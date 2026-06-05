import { useState } from 'react';
import { isValidWhisperFile, isValidFileSize, getFileSizeInMB, getWhisperSupportedFormats } from '@utils/fileValidators';

export function useLocalWhisperTranscription(model = 'tiny') {
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

    // Local Whisper can handle larger files, but we'll limit to 100MB for practical reasons
    if (!isValidFileSize(file, 100)) {
      setStatus(`❌ File size exceeds 100 MB limit.\nCurrent size: ${getFileSizeInMB(file)} MB`);
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult('');
    setStatus('📄 Validating file...');

    try {
      setStatus(`🧠 Transcribing with local Whisper (${model})...`);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', model);

      let response;
      try {
        response = await fetch('http://localhost:3000/api/transcribe-whisper', {
          method: 'POST',
          body: formData
        });
      } catch (fetchError) {
        // Network error - server likely not running
        if (fetchError.message.includes('Failed to fetch') || fetchError.message.includes('NetworkError')) {
          throw new Error(
            '❌ Cannot connect to server.\n\n' +
            'Please start the server:\n' +
            '1. Open a terminal in the project directory\n' +
            '2. Run: npm run server\n' +
            '3. Wait for "Server running on port 3000"\n' +
            '4. Try again'
          );
        }
        throw fetchError;
      }

      if (!response.ok) {
        let errorMessage = `Transcription request failed with status ${response.status}`;

        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
          }
          if (errorData.details) {
            errorMessage += `\n\nDetails: ${errorData.details}`;
          }
        } catch (parseError) {
          // If JSON parsing fails, use generic message
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data.text) {
        throw new Error('No transcription text returned from Whisper');
      }

      setStatus('✅ Done!');
      setResult(data.text);
      setIsLoading(false);

      // Save to history with metadata
      saveToHistory(data.text, file.name, model);

    } catch (err) {
      setStatus('❌ Error: ' + err.message);
      setError(err);
      setIsLoading(false);
    }
  };

  const saveToHistory = (text, fileName, whisperModel) => {
    const timestamp = new Date().toISOString();
    chrome.storage.local.get(['history'], (res) => {
      const history = res.history || [];
      const historyItem = {
        text,
        timestamp,
        source: 'whisper-local',
        fileName: fileName,
        model: whisperModel
      };

      history.unshift(historyItem);
      chrome.storage.local.set({ history });
    });
  };

  return { transcribeFile, status, result, error, isLoading };
}

