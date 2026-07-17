# Quick Start Guide - Whisper Transcription

## Large files (auto-compress)

Files over Groq's ~24 MB limit are handled automatically:

1. Detect oversized audio
2. Compress to mono 16 kHz 32 kbps MP3 via ffmpeg
3. If still over the limit, split into 10-minute chunks
4. Transcribe each chunk and return one concatenated transcript

This runs on the **local server** (`npm run server`) and on the **Modal** backend (`backend/modal_aether.py`). The extension shows "Large file — compressing…" and returns the transcript when done. No manual conversion required.

Redeploy Modal after pulling this change:

```bash
modal deploy backend/modal_aether.py
```

## Starting the Server

The extension requires a local server to be running for Whisper transcription.

### Step 1: Install Dependencies

**Node.js dependencies (for server):**
```bash
npm install
```

**Python dependencies (for Whisper):**
```bash
pip install -r requirements_transcribe.txt
```

### Step 2: Start the Server

Open a terminal in the project directory and run:

```bash
npm run server
```

You should see:
```
Server running on port 3000
```

**Keep this terminal open** - the server must stay running while using Whisper transcription.

### Step 3: Use the Extension

1. **Load the extension** in Chrome:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select this project folder

2. **Configure transcription service:**
   - Open the extension popup
   - Go to **Settings** tab
   - Under "Transcription Service", select **"Whisper"**
   - (Optional) Choose your preferred model (tiny, base, small, medium, large)

3. **Transcribe audio:**
   - Go to **Transcribe** tab
   - Upload a file or paste a YouTube URL
   - Click "Transcribe"

## Troubleshooting

### "Failed to fetch" or "Cannot connect to server"

**Solution:** The server isn't running. Start it with:
```bash
npm run server
```

Make sure you see "Server running on port 3000" in the terminal.

### "FFmpeg not found" or "Transcription failed"

**Solution:** Install Python audio extraction libraries:
```bash
pip install librosa soundfile pydub
```

Or install all requirements:
```bash
pip install -r requirements_transcribe.txt
```

### "ModuleNotFoundError"

**Solution:** Install missing Python packages:
```bash
pip install openai-whisper librosa soundfile pydub
```

### Server won't start

**Check:**
- Is port 3000 already in use? Try: `netstat -ano | findstr :3000`
- Are Node.js dependencies installed? Run: `npm install`
- Check for error messages in the terminal

### Slow transcription

- Use a smaller model (tiny or base)
- Large files take longer - be patient
- Consider using GPU if available (requires CUDA setup)

## Testing the Server

You can test if the server is running by visiting:
```
http://localhost:3000/health
```

You should see: `{"status":"ok"}`

