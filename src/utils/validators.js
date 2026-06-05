export function isValidYouTubeUrl(url) {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url);
}

export function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

export function generateTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function extractYouTubeUrl(text) {
  if (!text) return null;
  
  // Try to find YouTube URL in text
  const urlPattern = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = text.match(urlPattern);
  
  if (match) {
    const videoId = match[4];
    return `https://www.youtube.com/watch?v=${videoId}`;
  }
  
  return null;
}
