"""
Transcribe MP4 video file using free Whisper model.
Based on the reference script from AISE26_w17_d4.
"""

import sys
import io
import torch
import numpy as np
from transformers import pipeline
from pathlib import Path
import argparse

# Try to import audio extraction libraries
try:
    from moviepy.editor import VideoFileClip
    MOVIEPY_AVAILABLE = True
except ImportError:
    MOVIEPY_AVAILABLE = False

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False

try:
    import librosa
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

# Configure UTF-8 output for Windows emoji support
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')


class VideoTranscriber:
    def __init__(self, model_name="openai/whisper-tiny"):
        """
        Initialize Whisper ASR model.

        Model sizes available (all free):
        - whisper-tiny: Fastest, ~39M parameters (recommended for quick transcription)
        - whisper-base: ~74M parameters
        - whisper-small: ~244M parameters (better accuracy)
        - whisper-medium: ~769M parameters (requires more memory)
        - whisper-large: ~1550M parameters (GPU recommended)
        """
        print(f"Loading Whisper model: {model_name}")
        print("(First run will download the model - this may take a few minutes)")

        self.asr = pipeline(
            "automatic-speech-recognition",
            model=model_name,
            device=0 if torch.cuda.is_available() else -1
        )
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")

    def extract_audio_from_video(self, video_path, output_audio_path=None):
        """
        Extract audio from video file.
        Returns path to audio file (WAV format).
        """
        video_path = Path(video_path)
        
        if not video_path.exists():
            raise FileNotFoundError(f"Video file not found: {video_path}")

        # Determine output audio path
        if output_audio_path is None:
            output_audio_path = video_path.parent / f"{video_path.stem}_audio.wav"
        else:
            output_audio_path = Path(output_audio_path)

        # Try pydub first (often works well on Windows)
        if PYDUB_AVAILABLE:
            print(f"Extracting audio using pydub...")
            try:
                audio = AudioSegment.from_file(str(video_path))
                audio.export(str(output_audio_path), format="wav")
                print(f"Audio extracted to: {output_audio_path}")
                return output_audio_path
            except Exception as e:
                print(f"Warning: pydub extraction failed: {e}")
                print("Trying alternative method...")

        # Try moviepy (most reliable for MP4, but needs ffmpeg)
        if MOVIEPY_AVAILABLE:
            print(f"Extracting audio using moviepy...")
            try:
                video = VideoFileClip(str(video_path))
                audio = video.audio
                audio.write_audiofile(str(output_audio_path), verbose=False, logger=None)
                video.close()
                audio.close()
                print(f"Audio extracted to: {output_audio_path}")
                return output_audio_path
            except Exception as e:
                print(f"Warning: moviepy extraction failed: {e}")
                print("Trying alternative method...")

        # Fallback: Try librosa (may work with some MP4 files)
        if LIBROSA_AVAILABLE:
            print(f"Extracting audio using librosa...")
            try:
                audio, sr = librosa.load(str(video_path), sr=16000)
                import soundfile as sf
                sf.write(str(output_audio_path), audio, sr)
                print(f"Audio extracted to: {output_audio_path}")
                return output_audio_path
            except Exception as e:
                print(f"Warning: librosa extraction failed: {e}")

        # Last resort: Use ffmpeg via subprocess
        print(f"Attempting to extract audio using ffmpeg...")
        import subprocess
        try:
            subprocess.run(
                [
                    "ffmpeg",
                    "-i", str(video_path),
                    "-vn",  # No video
                    "-acodec", "pcm_s16le",  # WAV codec
                    "-ar", "16000",  # Sample rate
                    "-ac", "1",  # Mono
                    "-y",  # Overwrite
                    str(output_audio_path)
                ],
                check=True,
                capture_output=True
            )
            print(f"Audio extracted to: {output_audio_path}")
            return output_audio_path
        except (subprocess.CalledProcessError, FileNotFoundError) as e:
            raise RuntimeError(
                f"Failed to extract audio. Please install one of:\n"
                f"  - pydub: pip install pydub\n"
                f"  - moviepy: pip install moviepy (also needs ffmpeg)\n"
                f"  - ffmpeg: https://ffmpeg.org/download.html\n"
                f"Error: {e}"
            )

    def transcribe_audio(self, audio_path):
        """Transcribe audio file to text."""
        audio_path = Path(audio_path)
        if not audio_path.exists():
            return {"error": f"Audio file not found: {audio_path}"}

        print(f"Loading audio file: {audio_path}")
        
        # Load audio with librosa (handles WAV files well)
        if LIBROSA_AVAILABLE:
            audio, sr = librosa.load(str(audio_path), sr=16000)
        else:
            # Fallback: use soundfile or other method
            import soundfile as sf
            audio, sr = sf.read(str(audio_path))
            # Resample to 16kHz if needed
            if sr != 16000:
                import librosa
                audio = librosa.resample(audio, orig_sr=sr, target_sr=16000)

        print(f"Transcribing audio (duration: {len(audio)/16000:.2f}s)...")
        
        # Transcribe (pass numpy array instead of file path)
        # return_timestamps=True handles audio longer than 30 seconds
        result = self.asr(audio, return_timestamps=True)

        return result

    def transcribe_video(self, video_path, model_name="openai/whisper-tiny", keep_audio=False):
        """
        Transcribe video file directly.
        
        Args:
            video_path: Path to MP4 video file
            model_name: Whisper model to use
            keep_audio: If True, keep extracted audio file after transcription
        
        Returns:
            Dictionary with transcription text and metadata
        """
        video_path = Path(video_path)
        
        if not video_path.exists():
            return {"error": f"Video file not found: {video_path}"}

        # Extract audio
        temp_audio_path = video_path.parent / f"{video_path.stem}_temp_audio.wav"
        
        try:
            audio_path = self.extract_audio_from_video(video_path, temp_audio_path)
            
            # Transcribe audio
            result = self.transcribe_audio(audio_path)
            
            # Clean up temporary audio file if requested
            if not keep_audio and temp_audio_path.exists():
                temp_audio_path.unlink()
                print(f"Cleaned up temporary audio file")
            
            return result
            
        except Exception as e:
            # Clean up on error
            if temp_audio_path.exists():
                temp_audio_path.unlink()
            return {"error": str(e)}


def main():
    parser = argparse.ArgumentParser(description="Transcribe MP4 video using free Whisper model")
    parser.add_argument(
        "video_path",
        type=str,
        help="Path to MP4 video file to transcribe"
    )
    parser.add_argument(
        "--model",
        type=str,
        default="openai/whisper-tiny",
        choices=["openai/whisper-tiny", "openai/whisper-base", "openai/whisper-small", 
                "openai/whisper-medium", "openai/whisper-large"],
        help="Whisper model to use (default: openai/whisper-tiny)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file path for transcription (default: {video_name}_transcript.txt)"
    )
    parser.add_argument(
        "--keep-audio",
        action="store_true",
        help="Keep extracted audio file after transcription"
    )

    args = parser.parse_args()

    # Initialize transcriber
    transcriber = VideoTranscriber(model_name=args.model)

    # Transcribe video
    print("\n" + "=" * 60)
    print("Starting transcription...")
    print("=" * 60)
    
    result = transcriber.transcribe_video(
        args.video_path,
        model_name=args.model,
        keep_audio=args.keep_audio
    )

    # Check for errors
    if "error" in result:
        print(f"\n❌ Error: {result['error']}")
        sys.exit(1)

    # Get transcription text
    transcription_text = result.get("text", "")
    
    if not transcription_text:
        print("\n⚠️  Warning: Transcription is empty")
        sys.exit(1)

    # Determine output file path
    if args.output:
        output_path = Path(args.output)
    else:
        video_path = Path(args.video_path)
        output_path = video_path.parent / f"{video_path.stem}_transcript.txt"

    # Save transcription
    output_path.write_text(transcription_text, encoding='utf-8')
    
    print("\n" + "=" * 60)
    print("Transcription Complete!")
    print("=" * 60)
    print(f"\n✅ Transcription saved to: {output_path}")
    print(f"\nTranscription preview (first 500 characters):")
    print("-" * 60)
    print(transcription_text[:500] + ("..." if len(transcription_text) > 500 else ""))
    print("-" * 60)
    print(f"\nFull transcription length: {len(transcription_text)} characters")


if __name__ == "__main__":
    main()

