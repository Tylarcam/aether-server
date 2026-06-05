import { useEffect, useState, useRef } from 'react';
import { CircleDot, Square } from 'lucide-react';
import { useTabCapture } from '@/hooks/useTabCapture';
import { useTranscription } from '@/hooks/useTranscription';
import GlassCard from '@/components/layout/GlassCard';
import Button from '@/components/shared/Button';
import CopyButton from '@/components/shared/CopyButton';
import StatusMessage from '@/components/shared/StatusMessage';
import AudioVisualizer from '@/components/features/AudioVisualizer';

function formatElapsed(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

export default function RecordTab({ isRecording: parentIsRecording, setIsRecording: setParentIsRecording }) {
  const {
    startRecording,
    stopRecording,
    isRecording,
    status,
    elapsedTime,
    analyserDataRef,
    videoDuration,
    videoCurrentTime
  } = useTabCapture();
  const { status: txStatus, result, isLoading: isTranscribing, progress } = useTranscription('');

  const [timeRemaining, setTimeRemaining] = useState(null);
  const captureWallTimeRef = useRef(null);
  const captureVideoTimeRef = useRef(null);

  useEffect(() => {
    if (videoDuration !== null && videoCurrentTime !== null) {
      captureWallTimeRef.current = Date.now();
      captureVideoTimeRef.current = videoCurrentTime;
    } else {
      setTimeRemaining(null);
    }
  }, [videoDuration, videoCurrentTime]);

  useEffect(() => {
    if (!isRecording || videoDuration === null) {
      setTimeRemaining(null);
      return;
    }
    const id = setInterval(() => {
      if (captureWallTimeRef.current === null) return;
      const elapsed = (Date.now() - captureWallTimeRef.current) / 1000;
      const pos = (captureVideoTimeRef.current || 0) + elapsed;
      setTimeRemaining(Math.max(0, videoDuration - pos));
    }, 1000);
    return () => clearInterval(id);
  }, [isRecording, videoDuration]);

  // Sync recording state with parent (drives the TabBar indicator)
  useEffect(() => {
    if (setParentIsRecording) setParentIsRecording(isRecording);
  }, [isRecording, setParentIsRecording]);

  return (
    <div className="space-y-6">
      <GlassCard>
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-luna-white">Record Tab Audio</h2>
          <p className="text-luna-silver">
            Recording runs in the background — close this panel and keep browsing freely.
          </p>
        </div>
      </GlassCard>

      {isRecording && (
        <GlassCard>
          <AudioVisualizer analyserDataRef={analyserDataRef} />
          {elapsedTime > 0 && (
            <p className="text-center text-luna-silver text-sm mt-2">
              Elapsed: <span className="text-luna-white font-semibold">{formatElapsed(elapsedTime)}</span>
            </p>
          )}
          {videoDuration !== null && (
            <div className="flex items-center justify-center gap-2 mt-1">
              <span className="text-xs font-bold tracking-widest text-purple-400 border border-purple-400/30 rounded px-1.5 py-0.5">
                AUTO-STOP
              </span>
              {timeRemaining !== null && (
                <span className="text-xs text-purple-300 font-mono">
                  {timeRemaining > 0
                    ? `–${Math.floor(timeRemaining / 60)}:${String(Math.floor(timeRemaining % 60)).padStart(2, '0')}`
                    : 'Stopping...'}
                </span>
              )}
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard>
        <div className="space-y-4">
          <div className="flex gap-3 justify-center flex-wrap">
            <Button
              onClick={startRecording}
              disabled={isRecording}
              variant="primary"
            >
              <div className="flex items-center gap-2">
                <CircleDot className="w-5 h-5" />
                Start Recording
              </div>
            </Button>

            <Button
              onClick={stopRecording}
              disabled={!isRecording}
              variant="secondary"
            >
              <div className="flex items-center gap-2">
                <Square className="w-5 h-5" />
                Stop
              </div>
            </Button>

          </div>

          {status && <StatusMessage message={status} />}
        </div>
      </GlassCard>

      {!isRecording && (isTranscribing || result || txStatus) && (
        <GlassCard>
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-luna-white">Transcription</h3>
            {isTranscribing && (
              <>
                <p className="text-sm text-luna-silver">{txStatus}</p>
                <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${progress}%`,
                      background: 'linear-gradient(to right, var(--luna-accent-primary, #7c3aed), var(--luna-accent-glow, #a78bfa))'
                    }}
                  />
                </div>
              </>
            )}
            {result && (
              <>
                <p className="text-xs text-green-400">✅ Transcription complete — saved to history</p>
                <div className="bg-white/5 rounded-lg p-3 max-h-48 overflow-y-auto">
                  <p className="text-sm text-luna-silver whitespace-pre-wrap">{result}</p>
                </div>
                <CopyButton text={result} className="w-full">
                  Copy Transcript
                </CopyButton>
              </>
            )}
            {txStatus && !isTranscribing && !result && (
              <p className="text-sm text-luna-silver">{txStatus}</p>
            )}
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-luna-white">How it works</h3>
          <ul className="space-y-2 text-luna-silver text-sm">
            <li className="flex items-start gap-2">
              <span className="text-luna-accent-primary">•</span>
              <span>Navigate to a tab with audio (YouTube, podcast, course video)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-luna-accent-primary">•</span>
              <span>Click <strong className="text-luna-white">Start Recording</strong> — audio captures in the background</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-luna-accent-primary">•</span>
              <span>Close this popup and browse freely — recording keeps going</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-luna-accent-primary">•</span>
              <span>Reopen the extension anytime to check status or stop recording</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-luna-accent-primary">•</span>
              <span>Click <strong className="text-luna-white">Stop</strong> — audio is automatically transcribed</span>
            </li>
          </ul>
        </div>
      </GlassCard>
    </div>
  );
}
