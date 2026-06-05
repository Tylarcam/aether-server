// Offscreen Document - Persistent Audio Recorder
// Lives in the background, survives popup close and page navigation.

let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let analyserInterval = null;
let captureStream = null;
let lastAudioActivity = Date.now();

// Only handle messages targeted at this offscreen document
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'startRecording') {
    startRecording(message.streamId)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep channel open for async response
  }

  if (message.type === 'stopRecording') {
    stopRecording();
    sendResponse({ success: true });
  }

  if (message.type === 'deviceChanged') {
    handleDeviceChange();
    sendResponse({ success: true });
  }
});

async function startRecording(streamId) {
  captureStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    }
  });

  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(captureStream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);
  // Route audio to speakers so the user can hear the video while recording
  source.connect(audioContext.destination);

  mediaRecorder = new MediaRecorder(captureStream, { mimeType: 'audio/webm' });
  audioChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    encodeAndSave();
  };

  mediaRecorder.start(1000); // collect a chunk every second

  navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

  // Broadcast frequency data at ~20fps so the popup can render the waveform
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  analyserInterval = setInterval(() => {
    if (!analyser) return;
    analyser.getByteFrequencyData(frequencyData);
    const sum = frequencyData.reduce((a, b) => a + b, 0);
    if (sum > 50) lastAudioActivity = Date.now();
    chrome.runtime.sendMessage({
      type: 'analyserData',
      data: Array.from(frequencyData)
    }).catch(() => {}); // silent if no listeners
  }, 50);
}

async function handleDeviceChange() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  chrome.runtime.sendMessage({ type: 'deviceChanged' }).catch(() => {});

  // Check if tab capture stream tracks are still alive
  if (captureStream) {
    const allEnded = captureStream.getAudioTracks().every(t => t.readyState === 'ended');
    if (allEnded) {
      chrome.runtime.sendMessage({
        type: 'recordingError',
        error: 'Audio device changed. Please stop and restart recording.'
      }).catch(() => {});
    }
  }
}

function stopRecording() {
  if (analyserInterval) {
    clearInterval(analyserInterval);
    analyserInterval = null;
  }
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  } else {
    cleanup();
  }
}

async function encodeAndSave() {
  try {
    console.log('[offscreen] saving', audioChunks.length, 'chunks as WebM...');
    const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });
    console.log('[offscreen] webm blob size:', (webmBlob.size / 1024 / 1024).toFixed(1), 'MB');

    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `recording-${ts}.webm`;

    // Store blob in IndexedDB — shared with the background SW by extension origin.
    // This avoids the ~64MB IPC message limit that breaks large recordings when
    // sending the entire blob as a base64 data URL via sendMessage.
    await storeBlobInIDB(webmBlob, filename);

    chrome.runtime.sendMessage({ type: 'saveRecording', filename }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        console.error('[offscreen] save failed:', chrome.runtime.lastError?.message || response?.error);
        chrome.runtime.sendMessage({ type: 'recordingError', error: chrome.runtime.lastError?.message || response?.error }).catch(() => {});
      } else {
        chrome.runtime.sendMessage({ type: 'recordingComplete', filename }).catch(() => {});
      }
      cleanup();
    });
  } catch (err) {
    console.error('[offscreen] encodeAndSave error:', err);
    chrome.runtime.sendMessage({ type: 'recordingError', error: err.message }).catch(() => {});
    cleanup();
  }
}

function storeBlobInIDB(blob, key) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('aether_recordings', 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('blobs');
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put(blob, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
    req.onerror = () => reject(req.error);
  });
}

function cleanup() {
  navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  if (captureStream) {
    captureStream.getTracks().forEach((t) => t.stop());
    captureStream = null;
  }
  if (audioContext) {
    audioContext.close().catch(() => {});
    audioContext = null;
  }
  analyser = null;
  mediaRecorder = null;
  audioChunks = [];
}

