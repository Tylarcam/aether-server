const WHISPER_SUPPORTED_FORMATS = [
  // Audio formats
  'audio/mpeg',      // mp3
  'audio/mp4',       // mp4, m4a
  'audio/x-m4a',     // m4a (alternative MIME)
  'audio/mpga',      // mpga
  'audio/wav',       // wav
  'audio/webm',      // webm
  'audio/flac',      // flac
  'audio/ogg',       // ogg
  'audio/opus',      // opus
  // Video formats (Whisper extracts audio)
  'video/mp4',       // mp4
  'video/webm',      // webm
  'video/x-msvideo', // avi
];

const WHISPER_FILE_EXTENSIONS = [
  '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a',
  '.wav', '.webm', '.flac', '.ogg', '.opus', '.avi'
];

export function isValidWhisperFile(file) {
  if (!file) return false;

  // Check MIME type
  if (WHISPER_SUPPORTED_FORMATS.includes(file.type)) {
    return true;
  }

  // Fallback: check file extension
  const fileName = file.name.toLowerCase();
  return WHISPER_FILE_EXTENSIONS.some(ext => fileName.endsWith(ext));
}

export function isValidFileSize(file, maxSizeMB = 25) {
  if (!file) return false;
  const sizeMB = file.size / (1024 * 1024);
  return sizeMB <= maxSizeMB;
}

export function getFileSizeInMB(file) {
  if (!file) return 0;
  return (file.size / (1024 * 1024)).toFixed(2);
}

export function getWhisperSupportedFormats() {
  return 'Audio: mp3, mp4, mpeg, mpga, m4a, wav, webm, flac, ogg, opus\nVideo: mp4, webm, avi';
}
