"""
Aether Transcription Service — Modal backend

Replaces server.js + AssemblyAI with a single cloud endpoint.

Endpoints:
  GET  /health
  POST /transcribe/youtube  { url: str }
  POST /transcribe/audio    { audio_b64: str, filename: str }

Deploy:
  modal secret create groq-api-key GROQ_API_KEY=<your-key>
  modal deploy backend/modal_aether.py

Modal prints the live URL — paste it as AETHER_API_URL in popup/popup.js.
"""

import base64
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
    # yt-dlp[default] adds brotli + pycryptodomex + websockets — improves YouTube compat.
    .pip_install("fastapi", "groq", "pydantic", "yt-dlp[default]")
)

app = modal.App("aether-transcribe", image=image)
groq_secret = modal.Secret.from_name("groq-api-key")
youtube_session_secret = modal.Secret.from_name("youtube-session")

GROQ_MODEL = "whisper-large-v3-turbo"
MAX_AUDIO_BYTES = 24 * 1024 * 1024  # stay under Groq's 25 MB limit


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


def _run_groq_transcription(path: Path, client) -> str:
    with open(path, "rb") as f:
        data = f.read()
    if len(data) > MAX_AUDIO_BYTES:
        mb = len(data) // 1024 // 1024
        raise ValueError(f"Audio is {mb} MB — max 24 MB. Try a shorter clip.")
    result = client.audio.transcriptions.create(
        file=(path.name, data),
        model=GROQ_MODEL,
        response_format="text",
    )
    return str(result)


@app.function(secrets=[groq_secret, youtube_session_secret], timeout=300, scaledown_window=300)
@modal.asgi_app()
def web():
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from groq import Groq

    api = FastAPI(title="Aether Transcription Service")

    # Chrome extensions send requests from chrome-extension:// origin.
    # allow_origins=["*"] is required for the extension to reach this endpoint.
    api.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    client = Groq(api_key=os.environ["GROQ_API_KEY"])

    @api.get("/health")
    def health():
        return {"ok": True}

    yt_session_cookie = os.environ.get("SESSION_LOGININFO", "")

    def _yt_dlp_cmd(url: str, out_template: str, client: str | None) -> list[str]:
        cmd = [
            "yt-dlp",
            "--extract-audio",
            # bestaudio/best without a filesize filter — filesize metadata is often absent
            # in YouTube manifests, causing bestaudio[filesize<X] to match nothing.
            "--format", "bestaudio/best",
            "--output", out_template,
            "--no-playlist",
            "--no-warnings",
        ]
        # Authenticate with the user's YouTube session to bypass sign-in requirements
        if yt_session_cookie:
            cmd += ["--add-header", f"Cookie: session_logininfo={yt_session_cookie}"]
        if client:
            cmd += ["--extractor-args", f"youtube:player_client={client}"]
        cmd.append(url)
        return cmd

    @api.post("/transcribe/youtube", response_model=TranscribeResult)
    async def transcribe_youtube(req: YouTubeRequest):
        start = time.time()
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                out_template = str(Path(tmpdir) / "audio.%(ext)s")

                # Try web client first (works for most public videos), then mobile clients
                # that bypass the age-gate. None = default (web) client, no --extractor-args.
                proc = None
                for client in (None, "ios", "android", "tv_embedded"):
                    proc = subprocess.run(
                        _yt_dlp_cmd(req.url, out_template, client),
                        capture_output=True,
                        text=True,
                        timeout=180,
                    )
                    if proc.returncode == 0:
                        break
                    stderr = proc.stderr.strip()
                    # Retry on auth/age/format errors (client-specific); hard fail on anything else
                    is_retryable = (
                        "Sign in" in stderr or
                        "age" in stderr.lower() or
                        "format is not available" in stderr.lower() or
                        "requested format" in stderr.lower()
                    )
                    if not is_retryable:
                        break

                if proc.returncode != 0:
                    stderr = proc.stderr.strip()
                    if "Private video" in stderr:
                        raise ValueError("This video is private.")
                    if "age" in stderr.lower() and "Sign in" in stderr:
                        raise ValueError("This video is age-restricted. Open it in YouTube while signed in, then paste the URL here.")
                    if "Sign in" in stderr or "bot" in stderr.lower():
                        raise ValueError("YouTube is blocking server-side access to this video. Open the video in a YouTube tab, then paste the URL — Aether will use your browser session.")
                    raise ValueError(f"Could not extract audio: {stderr[:300]}")

                candidates = list(Path(tmpdir).glob("audio.*"))
                if not candidates:
                    raise ValueError("yt-dlp produced no audio file.")

                transcript = _run_groq_transcription(candidates[0], client)

        except ValueError as e:
            return TranscribeResult(success=False, error=str(e))
        except subprocess.TimeoutExpired:
            return TranscribeResult(success=False, error="Audio extraction timed out (video may be too long).")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        return TranscribeResult(
            success=True,
            transcript=transcript,
            latency_ms=int((time.time() - start) * 1000),
        )

    @api.post("/transcribe/audio", response_model=TranscribeResult)
    async def transcribe_audio(req: AudioRequest):
        start = time.time()
        try:
            audio_bytes = base64.b64decode(req.audio_b64)

            if len(audio_bytes) > MAX_AUDIO_BYTES:
                mb = len(audio_bytes) // 1024 // 1024
                return TranscribeResult(
                    success=False,
                    error=f"Recording is {mb} MB — max 24 MB. Try a shorter clip.",
                )

            suffix = Path(req.filename).suffix or ".webm"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
                tmp.write(audio_bytes)
                tmp_path = Path(tmp.name)

            try:
                transcript = _run_groq_transcription(tmp_path, client)
            finally:
                tmp_path.unlink(missing_ok=True)

        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

        return TranscribeResult(
            success=True,
            transcript=transcript,
            latency_ms=int((time.time() - start) * 1000),
        )

    return api
