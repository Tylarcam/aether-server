// server.js
// Requirements: Node.js, yt-dlp installed, npm install express cors
// Set SERVER_URL env variable to your public server URL (e.g., https://mydomain.com or http://localhost:3000)

import 'dotenv/config';
import express from 'express';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
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

// Configure multer for file uploads (large interviews are auto-compressed before Groq).
// Must keep the original extension — Groq infers type from the filename and rejects
// extensionless multer temp names (e.g. "a1b2c3d4").
const ALLOWED_AUDIO_EXTS = new Set([
  '.flac', '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.ogg', '.opus', '.wav', '.webm',
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: AUDIO_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const safeExt = ALLOWED_AUDIO_EXTS.has(ext) ? ext : '.mp3';
      cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${safeExt}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB — compress/chunk before Groq's 24MB cap
});

const execFileAsync = promisify(execFile);
const GROQ_MODEL = 'whisper-large-v3-turbo';
const GROQ_MAX_BYTES = 24 * 1024 * 1024;
const CHUNK_SECONDS = 600; // 10-min mono 32kbps speech chunks stay under Groq's cap
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;
const YTDLP_TIMEOUT_MS = 15 * 60 * 1000;

// yt-dlp binary: on machines with multiple Python installs, plain "yt-dlp" on PATH
// can resolve to a stale/outdated copy. Override with YTDLP_BIN if needed.
const YTDLP_BIN = process.env.YTDLP_BIN || 'yt-dlp';
// Cookie file (Netscape format) to get past YouTube's sign-in wall. Exported from a
// logged-in browser session via CDP. Never commit this file (see .gitignore).
const YTDLP_COOKIES_PATH = path.join(__dirname, 'youtube_cookies.txt');
const YTDLP_COOKIES_ARGS = fs.existsSync(YTDLP_COOKIES_PATH) ? ['--cookies', YTDLP_COOKIES_PATH] : [];

/**
 * Ensure audio is under Groq's 24 MB limit.
 * Compresses to mono 16 kHz 32k MP3 when oversized; segments if still too large.
 * Returns { paths, compressed, workDir } — caller must clean up workDir when set.
 */
async function prepareAudioForGroq(sourcePath) {
  const size = fs.statSync(sourcePath).size;
  if (size <= GROQ_MAX_BYTES) {
    return { paths: [sourcePath], compressed: false, workDir: null };
  }

  const workDir = fs.mkdtempSync(path.join(AUDIO_DIR, 'prep_'));
  const compressedPath = path.join(workDir, 'compressed.mp3');

  await execFileAsync('ffmpeg', [
    '-y', '-i', sourcePath,
    '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k',
    compressedPath,
  ], { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });

  if (fs.statSync(compressedPath).size <= GROQ_MAX_BYTES) {
    return { paths: [compressedPath], compressed: true, workDir };
  }

  await execFileAsync('ffmpeg', [
    '-y', '-i', compressedPath,
    '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k',
    '-f', 'segment', '-segment_time', String(CHUNK_SECONDS),
    path.join(workDir, 'chunk_%04d.mp3'),
  ], { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });

  const chunks = fs.readdirSync(workDir)
    .filter((f) => f.startsWith('chunk_') && f.endsWith('.mp3'))
    .sort()
    .map((f) => path.join(workDir, f));

  if (chunks.length === 0) {
    throw new Error('ffmpeg produced no audio chunks');
  }

  return { paths: chunks, compressed: true, workDir };
}

async function transcribePathsWithGroq(paths, { language, model } = {}) {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const useModel = model || GROQ_MODEL;
  const parts = [];
  for (const chunkPath of paths) {
    // Groq SDK uses the stream path basename for content-type sniffing.
    let uploadPath = chunkPath;
    if (!path.extname(chunkPath)) {
      uploadPath = `${chunkPath}.mp3`;
      fs.copyFileSync(chunkPath, uploadPath);
    }
    try {
      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(uploadPath),
        model: useModel,
        response_format: 'json',
        ...(language ? { language } : {}),
      });
      const text = (transcription.text || '').trim();
      if (text) parts.push(text);
    } finally {
      if (uploadPath !== chunkPath && fs.existsSync(uploadPath)) {
        fs.unlinkSync(uploadPath);
      }
    }
  }
  const text = parts.join('\n\n');
  if (!text) {
    throw new Error('Transcription returned no text (silent audio?)');
  }
  return { text, model: useModel, chunks: paths.length };
}

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => res.json({
  status: 'ok',
  auto_compress: true,
  max_upload_mb: 200,
  groq_max_mb: 24,
}));

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

// Groq Whisper — file upload / prior extract-audio path.
// Auto-compresses (and chunks if needed) when over Groq's 24 MB limit.
app.post('/api/transcribe-groq', upload.single('file'), async (req, res) => {
  let filePath;
  let cleanupUpload = false;
  let workDir = null;

  try {
    if (!process.env.GROQ_API_KEY) {
      return res.status(500).json({ error: 'GROQ_API_KEY not configured on the Aether server' });
    }

    if (req.file) {
      filePath = req.file.path;
      cleanupUpload = true;
    } else if (req.body.filename) {
      const safe = path.basename(req.body.filename);
      filePath = path.join(AUDIO_DIR, safe);
    } else if (req.body.audioUrl) {
      const safe = path.basename(new URL(req.body.audioUrl).pathname);
      filePath = path.join(AUDIO_DIR, safe);
    } else {
      return res.status(400).json({ error: 'Provide a file upload, filename, or audioUrl' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Audio file not found', path: filePath });
    }

    const prepared = await prepareAudioForGroq(filePath);
    workDir = prepared.workDir;
    const { text, model, chunks } = await transcribePathsWithGroq(prepared.paths, {
      model: req.body.model,
      language: req.body.language,
    });

    res.json({
      text,
      transcript: text,
      model,
      compressed: prepared.compressed,
      chunks,
    });
  } catch (err) {
    console.error('Groq transcription error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (cleanupUpload && filePath && fs.existsSync(filePath)) {
      fs.unlink(filePath, () => {});
    }
    if (workDir) {
      fs.rm(workDir, { recursive: true, force: true }, () => {});
    }
  }
});

// ---------------------------------------------------------------------------
// Agent-facing endpoint: URL in, transcript out.
// yt-dlp (residential IP) → auto-compress/chunk (Groq 24 MB cap) → Groq Whisper.
// ---------------------------------------------------------------------------

// yt-dlp --print with --no-simulate emits one metadata line to stdout while
// still downloading. The )j suffix makes yt-dlp print a JSON object.
const YTDLP_META_TEMPLATE = '%(.{title,duration,channel})j';

function parseYtdlpMeta(stdout) {
  const line = (stdout || '').split('\n').map(s => s.trim())
    .find(s => s.startsWith('{') && s.endsWith('}'));
  if (!line) return { title: null, channel: null, duration_sec: null };
  try {
    const meta = JSON.parse(line);
    return {
      title: meta.title || null,
      channel: meta.channel || null,
      duration_sec: Number.isFinite(meta.duration) ? Math.round(meta.duration) : null,
    };
  } catch {
    return { title: null, channel: null, duration_sec: null };
  }
}

app.post('/api/transcribe-url', async (req, res) => {
  const started = Date.now();
  const { url, language } = req.body || {};

  if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ success: false, error: 'Provide an http(s) url' });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ success: false, error: 'GROQ_API_KEY not configured on the Aether server' });
  }

  const jobDir = fs.mkdtempSync(path.join(AUDIO_DIR, 'job_'));
  const cleanup = () => fs.rm(jobDir, { recursive: true, force: true }, () => {});

  try {
    // 1. Download audio via yt-dlp (args array — no shell interpolation).
    const outTemplate = path.join(jobDir, 'source.%(ext)s');
    let meta = { title: null, channel: null, duration_sec: null };
    try {
      const { stdout } = await execFileAsync(YTDLP_BIN, [
        '--format', 'bestaudio/best',
        '--extract-audio',
        '--output', outTemplate,
        '--no-playlist',
        '--no-warnings',
        '--print', YTDLP_META_TEMPLATE,
        '--no-simulate',
        ...YTDLP_COOKIES_ARGS,
        url,
      ], { timeout: YTDLP_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 });
      meta = parseYtdlpMeta(stdout);
    } catch (err) {
      const stderr = (err.stderr || err.message || '').slice(0, 500);
      const blocked = /sign in|bot/i.test(stderr);
      return res.status(422).json({
        success: false,
        error: blocked
          ? 'yt-dlp blocked (sign-in wall). Video may need browser-session captions or the Record tab.'
          : `Audio extraction failed: ${stderr}`,
        stage: 'extract',
      });
    }

    const sources = fs.readdirSync(jobDir).filter(f => f.startsWith('source.'));
    if (sources.length === 0) {
      return res.status(422).json({ success: false, error: 'yt-dlp produced no audio file', stage: 'extract' });
    }
    const sourcePath = path.join(jobDir, sources[0]);

    // 2. Auto-compress / chunk under Groq's 24 MB cap, then transcribe.
    const prepared = await prepareAudioForGroq(sourcePath);
    const { text, model, chunks } = await transcribePathsWithGroq(prepared.paths, { language });
    if (prepared.workDir) {
      fs.rmSync(prepared.workDir, { recursive: true, force: true });
    }

    res.json({
      success: true,
      text,
      method: 'local_ytdlp_groq',
      model,
      title: meta.title,
      channel: meta.channel,
      duration_sec: meta.duration_sec,
      compressed: prepared.compressed,
      chunks,
      char_count: text.length,
      latency_ms: Date.now() - started,
    });
  } catch (err) {
    console.error('transcribe-url error:', err);
    res.status(500).json({ success: false, error: err.message, stage: 'transcribe' });
  } finally {
    cleanup();
  }
});

app.use('/audio', express.static(AUDIO_DIR));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
