import { useState } from 'react';
import { isValidWhisperFile, isValidFileSize, getFileSizeInMB, getWhisperSupportedFormats } from '@utils/fileValidators';

export function useWhisperTranscription(apiKey) {
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const transcribeFile = async (file) => {
    if (!file) {
      setStatus('❌ No file selected');
      return;
    }

    if (!isValidWhisperFile(file)) {
      setStatus(`❌ Unsupported file type.\n\nSupported formats:\n${getWhisperSupportedFormats()}`);
      return;
    }

    if (!isValidFileSize(file, 25)) {
      setStatus(`❌ File size exceeds 25 MB limit.\nCurrent size: ${getFileSizeInMB(file)} MB`);
      return;
    }

    if (!apiKey) {
      setStatus('❌ Missing OpenAI API key. Go to Settings.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult('');
    setStatus('📄 Validating file...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', 'whisper-1');

      setStatus('🧠 Transcribing with Whisper...');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
          // DO NOT set Content-Type - browser sets it automatically with boundary
        },
        body: formData
      });

      if (!response.ok) {
        let errorMessage = `API request failed with status ${response.status}`;

        try {
          const errorData = await response.json();

          // OpenAI error format: { error: { message: "...", type: "...", code: "..." } }
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }

          // Add specific handling for common errors
          if (response.status === 401) {
            errorMessage = 'Invalid API key. Please check your OpenAI API key in Settings.';
          } else if (response.status === 429) {
            errorMessage = 'Rate limit exceeded. Please try again later.';
          } else if (response.status === 413) {
            errorMessage = 'File too large for upload. Maximum size is 25 MB.';
          }
        } catch (parseError) {
          // If JSON parsing fails, use generic message
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Whisper API returns: { text: "transcribed text..." }
      if (!data.text) {
        throw new Error('No transcription text returned from Whisper API');
      }

      setStatus('✅ Done!');
      setResult(data.text);
      setIsLoading(false);

      // Save to history with metadata
      saveToHistory(data.text, file.name);

    } catch (err) {
      setStatus('❌ Error: ' + err.message);
      setError(err);
      setIsLoading(false);
    }
  };

  const saveToHistory = (text, fileName) => {
    const timestamp = new Date().toISOString();
    chrome.storage.local.get(['history'], (res) => {
      const history = res.history || [];
      history.unshift({
        text,
        timestamp,
        source: 'whisper',
        fileName: fileName
      });
      chrome.storage.local.set({ history });
    });
  };

  return { transcribeFile, status, result, error, isLoading };
}
