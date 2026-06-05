// server.js
// Requirements: Node.js, yt-dlp installed, npm install express cors
// Set SERVER_URL env variable to your public server URL (e.g., https://mydomain.com or http://localhost:3000)

import 'dotenv/config';
import express from 'express';
import { exec } from 'child_process';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';
import Groq from 'groq-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const AUDIO_DIR = path.join(__dirname, 'audio');
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const AUDIO_RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const AUDIO_CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // check hourly

if (!fs.existsSync(AUDIO_DIR)) fs.mkdirSync(AUDIO_DIR);

// Configure multer for file uploads
const upload = multer({ 
  dest: AUDIO_DIR,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Clean up audio files older than 3 days
setInterval(() => {
  fs.readdir(AUDIO_DIR, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(AUDIO_DIR, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && Date.now() - stats.mtimeMs > AUDIO_RETENTION_MS) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}, AUDIO_CLEANUP_INTERVAL_MS);

app.post('/api/extract-audio', (req, res) => {
  const { url, format = 'mp3' } = req.body;
  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const safeFormat = ['mp3', 'wav', 'm4a', 'opus', 'flac'].includes(format) ? format : 'mp3';
  const outputTemplate = path.join(AUDIO_DIR, 'audio_%(id)s.%(ext)s');
  const cmd = `yt-dlp -f m4a/bestaudio --extract-audio --audio-format ${safeFormat} -o "${outputTemplate}" "${url}"`;
  const getIdCmd = `yt-dlp --get-id "${url}"`;

  exec(getIdCmd, (idErr, stdout) => {
    if (idErr) {
      console.error('yt-dlp get-id error:', idErr);
      return res.status(500).json({ error: 'Failed to get video ID' });
    }
    const videoId = stdout.trim();
    exec(cmd, (err, _stdout, stderr) => {
      if (err) {
        console.error('yt-dlp error:', err);
        console.error('yt-dlp stderr:', stderr);
        return res.status(500).json({ error: 'Extraction failed', details: stderr });
      }
      const filename = `audio_${videoId}.${safeFormat}`;
      res.json({ audioUrl: `${SERVER_URL}/audio/${filename}` });
    });
  });
});

// Whisper transcription endpoint
app.post('/api/transcribe-whisper', upload.single('file'), (req, res) => {
  const { model = 'tiny' } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  // Validate model
  const validModels = ['tiny', 'base', 'small', 'medium', 'large'];
  const whisperModel = validModels.includes(model) ? model : 'tiny';

  // Get Python executable (try python3 first, then python)
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  
  // Path to the transcription script
  const scriptPath = path.join(__dirname, 'transcribe_video_simple.py');
  
  // Check if script exists
  if (!fs.existsSync(scriptPath)) {
    return res.status(500).json({ 
      error: 'Whisper transcription script not found',
      details: `Expected at: ${scriptPath}`
    });
  }

  // Run transcription with timeout (10 minutes max)
  const cmd = `${pythonCmd} "${scriptPath}" "${file.path}" --model ${whisperModel} --output "${file.path}_transcript.txt"`;
  
  let responseSent = false;
  const sendError = (error, details) => {
    if (responseSent) return;
    responseSent = true;
    res.status(500).json({ error, details });
  };

  const transcriptionProcess = exec(cmd, { maxBuffer: 1024 * 1024 * 100 }, (err, stdout, stderr) => {
    // Clean up uploaded file
    if (fs.existsSync(file.path)) {
      fs.unlink(file.path, () => {});
    }

    if (err) {
      console.error('Whisper transcription error:', err);
      console.error('stderr:', stderr);
      console.error('stdout:', stdout);
      
      // Provide helpful error messages
      let errorMessage = 'Transcription failed';
      let errorDetails = stderr || err.message;
      
      // Check for common errors
      if (stderr && (stderr.includes('ffmpeg') || stderr.includes('file specified'))) {
        errorMessage = 'FFmpeg not found. Please install audio extraction libraries:';
        errorDetails = 'pip install librosa soundfile pydub\nOr install ffmpeg from https://ffmpeg.org/download.html';
      } else if (stderr && (stderr.includes('ModuleNotFoundError') || stderr.includes('No module named'))) {
        errorMessage = 'Missing Python dependencies. Please install:';
        errorDetails = 'pip install -r requirements_transcribe.txt';
      } else if (stderr && stderr.includes('openai-whisper')) {
        errorMessage = 'Whisper package not installed. Please install:';
        errorDetails = 'pip install openai-whisper';
      }
      
      return sendError(errorMessage, errorDetails);
    }

    // Read transcript file
    const transcriptPath = `${file.path}_transcript.txt`;
    fs.readFile(transcriptPath, 'utf8', (readErr, transcript) => {
      // Clean up transcript file
      if (fs.existsSync(transcriptPath)) {
        fs.unlink(transcriptPath, () => {});
      }

      if (readErr) {
        return sendError('Failed to read transcript', readErr.message);
      }

      if (!transcript || transcript.trim().length === 0) {
        return sendError('Transcription is empty', 'The transcription completed but returned no text');
      }

      if (responseSent) return;
      responseSent = true;
      res.json({ 
        text: transcript.trim(),
        model: whisperModel
      });
    });
  });

  // Set timeout (10 minutes)
  setTimeout(() => {
    if (!transcriptionProcess.killed && !responseSent) {
      transcriptionProcess.kill();
      if (fs.existsSync(file.path)) {
        fs.unlink(file.path, () => {});
      }
      sendError('Transcription timeout', 'Transcription took longer than 10 minutes and was cancelled');
    }
  }, 10 * 60 * 1000);
});

// Groq Whisper transcription — accepts either a file upload or a filename from /api/extract-audio
app.post('/api/transcribe-groq', upload.single('file'), async (req, res) => {
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    let filePath;
    let cleanup = false;

    if (req.file) {
      // Direct upload
      filePath = req.file.path;
      cleanup = true;
    } else if (req.body.filename) {
      // Filename from a previous /api/extract-audio response
      const safe = path.basename(req.body.filename);
      filePath = path.join(AUDIO_DIR, safe);
    } else if (req.body.audioUrl) {
      // Full URL like http://localhost:3000/audio/audio_xyz.mp3 — extract filename
      const safe = path.basename(new URL(req.body.audioUrl).pathname);
      filePath = path.join(AUDIO_DIR, safe);
    } else {
      return res.status(400).json({ error: 'Provide a file upload, filename, or audioUrl' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found', path: filePath });
    }

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: req.body.model || 'whisper-large-v3-turbo',
      response_format: 'json',
    });

    if (cleanup) fs.unlink(filePath, () => {});

    res.json({ text: transcription.text, model: req.body.model || 'whisper-large-v3-turbo' });
  } catch (err) {
    console.error('Groq transcription error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.use('/audio', express.static(AUDIO_DIR));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
