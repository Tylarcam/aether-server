// Background Service Worker

import { isValidYouTubeUrl, getYouTubeVideoId, normalizeYouTubeWatchUrl } from '@utils/validators';

const AETHER_API_URL = 'https://tylarcam--aether-transcribe-web.modal.run';
const LOCAL_SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000';
const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || '';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Aether Audio Transcriber Installed');
});

// Open the side panel when the user clicks the toolbar icon.
// Using action.onClicked (instead of openPanelOnActionClick) is required so that Chrome
// fires the onClicked event, which grants activeTab permission for that tab.
// Without activeTab, chrome.tabCapture.getMediaStreamId always fails with
// "Extension has not been invoked for the current page".
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
});

// ---- Recording State ----

// Ensure the offscreen recording document exists
async function ensureOffscreenDocument() {
  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Recording tab audio for transcription'
    });
  } catch (err) {
    // "Only a single offscreen document may be created" means it already exists — that's fine
    if (!err.message?.includes('single offscreen')) throw err;
  }
}

// Close the offscreen document if it exists
async function closeOffscreenDocument() {
  try {
    await chrome.offscreen.closeDocument();
  } catch (_) {
    // Already closed or never opened — ignore
  }
}

// Send a message to the offscreen recorder, verifying the document exists first
async function sendToOffscreen(message) {
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  if (!contexts.length) {
    throw new Error('Offscreen recorder not available');
  }
  return chrome.runtime.sendMessage({ target: 'offscreen', ...message });
}

// Shared stop flow — used by manual stop and video-end auto-stop
async function handleStopRecording() {
  await chrome.storage.session.set({
    recordingState: { isRecording: false, status: 'Stopping...' }
  });
  chrome.runtime.sendMessage({ type: 'recordingStopping' }).catch(() => {});
  await sendToOffscreen({ type: 'stopRecording' });
}

async function injectVideoWatcher(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const videos = Array.from(document.querySelectorAll('video'));
        if (!videos.length) {
          chrome.runtime.sendMessage({
            type: 'videoPlaybackInfo',
            duration: null,
            currentTime: null
          });
          return;
        }

        const video = videos.reduce((best, v) => {
          if (!best) return v;
          if (v.duration > best.duration) return v;
          return best;
        }, null);

        const duration = Number.isFinite(video.duration) ? video.duration : null;

        chrome.runtime.sendMessage({
          type: 'videoPlaybackInfo',
          duration,
          currentTime: video.currentTime
        });

        if (duration !== null) {
          video.addEventListener('ended', () => {
            chrome.runtime.sendMessage({ type: 'videoEnded' }).catch(() => {});
          }, { once: true });
        }
      }
    });
  } catch (err) {
    console.warn('[background] injectVideoWatcher failed:', err.message);
  }
}

// ---- IndexedDB helpers for large recording blobs ----
// Offscreen document stores blobs here; background SW reads and downloads them.
// Both share the same origin (chrome-extension://[id]/) so they access the same IDB.

function openRecordingsIDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('aether_recordings', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('blobs');
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function getBlobFromIDB(filename) {
  const db = await openRecordingsIDB();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readonly');
    const req = tx.objectStore('blobs').get(filename);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
  if (!blob) throw new Error('Recording blob not found in IDB');
  return blob;
}

async function downloadBlobFromIDB(filename) {
  const db = await openRecordingsIDB();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction('blobs', 'readwrite');
    const getReq = tx.objectStore('blobs').get(filename);
    getReq.onsuccess = () => resolve(getReq.result);
    getReq.onerror = () => reject(getReq.error);
    tx.oncomplete = () => db.close();
  });

  if (!blob) throw new Error('Recording blob not found in IDB');

  // URL.createObjectURL is not available in MV3 extension service workers.
  // Convert the blob to a base64 data URL entirely within the SW using
  // blob.arrayBuffer() (available in SW) + btoa() — no IPC size limits apply.
  const dataUrl = await blobToDataUrl(blob);

  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, (downloadId) => {
      // Clean up the blob from IDB now that download has started
      openRecordingsIDB().then((db2) => {
        const tx = db2.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(filename);
        tx.oncomplete = () => db2.close();
      }).catch(() => {});
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(err.message));
      else resolve(downloadId);
    });
  });
}

async function blobToDataUrl(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  // Build binary string in chunks to avoid call-stack overflow on large files
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < uint8.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, uint8.subarray(i, i + CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

// ---- Error logging ----

async function logError({ jobId, source, sourceRef, errorMessage, stage, service, httpStatus }) {
  const entry = {
    id: `err_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    timestamp: new Date().toISOString(),
    jobId,
    source,
    sourceRef,
    errorMessage,
    stage,
    service,
    ...(httpStatus ? { httpStatus } : {})
  };

  const res = await chrome.storage.local.get(['error_log']);
  const log = res.error_log || [];
  log.unshift(entry);
  if (log.length > 100) log.length = 100;
  await chrome.storage.local.set({ error_log: log });
}

// Active transcription jobs
const activeJobs = new Map();

// Keep-alive: prevent MV3 service worker from being terminated during long async operations.
// Chrome will kill idle SWs after ~30s; we ping storage every 20s while any job is running.
let keepAliveTimer = null;

function startKeepAlive() {
  if (keepAliveTimer) return; // already running
  keepAliveTimer = setInterval(() => {
    chrome.storage.session.set({ _keepAlive: Date.now() });
  }, 20000);
}

function stopKeepAlive() {
  if (activeJobs.size === 0 && keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// Generate unique job ID
function generateJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Calculate timing metrics
function calculateTimingMetrics(jobData, currentProgress) {
  if (!jobData.startTime || currentProgress <= 5) {
    return {
      elapsedTime: 0,
      estimatedTimeRemaining: null,
      processingSpeed: null
    };
  }

  const now = Date.now();
  const elapsedMs = now - jobData.startTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  
  // Calculate ETA only if we have meaningful progress
  let estimatedTimeRemaining = null;
  let processingSpeed = null;
  
  if (currentProgress > 5) {
    const progressRatio = currentProgress / 100;
    const estimatedTotalMs = elapsedMs / progressRatio;
    const estimatedRemainingMs = estimatedTotalMs - elapsedMs;
    estimatedTimeRemaining = Math.max(0, Math.floor(estimatedRemainingMs / 1000));
    
    // Processing speed: percentage per second
    processingSpeed = currentProgress / elapsedSeconds;
  }

  return {
    elapsedTime: elapsedSeconds,
    estimatedTimeRemaining,
    processingSpeed
  };
}

// Format time as "Xm Ys" or "Xs"
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}

// Update job progress in storage
async function updateJobProgress(jobId, progress) {
  // Get existing job data to calculate timing
  const existingData = await chrome.storage.local.get([`transcription_${jobId}`]);
  const existingJob = existingData[`transcription_${jobId}`] || {};
  
  // Ensure startTime is set
  if (!existingJob.startTime && progress.status !== 'error') {
    existingJob.startTime = Date.now();
  }

  // Calculate timing metrics
  const timingMetrics = calculateTimingMetrics(existingJob, progress.progress || 0);

  const progressData = {
    ...progress,
    ...timingMetrics,
    startTime: existingJob.startTime || Date.now(),
    updatedAt: Date.now()
  };
  
  await chrome.storage.local.set({
    [`transcription_${jobId}`]: progressData
  });
  
  // Try to notify any open extension pages (popup, etc.)
  // This will fail silently if no listeners are available (popup closed)
  chrome.runtime.sendMessage({
    type: 'transcription_progress',
    jobId,
    ...progressData
  }).catch(() => {
    // Ignore - no listeners available (popup closed)
  });
}

// Show notification
async function showNotification(jobId, title, message, type = 'basic') {
  const notificationId = `transcription_${jobId}`;
  
  await chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title,
    message,
    priority: 2
  });
  
  return notificationId;
}

// The injected caption-extraction function (runs in MAIN world on the YouTube page).
// YouTube timedtext URLs now require player-generated PoTokens (pot=). Direct fetches of
// captionTracks[].baseUrl return HTTP 200 with an empty body. We drive the YouTube player
// captions module and reuse the player-generated json3 URL (or intercept the fetch).
async function _extractCaptionsInPage(expectedVideoId) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function textFromJson3Events(events) {
    return (events || [])
      .filter((event) => event?.segs)
      .map((event) => event.segs.map((seg) => seg.utf8 || '').join(''))
      .join(' ')
      .replace(/[\n\r\uFEFF]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseJson3(text) {
    if (!text) return null;
    try {
      const data = JSON.parse(text);
      const transcript = textFromJson3Events(data.events);
      return transcript || null;
    } catch {
      return null;
    }
  }

  function timedtextUrlMatchesVideo(url) {
    try {
      return new URL(url, location.origin).searchParams.get('v') === expectedVideoId;
    } catch {
      return false;
    }
  }

  function captionTrackToPlayerTrack(track) {
    if (!track?.languageCode) return null;
    const name = track.name?.simpleText
      || (Array.isArray(track.name?.runs) ? track.name.runs.map((run) => run?.text || '').join('') : '')
      || track.languageCode;
    return {
      displayName: name,
      id: null,
      is_default: false,
      is_servable: false,
      is_translateable: !!track.isTranslatable,
      kind: track.kind || '',
      languageCode: track.languageCode,
      languageName: name,
      name: '',
      vss_id: track.vssId || `${track.kind === 'asr' ? 'a.' : '.'}${track.languageCode}`,
    };
  }

  function getTrackCandidates(player) {
    const tracklist = player?.getOption?.('captions', 'tracklist');
    if (Array.isArray(tracklist) && tracklist.length > 0) return tracklist;

    const playerResponse = player?.getPlayerResponse?.() || window.ytInitialPlayerResponse;
    const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(captionTracks)) return [];
    return captionTracks.map(captionTrackToPlayerTrack).filter(Boolean);
  }

  function pickTrack(tracklist) {
    if (!Array.isArray(tracklist) || !tracklist.length) return null;
    return tracklist.find((track) => track.languageCode === 'en' && track.kind !== 'asr')
      || tracklist.find((track) => track.languageCode === 'en')
      || tracklist.find((track) => track.kind !== 'asr')
      || tracklist[0];
  }

  function isJson3TimedtextUrl(url, track) {
    if (!url || !url.includes('/api/timedtext')) return false;
    if (!url.includes('fmt=json3')) return false;
    if (!url.includes('pot=')) return false;
    if (!timedtextUrlMatchesVideo(url)) return false;
    if (!track?.languageCode) return true;
    try {
      const parsed = new URL(url, location.origin);
      const got = String(parsed.searchParams.get('lang') || '').toLowerCase();
      const wanted = String(track.languageCode || '').toLowerCase();
      const gotBase = got.split('-')[0];
      const wantedBase = wanted.split('-')[0];
      return got === wanted || gotBase === wantedBase || wantedBase === got;
    } catch {
      return false;
    }
  }

  function findTimedtextUrl(track) {
    const urls = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((url) => isJson3TimedtextUrl(url, track));
    return urls.length ? urls[urls.length - 1] : '';
  }

  async function fetchTimedtextUrl(url) {
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) return null;
    return parseJson3(await resp.text());
  }

  // Legacy path: works only when YouTube has not enabled PoToken on this video.
  const pr = window.ytInitialPlayerResponse;
  if (pr?.videoDetails?.videoId === expectedVideoId) {
    const tracks = pr.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (tracks?.length) {
      const track = tracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr')
        || tracks.find((t) => t.languageCode === 'en')
        || tracks[0];
      if (track?.baseUrl && !track.baseUrl.includes('exp=xpe')) {
        const legacyText = await fetchTimedtextUrl(`${track.baseUrl}&fmt=json3`);
        if (legacyText) return legacyText;
      }
    }
  }

  const player = document.getElementById('movie_player');
  if (!player?.getOption || !player?.setOption) return null;

  let track = null;
  for (let i = 0; i < 20; i += 1) {
    track = pickTrack(getTrackCandidates(player));
    if (track) break;
    await sleep(500);
  }
  if (!track) return null;

  const originalFetch = globalThis.fetch;
  const boundOriginalFetch = originalFetch?.bind(globalThis);
  const OriginalXHR = globalThis.XMLHttpRequest;
  let capturedJson3Text = '';

  try {
    if (boundOriginalFetch) {
      globalThis.fetch = async (...args) => {
        const response = await boundOriginalFetch(...args);
        try {
          const req = args[0];
          const reqUrl = typeof req === 'string' ? req : req?.url || '';
          if (isJson3TimedtextUrl(reqUrl, track) && response?.ok) {
            const text = await response.clone().text();
            if (text && !capturedJson3Text) capturedJson3Text = text;
          }
        } catch {
          // Ignore capture errors — polling fallback still runs.
        }
        return response;
      };
    }

    if (OriginalXHR) {
      globalThis.XMLHttpRequest = class TimedtextCaptureXHR extends OriginalXHR {
        open(method, url, ...rest) {
          this.__aetherTimedtextUrl = typeof url === 'string' ? url : '';
          return super.open(method, url, ...rest);
        }

        send(...args) {
          this.addEventListener('load', () => {
            try {
              const url = this.__aetherTimedtextUrl || this.responseURL || '';
              if (!isJson3TimedtextUrl(url, track)) return;
              if (this.status < 200 || this.status >= 300) return;
              const text = typeof this.responseText === 'string' ? this.responseText : '';
              if (text && !capturedJson3Text) capturedJson3Text = text;
            } catch {
              // Ignore capture errors — polling fallback still runs.
            }
          });
          return super.send(...args);
        }
      };
    }

    try { player.loadModule?.('captions'); } catch { /* module may already be loaded */ }
    await sleep(500);
    try { player.setOption('captions', 'track', track); } catch { /* best effort */ }
    try {
      player.mute?.();
      player.playVideo?.();
    } catch { /* autoplay may be blocked — timedtext can still load */ }

    for (let i = 0; i < 30; i += 1) {
      await sleep(500);

      if (capturedJson3Text) {
        const capturedText = parseJson3(capturedJson3Text);
        if (capturedText) return capturedText;
      }

      const timedtextUrl = findTimedtextUrl(track);
      if (timedtextUrl) {
        const fetchedText = await fetchTimedtextUrl(timedtextUrl);
        if (fetchedText) return fetchedText;
      }
    }

    return null;
  } finally {
    try { player.pauseVideo?.(); } catch { /* ignore */ }
    if (originalFetch) globalThis.fetch = originalFetch;
    if (OriginalXHR) globalThis.XMLHttpRequest = OriginalXHR;
  }
}

// Wait for YouTube player + ytInitialPlayerResponse before caption extraction.
async function _waitForPlayerResponse(tabId, videoId, timeoutMs = 22000) {
  const pollInterval = 800;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: (vid) => {
        const pr = window.ytInitialPlayerResponse;
        const player = document.getElementById('movie_player');
        const prReady = pr?.videoDetails?.videoId === vid;
        const playerReady = !!(player?.getOption && player?.setOption);
        if (prReady && playerReady) return 'ready';
        if (prReady) return 'player-waiting';
        return 'waiting';
      },
      args: [videoId]
    }).catch(() => null);
    if (results?.[0]?.result === 'ready') return true;
    await new Promise((r) => setTimeout(r, pollInterval));
  }
  return false;
}

// Extract captions for a YouTube URL.
// 1. If the video is already open in a tab: read captions from that tab instantly.
// 2. If not: open a background tab, wait for YouTube's JS to load, extract, then close the tab.
// Both paths use the user's authenticated browser session — works for age-restricted videos.
async function tryGetCaptionsFromTab(url) {
  let tempTabId = null;
  try {
    const videoId = getYouTubeVideoId(url);
    if (!videoId) return null;

    const watchUrl = normalizeYouTubeWatchUrl(url);
    let tabs = await chrome.tabs.query({ url: `https://www.youtube.com/watch?v=${videoId}*` });
    let tabId;

    if (tabs.length) {
      tabId = tabs[0].id;
    } else {
      const newTab = await chrome.tabs.create({ url: watchUrl, active: false });
      tempTabId = newTab.id;
      tabId = newTab.id;
      await chrome.tabs.update(tabId, { muted: true }).catch(() => {});
    }

    // Always wait — existing tabs may still be loading player data
    const ready = await _waitForPlayerResponse(tabId, videoId);
    if (!ready) return null;

    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: _extractCaptionsInPage,
      args: [videoId]
    });

    return results?.[0]?.result || null;
  } catch (err) {
    // Scripting blocked, tab crashed, navigated away — fall through to Modal
    console.warn('[captions]', err.message);
    return null;
  } finally {
    // Clean up the background tab we opened (if any)
    if (tempTabId !== null) {
      chrome.tabs.remove(tempTabId).catch(() => {});
    }
  }
}

// YouTube fallback via local server (yt-dlp + Groq on your machine — uses residential IP).
async function tryLocalServerYouTubeTranscription(url) {
  try {
    const extractResp = await fetch(`${LOCAL_SERVER_URL}/api/extract-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, format: 'mp3' })
    });
    if (!extractResp.ok) return null;

    const { audioUrl } = await extractResp.json();
    if (!audioUrl) return null;

    const transcribeResp = await fetch(`${LOCAL_SERVER_URL}/api/transcribe-groq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl })
    });
    if (!transcribeResp.ok) return null;

    const data = await transcribeResp.json();
    return data.text?.trim() || null;
  } catch (err) {
    console.warn('[local-server]', err.message);
    return null;
  }
}

// Handle URL transcription (YouTube + other video pages via yt-dlp).
// YouTube: captions first (instant, works for age-restricted), then local server, then Modal.
// Other URLs: skip caption path, go straight to Modal yt-dlp.
async function transcribeUrl(jobId, url) {
  const isYouTube = isValidYouTubeUrl(url);

  try {
    if (isYouTube) {
      await updateJobProgress(jobId, {
        status: 'extracting',
        message: '🔍 Checking for captions...',
        progress: 10
      });

      const captionText = await tryGetCaptionsFromTab(url);
      if (captionText) {
        await updateJobProgress(jobId, {
          status: 'completed',
          message: '✅ Transcription complete!',
          progress: 100,
          result: captionText,
          sourceType: 'url'
        });
        await showNotification(jobId, 'Transcription Complete', 'YouTube captions extracted successfully!');
        saveToHistory(captionText, url, 'url', 'captions');
        activeJobs.delete(jobId);
        stopKeepAlive();
        return;
      }
    } else {
      await updateJobProgress(jobId, {
        status: 'extracting',
        message: '📥 Extracting audio from page...',
        progress: 10
      });
    }

    if (isYouTube) {
      await updateJobProgress(jobId, {
        status: 'extracting',
        message: '📥 Trying local server (yt-dlp)...',
        progress: 15
      });

      const localTranscript = await tryLocalServerYouTubeTranscription(url);
      if (localTranscript) {
        await updateJobProgress(jobId, {
          status: 'completed',
          message: '✅ Transcription complete!',
          progress: 100,
          result: localTranscript,
          sourceType: 'url'
        });
        await showNotification(jobId, 'Transcription Complete', 'YouTube video transcribed via local server!');
        saveToHistory(localTranscript, url, 'url', 'local');
        activeJobs.delete(jobId);
        stopKeepAlive();
        return;
      }
    }

    await updateJobProgress(jobId, {
      status: 'extracting',
      message: '📥 Extracting and transcribing audio...',
      progress: 20
    });

    let response;
    try {
      response = await fetch(`${AETHER_API_URL}/transcribe/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
    } catch (fetchError) {
      throw new Error('Cannot reach transcription service. Check your connection and try again.');
    }

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Service error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success) {
      if (isYouTube) {
        const serverBlocked = data.error?.toLowerCase().includes('blocking') || data.error?.toLowerCase().includes('bot');
        if (serverBlocked) {
          throw new Error("Could not read captions from your browser, and YouTube blocks cloud server-side extraction.\n\nTry this:\n• Open the video in a YouTube tab (captions/CC enabled), then paste the URL again\n• Make sure npm run server is running with yt-dlp installed (uses your home IP)\n• For videos without captions, use the Record tab while the video plays");
        }
        const isAgeRestricted = data.error?.toLowerCase().includes('age');
        if (isAgeRestricted) {
          throw new Error('This video is age-restricted. Sign in to YouTube, open the video, then paste the URL again — Aether will extract captions using your session.');
        }
      } else {
        throw new Error(`${data.error || 'Could not extract audio from this URL.'}\n\nTip: open the page in a browser tab and use Aether's Record tab to capture the audio directly.`);
      }
      throw new Error(data.error || 'Transcription failed');
    }

    await updateJobProgress(jobId, {
      status: 'completed',
      message: '✅ Transcription complete!',
      progress: 100,
      result: data.transcript,
      sourceType: 'url'
    });

    const notifyMsg = isYouTube ? 'YouTube video transcribed successfully!' : 'Page audio transcribed successfully!';
    await showNotification(jobId, 'Transcription Complete', notifyMsg);
    saveToHistory(data.transcript, url, 'url', 'aether');
    activeJobs.delete(jobId);
    stopKeepAlive();
  } catch (error) {
    await updateJobProgress(jobId, {
      status: 'error',
      message: `❌ ${error.message}`,
      progress: 0,
      error: error.message
    });
    await logError({ jobId, source: 'url', sourceRef: url, errorMessage: error.message, stage: 'transcribing', service: 'aether' });
    await showNotification(jobId, 'Transcription Failed', error.message, 'basic');
    activeJobs.delete(jobId);
    stopKeepAlive();
  }
}

// Handle Modal Whisper transcription (cloud, always-on endpoint)
async function transcribeWithModalWhisper(jobId, fileData, modalUrl, modelSize) {
  try {
    if (!modalUrl) throw new Error('Modal Whisper URL not configured. Add it in Settings.');

    await updateJobProgress(jobId, {
      status: 'processing',
      message: 'Sending to Whisper (Modal)...',
      progress: 20
    });

    const cleanUrl = modalUrl.replace(/\/$/, '');
    const response = await fetch(`${cleanUrl}/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audio_base64: fileData.data,
        model: modelSize || 'base',
        filename: fileData.name || 'audio.webm',
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Modal API error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.text) throw new Error('No transcription text returned from Modal');

    await updateJobProgress(jobId, {
      status: 'completed',
      message: 'Transcription complete!',
      progress: 100,
      result: data.text,
      sourceType: 'file'
    });

    await showNotification(jobId, 'Transcription Complete', 'Whisper (Modal) transcription finished!');
    saveToHistory(data.text, fileData.name, 'file', 'whisper-modal', modelSize);
    activeJobs.delete(jobId);
    stopKeepAlive();
  } catch (error) {
    await updateJobProgress(jobId, {
      status: 'error',
      message: `❌ Modal Whisper error: ${error.message}`,
      progress: 0,
      error: error.message
    });
    await logError({ jobId, source: 'file', sourceRef: fileData?.name, errorMessage: error.message, stage: 'processing', service: 'whisper-modal' });
    await showNotification(jobId, 'Transcription Failed', error.message);
    activeJobs.delete(jobId);
    stopKeepAlive();
  }
}

// Handle file transcription — calls Groq API directly if a key is available,
// falls back to the Aether Modal backend (no key required).
async function transcribeWithGroq(jobId, fileData, groqApiKey) {
  try {
    await updateJobProgress(jobId, {
      status: 'processing',
      message: '🚀 Transcribing audio...',
      progress: 20
    });

    let transcript;

    if (groqApiKey) {
      // Direct Groq API path
      const byteCharacters = atob(fileData.data);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteArray[i] = byteCharacters.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: fileData.type });
      const formData = new FormData();
      formData.append('file', blob, fileData.name || 'audio.webm');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'json');

      await updateJobProgress(jobId, { status: 'processing', message: '🚀 Sending to Groq...', progress: 40 });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);
      let response;
      try {
        response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqApiKey}` },
          body: formData,
          signal: controller.signal
        });
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') throw new Error('Groq request timed out after 60s. Try again.');
        throw fetchErr;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Groq API error: ${response.status}`);
      }
      const data = await response.json();
      if (!data.text) throw new Error('No transcription text returned from Groq');
      transcript = data.text;
    } else {
      // Aether Modal backend fallback (no key needed)
      let response;
      try {
        response = await fetch(`${AETHER_API_URL}/transcribe/audio`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audio_b64: fileData.data, filename: fileData.name || 'audio.webm' })
        });
      } catch (fetchError) {
        throw new Error('Cannot reach transcription service. Check your connection and try again.');
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Service error: ${response.status}`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error || 'Transcription failed');
      transcript = data.transcript;
    }

    await updateJobProgress(jobId, {
      status: 'completed',
      message: '✅ Transcription complete!',
      progress: 100,
      result: transcript,
      sourceType: 'file'
    });

    await showNotification(jobId, 'Transcription Complete', 'Audio transcribed successfully!');
    saveToHistory(transcript, fileData.name, 'file', groqApiKey ? 'groq' : 'aether');
    activeJobs.delete(jobId);
    stopKeepAlive();
  } catch (error) {
    await updateJobProgress(jobId, {
      status: 'error',
      message: `❌ ${error.message}`,
      progress: 0,
      error: error.message
    });
    await logError({ jobId, source: 'file', sourceRef: fileData?.name, errorMessage: error.message, stage: 'processing', service: groqApiKey ? 'groq' : 'aether' });
    await showNotification(jobId, 'Transcription Failed', error.message);
    activeJobs.delete(jobId);
    stopKeepAlive();
  }
}

// Handle Whisper transcription
async function transcribeWithWhisper(jobId, file, fileName, model) {
  try {
    await updateJobProgress(jobId, {
      status: 'processing',
      message: `🧠 Transcribing with Whisper (${model})...`,
      progress: 30
    });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', model);

    let response;
    try {
      response = await fetch('http://localhost:3000/api/transcribe-whisper', {
        method: 'POST',
        body: formData
      });
    } catch (fetchError) {
      // Network error - server likely not running
      if (fetchError.message.includes('Failed to fetch') || fetchError.name === 'TypeError') {
        throw new Error(
          'Cannot connect to server. Please start the server:\n' +
          '1. Open terminal in project directory\n' +
          '2. Run: npm run server\n' +
          '3. Wait for "Server running on port 3000"'
        );
      }
      throw fetchError;
    }

    if (!response.ok) {
      let errorMessage = `Transcription failed: ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.error) errorMessage = errorData.error;
        if (errorData.details) errorMessage += `\n${errorData.details}`;
      } catch (e) {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.text) {
      throw new Error('No transcription text returned');
    }

    await updateJobProgress(jobId, {
      status: 'completed',
      message: '✅ Transcription complete!',
      progress: 100,
      result: data.text,
      source: fileName,
      sourceType: 'file',
      model: model
    });

    await showNotification(
      jobId,
      'Transcription Complete',
      `Your file "${fileName}" has been transcribed successfully!`,
      'basic'
    );

    saveToHistory(data.text, fileName, 'file', 'whisper-local', model);
    activeJobs.delete(jobId);
    stopKeepAlive();
  } catch (error) {
    await updateJobProgress(jobId, {
      status: 'error',
      message: `❌ ${error.message}`,
      progress: 0,
      error: error.message
    });

    await logError({ jobId, source: 'file', sourceRef: fileName, errorMessage: error.message, stage: 'processing', service: 'whisper-local' });

    await showNotification(jobId, 'Transcription Failed', error.message, 'basic');
    activeJobs.delete(jobId);
    stopKeepAlive();
  }
}

// Save to history
function saveToHistory(text, source, type = 'url', service = 'groq', model = null) {
  const timestamp = new Date().toISOString();
  chrome.storage.local.get(['history'], (res) => {
    const history = res.history || [];
    const historyItem = {
      text,
      timestamp,
      source: service
    };

    if (model) {
      historyItem.model = model;
    }

    if (type === 'url') {
      historyItem.url = source;
    } else {
      historyItem.fileName = source;
    }

    history.unshift(historyItem);
    chrome.storage.local.set({ history });
  });
}

// Export formatTime for use in other modules if needed
// (Currently only used internally)

// Handle messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Keep-alive ping — used by the side panel to pre-warm the SW before calling
  // tabCapture.getMediaStreamId, which expires quickly if the SW is still waking up.
  if (message.type === 'ping') {
    sendResponse({ pong: true });
    return false;
  }

  // ---- Recording messages ----

  if (message.type === 'startRecording') {
    // streamId is obtained by the popup (where activeTab is invoked) and passed here
    const { streamId, targetTabId } = message;
    if (!streamId) {
      sendResponse({ error: 'No stream ID provided' });
      return true;
    }

    (async () => {
      try {
        await ensureOffscreenDocument();
        const startTime = Date.now();
        await chrome.storage.session.set({
          recordingState: {
            isRecording: true,
            startTime,
            status: 'Recording...',
            targetTabId: targetTabId || null,
            videoDuration: null,
            videoCurrentTime: null
          }
        });
        const prefs = await chrome.storage.sync.get(['audio_input_device_id', 'audio_input_auto_detect']);
        // Forward stream ID and device prefs to the offscreen document
        const offscreenResult = await sendToOffscreen({
          type: 'startRecording',
          streamId,
          deviceId: prefs.audio_input_device_id || 'default',
          autoDetect: prefs.audio_input_auto_detect ?? true
        });
        if (offscreenResult?.error) {
          throw new Error(offscreenResult.error);
        }
        // Notify all content scripts so the floating indicator appears immediately
        chrome.runtime.sendMessage({ type: 'recordingStarted', startTime }).catch(() => {});
        if (targetTabId) {
          injectVideoWatcher(targetTabId);
        }
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ error: err.message });
      }
    })();
    return true; // async
  }

  if (message.type === 'stopRecording') {
    (async () => {
      try {
        await handleStopRecording();
        sendResponse({ success: true });
      } catch (err) {
        console.error('[background] stopRecording failed:', err);
        await chrome.storage.session.set({
          recordingState: { isRecording: false, status: `Error: ${err.message}` }
        });
        chrome.runtime.sendMessage({ type: 'recordingError', error: err.message }).catch(() => {});
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (message.type === 'saveRecording') {
    // Blob is stored in IndexedDB by the offscreen document.
    // Always download the audio to the user's Downloads folder first so they
    // have a local copy regardless of transcription success or failure.
    // Then kick off auto-transcription with the same data.
    const { filename } = message;
    (async () => {
      try {
        const blob = await getBlobFromIDB(filename);
        const dataUrl = await blobToDataUrl(blob);
        const base64 = dataUrl.split(',')[1];
        const fileData = { name: filename, type: blob.type || 'audio/webm', size: blob.size, data: base64 };

        // Download audio to local device — user keeps the file even if transcription fails
        await new Promise((resolve) => {
          chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, () => {
            void chrome.runtime.lastError; // non-fatal — proceed even if download fails
            resolve();
          });
        });

        // Delete from IDB — data is now in Downloads and in fileData for transcription
        const db = await openRecordingsIDB();
        const tx = db.transaction('blobs', 'readwrite');
        tx.objectStore('blobs').delete(filename);
        await new Promise(r => { tx.oncomplete = r; });
        db.close();

        sendResponse({ success: true });

        // Start transcription job
        const jobId = generateJobId();
        const startTime = Date.now();
        activeJobs.set(jobId, { jobId, startedAt: startTime });
        startKeepAlive();
        chrome.storage.local.set({
          [`transcription_${jobId}`]: { startTime, status: 'starting', progress: 0, updatedAt: startTime }
        });

        // Read service preference and dispatch to the appropriate handler
        chrome.storage.sync.get(['transcription_service', 'whisper_model', 'modal_whisper_url', 'groq_api_key'], (res) => {
          const service = res.transcription_service || 'groq';
          const modelSize = res.whisper_model || 'base';
          const modalUrl = res.modal_whisper_url || '';
          const groqKey = res.groq_api_key || GROQ_API_KEY;

          if (service === 'whisper-modal') {
            transcribeWithModalWhisper(jobId, fileData, modalUrl, modelSize);
          } else if (service === 'whisper') {
            transcribeWithWhisper(jobId, fileData, modelSize);
          } else {
            transcribeWithGroq(jobId, fileData, groqKey);
          }

          // Notify popup that transcription has started so it can show progress
          chrome.runtime.sendMessage({ type: 'transcription_started', jobId }).catch(() => {});
        });
      } catch (err) {
        console.error('[background] auto-transcription failed:', err.message);
        sendResponse({ error: err.message });
      }
    })();
    return true; // async
  }

  if (message.type === 'recordingComplete') {
    chrome.storage.session.set({
      recordingState: { isRecording: false, status: '🔄 Transcribing recording...' }
    });
    closeOffscreenDocument();
    return false;
  }

  if (message.type === 'recordingError') {
    chrome.storage.session.set({
      recordingState: { isRecording: false, status: `Error: ${message.error}` }
    });
    closeOffscreenDocument();
    return false;
  }

  if (message.type === 'deviceChanged') {
    // Surface status in session storage for RecordTab to read
    chrome.storage.session.get('recordingState', (res) => {
      if (res.recordingState?.isRecording) {
        chrome.storage.session.set({
          recordingState: {
            ...res.recordingState,
            status: 'Audio device changed — checking stream...'
          }
        });
      }
    });
    // Forward to offscreen
    chrome.runtime.sendMessage({ target: 'offscreen', type: 'deviceChanged' })
      .catch(() => {});
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'videoPlaybackInfo') {
    chrome.storage.session.get('recordingState', (res) => {
      if (res.recordingState?.isRecording) {
        chrome.storage.session.set({
          recordingState: {
            ...res.recordingState,
            videoDuration: message.duration,
            videoCurrentTime: message.currentTime
          }
        });
      }
    });
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === 'videoEnded') {
    (async () => {
      const res = await chrome.storage.session.get('recordingState');
      if (!res.recordingState?.isRecording) return;
      try {
        await handleStopRecording();
      } catch (err) {
        console.warn('[background] videoEnded stopRecording failed:', err);
      }
    })();
    sendResponse({ ok: true });
    return false;
  }

  // analyserData from offscreen is broadcast and consumed directly by the popup —
  // no forwarding needed here

  // ---- Transcription messages ----

  if (message.type === 'start_transcription') {
    const jobId = generateJobId();
    const startTime = Date.now();
    activeJobs.set(jobId, { jobId, startedAt: startTime });
    startKeepAlive();
    
    // Initialize job data with start time
    chrome.storage.local.set({
      [`transcription_${jobId}`]: {
        startTime,
        status: 'starting',
        progress: 0,
        updatedAt: startTime
      }
    });

    // Get preferences
    chrome.storage.sync.get(['transcription_service', 'whisper_model', 'modal_whisper_url', 'groq_api_key'], async (res) => {
      const service = res.transcription_service || 'groq';
      const modelSize = res.whisper_model || 'base';
      const modalUrl = res.modal_whisper_url || '';
      const groqKey = res.groq_api_key || GROQ_API_KEY;

      if (message.source === 'url') {
        transcribeUrl(jobId, message.url);
      } else if (message.source === 'file') {
        if (!message.fileData) {
          sendResponse({ error: 'File data not provided' });
          return;
        }
        if (service === 'whisper-modal') {
          transcribeWithModalWhisper(jobId, message.fileData, modalUrl, modelSize);
        } else if (service === 'whisper') {
          transcribeWithWhisper(jobId, message.fileData, modelSize);
        } else {
          transcribeWithGroq(jobId, message.fileData, groqKey);
        }
      }

      sendResponse({ jobId, status: 'started' });
    });

    return true; // Keep channel open for async response
  }

  if (message.type === 'get_job_status') {
    chrome.storage.local.get([`transcription_${message.jobId}`], (res) => {
      const jobData = res[`transcription_${message.jobId}`];
      sendResponse({ job: jobData || null });
    });
    return true;
  }

  if (message.type === 'get_active_jobs') {
    const jobIds = Array.from(activeJobs.keys());
    const jobs = {};
    
    chrome.storage.local.get(jobIds.map(id => `transcription_${id}`), (res) => {
      jobIds.forEach(id => {
        const key = `transcription_${id}`;
        if (res[key]) {
          jobs[id] = res[key];
        }
      });
      sendResponse({ jobs });
    });
    return true;
  }
});

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  // Open extension popup when notification is clicked
  chrome.action.openPopup();
  chrome.notifications.clear(notificationId);
});
