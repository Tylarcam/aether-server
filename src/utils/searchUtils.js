/**
 * Search utility functions for filtering transcription history
 */

/**
 * Search through a history item for matching text
 * @param {Object} item - History item with text, fileName, url, timestamp
 * @param {string} query - Search query (case-insensitive)
 * @returns {boolean} - True if item matches search query
 */
export function searchHistoryItem(item, query) {
  if (!query || !query.trim()) {
    return true;
  }

  const searchTerm = query.toLowerCase().trim();

  // Search in transcript text
  if (item.text && item.text.toLowerCase().includes(searchTerm)) {
    return true;
  }

  // Search in file name
  if (item.fileName && item.fileName.toLowerCase().includes(searchTerm)) {
    return true;
  }

  // Search in URL
  if (item.url && item.url.toLowerCase().includes(searchTerm)) {
    return true;
  }

  // Search in timestamp (formatted date)
  if (item.timestamp) {
    try {
      const date = new Date(item.timestamp);
      const dateString = date.toLocaleDateString().toLowerCase();
      const timeString = date.toLocaleTimeString().toLowerCase();
      if (dateString.includes(searchTerm) || timeString.includes(searchTerm)) {
        return true;
      }
    } catch (e) {
      // Ignore date parsing errors
    }
  }

  // Search in service/model
  if (item.source && item.source.toLowerCase().includes(searchTerm)) {
    return true;
  }

  if (item.model && item.model.toLowerCase().includes(searchTerm)) {
    return true;
  }

  return false;
}

/**
 * Filter history array based on search query
 * @param {Array} history - Array of history items
 * @param {string} query - Search query
 * @returns {Array} - Filtered history array
 */
export function filterHistory(history, query) {
  if (!query || !query.trim()) {
    return history;
  }

  return history.filter(item => searchHistoryItem(item, query));
}

/**
 * Debounce function to delay search execution
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}


