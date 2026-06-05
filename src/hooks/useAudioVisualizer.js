import { useEffect, useState, useRef } from 'react';

export function useAudioVisualizer(audioStream) {
  const [analyserNode, setAnalyserNode] = useState(null);
  const frequencyDataRef = useRef(null);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!audioStream) {
      // Cleanup if stream is removed
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
        setAnalyserNode(null);
      }
      return;
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(audioStream);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    source.connect(analyser);

    audioContextRef.current = audioContext;
    frequencyDataRef.current = dataArray;
    setAnalyserNode(analyser);

    return () => {
      source.disconnect();
      audioContext.close();
    };
  }, [audioStream]);

  return {
    analyserNode,
    frequencyData: frequencyDataRef.current
  };
}
