# MVP Audio Transcriber Extension

## Features
- 🎙️ Record browser tab audio and download it
- 📺 Paste a YouTube URL and get a full transcript using AssemblyAI
- 📁 Export transcripts as TXT, MD, or PDF
- 🧠 View transcription history
- 🔐 Save your API key securely

## Installation
1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click "Load unpacked" and select this folder

## Setup
1. Open the extension popup
2. Go to Settings → paste your AssemblyAI API key
3. Start recording or paste a YouTube link and transcribe

Server endpoint required for YouTube audio extraction:
POST to `/api/extract-audio` with `{ url, format }`

## Backend Server Example (Required for YouTube Audio Extraction)

You must run a backend server to handle YouTube audio extraction. Here is a minimal Node.js/Express example using `yt-dlp`:

```js
