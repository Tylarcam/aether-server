import { useState, useEffect, useRef } from 'react';
import { Check, Download, Sparkles, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranscription } from '@/hooks/useTranscription';
import { useUIReaction } from '@/hooks/useUIReaction';
import { extractYouTubeUrl, isValidYouTubeUrl, generateTimestamp } from '@/utils/validators';
import { isValidWhisperFile, isValidFileSize } from '@utils/fileValidators';
import GlassCard from '@/components/layout/GlassCard';
import Button from '@/components/shared/Button';
import CopyButton from '@/components/shared/CopyButton';
import Input from '@/components/shared/Input';
import Select from '@/components/shared/Select';
import StatusMessage from '@/components/shared/StatusMessage';

export default function TranscribeTab() {
  const [mode, setMode] = useState('youtube');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('mp3');
  const [selectedFile, setSelectedFile] = useState(null);
  const [transcriptionService, setTranscriptionService] = useState('groq');
  const [modalWhisperUrl, setModalWhisperUrl] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [dragError, setDragError] = useState('');
  const dropZoneRef = useRef(null);
  const { transcribe, transcribeFile, status, result, isLoading, progress, timingMetrics, formatTime } = useTranscription();
  const { controls: dlIconControls, triggerMicro: triggerDlMicro } = useUIReaction();
  const [downloadFormat, setDownloadFormat] = useState('mp3');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const [downloadComplete, setDownloadComplete] = useState(false);

  // Load service preference
  useEffect(() => {
    chrome.storage.sync.get(['transcription_service', 'modal_whisper_url'], (res) => {
      setTranscriptionService(res.transcription_service || 'groq');
      setModalWhisperUrl(res.modal_whisper_url || '');
    });
  }, []);


  const handleTranscribe = () => {
    transcribe(url, format);
  };

  const handleDownload = async () => {
    if (!isValidYouTubeUrl(url)) { setDownloadStatus('❌ Invalid YouTube URL'); return; }
    setIsDownloading(true);
    setDownloadStatus('📥 Extracting audio...');
    try {
      const response = await fetch('http://localhost:3000/api/extract-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, format: downloadFormat })
      });
      if (!response.ok) { const e = await response.json(); throw new Error(e.error || 'Download failed'); }
      const { audioUrl } = await response.json();
      setDownloadStatus('⬇️ Downloading...');
      const filename = `youtube-audio-${generateTimestamp()}.${downloadFormat}`;
      chrome.downloads.download({ url: audioUrl, filename, saveAs: false }, () => {
        if (chrome.runtime.lastError) {
          setDownloadStatus('❌ Error: ' + chrome.runtime.lastError.message);
        } else {
          setDownloadStatus(`✅ Downloaded as ${filename}`);
          setDownloadComplete(true);
          triggerDlMicro('dlIcon', 'flip');
          setTimeout(() => setDownloadComplete(false), 1000);
        }
        setIsDownloading(false);
      });
    } catch (err) {
      setDownloadStatus('❌ Error: ' + err.message);
      setIsDownloading(false);
    }
  };

  const handleFileTranscribe = () => {
    transcribeFile(selectedFile);
  };

  const downloadTranscript = () => {
    const blob = new Blob([result], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    setSelectedFile(file);
  };

  // Drag & Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isLoading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragError('');
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    setDragError('');

    if (isLoading) return;

    const items = e.dataTransfer.items;
    const files = e.dataTransfer.files;

    // Check for files first
    if (files.length > 0) {
      const file = files[0];
      
      if (!isValidWhisperFile(file)) {
        setDragError('Unsupported file type. Please use audio/video files.');
        return;
      }

      if (!isValidFileSize(file, 100)) {
        setDragError(`File size exceeds 100 MB limit. Current size: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
        return;
      }

      setSelectedFile(file);
      setMode('upload');
      // Auto-trigger transcription after a short delay
      setTimeout(() => {
        transcribeFile(file);
      }, 100);
      return;
    }

    // Check for text/URL
    if (items.length > 0) {
      const item = items[0];
      if (item.kind === 'string' && item.type === 'text/plain') {
        item.getAsString((text) => {
          const youtubeUrl = extractYouTubeUrl(text);
          if (youtubeUrl) {
            setUrl(youtubeUrl);
            setMode('youtube');
            // Auto-trigger transcription after a short delay
            setTimeout(() => {
              transcribe(youtubeUrl, format);
            }, 100);
          } else {
            setDragError('No valid YouTube URL found in dropped text.');
          }
        });
        return;
      }
    }

    setDragError('Please drop a file or YouTube URL.');
  };

  return (
    <div 
      className="space-y-6 relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      ref={dropZoneRef}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-luna-accent-primary/10 backdrop-blur-sm flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-luna-accent-primary/20 border-2 border-dashed border-luna-accent-primary rounded-2xl p-12 text-center"
            >
              <Upload className="w-16 h-16 text-luna-accent-primary mx-auto mb-4" />
              <p className="text-xl font-semibold text-luna-white mb-2">Drop to transcribe</p>
              <p className="text-sm text-luna-silver">Drop a file or YouTube URL here</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <GlassCard>
        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-luna-white">Transcribe Audio</h2>
          <p className="text-luna-silver">
            Extract and transcribe audio from YouTube or upload your own files
          </p>
        </div>
      </GlassCard>

      <GlassCard>
        <div className="flex gap-2 p-1 bg-black/20 rounded-full">
          <Button
            onClick={() => setMode('youtube')}
            variant={mode === 'youtube' ? 'primary' : 'secondary'}
            className="flex-1"
          >
            YouTube URL
          </Button>
          <Button
            onClick={() => setMode('upload')}
            variant={mode === 'upload' ? 'primary' : 'secondary'}
            className="flex-1"
          >
            Upload File
          </Button>
          <Button
            onClick={() => setMode('download')}
            variant={mode === 'download' ? 'primary' : 'secondary'}
            className="flex-1"
          >
            Download
          </Button>
        </div>
      </GlassCard>


      <GlassCard>
        <div className="space-y-4">{mode === 'download' ? (
          // Download Audio Mode
          <>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube URL here..."
              disabled={isDownloading}
            />
            <Select
              value={downloadFormat}
              onChange={(e) => setDownloadFormat(e.target.value)}
              disabled={isDownloading}
              options={[
                { value: 'mp3', label: 'MP3 (Recommended)' },
                { value: 'wav', label: 'WAV (Uncompressed)' },
                { value: 'm4a', label: 'M4A (Apple)' },
                { value: 'opus', label: 'OPUS (High Quality)' },
                { value: 'flac', label: 'FLAC (Lossless)' }
              ]}
            />
            <Button
              onClick={handleDownload}
              disabled={!url || isDownloading}
              variant="primary"
              className="w-full"
            >
              <div className="flex items-center justify-center gap-2">
                <motion.div animate={dlIconControls}>
                  {downloadComplete ? <Check className="w-5 h-5" /> : <Download className="w-5 h-5" />}
                </motion.div>
                {isDownloading ? 'Downloading...' : 'Download Audio'}
              </div>
            </Button>
            {downloadStatus && <StatusMessage message={downloadStatus} />}
          </>
        ) : mode === 'youtube' ? (
          // YouTube URL Mode
          <>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste YouTube URL here..."
              disabled={isLoading}
            />

            <Select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              disabled={isLoading}
              options={[
                { value: 'mp3', label: 'MP3' },
                { value: 'wav', label: 'WAV' },
                { value: 'm4a', label: 'M4A' },
                { value: 'opus', label: 'OPUS' }
              ]}
            />

            <Button
              onClick={handleTranscribe}
              disabled={
                !url ||
                isLoading ||
                (transcriptionService === 'whisper-modal' && !modalWhisperUrl.trim())
              }
              variant="primary"
              className="w-full"
            >
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5" />
                {isLoading ? 'Processing...' : 'Transcribe'}
              </div>
            </Button>

            {transcriptionService === 'groq' && (
              <p className="text-sm text-blue-400 text-center">
                ℹ️ Using Groq Whisper (cloud, free tier, fastest)
              </p>
            )}
            {transcriptionService === 'whisper' && (
              <p className="text-sm text-blue-400 text-center">
                ℹ️ Using Whisper (local). Make sure server is running (npm run server)
              </p>
            )}
            {transcriptionService === 'whisper-modal' && !modalWhisperUrl.trim() && (
              <p className="text-sm text-yellow-400 text-center">
                ⚠️ Add your Modal Whisper endpoint URL in Settings first
              </p>
            )}
            {transcriptionService === 'whisper-modal' && modalWhisperUrl.trim() && (
              <p className="text-sm text-blue-400 text-center">
                ℹ️ Using Whisper on Modal (cloud)
              </p>
            )}
          </>
        ) : (
          // Upload File Mode
          <>
            <Input
              type="file"
              accept=".mp3,.mp4,.mpeg,.mpga,.m4a,.wav,.webm,.flac,.ogg,.opus,.avi"
              onChange={handleFileChange}
              disabled={isLoading}
            />

            {selectedFile && (
              <div className="text-sm text-luna-silver">
                Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
              </div>
            )}

            <Button
              onClick={handleFileTranscribe}
              disabled={
                !selectedFile ||
                isLoading ||
                (transcriptionService === 'whisper-modal' && !modalWhisperUrl.trim())
              }
              variant="primary"
              className="w-full"
            >
              <div className="flex items-center justify-center gap-2">
                <Sparkles className="w-5 h-5" />
                {isLoading
                  ? 'Transcribing...'
                  : transcriptionService === 'whisper'
                    ? 'Transcribe with Whisper'
                    : transcriptionService === 'whisper-modal'
                      ? 'Transcribe with Whisper (Modal)'
                      : 'Transcribe with Groq'}
              </div>
            </Button>

            {transcriptionService === 'groq' && (
              <p className="text-sm text-blue-400 text-center">
                ℹ️ Using Groq Whisper (cloud, free tier, fastest)
              </p>
            )}
            {transcriptionService === 'whisper' && (
              <p className="text-sm text-blue-400 text-center">
                ℹ️ Using Whisper (local). Make sure server is running (npm run server)
              </p>
            )}
            {transcriptionService === 'whisper-modal' && !modalWhisperUrl.trim() && (
              <p className="text-sm text-yellow-400 text-center">
                ⚠️ Add your Modal Whisper endpoint URL in Settings first
              </p>
            )}
            {transcriptionService === 'whisper-modal' && modalWhisperUrl.trim() && (
              <p className="text-sm text-blue-400 text-center">
                ℹ️ Using Whisper on Modal (cloud)
              </p>
            )}
          </>
        )}

          {dragError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-400">{dragError}</p>
            </div>
          )}

          {status && (
            <div className="space-y-3">
              <StatusMessage message={status} />
              {isLoading && progress > 0 && (
                <>
                  <div className="w-full bg-black/20 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-luna-accent-primary to-luna-accent-secondary transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-luna-silver">
                    <div className="flex items-center gap-4">
                      {timingMetrics.elapsedTime > 0 && (
                        <span>Elapsed: {formatTime(timingMetrics.elapsedTime)}</span>
                      )}
                      {timingMetrics.estimatedTimeRemaining !== null && timingMetrics.estimatedTimeRemaining > 0 && (
                        <span className="text-luna-accent-primary">
                          ETA: {formatTime(timingMetrics.estimatedTimeRemaining)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      {timingMetrics.processingSpeed !== null && (
                        <span>Speed: {timingMetrics.processingSpeed.toFixed(1)}%/min</span>
                      )}
                      <span className="font-semibold text-luna-white">{progress}%</span>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </GlassCard>

      {result && (
        <GlassCard>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-luna-white">Transcript</h3>
              <div className="flex gap-2">
                <CopyButton text={result} className="!px-4 !py-2" />
                <Button
                  onClick={downloadTranscript}
                  variant="secondary"
                  className="!px-4 !py-2"
                >
                  <Download className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="bg-black/20 rounded-lg p-4 max-h-96 overflow-y-auto">
              <p className="text-luna-white whitespace-pre-wrap">{result}</p>
            </div>
          </div>
        </GlassCard>
      )}

      <GlassCard>
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-luna-white">Features</h3>
          <ul className="space-y-2 text-luna-silver text-sm">
            {mode === 'youtube' ? (
              <>
                <li className="flex items-start gap-2">
                  <span className="text-luna-accent-primary">•</span>
                  <span>Supports multiple audio formats (MP3, WAV, M4A, OPUS)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-luna-accent-primary">•</span>
                  <span>Powered by Groq Whisper, Whisper (Modal), or Whisper (Local)</span>
                </li>
              </>
            ) : (
              <>
                <li className="flex items-start gap-2">
                  <span className="text-luna-accent-primary">•</span>
                  <span>Supports audio/video files up to 100 MB</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-luna-accent-primary">•</span>
                  <span>Powered by Groq Whisper, Whisper (Modal), or Whisper (Local)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-luna-accent-primary">•</span>
                  <span>Supports: mp3, mp4, wav, webm, flac, ogg, opus, avi, m4a, mpeg, mpga</span>
                </li>
              </>
            )}
            <li className="flex items-start gap-2">
                <span className="text-luna-accent-primary">•</span>
                <span>Copy to clipboard or download as text file</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-luna-accent-primary">•</span>
                <span>Automatically saved to history for later access</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-luna-accent-primary">•</span>
                <span>Runs in background - you can close the extension and get notified when complete</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-luna-accent-primary">•</span>
                <span>Drag & drop files or YouTube URLs directly onto this tab</span>
              </li>
          </ul>
        </div>
      </GlassCard>
    </div>
  );
}
