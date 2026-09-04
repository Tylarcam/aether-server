#!/usr/bin/env python3
"""Aether CLI — health, URL transcription, file transcription, audio extract.

Tries the local server (server.js) first, then falls back to the Modal deploy.
Agent-friendly JSON on stdout by default; use --text for plain transcript only.
"""

from __future__ import annotations

import argparse
import base64
import json
import mimetypes
import os
import sys
import uuid
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

DEFAULT_LOCAL = "http://localhost:3000"
DEFAULT_MODAL = "https://tylarcam--aether-transcribe-web.modal.run"
HEALTH_TIMEOUT = 5
TRANSCRIBE_TIMEOUT = 20 * 60


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _dotenv_candidates() -> list[Path]:
    root = _repo_root()
    home = os.environ.get("AETHER_HOME", "").strip()
    paths = [root / ".env"]
    if home:
        paths.insert(0, Path(home) / ".env")
    return paths


def _load_dotenv() -> None:
    for path in _dotenv_candidates():
        if not path.is_file():
            continue
        with path.open(encoding="utf-8") as fh:
            for raw in fh:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                if not key.startswith("AETHER_"):
                    continue
                val = val.strip().strip('"').strip("'")
                if val and not os.environ.get(key):
                    os.environ[key] = val


def _local_url() -> str:
    return (os.environ.get("AETHER_URL") or DEFAULT_LOCAL).strip().rstrip("/")


def _modal_url() -> str:
    return (os.environ.get("AETHER_MODAL_URL") or DEFAULT_MODAL).strip().rstrip("/")


def _request(
    method: str,
    url: str,
    *,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = HEALTH_TIMEOUT,
) -> tuple[int, dict[str, Any] | str]:
    req_headers = {"Accept": "application/json"}
    if headers:
        req_headers.update(headers)
    req = Request(url, data=body, headers=req_headers, method=method)
    try:
        with urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, raw
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            return exc.code, json.loads(raw)
        except json.JSONDecodeError:
            return exc.code, raw or f"HTTP {exc.code}"
    except URLError as exc:
        raise RuntimeError(str(exc.reason)) from exc


def _probe_health(base: str, backend: str) -> dict[str, Any]:
    try:
        status, data = _request("GET", f"{base}/health", timeout=HEALTH_TIMEOUT)
        if status != 200:
            return {"backend": backend, "url": base, "ok": False, "error": f"HTTP {status}"}
        if isinstance(data, dict):
            ok = data.get("status") == "ok" or data.get("ok") is True
            return {"backend": backend, "url": base, "ok": ok, "details": data}
        return {"backend": backend, "url": base, "ok": False, "error": "unexpected response"}
    except RuntimeError as exc:
        return {"backend": backend, "url": base, "ok": False, "error": str(exc)}


def _pick_backend() -> tuple[str, str]:
    local = _local_url()
    probe = _probe_health(local, "local")
    if probe.get("ok"):
        return local, "local"
    modal = _modal_url()
    probe = _probe_health(modal, "modal")
    if probe.get("ok"):
        return modal, "modal"
    raise RuntimeError(
        f"no Aether backend reachable (local={local}, modal={modal})"
    )


def _normalize(
    data: dict[str, Any],
    *,
    backend: str,
    method: str = "",
    source_url: str = "",
) -> dict[str, Any]:
    text = (data.get("text") or data.get("transcript") or "").strip()
    success = bool(data.get("success", bool(text)))
    if data.get("error") and not text:
        success = False
    return {
        "success": success,
        "text": text,
        "title": data.get("title") or None,
        "channel": data.get("channel") or None,
        "duration_sec": data.get("duration_sec"),
        "method": data.get("method") or method,
        "backend": backend,
        "source_url": source_url or None,
        "error": data.get("error") or ("" if success else "transcription failed"),
        "model": data.get("model"),
        "compressed": data.get("compressed"),
        "chunks": data.get("chunks"),
        "char_count": len(text) if text else 0,
    }


def _emit(result: dict[str, Any], *, text_only: bool, out_path: str | None) -> int:
    if out_path:
        Path(out_path).write_text(result.get("text") or "", encoding="utf-8")
    if text_only:
        if result.get("text"):
            print(result["text"])
        elif not result.get("success"):
            print(result.get("error") or "transcription failed", file=sys.stderr)
            return 1
        return 0 if result.get("success") else 1
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 0 if result.get("success") else 1


def cmd_health(_args: argparse.Namespace) -> int:
    local = _probe_health(_local_url(), "local")
    modal = _probe_health(_modal_url(), "modal")
    preferred = "local" if local.get("ok") else ("modal" if modal.get("ok") else None)
    payload = {
        "success": preferred is not None,
        "preferred": preferred,
        "local": local,
        "modal": modal,
    }
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0 if preferred else 1


def cmd_transcribe(args: argparse.Namespace) -> int:
    try:
        base, backend = _pick_backend()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    payload: dict[str, Any] = {"url": args.url}
    if args.lang:
        payload["language"] = args.lang

    if backend == "local":
        status, data = _request(
            "POST",
            f"{base}/api/transcribe-url",
            body=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            timeout=TRANSCRIBE_TIMEOUT,
        )
        if not isinstance(data, dict):
            print(str(data), file=sys.stderr)
            return 1
        result = _normalize(
            data,
            backend=backend,
            method=data.get("method") or "local_ytdlp_groq",
            source_url=args.url,
        )
    else:
        status, data = _request(
            "POST",
            f"{base}/transcribe/youtube",
            body=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            timeout=TRANSCRIBE_TIMEOUT,
        )
        if not isinstance(data, dict):
            print(str(data), file=sys.stderr)
            return 1
        if status >= 400 and not data.get("success"):
            data.setdefault("error", data.get("detail") or f"HTTP {status}")
        result = _normalize(
            data,
            backend=backend,
            method="modal_ytdlp_groq",
            source_url=args.url,
        )

    if status >= 400 and result.get("success"):
        result["success"] = False
        result.setdefault("error", f"HTTP {status}")

    return _emit(result, text_only=args.text, out_path=args.out)


def _multipart_body(
    file_path: Path,
    *,
    field_name: str = "file",
    extra: dict[str, str] | None = None,
) -> tuple[bytes, str]:
    boundary = f"----aether-{uuid.uuid4().hex}"
    mime = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    chunks: list[bytes] = []
    for key, val in (extra or {}).items():
        chunks.append(
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
            f"{val}\r\n".encode("utf-8")
        )
    chunks.append(
        (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{field_name}"; filename="{file_path.name}"\r\n'
            f"Content-Type: {mime}\r\n\r\n"
        ).encode("utf-8")
    )
    chunks.append(file_path.read_bytes())
    chunks.append(f"\r\n--{boundary}--\r\n".encode("utf-8"))
    body = b"".join(chunks)
    return body, boundary


def cmd_file(args: argparse.Namespace) -> int:
    file_path = Path(args.path).expanduser().resolve()
    if not file_path.is_file():
        print(f"file not found: {file_path}", file=sys.stderr)
        return 1

    try:
        base, backend = _pick_backend()
    except RuntimeError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    if backend == "local":
        extra: dict[str, str] = {}
        if args.lang:
            extra["language"] = args.lang
        body, boundary = _multipart_body(file_path, extra=extra or None)
        status, data = _request(
            "POST",
            f"{base}/api/transcribe-groq",
            body=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            timeout=TRANSCRIBE_TIMEOUT,
        )
        if not isinstance(data, dict):
            print(str(data), file=sys.stderr)
            return 1
        result = _normalize(data, backend=backend, method="local_groq_file")
    else:
        audio_b64 = base64.b64encode(file_path.read_bytes()).decode("ascii")
        payload = {"audio_b64": audio_b64, "filename": file_path.name}
        status, data = _request(
            "POST",
            f"{base}/transcribe/audio",
            body=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            timeout=TRANSCRIBE_TIMEOUT,
        )
        if not isinstance(data, dict):
            print(str(data), file=sys.stderr)
            return 1
        if status >= 400 and not data.get("success"):
            data.setdefault("error", data.get("detail") or f"HTTP {status}")
        result = _normalize(data, backend=backend, method="modal_groq_file")

    if status >= 400 and result.get("success"):
        result["success"] = False
        result.setdefault("error", f"HTTP {status}")

    return _emit(result, text_only=args.text, out_path=args.out)


def cmd_extract(args: argparse.Namespace) -> int:
    local = _local_url()
    probe = _probe_health(local, "local")
    if not probe.get("ok"):
        print(
            f"extract requires the local Aether server at {local} (not reachable)",
            file=sys.stderr,
        )
        return 1

    payload = {"url": args.url, "format": args.format}
    status, data = _request(
        "POST",
        f"{local}/api/extract-audio",
        body=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        timeout=TRANSCRIBE_TIMEOUT,
    )
    if isinstance(data, dict):
        data["success"] = status == 200 and bool(data.get("audioUrl"))
        data["backend"] = "local"
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return 0 if data["success"] else 1
    print(str(data), file=sys.stderr)
    return 1


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="aether",
        description="Aether transcription CLI (local server.js + Modal fallback)",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("health", help="Probe local and Modal backends")

    p_transcribe = sub.add_parser("transcribe", help="Transcribe a video URL")
    p_transcribe.add_argument("url", help="http(s) video URL (YouTube or yt-dlp site)")
    p_transcribe.add_argument("--lang", help="Language code (optional, e.g. en)")
    p_transcribe.add_argument("--text", action="store_true", help="Print transcript text only")
    p_transcribe.add_argument("--out", help="Write transcript text to file")

    p_file = sub.add_parser("file", help="Transcribe a local audio/video file")
    p_file.add_argument("path", help="Path to audio or video file")
    p_file.add_argument("--lang", help="Language code (optional, e.g. en)")
    p_file.add_argument("--text", action="store_true", help="Print transcript text only")
    p_file.add_argument("--out", help="Write transcript text to file")

    p_extract = sub.add_parser("extract", help="Extract YouTube audio (local server only)")
    p_extract.add_argument("url", help="YouTube URL")
    p_extract.add_argument(
        "--format",
        default="mp3",
        choices=["mp3", "wav", "m4a", "opus", "flac"],
        help="Output audio format (default: mp3)",
    )

    return parser


def main() -> int:
    _load_dotenv()
    parser = _build_parser()
    if len(sys.argv) == 1:
        parser.print_usage(sys.stderr)
        return 2
    args = parser.parse_args()
    handlers = {
        "health": cmd_health,
        "transcribe": cmd_transcribe,
        "file": cmd_file,
        "extract": cmd_extract,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())
