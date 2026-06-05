import { useState, useEffect, useRef } from 'react';
import { isValidYouTubeUrl } from '@utils/validators';
import { isValidWhisperFile, isValidFileSize, getFileSizeInMB, getWhisperSupportedFormats } from '@utils/fileValidators';

export function useTranscription() {
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timingMetrics, setTimingMetrics] = useState({
    elapsedTime: 0,
    estimatedTimeRemaining: null,
    processingSpeed: null
  });
  const [whisperModel, setWhisperModel] = useState('tiny');
  const currentJobIdRef = useRef(null);
  const progressListenerRef = useRef(null);
  
  // Load preferences from storage
  useEffect(() => {
    chrome.storage.sync.get(['transcription_service', 'whisper_model'], (res) => {
      setWhisperModel(res.whisper_model || 'tiny');
    });
  }, []);

  // Listen for progress updates from background
  useEffect(() => {
    const messageListener = (message) => {
      // Background fires this when a recording is auto-transcribed after Stop.
      // Without capturing the jobId here, all progress updates are ignored
      // because currentJobIdRef.current stays null.
      if (message.type === 'transcription_started') {
        currentJobIdRef.current = message.jobId;
        setIsLoading(true);
        setError(null);
        setResult('');
        setStatus('Starting transcription...');
        setProgress(0);
        return;
      }

      if (message.type === 'transcription_progress') {
        // Only update if this is the current job
        if (message.jobId === currentJobIdRef.current) {
          setStatus(message.message || '');
          setProgress(message.progress || 0);
          setTimingMetrics({
            elapsedTime: message.elapsedTime || 0,
            estimatedTimeRemaining: message.estimatedTimeRemaining,
            processingSpeed: message.processingSpeed
          });

          if (message.status === 'completed') {
            setResult(message.result || '');
            setIsLoading(false);
            currentJobIdRef.current = null;
          } else if (message.status === 'error') {
            setError(new Error(message.error || 'Transcription failed'));
            setIsLoading(false);
            currentJobIdRef.current = null;
          }
        }
      }
    };

    chrome.runtime.onMessage.addListener(messageListener);
    progressListenerRef.current = messageListener;

    return () => {
      if (progressListenerRef.current) {
        chrome.runtime.onMessage.removeListener(progressListenerRef.current);
      }
    };
  }, []);

  // Check for active jobs on mount
  useEffect(() => {
    const checkActiveJobs = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'get_active_jobs' });
        if (response && response.jobs) {
          const jobs = Object.values(response.jobs);
          // Get the most recent active job
          const activeJob = jobs
            .filter(job => job.status !== 'completed' && job.status !== 'error')
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0];
          
          if (activeJob) {
            // Find the job ID
            const jobId = Object.keys(response.jobs).find(id => response.jobs[id] === activeJob);
            if (jobId) {
              currentJobIdRef.current = jobId;
              setStatus(activeJob.message || '');
              setProgress(activeJob.progress || 0);
              setTimingMetrics({
                elapsedTime: activeJob.elapsedTime || 0,
                estimatedTimeRemaining: activeJob.estimatedTimeRemaining,
                processingSpeed: activeJob.processingSpeed
              });
              setIsLoading(true);
              
              if (activeJob.result) {
                setResult(activeJob.result);
                setIsLoading(false);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error checking active jobs:', err);
      }
    };

    checkActiveJobs();
  }, []);

  const transcribe = async (url, format = 'mp3') => {
    if (!isValidYouTubeUrl(url)) {
      setStatus('❌ Invalid YouTube URL');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult('');
    setStatus('🚀 Starting transcription...');
    setProgress(0);

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'start_transcription',
        source: 'url',
        url,
        format
      });

      if (response && response.jobId) {
        currentJobIdRef.current = response.jobId;
      } else {
        throw new Error('Failed to start transcription job');
      }
    } catch (err) {
      setStatus('❌ Error: ' + err.message);
      setError(err);
      setIsLoading(false);
    }
  };

  const transcribeFile = async (file) => {
    if (!file) {
      setStatus('❌ No file selected');
      return;
    }

    if (!isValidWhisperFile(file)) {
      setStatus(`❌ Unsupported file type.\n\nSupported formats:\n${getWhisperSupportedFormats()}`);
      return;
    }

    if (!isValidFileSize(file, 100)) {
      setStatus(`❌ File size exceeds 100 MB limit.\nCurrent size: ${getFileSizeInMB(file)} MB`);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult('');
    setStatus('🚀 Starting transcription...');
    setProgress(0);

    try {
      // Convert file to base64 for transfer to background service
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve({
            name: file.name,
            type: file.type,
            size: file.size,
            data: reader.result.split(',')[1] // Remove data:type;base64, prefix
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const response = await chrome.runtime.sendMessage({
        type: 'start_transcription',
        source: 'file',
        fileData: fileData
      });

      if (response && response.jobId) {
        currentJobIdRef.current = response.jobId;
      } else {
        throw new Error('Failed to start transcription job');
      }
    } catch (err) {
      setStatus('❌ Error: ' + err.message);
      setError(err);
      setIsLoading(false);
    }
  };

  // Poll for job status updates (fallback if message listener doesn't work)
  useEffect(() => {
    if (!currentJobIdRef.current || !isLoading) return;

    const pollInterval = setInterval(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'get_job_status',
          jobId: currentJobIdRef.current
        });

        if (response && response.job) {
          const job = response.job;
          setStatus(job.message || '');
          setProgress(job.progress || 0);
          setTimingMetrics({
            elapsedTime: job.elapsedTime || 0,
            estimatedTimeRemaining: job.estimatedTimeRemaining,
            processingSpeed: job.processingSpeed
          });

          if (job.status === 'completed') {
            setResult(job.result || '');
            setIsLoading(false);
            currentJobIdRef.current = null;
            clearInterval(pollInterval);
          } else if (job.status === 'error') {
            setError(new Error(job.error || 'Transcription failed'));
            setIsLoading(false);
            currentJobIdRef.current = null;
            clearInterval(pollInterval);
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(pollInterval);
  }, [isLoading]);

  // Format time helper
  const formatTime = (seconds) => {
    if (!seconds && seconds !== 0) return null;
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  };

  return { 
    transcribe, 
    transcribeFile, 
    status, 
    result, 
    error, 
    isLoading, 
    progress,
    timingMetrics,
    formatTime
  };
}
