import { useState, useRef, useEffect, useCallback } from 'react';

export function useTabCapture() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(null);
  const [showInvocationHelp, setShowInvocationHelp] = useState(false);

  // Ref holding the latest frequency array from the offscreen analyser.
  // Using a ref (not state) avoids triggering React re-renders at 20fps.
  const analyserDataRef = useRef(null);
  const startTimeRef = useRef(null);
  const elapsedIntervalRef = useRef(null);
  const pollingIntervalRef = useRef(null);

  // ---- Keep the MV3 service worker warm ----
  // MV3 SWs go idle after ~30s. stream IDs from getMediaStreamId expire in ~2s.
  // If the SW is sleeping when the user clicks Record, it wakes too slowly and
  // the stream ID expires before the offscreen document can use it.
  // Pinging every 25s ensures the SW stays alive while the panel is open.
  useEffect(() => {
    const warmUp = () => {
      chrome.runtime.sendMessage({ type: 'ping' }, () => {
        void chrome.runtime.lastError; // consume — SW may already be warm
      });
    };
    warmUp(); // ping immediately on mount
    const warmTimer = setInterval(warmUp, 25000);
    return () => clearInterval(warmTimer);
  }, []);

  // ---- Sync state from session storage (handles popup-reopen scenario) ----
  useEffect(() => {
    const syncFromStorage = async () => {
      const result = await chrome.storage.session.get('recordingState');
      const state = result.recordingState;
      if (!state) return;

      setIsRecording(state.isRecording);
      if (state.status) setStatus(state.status);

      setVideoDuration(state.videoDuration ?? null);
      setVideoCurrentTime(state.videoCurrentTime ?? null);

      if (state.isRecording && state.startTime) {
        startTimeRef.current = state.startTime;
      } else if (!state.isRecording) {
        startTimeRef.current = null;
        analyserDataRef.current = null;
      }
    };

    syncFromStorage();
    pollingIntervalRef.current = setInterval(syncFromStorage, 2000);
    return () => clearInterval(pollingIntervalRef.current);
  }, []);

  // ---- Listen for live messages from background / offscreen ----
  useEffect(() => {
    const listener = (message) => {
      // Waveform data streamed from the offscreen analyser
      if (message.type === 'analyserData' && message.data) {
        if (
          !analyserDataRef.current ||
          analyserDataRef.current.length !== message.data.length
        ) {
          analyserDataRef.current = new Uint8Array(message.data.length);
        }
        analyserDataRef.current.set(message.data);
        return;
      }

      if (message.type === 'recordingComplete') {
        setIsRecording(false);
        setStatus('✅ Recording complete — transcribing now...');
        analyserDataRef.current = null;
        startTimeRef.current = null;
        setElapsedTime(0);
        return;
      }

      if (message.type === 'recordingError') {
        setIsRecording(false);
        setStatus(`⚠️ ${message.error}`);
        analyserDataRef.current = null;
        startTimeRef.current = null;
        setElapsedTime(0);
        return;
      }

      if (message.type === 'deviceChanged') {
        setStatus('Audio device changed — recording may be affected. Restart if audio stops.');
      }
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  // ---- Elapsed time ticker ----
  useEffect(() => {
    if (!isRecording) {
      setElapsedTime(0);
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current);
        elapsedIntervalRef.current = null;
      }
      return;
    }

    elapsedIntervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    return () => {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    };
  }, [isRecording]);

  // ---- Controls ----
  const startRecording = useCallback(() => {
    setStatus('⏳ Starting...');

    // Use callbacks (not async/await) for the entire capture chain.
    // async/await can break Chrome's user-gesture propagation, causing
    // "Extension has not been invoked" errors from tabCapture.
    // SW is kept warm by the keepalive useEffect above.
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab) {
        setStatus('❌ No active tab found. Click the extension icon while on a webpage.');
        return;
      }

      const url = tab.url || '';
      if (
        url.startsWith('chrome://') ||
        url.startsWith('chrome-extension://') ||
        url.startsWith('about:') ||
        url.startsWith('edge://')
      ) {
        setStatus('❌ Cannot capture Chrome system pages. Navigate to a website (e.g. YouTube) first.');
        return;
      }

      // Must pass targetTabId explicitly — empty object does not resolve the tab
      // from a popup context. Must stay within user-gesture callback chain.
      chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (streamId) => {
        if (chrome.runtime.lastError || !streamId) {
          const msg = chrome.runtime.lastError?.message || 'Could not get stream ID';
          // Show a clear inline message instead of re-opening the onboarding modal
          if (msg.includes('not been invoked') || msg.includes('activeTab')) {
            setStatus('⚠️ Click the Aether icon in the Chrome toolbar while on this tab first, then try again.');
          } else {
            setStatus(`❌ ${msg}`);
          }
          return;
        }

        chrome.runtime.sendMessage({ type: 'startRecording', streamId, targetTabId: tab.id }, (response) => {
          if (chrome.runtime.lastError || response?.error) {
            setStatus(`❌ ${response?.error || chrome.runtime.lastError?.message}`);
          } else {
            setIsRecording(true);
            startTimeRef.current = Date.now();
            setStatus('🔴 Recording in background...');
          }
        });
      });
    });
  }, []);

  const stopRecording = useCallback(async () => {
    try {
      setStatus('⏹️ Stopping...');
      await chrome.runtime.sendMessage({ type: 'stopRecording' });
    } catch (err) {
      setStatus(`❌ Failed to stop: ${err.message}`);
    }
  }, []);

  return {
    startRecording,
    stopRecording,
    isRecording,
    status,
    setStatus,
    elapsedTime,
    analyserDataRef,
    videoDuration,
    videoCurrentTime,
  };
}
