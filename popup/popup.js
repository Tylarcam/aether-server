// Paste your deployed Modal URL here after running:
//   modal deploy backend/modal_aether.py
const AETHER_API_URL = 'https://tylarcam--aether-transcribe-web.modal.run';

function openTab(tabId) {
  document.querySelectorAll('.tabcontent').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tablink').forEach(btn => btn.setAttribute('aria-selected', 'false'));
  document.getElementById(tabId).classList.add('active');
  const activeBtn = document.querySelector(`.tablink[data-tab="${tabId}"]`);
  if (activeBtn) activeBtn.setAttribute('aria-selected', 'true');
  if (tabId === 'downloads') loadDownloads();
}

function loadDownloads() {
  document.getElementById('downloadsList').innerHTML = '<em>No downloads yet.</em>';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function safeDownload(text, format) {
  let content, mime;
  if (format === 'md') {
    content = '# Transcript\n\n' + text;
    mime = 'text/markdown';
  } else {
    content = text;
    mime = 'text/plain';
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'transcript.' + format;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderTranscript(container, text) {
  container.innerHTML = '';

  const ta = document.createElement('textarea');
  ta.style.cssText = 'width:100%;height:150px;';
  ta.value = text;
  container.appendChild(ta);

  const br = document.createElement('br');
  container.appendChild(br);

  ['txt', 'md'].forEach(fmt => {
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.textContent = fmt.toUpperCase();
    btn.addEventListener('click', () => safeDownload(text, fmt));
    container.appendChild(btn);
  });
}

function saveHistory(text) {
  const timestamp = new Date().toISOString();
  chrome.storage.local.get(['history'], res => {
    const history = res.history || [];
    history.unshift({ text, timestamp });
    chrome.storage.local.set({ history });
    loadHistory();
  });
}

function loadHistory() {
  const historyList = document.getElementById('historyList');
  chrome.storage.local.get(['history'], res => {
    const history = res.history || [];
    historyList.innerHTML = '';
    history.forEach(item => {
      const li = document.createElement('li');

      const strong = document.createElement('strong');
      strong.textContent = item.timestamp;
      li.appendChild(strong);
      li.appendChild(document.createElement('br'));

      const preview = document.createTextNode(item.text.slice(0, 100) + '... ');
      li.appendChild(preview);

      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Download';
      btn.addEventListener('click', () => safeDownload(item.text, 'txt'));
      li.appendChild(btn);

      historyList.appendChild(li);
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  openTab('transcribe');

  const closeWindowBtn = document.getElementById('closeWindowBtn');
  if (closeWindowBtn) {
    closeWindowBtn.addEventListener('click', () => { try { window.close(); } catch (e) {} });
  }
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { try { window.close(); } catch (e) {} }
  });

  document.querySelectorAll('.tablink').forEach(btn => {
    btn.addEventListener('click', () => openTab(btn.getAttribute('data-tab')));
  });

  // ── YouTube transcription ────────────────────────────────────────────────
  const ytInput = document.getElementById('youtubeUrl');
  const transcribeBtn = document.getElementById('transcribeBtn');
  const transcribeStatus = document.getElementById('transcribeStatus');
  const transcribeResult = document.getElementById('transcribeResult');

  transcribeBtn.addEventListener('click', async () => {
    const url = ytInput.value.trim();
    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(url)) {
      transcribeStatus.innerText = '❌ Invalid YouTube URL';
      return;
    }

    transcribeBtn.disabled = true;
    transcribeStatus.innerText = '⏳ Extracting and transcribing...';
    transcribeResult.innerHTML = '';

    const start = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      transcribeStatus.innerText = `⏳ Processing... (${s}s)`;
    }, 1000);

    try {
      const res = await fetch(`${AETHER_API_URL}/transcribe/youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Transcription failed');

      transcribeStatus.innerText = `✅ Done in ${Math.round(data.latency_ms / 1000)}s`;
      renderTranscript(transcribeResult, data.transcript);
      saveHistory(data.transcript);
    } catch (err) {
      transcribeStatus.innerText = '❌ ' + err.message;
    } finally {
      clearInterval(timer);
      transcribeBtn.disabled = false;
    }
  });

  // ── Tab recording ────────────────────────────────────────────────────────
  const recordBtn = document.getElementById('recordBtn');
  const stopBtn = document.getElementById('stopBtn');
  const recordStatus = document.getElementById('recordStatus');
  const transcribeRecordingBtn = document.getElementById('transcribeRecordingBtn');
  const recordTranscriptResult = document.getElementById('recordTranscriptResult');

  let stream = null;
  let recorder = null;
  let chunks = [];
  let currentWebmBlob = null;

  recordBtn.addEventListener('click', () => {
    chrome.tabCapture.capture({ audio: true, video: false }, s => {
      if (!s) {
        recordStatus.innerText = '❌ Could not capture tab audio.';
        return;
      }
      stream = s;
      recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunks = [];
      currentWebmBlob = null;
      transcribeRecordingBtn.style.display = 'none';
      recordTranscriptResult.innerHTML = '';

      recorder.ondataavailable = e => chunks.push(e.data);

      recorder.onstop = async () => {
        const webmBlob = new Blob(chunks, { type: 'audio/webm' });
        currentWebmBlob = webmBlob;

        // Convert to WAV and save to Downloads
        try {
          const arrayBuffer = await webmBlob.arrayBuffer();
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
          const wavBuffer = encodeWAV(audioBuffer);
          const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
          audioCtx.close();

          const reader = new FileReader();
          reader.onloadend = () => {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            chrome.downloads.download(
              { url: reader.result, filename: `recording-${timestamp}.wav`, saveAs: false },
              () => {
                if (chrome.runtime.lastError) {
                  recordStatus.innerText = '❌ Save error: ' + chrome.runtime.lastError.message;
                } else {
                  recordStatus.innerText = '✅ Saved to Downloads. Click Transcribe to get text.';
                }
                transcribeRecordingBtn.style.display = 'inline-block';
              }
            );
          };
          reader.readAsDataURL(wavBlob);
        } catch (e) {
          recordStatus.innerText = '⚠️ WAV conversion failed. You can still transcribe.';
          transcribeRecordingBtn.style.display = 'inline-block';
        }
      };

      recorder.start();
      recordStatus.innerText = '🔴 Recording...';
    });
  });

  stopBtn.addEventListener('click', () => {
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
      stream.getTracks().forEach(t => t.stop());
      recordStatus.innerText = '⏹️ Stopped. Processing...';
    }
  });

  transcribeRecordingBtn.addEventListener('click', async () => {
    if (!currentWebmBlob) return;
    transcribeRecordingBtn.disabled = true;
    recordStatus.innerText = '🧠 Transcribing...';

    const start = Date.now();
    const timer = setInterval(() => {
      const s = Math.floor((Date.now() - start) / 1000);
      recordStatus.innerText = `🧠 Transcribing... (${s}s)`;
    }, 1000);

    try {
      const audio_b64 = await blobToBase64(currentWebmBlob);
      const res = await fetch(`${AETHER_API_URL}/transcribe/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audio_b64, filename: 'recording.webm' }),
      });

      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Transcription failed');

      recordStatus.innerText = `✅ Done in ${Math.round(data.latency_ms / 1000)}s`;
      renderTranscript(recordTranscriptResult, data.transcript);
      saveHistory(data.transcript);
    } catch (err) {
      recordStatus.innerText = '❌ ' + err.message;
    } finally {
      clearInterval(timer);
      transcribeRecordingBtn.disabled = false;
    }
  });

  loadHistory();
});

// ── WAV encoder ──────────────────────────────────────────────────────────────
function encodeWAV(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const bitDepth = 16;
  const samples = audioBuffer.length;
  const blockAlign = numChannels * bitDepth / 8;
  const dataLength = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  return buffer;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
