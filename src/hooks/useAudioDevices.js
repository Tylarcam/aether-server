import { useState, useEffect, useRef, useCallback } from 'react';
import { useStorage } from '@/hooks/useStorage';

export function useAudioDevices() {
  const [devices, setDevices] = useState([]);
  const [hasMicPermission, setHasMicPermission] = useState(false);
  const [noInputDevice, setNoInputDevice] = useState(false);
  const [permissionError, setPermissionError] = useState('');
  const [deviceId, setDeviceId] = useStorage('audio_input_device_id', 'default');
  const [autoDetect, setAutoDetect] = useStorage('audio_input_auto_detect', true);

  const [isTesting, setIsTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const testStreamRef = useRef(null);
  const testContextRef = useRef(null);
  const rafRef = useRef(null);

  // Enumerate audio input devices. Works without permission but returns empty labels.
  const enumerateDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const inputs = all.filter((d) => d.kind === 'audioinput');
      setDevices(inputs);
      return inputs;
    } catch (err) {
      console.warn('[useAudioDevices] enumerateDevices failed:', err);
      return [];
    }
  }, []);

  // Handle device change events (fires without permission — headphone plug/unplug always works)
  const handleDeviceChange = useCallback(async () => {
    const current = await enumerateDevices();

    // If auto-detect and selected device disappeared, reset to default
    const storageResult = await chrome.storage.sync.get(['audio_input_device_id', 'audio_input_auto_detect']);
    const currentDeviceId = storageResult.audio_input_device_id || 'default';
    const currentAutoDetect = storageResult.audio_input_auto_detect ?? true;

    if (
      currentAutoDetect &&
      currentDeviceId !== 'default' &&
      !current.find((d) => d.deviceId === currentDeviceId)
    ) {
      setDeviceId('default');
    }

    // If currently recording, notify background
    const sessionResult = await chrome.storage.session.get('recordingState');
    if (sessionResult.recordingState?.isRecording) {
      chrome.runtime.sendMessage({ type: 'deviceChanged' }).catch(() => {});
    }
  }, [enumerateDevices, setDeviceId]);

  // On mount: enumerate directly — if any device has a label, permission already granted.
  // Avoids navigator.permissions.query which is unreliable in extension popup/side-panel.
  useEffect(() => {
    (async () => {
      const devs = await enumerateDevices();
      if (devs.some((d) => d.label)) {
        setHasMicPermission(true);
      }
    })();

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enumerateDevices, handleDeviceChange]);

  // Request microphone permission from a user click.
  // Distinguishes NotFoundError (no mic hardware) from NotAllowedError (user denied).
  const requestMicPermission = useCallback(async () => {
    setPermissionError('');
    setNoInputDevice(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setHasMicPermission(true);
      await enumerateDevices();
      return true;
    } catch (err) {
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        // No input device present — not a permission problem
        setNoInputDevice(true);
        return false;
      }
      // NotAllowedError or anything else — genuine denial
      setPermissionError('Microphone access was denied. Allow it in Chrome site settings.');
      return false;
    }
  }, [enumerateDevices]);

  // Mic test: open stream, drive level meter via AnalyserNode
  const startMicTest = useCallback(async (testDeviceId) => {
    if (isTesting) return;
    try {
      const constraints = {
        audio: testDeviceId && testDeviceId !== 'default'
          ? { deviceId: { exact: testDeviceId } }
          : true
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      testStreamRef.current = stream;

      const ctx = new AudioContext();
      testContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const val = (data[i] - 128) / 128;
          sum += val * val;
        }
        setMicLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      setIsTesting(true);
    } catch (err) {
      setPermissionError(`Mic test error: ${err.message}`);
    }
  }, [isTesting]);

  const stopMicTest = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((t) => t.stop());
      testStreamRef.current = null;
    }
    if (testContextRef.current) {
      testContextRef.current.close().catch(() => {});
      testContextRef.current = null;
    }
    setIsTesting(false);
    setMicLevel(0);
  }, []);

  return {
    devices,
    hasMicPermission,
    noInputDevice,
    permissionError,
    deviceId,
    setDeviceId,
    autoDetect,
    setAutoDetect,
    requestMicPermission,
    isTesting,
    micLevel,
    startMicTest,
    stopMicTest
  };
}
