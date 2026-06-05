"""
Modal Cloud Deployment — Aether Whisper Transcription
Run: modal deploy src/modal_whipser.py
"""
import modal
from modal import enter
import io
import base64

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libsndfile1")
    .pip_install(
        "faster-whisper>=1.0.3",
        "fastapi",
        "pydantic",
        "python-multipart",
    )
)

app = modal.App("aether-whisper-transcription", image=image)

VALID_MODELS = ["tiny", "base", "small", "medium", "large-v3"]


@app.cls(
    scaledown_window=300,
    timeout=600,
)
class WhisperModel:
    @enter()
    def load_model(self):
        from faster_whisper import WhisperModel as FasterWhisper
        print("Loading Whisper tiny (default)...")
        self.models = {
            "tiny": FasterWhisper("tiny", device="cpu", compute_type="int8")
        }
        print("Whisper tiny loaded and ready")

    def _get_model(self, model_size: str):
        from faster_whisper import WhisperModel as FasterWhisper
        if model_size not in self.models:
            print(f"Loading Whisper {model_size}...")
            self.models[model_size] = FasterWhisper(
                model_size, device="cpu", compute_type="int8"
            )
            print(f"Whisper {model_size} loaded")
        return self.models[model_size]

    @modal.method()
    def transcribe(self, audio_base64: str, model_size: str = "base", filename: str = "audio.webm"):
        import time
        import tempfile
        import os

        start = time.time()

        if model_size not in VALID_MODELS:
            model_size = "base"

        audio_bytes = base64.b64decode(audio_base64)

        suffix = os.path.splitext(filename)[-1] or ".webm"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name

        try:
            model = self._get_model(model_size)
            segments, info = model.transcribe(tmp_path, beam_size=5)
            text = " ".join(seg.text.strip() for seg in segments)
        finally:
            os.unlink(tmp_path)

        processing_time = time.time() - start
        print(f"Transcribed {len(audio_bytes)/1024:.0f}KB in {processing_time:.1f}s using {model_size}")

        return {
            "success": True,
            "text": text,
            "model": model_size,
            "language": info.language,
            "duration_seconds": info.duration,
            "processing_time_seconds": processing_time,
        }


whisper_model = WhisperModel()


@app.function()
@modal.asgi_app()
def fastapi_app():
    from fastapi import FastAPI, HTTPException
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel
    from typing import Optional

    web_app = FastAPI(title="Aether Whisper Transcription")

    web_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    class TranscribeRequest(BaseModel):
        audio_base64: str
        model: Optional[str] = "base"
        filename: Optional[str] = "audio.webm"

    @web_app.post("/transcribe")
    async def transcribe(request: TranscribeRequest):
        if not request.audio_base64:
            raise HTTPException(status_code=400, detail="audio_base64 required")
        model_size = request.model if request.model in VALID_MODELS else "base"
        try:
            result = whisper_model.transcribe.remote(
                audio_base64=request.audio_base64,
                model_size=model_size,
                filename=request.filename or "audio.webm",
            )
            return JSONResponse(content=result)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    @web_app.get("/health")
    async def health():
        return {"status": "ok", "service": "aether-whisper", "models": VALID_MODELS}

    @web_app.get("/")
    async def root():
        return {
            "service": "Aether Whisper Transcription",
            "endpoints": {
                "transcribe": "POST /transcribe",
                "health": "GET /health",
            },
            "models": VALID_MODELS,
        }

    return web_app
