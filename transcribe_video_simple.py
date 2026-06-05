"""
Simple video transcription using openai-whisper package.
This script handles MP4 files by pre-extracting audio to avoid ffmpeg dependency issues.
"""

import whisper
import argparse
from pathlib import Path
import sys
import tempfile

# Try to import audio extraction libraries
try:
    import librosa
    import soundfile as sf
    LIBROSA_AVAILABLE = True
except ImportError:
    LIBROSA_AVAILABLE = False

try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    PYDUB_AVAILABLE = False

try:
    from moviepy import VideoFileClip
    MOVIEPY_AVAILABLE = True
except ImportError:
    try:
        # Fallback for older moviepy versions
        from moviepy.editor import VideoFileClip
        MOVIEPY_AVAILABLE = True
    except ImportError:
        MOVIEPY_AVAILABLE = False


def extract_audio_from_video(video_path, output_audio_path=None):
    """
    Extract audio from video file using available libraries.
    Returns path to extracted audio file (WAV format).
    """
    video_path = Path(video_path)
    
    if output_audio_path is None:
        # Create temporary audio file
        temp_dir = tempfile.gettempdir()
        output_audio_path = Path(temp_dir) / f"{video_path.stem}_temp_audio.wav"
    else:
        output_audio_path = Path(output_audio_path)
    
    # Check if file is actually a video or audio file
    is_video = video_path.suffix.lower() in ['.mp4', '.avi', '.webm', '.mov', '.mkv']
    
    # For audio files, try librosa first (works well, doesn't need ffmpeg)
    if not is_video and LIBROSA_AVAILABLE:
        print(f"Extracting audio using librosa...")
        try:
            audio, sr = librosa.load(str(video_path), sr=16000, mono=True)
            sf.write(str(output_audio_path), audio, sr)
            print(f"✅ Audio extracted to: {output_audio_path}")
            return output_audio_path
        except Exception as e:
            print(f"⚠️  Warning: librosa extraction failed: {e}")
    
    # For video files, try moviepy first (most reliable, but needs ffmpeg)
    if is_video and MOVIEPY_AVAILABLE:
        print(f"Extracting audio from video using moviepy...")
        try:
            video = VideoFileClip(str(video_path))
            if video.audio is not None:
                video.audio.write_audiofile(str(output_audio_path), verbose=False, logger=None)
                video.close()
                print(f"✅ Audio extracted to: {output_audio_path}")
                return output_audio_path
            else:
                video.close()
                raise ValueError("Video file has no audio track")
        except Exception as e:
            print(f"⚠️  Warning: moviepy extraction failed: {e}")
            if "ffmpeg" in str(e).lower() or "not found" in str(e).lower():
                print("   (moviepy requires ffmpeg to be installed)")
    
    # Try librosa for video files (may work for some formats)
    if LIBROSA_AVAILABLE:
        print(f"Extracting audio using librosa...")
        try:
            audio, sr = librosa.load(str(video_path), sr=16000, mono=True)
            sf.write(str(output_audio_path), audio, sr)
            print(f"✅ Audio extracted to: {output_audio_path}")
            return output_audio_path
        except Exception as e:
            print(f"⚠️  Warning: librosa extraction failed: {e}")
    
    # Try pydub as fallback (needs ffmpeg for video files)
    if PYDUB_AVAILABLE:
        print(f"Extracting audio using pydub...")
        try:
            audio = AudioSegment.from_file(str(video_path))
            audio = audio.set_frame_rate(16000).set_channels(1)  # Convert to 16kHz mono
            audio.export(str(output_audio_path), format="wav")
            print(f"✅ Audio extracted to: {output_audio_path}")
            return output_audio_path
        except Exception as e:
            print(f"⚠️  Warning: pydub extraction failed: {e}")
            if "ffmpeg" in str(e).lower() or "not found" in str(e).lower():
                print("   (pydub requires ffmpeg for video files)")
    
    # If all methods fail, return None to try direct whisper (which also needs ffmpeg)
    print("⚠️  Warning: All audio extraction methods failed.")
    print("Attempting direct transcription (requires ffmpeg in PATH)...")
    return None


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
        default="tiny",
        choices=["tiny", "base", "small", "medium", "large"],
        help="Whisper model to use (default: tiny). Options: tiny, base, small, medium, large"
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

    video_path = Path(args.video_path)
    
    if not video_path.exists():
        print(f"❌ Error: Video file not found: {video_path}")
        sys.exit(1)

    # Load Whisper model
    print(f"Loading Whisper model: {args.model}")
    print("(First run will download the model - this may take a few minutes)")
    model = whisper.load_model(args.model)

    # Extract audio first to avoid ffmpeg dependency
    print("\n" + "=" * 60)
    print("Extracting audio from video...")
    print("=" * 60)
    
    audio_path = extract_audio_from_video(video_path)
    
    if audio_path is None:
        # Fallback: try direct transcription (requires ffmpeg)
        print("\n⚠️  Attempting direct video transcription (requires ffmpeg)...")
        audio_to_transcribe = str(video_path)
        cleanup_audio = False
    else:
        audio_to_transcribe = str(audio_path)
        cleanup_audio = not args.keep_audio
    
    # Transcribe audio
    print("\n" + "=" * 60)
    print("Starting transcription...")
    print("=" * 60)
    print(f"Processing: {video_path.name}")
    
    try:
        result = model.transcribe(audio_to_transcribe)
    except Exception as e:
        print(f"\n❌ Error during transcription: {e}")
        if "ffmpeg" in str(e).lower() or "file specified" in str(e).lower():
            print("\n💡 Solution: Install ffmpeg or install audio extraction libraries:")
            print("   pip install librosa soundfile")
            print("   OR")
            print("   pip install pydub")
            print("   OR")
            print("   Install ffmpeg from https://ffmpeg.org/download.html")
        if audio_path and audio_path.exists():
            audio_path.unlink()
        sys.exit(1)
    finally:
        # Clean up temporary audio file if needed
        if cleanup_audio and audio_path and audio_path.exists():
            try:
                audio_path.unlink()
                print(f"\n🧹 Cleaned up temporary audio file")
            except:
                pass

    # Get transcription text
    transcription_text = result["text"]
    
    if not transcription_text:
        print("\n⚠️  Warning: Transcription is empty")
        sys.exit(1)

    # Determine output file path
    if args.output:
        output_path = Path(args.output)
    else:
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
    
    # Also print language detected if available
    if "language" in result:
        print(f"Detected language: {result['language']}")


if __name__ == "__main__":
    main()


