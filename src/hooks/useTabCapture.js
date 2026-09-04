import { useState, useRef, useEffect, useCallback } from 'react';

function readCaptureTabIdFromUrl() {
  try {
    const raw = new URLSearchParams(window.location.search).get('captureTabId');
    const id = Number(raw);
    return Number.isFinite(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

export function useTabCapture() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [elapsedTime, setElapsedTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(null);
  const [videoCurrentTime, setVideoCurrentTime] = useState(null);

  // Ref holding the latest frequency array from the offscreen analyser.
  // Using a ref (not state) avoids triggering React re-renders at 20fps.
  const analyserDataRef = useRef(null);
  const startTimeRef = useRef(null);
  const elapsedIntervalRef = useRef(null);
  const pollingIntervalRef = useRef(null);
  // Tab that last received activeTab via toolbar icon click. Must be available
  // synchronously when Record is pressed — getMediaStreamId cannot follow an
  // async tabs.query (gesture + invocation are both lost in that callback).
  const targetTabIdRef = useRef(readCaptureTabIdFromUrl());

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

  // ---- Resolve the toolbar-invoked capture tab ----
  useEffect(() => {
    const applyTabId = (tabId) => {
      if (tabId == null) return;
      const id = Number(tabId);
      if (Number.isFinite(id) && id > 0) {
        targetTabIdRef.current = id;
      }
    };

    applyTabId(readCaptureTabIdFromUrl());

    chrome.storage.session.get('captureTargetTabId', (result) => {
      void chrome.runtime.lastError;
      applyTabId(result?.captureTargetTabId);
    });

    chrome.runtime.sendMessage({ type: 'getCaptureTargetTab' }, (response) => {
      void chrome.runtime.lastError;
      applyTabId(response?.tabId);
    });

    const onStorage = (changes, area) => {
      if (area === 'session' && changes.captureTargetTabId) {
        applyTabId(changes.captureTargetTabId.newValue);
      }
    };
    const onMessage = (message) => {
      if (message?.type === 'captureTargetUpdated') {
        applyTabId(message.tabId);
      }
    };

    chrome.storage.onChanged.addListener(onStorage);
    chrome.runtime.onMessage.addListener(onMessage);
    return () => {
      chrome.storage.onChanged.removeListener(onStorage);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, []);

  // ---- Sync state from session storage (handles popup-reopen scenario) ----
  useEffect(() => {
    const syncFromStorage = async () => {
      const result = await chrome.storage.session.get('recordingState');
      const state = result.recordingState;
      if (!state) return;

      setIsRecording(!!state.isRecording && state.status !== 'Stopping...');
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

      if (message.type === 'recordingStopping') {
        setIsRecording(false);
        setStatus('⏹️ Stopping...');
        analyserDataRef.current = null;
        startTimeRef.current = null;
        setElapsedTime(0);
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

    // getMediaStreamId must run in the same turn as the Record click.
    // Do not await or nest it under tabs.query — that drops the user gesture
    // and Chrome reports "Extension has not been invoked".
    const tabId = targetTabIdRef.current;
    if (!tabId) {
      setStatus('⚠️ Open Aether from the toolbar icon while on the video tab, then press Record.');
      return;
    }

    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (streamId) => {
      if (chrome.runtime.lastError || !streamId) {
        const msg = chrome.runtime.lastError?.message || 'Could not get stream ID';
        if (msg.includes('not been invoked') || msg.includes('activeTab')) {
          // Stale target (panel left open across tabs) — clear and guide once.
          targetTabIdRef.current = null;
          chrome.storage.session.remove('captureTargetTabId').catch(() => {});
          setStatus('⚠️ Click the Aether toolbar icon while on this video tab, then press Record.');
        } else if (msg.includes('No tab') || msg.includes('Invalid tab')) {
          targetTabIdRef.current = null;
          setStatus('❌ That tab was closed. Click the Aether icon on the video tab and try again.');
        } else if (msg.includes('Chrome pages') || msg.includes('cannot be captured')) {
          setStatus('❌ Cannot capture browser system pages. Open a website (e.g. YouTube) and try again.');
        } else {
          setStatus(`❌ ${msg}`);
        }
        return;
      }

      // streamId expires in ~2s — hand off immediately (no tabs.get in between).
      chrome.runtime.sendMessage(
        { type: 'startRecording', streamId, targetTabId: tabId },
        (response) => {
          if (chrome.runtime.lastError || response?.error) {
            setStatus(`❌ ${response?.error || chrome.runtime.lastError?.message}`);
          } else {
            setIsRecording(true);
            startTimeRef.current = Date.now();
            setStatus('🔴 Recording in background...');
          }
        }
      );
    });
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    analyserDataRef.current = null;
    startTimeRef.current = null;
    setStatus('⏹️ Stopping...');
    chrome.runtime.sendMessage({ type: 'stopRecording' }, (response) => {
      if (chrome.runtime.lastError || response?.error) {
        setStatus(`❌ Failed to stop: ${response?.error || chrome.runtime.lastError?.message}`);
      }
    });
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
    videoCurrentTime
  };
}
