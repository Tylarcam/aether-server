import { useState } from 'react';
import { isValidWhisperFile, isValidFileSize, getFileSizeInMB, getWhisperSupportedFormats } from '@utils/fileValidators';

export function useHuggingFaceTranscription(apiKey) {
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
      setStatus('❌ Missing Hugging Face API key. Go to Settings.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult('');
    setStatus('📄 Validating file...');

    try {
      setStatus('🧠 Transcribing with Hugging Face Whisper...');

      // Hugging Face Inference API endpoint for Whisper
      // Using whisper-base as it's more reliable on free tier
      // Send audio file directly as binary data
      const response = await fetch(
        'https://api-inference.huggingface.co/models/openai/whisper-base',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`
            // Don't set Content-Type - let browser set it automatically
          },
          body: file
        }
      );

      if (!response.ok) {
        let errorMessage = `API request failed with status ${response.status}`;

        try {
          const errorData = await response.json();
          
          // Hugging Face error format: { error: "error message" }
          if (errorData.error) {
            errorMessage = errorData.error;
          }

          // Handle specific error cases
          if (response.status === 401) {
            errorMessage = 'Invalid API key. Please check your Hugging Face API key in Settings.';
          } else           if (response.status === 410) {
            errorMessage = 'Model endpoint unavailable (410). This may be temporary - the free Inference API has limited availability. Try again in a few moments, or the model may need to warm up on first use.';
          } else if (response.status === 429) {
            errorMessage = 'Rate limit exceeded. Please try again later.';
          } else if (response.status === 503) {
            errorMessage = 'Model is loading. Please wait a moment and try again.';
          } else if (response.status === 413) {
            errorMessage = 'File too large. Maximum size is 25 MB.';
          }
        } catch (parseError) {
          // If JSON parsing fails, use generic message
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      // Hugging Face Whisper returns: { text: "transcribed text..." }
      if (!data.text) {
        throw new Error('No transcription text returned from Hugging Face API');
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
        source: 'huggingface',
        fileName: fileName
      });
      chrome.storage.local.set({ history });
    });
  };

  return { transcribeFile, status, result, error, isLoading };
}

