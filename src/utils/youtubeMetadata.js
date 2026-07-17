import { getYouTubeVideoId } from '@utils/validators';

const cache = new Map();

/**
 * Fetch YouTube video title + channel via the public oEmbed API (no API key).
 * @param {string} url
 * @returns {Promise<{ title: string|null, author: string|null }|null>}
 */
export async function fetchYouTubeOEmbed(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) return null;

  if (cache.has(videoId)) return cache.get(videoId);

  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const resp = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const result = {
      title: data.title?.trim() || null,
      author: data.author_name?.trim() || null,
    };
    cache.set(videoId, result);
    return result;
  } catch {
    return null;
  }
}

/** Fill missing title/author for YouTube URLs without overwriting existing values. */
export async function withYouTubeMetadata(url, metadata = {}) {
  if (!getYouTubeVideoId(url)) return metadata;
  if (metadata.title && metadata.author) return metadata;

  const oembed = await fetchYouTubeOEmbed(url);
  if (!oembed) return metadata;

  return {
    ...metadata,
    title: metadata.title || oembed.title || null,
    author: metadata.author || oembed.author || null,
  };
}
