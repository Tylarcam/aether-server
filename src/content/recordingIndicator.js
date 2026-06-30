// Floating recording indicator — injected into every page via content script.
// Shows bottom-left when recording is active; click to stop.

(function () {
  'use strict';

  let host = null;
  let shadow = null;
  let timerInterval = null;
  let pollInterval = null;
  let startTime = null;
  let videoDuration = null;
  let videoStartTime = null;
  let videoCurrentTimeAtCapture = null;
  let isVisible = false;
  let isStopping = false;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  // ── Indicator DOM ─────────────────────────────────────────────────────────

  const CSS = `
    *,*::before,*::after { box-sizing: border-box; margin: 0; padding: 0; }

    :host {
      position: fixed !important;
      bottom: 20px !important;
      left: 20px !important;
      z-index: 2147483647 !important;
      pointer-events: auto !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }

    .pill {
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 9px 14px 9px 11px;
      background: rgba(12, 12, 25, 0.92);
      border: 1px solid rgba(255, 70, 70, 0.35);
      border-radius: 999px;
      cursor: pointer;
      color: #fff;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.03em;
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      box-shadow:
        0 4px 24px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 70, 70, 0.15),
        inset 0 1px 0 rgba(255,255,255,0.06);
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
      user-select: none;
      -webkit-user-select: none;
      white-space: nowrap;
    }

    .pill:hover {
      transform: scale(1.05);
      border-color: rgba(255, 70, 70, 0.7);
      box-shadow:
        0 6px 28px rgba(0, 0, 0, 0.6),
        0 0 0 2px rgba(255, 70, 70, 0.3);
    }

    .pill:active {
      transform: scale(0.97);
    }

    .pill.stopping {
      opacity: 0.6;
      pointer-events: none;
      cursor: default;
    }

    /* Red pulsing dot */
    .rec-dot {
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #ff4040;
      flex-shrink: 0;
      animation: blink 1.4s ease-in-out infinite;
      box-shadow: 0 0 6px rgba(255, 64, 64, 0.7);
    }

    @keyframes blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.35; }
    }

    /* Default label */
    .rec-label {
      color: rgba(255, 255, 255, 0.75);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }

    /* Elapsed time */
    .timer {
      font-variant-numeric: tabular-nums;
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      min-width: 28px;
    }

    /* Divider */
    .divider {
      width: 1px;
      height: 12px;
      background: rgba(255,255,255,0.15);
    }

    /* Stop icon (shown on hover) */
    .stop-wrap {
      display: flex;
      align-items: center;
      gap: 5px;
      color: #ff7070;
      font-size: 11px;
      font-weight: 600;
      opacity: 0;
      max-width: 0;
      overflow: hidden;
      transition: opacity 0.2s ease, max-width 0.2s ease;
    }

    .stop-square {
      width: 8px;
      height: 8px;
      border-radius: 2px;
      background: #ff5555;
      flex-shrink: 0;
    }

    .pill:hover .stop-wrap {
      opacity: 1;
      max-width: 80px;
    }

    .auto-badge {
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: rgba(167, 139, 250, 0.9);
      text-transform: uppercase;
      padding: 2px 5px;
      border: 1px solid rgba(167, 139, 250, 0.3);
      border-radius: 4px;
      line-height: 1;
    }

    .countdown {
      font-variant-numeric: tabular-nums;
      color: rgba(167, 139, 250, 0.85);
      font-size: 11px;
      min-width: 36px;
    }
  `;

  function buildDOM() {
    const style = document.createElement('style');
    style.textContent = CSS;

    const pill = document.createElement('div');
    pill.className = 'pill';
    pill.setAttribute('role', 'button');
    pill.setAttribute('aria-label', 'Stop recording');
    pill.setAttribute('title', 'Click to stop recording');
    pill.innerHTML = `
      <span class="rec-dot"></span>
      <span class="rec-label">REC</span>
      <span class="timer" id="timer">0:00</span>
      <span class="auto-badge" id="auto-badge" style="display:none">AUTO</span>
      <span class="countdown" id="countdown" style="display:none"></span>
      <span class="divider"></span>
      <span class="stop-wrap">
        <span class="stop-square"></span>Stop
      </span>
    `;

    pill.addEventListener('click', handleStop);

    shadow.appendChild(style);
    shadow.appendChild(pill);
  }

  function showIndicator(st) {
    if (!isVisible) {
      host = document.createElement('div');
      host.setAttribute('data-aether-recorder', 'true');
      // Append to <html> so it works even if body hasn't loaded yet
      (document.body || document.documentElement).appendChild(host);
      shadow = host.attachShadow({ mode: 'open' });
      buildDOM();
      isVisible = true;
      isStopping = false;
    }
    startTime = st;
    updateTimer();
    if (!timerInterval) {
      timerInterval = setInterval(() => {
        updateTimer();
        updateCountdown();
      }, 1000);
    }
  }

  function hideIndicator() {
    if (host) {
      host.remove();
      host = null;
      shadow = null;
    }
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    isVisible = false;
    isStopping = false;
    startTime = null;
    videoDuration = null;
    videoStartTime = null;
    videoCurrentTimeAtCapture = null;
  }

  function updateTimer() {
    if (!startTime || !shadow) return;
    const el = shadow.getElementById('timer');
    if (el) el.textContent = formatTime(Math.floor((Date.now() - startTime) / 1000));
  }

  function updateAutoStop(duration, currentTimeAtCapture) {
    if (!shadow) return;
    const badge = shadow.getElementById('auto-badge');
    const countdown = shadow.getElementById('countdown');
    if (!badge || !countdown) return;

    if (duration === null || duration === undefined) {
      badge.style.display = 'none';
      countdown.style.display = 'none';
      videoDuration = null;
      return;
    }

    videoDuration = duration;
    videoCurrentTimeAtCapture = currentTimeAtCapture || 0;
    videoStartTime = Date.now();
    badge.style.display = '';
    countdown.style.display = '';
    updateCountdown();
  }

  function updateCountdown() {
    if (!shadow || videoDuration === null) return;
    const countdown = shadow.getElementById('countdown');
    if (!countdown) return;

    const elapsedSinceCapture = (Date.now() - videoStartTime) / 1000;
    const estimatedVideoPos = videoCurrentTimeAtCapture + elapsedSinceCapture;
    const remaining = Math.max(0, videoDuration - estimatedVideoPos);

    const m = Math.floor(remaining / 60);
    const s = Math.floor(remaining % 60);
    countdown.textContent = `–${m}:${s.toString().padStart(2, '0')}`;
  }

  async function handleStop() {
    if (isStopping) return;
    isStopping = true;
    const pill = shadow?.querySelector('.pill');
    if (pill) pill.classList.add('stopping');
    try {
      await chrome.runtime.sendMessage({ type: 'stopRecording' });
    } catch (_) {
      // ignore — background may not respond
    }
  }

  // ── State sync ────────────────────────────────────────────────────────────

  async function checkState() {
    try {
      const result = await chrome.storage.session.get('recordingState');
      const state = result?.recordingState;
      if (state?.isRecording && state.status !== 'Stopping...') {
        showIndicator(state.startTime);
        updateAutoStop(state.videoDuration, state.videoCurrentTime);
      } else if (isVisible) {
        hideIndicator();
      }
    } catch (_) {
      // Extension context may be invalidated on reload — ignore
    }
  }

  // Immediate message listener for instant response
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'recordingStarted') {
      showIndicator(message.startTime);
    }
    if (message.type === 'recordingComplete' || message.type === 'recordingError' || message.type === 'recordingStopping') {
      hideIndicator();
    }
  });

  // Initial check + periodic sync (handles navigations and missed messages)
  checkState();
  pollInterval = setInterval(checkState, 2000);
})();
