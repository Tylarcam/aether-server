/**
 * Transcription history storage — shared by background SW and side panel hooks.
 */

/**
 * @typedef {Object} HistoryMetadata
 * @property {string} [url] - Source page URL
 * @property {string} [title] - Subject / topic (video title, page title, file name)
 * @property {string} [author] - Publisher, channel, or author name
 * @property {number} [durationSec] - Source duration in seconds (when known)
 */

/**
 * @typedef {'idle'|'pending'|'ready'|'error'} CeoBriefStatus
 */

/**
 * @param {Object} params
 * @param {string} params.text
 * @param {string} params.sourceRef - URL or file name
 * @param {'url'|'file'} [params.sourceType]
 * @param {string} [params.service]
 * @param {string|null} [params.model]
 * @param {HistoryMetadata} [params.metadata]
 * @returns {Promise<Object>} saved history item (includes timestamp)
 */
export function saveToHistory({
  text,
  sourceRef,
  sourceType = 'url',
  service = 'groq',
  model = null,
  metadata = {},
}) {
  const timestamp = new Date().toISOString();
  return new Promise((resolve) => {
    chrome.storage.local.get(['history'], (res) => {
      const history = res.history || [];
      const item = {
        text,
        timestamp,
        source: service,
        sourceType,
        ceoBriefStatus: 'idle',
      };

      if (model) item.model = model;

      if (sourceType === 'url') {
        item.url = metadata.url || sourceRef;
      } else {
        item.fileName = sourceRef;
        if (metadata.url) item.url = metadata.url;
      }

      const title = metadata.title || (sourceType === 'file' ? sourceRef : null);
      if (title) item.title = title;
      if (metadata.author) item.author = metadata.author;
      if (
        typeof metadata.durationSec === 'number' &&
        Number.isFinite(metadata.durationSec) &&
        metadata.durationSec > 0
      ) {
        item.durationSec = Math.round(metadata.durationSec);
      }

      history.unshift(item);
      chrome.storage.local.set({ history }, () => resolve(item));
    });
  });
}

/**
 * Find the newest history row whose transcript matches (exact, then prefix).
 * Used by result panels to surface CEO Brief status for the just-finished job.
 * @param {Object[]} history
 * @param {string} text
 * @returns {Object|null}
 */
export function findHistoryItemByTranscript(history, text) {
  if (!text?.trim() || !Array.isArray(history)) return null;
  const needle = text.trim();
  const exact = history.find((h) => h.text?.trim() === needle);
  if (exact) return exact;
  return (
    history.find(
      (h) =>
        typeof h.text === 'string' &&
        (h.text.startsWith(needle.slice(0, 200)) || needle.startsWith(h.text.slice(0, 200)))
    ) || null
  );
}

/**
 * Patch a history row by timestamp. Returns the updated item.
 * @param {string} timestamp
 * @param {Object} patch
 * @returns {Promise<Object>}
 */
export function updateHistoryItem(timestamp, patch) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['history'], (res) => {
      const history = res.history || [];
      const idx = history.findIndex((h) => h.timestamp === timestamp);
      if (idx === -1) {
        reject(new Error('History item not found'));
        return;
      }
      history[idx] = { ...history[idx], ...patch };
      chrome.storage.local.set({ history }, () => resolve(history[idx]));
    });
  });
}

/**
 * @param {string} timestamp
 * @returns {Promise<Object|null>}
 */
export function getHistoryItem(timestamp) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['history'], (res) => {
      const history = res.history || [];
      resolve(history.find((h) => h.timestamp === timestamp) || null);
    });
  });
}

/** Display title for a history row (new + legacy entries). Never use the URL as the title. */
export function getHistoryDisplayTitle(item) {
  if (item.title) return item.title;
  if (item.fileName) return item.fileName;
  return 'Untitled transcription';
}

/** Safe filename slug for downloads. */
export function historyDownloadBasename(item) {
  const base = getHistoryDisplayTitle(item)
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return base || 'transcript';
}
