export function isValidYouTubeUrl(url) {
  return getYouTubeVideoId(url) !== null;
}

export function getYouTubeVideoId(url) {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = parsed.pathname.slice(1).split('/')[0];
      return id?.length === 11 ? id : null;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = parsed.searchParams.get('v');
      if (v) return v;

      const shortsMatch = parsed.pathname.match(/^\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return shortsMatch[1];

      const embedMatch = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return embedMatch[1];
    }

    return null;
  } catch {
    return null;
  }
}

export function normalizeYouTubeWatchUrl(url) {
  const videoId = getYouTubeVideoId(url);
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}

export function isValidUrl(url) {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9]/gi, '-').toLowerCase();
}

export function generateTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function extractYouTubeUrl(text) {
  if (!text) return null;

  const urlPattern = /(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const match = text.match(urlPattern);

  if (match) {
    const videoId = match[4];
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  return null;
}

/** Extract a transcribable URL from pasted/dropped text (YouTube or any http(s) URL). */
export function extractUrl(text) {
  if (!text) return null;

  const youtubeUrl = extractYouTubeUrl(text);
  if (youtubeUrl) return youtubeUrl;

  const urlPattern = /https?:\/\/[^\s<>"{}|\\^`[\]]+/i;
  const match = text.match(urlPattern);
  if (!match) return null;

  const cleaned = match[0].replace(/[.,;:!?)]+$/, '');
  return isValidUrl(cleaned) ? cleaned : null;
}
