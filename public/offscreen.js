// Offscreen Document - Persistent Audio Recorder
// Lives in the background, survives popup close and page navigation.

let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;
let analyser = null;
let analyserInterval = null;
let captureStream = null;
let lastAudioActivity = Date.now();
let isStopping = false;
let outputFormat = 'wav';

// Only handle messages targeted at this offscreen document
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'startRecording') {
    startRecording(message.streamId, message.outputFormat)
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.type === 'stopRecording') {
    stopRecording();
    sendResponse({ success: true });
    return false;
  }

  if (message.type === 'deviceChanged') {
    handleDeviceChange();
    sendResponse({ success: true });
    return false;
  }
});

function abandonExistingRecording() {
  if (analyserInterval) {
    clearInterval(analyserInterval);
    analyserInterval = null;
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = null;
    try {
      mediaRecorder.stop();
    } catch (_) {
      // ignore — recorder may already be stopping
    }
  }
  cleanup();
}

async function startRecording(streamId, format = 'wav') {
  if (mediaRecorder || captureStream) {
    abandonExistingRecording();
  }

  outputFormat = format || 'wav';

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
  isStopping = false;

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
    }).catch(() => {});
  }, 50);
}

async function handleDeviceChange() {
  if (!mediaRecorder || mediaRecorder.state !== 'recording') return;
  chrome.runtime.sendMessage({ type: 'deviceChanged' }).catch(() => {});

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

function stopCaptureTracks() {
  if (captureStream) {
    captureStream.getTracks().forEach((t) => t.stop());
  }
}

function stopRecording() {
  if (isStopping) return;
  isStopping = true;

  chrome.runtime.sendMessage({ type: 'recordingStopping' }).catch(() => {});

  if (analyserInterval) {
    clearInterval(analyserInterval);
    analyserInterval = null;
  }

  const recorder = mediaRecorder;
  const isActive = recorder && (recorder.state === 'recording' || recorder.state === 'paused');

  if (isActive) {
    recorder.stop();
    return;
  }

  stopCaptureTracks();

  if (audioChunks.length > 0) {
    encodeAndSave();
    return;
  }

  chrome.runtime.sendMessage({
    type: 'recordingError',
    error: 'No active recording to stop'
  }).catch(() => {});
  cleanup();
}

async function encodeAndSave() {
  try {
    stopCaptureTracks();

    console.log('[offscreen] saving', audioChunks.length, 'chunks, output format:', outputFormat);
    const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });
    console.log('[offscreen] webm blob size:', (webmBlob.size / 1024 / 1024).toFixed(1), 'MB');

    if (webmBlob.size === 0) {
      chrome.runtime.sendMessage({
        type: 'recordingError',
        error: 'Recording was empty — no audio captured'
      }).catch(() => {});
      cleanup();
      return;
    }

    const { blob, mimeType, ext } = await convertWebmToFormat(webmBlob, outputFormat);
    console.log('[offscreen] exported', ext, 'size:', (blob.size / 1024 / 1024).toFixed(1), 'MB');

    const ts = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
    const filename = `recording-${ts}.${ext}`;

    await storeBlobInIDB(blob, filename, mimeType);

    chrome.runtime.sendMessage({ type: 'saveRecording', filename }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        console.error('[offscreen] save failed:', chrome.runtime.lastError?.message || response?.error);
        chrome.runtime.sendMessage({
          type: 'recordingError',
          error: chrome.runtime.lastError?.message || response?.error
        }).catch(() => {});
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

function storeBlobInIDB(blob, key, mimeType = 'application/octet-stream') {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('aether_recordings', 2);
    req.onupgradeneeded = (e) => {
      if (!e.target.result.objectStoreNames.contains('blobs')) {
        e.target.result.createObjectStore('blobs');
      }
    };
    req.onsuccess = (e) => {
      const db = e.target.result;
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put({ blob, mimeType }, key);
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
  isStopping = false;
}
