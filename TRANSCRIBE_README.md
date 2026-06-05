# Video Transcription with Whisper

This directory contains scripts to transcribe MP4 videos using the free Whisper model.

## Quick Start

The simplest way to transcribe your video is using `transcribe_video_simple.py`:

```bash
python transcribe_video_simple.py "RGA_Ditto_Whats_Working.MP4" --model tiny
```

## Prerequisites

### Python Packages

Install required packages:

```bash
pip install -r requirements_transcribe.txt
```

Or install individually:

```bash
pip install openai-whisper librosa soundfile pydub
```

**Note:** The script now uses `librosa` and `pydub` for audio extraction, so **ffmpeg is no longer required** for most use cases. If these libraries fail, the script will attempt to use ffmpeg as a fallback (which would then need to be installed).

## Usage

### Simple Script (Recommended)

```bash
python transcribe_video_simple.py "your_video.mp4" --model tiny
```

**Model Options:**
- `tiny` - Fastest, least accurate (~39M parameters)
- `base` - Good balance (~74M parameters)
- `small` - Better accuracy (~244M parameters)
- `medium` - High accuracy (~769M parameters, slower)
- `large` - Best accuracy (~1550M parameters, slowest)

**Output:**
- By default, saves to `{video_name}_transcript.txt`
- Use `--output` to specify a custom path

### Advanced Script

The `transcribe_video_whisper.py` script provides more options but requires additional setup.

## Using with the Browser Extension

The transcription script is used by the browser extension's local Whisper feature:

1. **Start the server:**
   ```bash
   npm run server
   ```

2. **Make sure Python dependencies are installed:**
   ```bash
   pip install -r requirements_transcribe.txt
   ```

3. **Use Whisper in the extension:**
   - Open the extension popup
   - Go to Settings → Transcription Service → Select "Whisper"
   - Upload a file or paste a YouTube URL
   - The extension will use the local server for transcription

## Troubleshooting

**Error: "The system cannot find the file specified" or "FFmpeg not found"**
- Install audio extraction libraries: `pip install librosa soundfile pydub`
- Or install ffmpeg separately: https://ffmpeg.org/download.html

**Error: "ModuleNotFoundError"**
- Install required packages: `pip install -r requirements_transcribe.txt`

**Error: "Transcription failed" when using extension**
- Make sure the server is running: `npm run server`
- Check that Python dependencies are installed
- Check server console for detailed error messages

**Slow transcription:**
- Use a smaller model (`tiny` or `base`)
- Consider using GPU if available (requires CUDA setup)

**Server connection errors:**
- Make sure the server is running on port 3000
- Check firewall settings if running on a different machine


