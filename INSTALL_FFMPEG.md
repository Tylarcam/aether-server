# Installing FFmpeg for Video Transcription

FFmpeg is required to extract audio from video files (MP4, AVI, etc.). Here are the easiest ways to install it:

## Option 1: Extract Your Existing Archive (Recommended)

You already have `ffmpeg-release-full.7z` in the project directory!

### Using 7-Zip (if installed):
1. Right-click `ffmpeg-release-full.7z`
2. Select "7-Zip" → "Extract Here" (or "Extract to ffmpeg-release-full/")
3. Navigate into the extracted folder
4. Find the `bin` folder (should contain `ffmpeg.exe`)
5. Copy the full path to the `bin` folder (e.g., `C:\Users\tylar\code\audio_transcriber_mvp\ffmpeg-release-full\bin`)

### Using Windows built-in extraction:
1. Install 7-Zip from https://www.7-zip.org/ (if not already installed)
2. Right-click `ffmpeg-release-full.7z` → "7-Zip" → "Extract Here"
3. Find the `bin` folder inside the extracted folder

### Add to PATH:
1. Press `Win + X` → Select "System"
2. Click "Advanced system settings"
3. Click "Environment Variables"
4. Under "System variables", find "Path" and click "Edit"
5. Click "New" and paste the path to the `bin` folder
6. Click "OK" on all dialogs
7. **Restart your terminal/IDE** for changes to take effect

### Verify Installation:
Open a new terminal and run:
```bash
ffmpeg -version
```

You should see version information.

## Option 2: Download Pre-built FFmpeg

1. Go to https://www.gyan.dev/ffmpeg/builds/
2. Download "ffmpeg-release-essentials.zip"
3. Extract it to `C:\ffmpeg` (or any location you prefer)
4. Add `C:\ffmpeg\bin` to your PATH (follow steps above)
5. Restart terminal

## Option 3: Use Chocolatey (if installed)

```bash
choco install ffmpeg
```

## Option 4: Use Scoop (if installed)

```bash
scoop install ffmpeg
```

## After Installation

1. **Restart your terminal/IDE** (important!)
2. Verify: `ffmpeg -version`
3. Restart the server: `npm run server`
4. Try transcribing again in the extension

## Troubleshooting

**"ffmpeg is not recognized"**
- Make sure you restarted the terminal after adding to PATH
- Check that the path is correct (should point to the `bin` folder, not the parent folder)
- Try using the full path: `C:\path\to\ffmpeg\bin\ffmpeg.exe -version`

**Still not working?**
- Try using the full path to ffmpeg in the Python script temporarily
- Or extract the archive manually and note the exact path to `ffmpeg.exe`

