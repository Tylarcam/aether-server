"""
Aether Transcription Service — Modal backend

Endpoints:
  GET  /health
  POST /transcribe/youtube  { url: str }
  POST /transcribe/audio    { audio_b64: str, filename: str }

Large files: auto-compress with ffmpeg (mono 16 kHz speech MP3). If still over
Groq's 24 MB cap, segment into chunks, transcribe each, and concatenate.

Deploy:
  modal secret create groq-api-key GROQ_API_KEY=<your-key>
  modal deploy backend/modal_aether.py
"""

from __future__ import annotations

import base64
import json
import os
import subprocess
import tempfile
import time
from pathlib import Path

import modal
from pydantic import BaseModel, Field

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg")
    .pip_install("fastapi", "groq", "pydantic", "yt-dlp[default]")
)

app = modal.App("aether-transcribe", image=image)
groq_secret = modal.Secret.from_name("groq-api-key")
youtube_session_secret = modal.Secret.from_name("youtube-session")

GROQ_MODEL = "whisper-large-v3-turbo"
MAX_AUDIO_BYTES = 24 * 1024 * 1024  # Groq hard cap (~25 MB)
MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # accept large uploads; we compress first
CHUNK_SECONDS = 600  # 10-min speech chunks at 32 kbps stay well under 24 MB
SPEECH_BITRATE = "32k"
SPEECH_SAMPLE_RATE = "16000"


class YouTubeRequest(BaseModel):
    url: str = Field(min_length=10, max_length=500)


class AudioRequest(BaseModel):
    audio_b64: str = Field(min_length=1)
    filename: str = Field(default="recording.webm", max_length=100)


class TranscribeResult(BaseModel):
    success: bool
    transcript: str = ""
    error: str = ""
    latency_ms: int = 0
    compressed: bool = False
    chunks: int = 1
    title: str = ""
    channel: str = ""


def _fetch_ytdlp_metadata(url: str) -> dict[str, str | None]:
    """Lightweight metadata fetch (no download)."""
    try:
        proc = subprocess.run(
            [
                "yt-dlp",
                "--print", "%(.{title,channel})j",
                "--no-playlist",
                "--no-warnings",
                "--skip-download",
                url,
            ],
            capture_output=True,
            text=True,
            timeout=60,
        )
        if proc.returncode != 0:
            return {"title": None, "channel": None}
        line = next(
            (ln.strip() for ln in (proc.stdout or "").splitlines() if ln.strip().startswith("{")),
            "",
        )
        if not line:
            return {"title": None, "channel": None}
        meta = json.loads(line)
        return {"title": meta.get("title") or None, "channel": meta.get("channel") or None}
    except Exception:
        return {"title": None, "channel": None}


    proc = subprocess.run(
        args,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if proc.returncode != 0:
        stderr = (proc.stderr or "").strip()[:400]
        raise ValueError(f"ffmpeg failed: {stderr or 'unknown error'}")


def _compress_speech_mp3(src: Path, dst: Path) -> None:
    """Mono 16 kHz speech MP3 — typically 3–4× smaller than interview m4a/wav."""
    _ffmpeg_run([
        "ffmpeg", "-y", "-i", str(src),
        "-vn", "-ac", "1", "-ar", SPEECH_SAMPLE_RATE, "-b:a", SPEECH_BITRATE,
        str(dst),
    ])


def _segment_speech_mp3(src: Path, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    pattern = str(out_dir / "chunk_%04d.mp3")
    _ffmpeg_run([
        "ffmpeg", "-y", "-i", str(src),
        "-vn", "-ac", "1", "-ar", SPEECH_SAMPLE_RATE, "-b:a", SPEECH_BITRATE,
        "-f", "segment", "-segment_time", str(CHUNK_SECONDS),
        pattern,
    ])
    chunks = sorted(out_dir.glob("chunk_*.mp3"))
    if not chunks:
        raise ValueError("ffmpeg produced no audio chunks")
    return chunks


def _prepare_for_groq(path: Path, work_dir: Path) -> tuple[list[Path], bool]:
    """
    Return (paths, compressed) where every path is under MAX_AUDIO_BYTES.
    Compresses when over the limit; segments if still over after compression.
    """
    size = path.stat().st_size
    if size <= MAX_AUDIO_BYTES:
        return [path], False

    compressed = work_dir / "compressed.mp3"
    _compress_speech_mp3(path, compressed)
    if compressed.stat().st_size <= MAX_AUDIO_BYTES:
        return [compressed], True

    chunks = _segment_speech_mp3(compressed, work_dir / "chunks")
    oversized = [c for c in chunks if c.stat().st_size > MAX_AUDIO_BYTES]
    if oversized:
        raise ValueError(
            f"Audio chunk still exceeds {MAX_AUDIO_BYTES // (1024 * 1024)} MB after compression"
        )
    return chunks, True


def _transcribe_paths(paths: list[Path], client) -> str:
    parts: list[str] = []
    for path in paths:
        data = path.read_bytes()
        if len(data) > MAX_AUDIO_BYTES:
            mb = len(data) // (1024 * 1024)
            raise ValueError(f"Audio is {mb} MB — max 24 MB after compression.")
        result = client.audio.transcriptions.create(
            file=(path.name, data),
            model=GROQ_MODEL,
            response_format="text",
        )
        text = str(result).strip()
        if text:
            parts.append(text)
    if not parts:
        raise ValueError("Transcription returned no text (silent audio?)")
    return "\n\n".join(parts)


def _run_groq_transcription(path: Path, client) -> tuple[str, bool, int]:
    """Transcribe path, auto-compressing/chunking when over Groq's size limit."""
    with tempfile.TemporaryDirectory() as tmp:
        work_dir = Path(tmp)
        chunks, compressed = _prepare_for_groq(path, work_dir)
        transcript = _transcribe_paths(chunks, client)
        return transcript, compressed, len(chunks)


# Long interviews: compress + multi-chunk Groq can exceed 5 minutes.
@app.function(secrets=[groq_secret, youtube_session_secret], timeout=900, scaledown_window=300)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from groq import Groq

    api = FastAPI(title="Aether Transcription Service")

    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    client = Groq(api_key=os.environ["GROQ_API_KEY"])

    @api.get("/health")
    def health():
        return {"ok": True, "max_upload_mb": MAX_UPLOAD_BYTES // (1024 * 1024), "auto_compress": True}

    yt_session_cookie = os.environ.get("SESSION_LOGININFO", "")

    def _yt_dlp_cmd(url: str, out_template: str, player_client: str | None) -> list[str]:
        cmd = [
            "yt-dlp",
            "--extract-audio",
            "--format", "bestaudio/best",
            "--output", out_template,
            "--no-playlist",
            "--no-warnings",
        ]
        if yt_session_cookie:
            cmd += ["--add-header", f"Cookie: session_logininfo={yt_session_cookie}"]
        if player_client:
            cmd += ["--extractor-args", f"youtube:player_client={player_client}"]
        cmd.append(url)
        return cmd

    @api.post("/transcribe/youtube", response_model=TranscribeResult)
    async def transcribe_youtube(req: YouTubeRequest):
        start = time.time()
        compressed = False
        chunks = 1
        meta = _fetch_ytdlp_metadata(req.url)
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                out_template = str(Path(tmpdir) / "audio.%(ext)s")

                proc = None
                for player_client in (None, "ios", "android", "tv_embedded"):
                    proc = subprocess.run(
                        _yt_dlp_cmd(req.url, out_template, player_client),
                        capture_output=True,
                        text=True,
                        timeout=180,
                    )
                    if proc.returncode == 0:
                        break
                    stderr = proc.stderr.strip()
                    is_retryable = (
                        "Sign in" in stderr
                        or "age" in stderr.lower()
                        or "format is not available" in stderr.lower()
                        or "requested format" in stderr.lower()
                    )
                    if not is_retryable:
                        break

                if proc.returncode != 0:
                    stderr = proc.stderr.strip()
                    if "Private video" in stderr:
                        raise ValueError("This video is private.")
                    if "age" in stderr.lower() and "Sign in" in stderr:
                        raise ValueError(
                            "This video is age-restricted. Open it in YouTube while signed in, then paste the URL here."
                        )
                    if "Sign in" in stderr or "bot" in stderr.lower():
                        raise ValueError(
                            "YouTube is blocking server-side access to this video. Open the video in a YouTube tab, then paste the URL — Aether will use your browser session."
                        )
                    raise ValueError(f"Could not extract audio: {stderr[:300]}")

                candidates = list(Path(tmpdir).glob("audio.*"))
                if not candidates:
                    raise ValueError("yt-dlp produced no audio file.")

                transcript, compressed, chunks = _run_groq_transcription(candidates[0], client)

        except ValueError as e:
            return TranscribeResult(success=False, error=str(e))
        except subprocess.TimeoutExpired:
            return TranscribeResult(
                success=False,
                error="Audio extraction timed out (video may be too long).",
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        return TranscribeResult(
            success=True,
            transcript=transcript,
            latency_ms=int((time.time() - start) * 1000),
            compressed=compressed,
            chunks=chunks,
            title=meta.get("title") or "",
            channel=meta.get("channel") or "",
        )

    @api.post("/transcribe/audio", response_model=TranscribeResult)
    async def transcribe_audio(req: AudioRequest):
        start = time.time()
        try:
            audio_bytes = base64.b64decode(req.audio_b64)

            if len(audio_bytes) > MAX_UPLOAD_BYTES:
                mb = len(audio_bytes) // (1024 * 1024)
                return TranscribeResult(
                    success=False,
                    error=f"Recording is {mb} MB — max upload is {MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
                )

            suffix = Path(req.filename).suffix or ".webm"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = Path(tmp.name)

            try:
                transcript, compressed, chunks = _run_groq_transcription(tmp_path, client)
            finally:
                tmp_path.unlink(missing_ok=True)

        except ValueError as e:
            return TranscribeResult(success=False, error=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        return TranscribeResult(
            success=True,
            transcript=transcript,
            latency_ms=int((time.time() - start) * 1000),
            compressed=compressed,
            chunks=chunks,
        )

    return api
