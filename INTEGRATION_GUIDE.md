# Audio Transcriber Integration Guide

Complete guide for integrating the AssemblyAI Audio Transcriber into your application.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Quick Start](#quick-start)
4. [Integration Methods](#integration-methods)
5. [API Reference](#api-reference)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required

- Python 3.7 or higher
- AssemblyAI API key ([Get one here](https://www.assemblyai.com/))
- Internet connection for API calls

### System Requirements

- Minimum 100MB free disk space
- Network access to `api.assemblyai.com`

---

## Installation

### Step 1: Install Dependencies

```bash
pip install requests tqdm python-dotenv
```

### Step 2: Copy Required Files

Copy these files to your project:

```
your_project/
├── audio_transcriber.py      # Core transcription module
└── .env                       # Environment configuration (create this)
```

### Step 3: Configure API Key

Create a `.env` file in your project root:

```env
ASSEMBLYAI_API_KEY=your_api_key_here
```

**Alternative:** Set as environment variable:

```bash
# Linux/Mac
export ASSEMBLYAI_API_KEY="your_api_key_here"

# Windows (Command Prompt)
set ASSEMBLYAI_API_KEY=your_api_key_here

# Windows (PowerShell)
$env:ASSEMBLYAI_API_KEY="your_api_key_here"
```

---

## Quick Start

### Basic Transcription

```python
from audio_transcriber import AudioTranscriber

# Initialize transcriber
transcriber = AudioTranscriber()

# Transcribe a file
result = transcriber.transcribe_file('audio.mp3')

# Save the transcript
transcriber.save_transcript(result, 'transcript.txt', format='txt')

print(result['text'])
```

### One-Line Transcription

```python
from audio_transcriber import transcribe_audio

# Transcribe and save in one call
result = transcribe_audio('audio.mp3', 'output.txt')
```

---

## Integration Methods

### Method 1: Direct Integration (Recommended)

Import the class directly into your application:

```python
from audio_transcriber import AudioTranscriber

class YourApplication:
    def __init__(self):
        self.transcriber = AudioTranscriber()

    def process_audio(self, file_path):
        try:
            result = self.transcriber.transcribe_file(file_path)
            return result['text']
        except Exception as e:
            print(f"Transcription error: {e}")
            return None
```

### Method 2: Custom API Key

Pass API key programmatically instead of using environment variables:

```python
from audio_transcriber import AudioTranscriber

# Initialize with custom API key
transcriber = AudioTranscriber(api_key="your_api_key_here")

result = transcriber.transcribe_file('audio.mp3')
```

### Method 3: Async/Background Processing

For non-blocking transcription in web applications:

```python
import threading
from audio_transcriber import AudioTranscriber

def transcribe_in_background(file_path, callback):
    """Transcribe audio in a background thread."""
    def worker():
        try:
            transcriber = AudioTranscriber()
            result = transcriber.transcribe_file(file_path)
            callback(result, None)
        except Exception as e:
            callback(None, str(e))

    thread = threading.Thread(target=worker)
    thread.start()
    return thread

# Usage
def on_complete(result, error):
    if error:
        print(f"Error: {error}")
    else:
        print(f"Done: {result['text'][:100]}...")

thread = transcribe_in_background('audio.mp3', on_complete)
```

### Method 4: Flask/Web API Integration

```python
from flask import Flask, request, jsonify
from audio_transcriber import AudioTranscriber
import os

app = Flask(__name__)
transcriber = AudioTranscriber()

@app.route('/transcribe', methods=['POST'])
def transcribe_endpoint():
    """API endpoint for audio transcription."""
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']

    # Save uploaded file temporarily
    temp_path = f"/tmp/{file.filename}"
    file.save(temp_path)

    try:
        # Transcribe
        result = transcriber.transcribe_file(temp_path)

        # Cleanup
        os.remove(temp_path)

        return jsonify({
            'success': True,
            'text': result['text'],
            'duration': result.get('audio_duration', 0)
        })

    except Exception as e:
        # Cleanup on error
        if os.path.exists(temp_path):
            os.remove(temp_path)

        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)
```

### Method 5: Django Integration

```python
# views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from audio_transcriber import AudioTranscriber
import tempfile
import os

transcriber = AudioTranscriber()

@csrf_exempt
def transcribe_view(request):
    """Django view for transcription."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    if 'audio_file' not in request.FILES:
        return JsonResponse({'error': 'No file provided'}, status=400)

    audio_file = request.FILES['audio_file']

    # Save to temporary file
    with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp:
        for chunk in audio_file.chunks():
            tmp.write(chunk)
        temp_path = tmp.name

    try:
        # Transcribe
        result = transcriber.transcribe_file(temp_path)

        return JsonResponse({
            'success': True,
            'transcript': result['text'],
            'metadata': {
                'duration': result.get('audio_duration'),
                'confidence': result.get('confidence')
            }
        })

    except Exception as e:
        return JsonResponse({
            'success': False,
            'error': str(e)
        }, status=500)

    finally:
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)
```

---

## API Reference

### AudioTranscriber Class

#### `__init__(api_key=None, base_url=None)`

Initialize the transcriber.

**Parameters:**
- `api_key` (str, optional): AssemblyAI API key. Defaults to `ASSEMBLYAI_API_KEY` env var
- `base_url` (str, optional): Custom API endpoint. Default: `https://api.assemblyai.com/v2`

**Raises:**
- `ValueError`: If no API key is provided

---

#### `transcribe_file(file_path, **options)`

Transcribe an audio file (complete workflow).

**Parameters:**
- `file_path` (str): Path to audio file
- `**options`: Additional transcription options (see below)

**Returns:**
- `dict`: Transcription result containing:
  - `text`: Full transcript text
  - `words`: Word-level timestamps
  - `audio_duration`: Duration in milliseconds
  - `confidence`: Confidence score
  - `id`: Transcript ID

**Supported Options:**
- `language_code` (str): Language code (default: `'en'`)
- `punctuate` (bool): Enable punctuation (default: `True`)
- `format_text` (bool): Enable text formatting (default: `True`)
- `word_boost` (list): Words to boost accuracy
- `boost_param` (str): Boost level - `'low'`, `'medium'`, or `'high'`

**Example:**
```python
result = transcriber.transcribe_file(
    'audio.mp3',
    language_code='es',
    punctuate=True,
    word_boost=['technical', 'jargon'],
    boost_param='high'
)
```

---

#### `save_transcript(transcript_data, output_path, format='txt')`

Save transcript to file.

**Parameters:**
- `transcript_data` (dict): Result from `transcribe_file()`
- `output_path` (str): Output file path
- `format` (str): Output format - `'txt'`, `'srt'`, or `'json'`

**Example:**
```python
transcriber.save_transcript(result, 'output.txt', format='txt')
transcriber.save_transcript(result, 'output.srt', format='srt')
transcriber.save_transcript(result, 'output.json', format='json')
```

---

#### `validate_audio_file(file_path)`

Validate audio file before transcription.

**Parameters:**
- `file_path` (str): Path to audio file

**Returns:**
- `bool`: True if valid, False otherwise

**Raises:**
- `FileNotFoundError`: If file doesn't exist

**Supported Formats:**
- `.mp3`, `.wav`, `.m4a`, `.flac`, `.aac`, `.ogg`, `.wma`, `.aiff`

**Max File Size:** 1GB

---

#### Advanced Methods

For custom workflows, you can use these lower-level methods:

```python
# Upload audio file
upload_url = transcriber.upload_audio_file('audio.mp3')

# Submit transcription request
transcript_id = transcriber.submit_transcription(upload_url)

# Check status
status = transcriber.get_transcription_status(transcript_id)

# Wait for completion
result = transcriber.wait_for_completion(transcript_id, timeout=3600)
```

---

## Error Handling

### Common Errors and Solutions

#### 1. Missing API Key

```python
# Error: ValueError: AssemblyAI API key is required

# Solution 1: Use environment variable
import os
os.environ['ASSEMBLYAI_API_KEY'] = 'your_key'

# Solution 2: Pass directly
transcriber = AudioTranscriber(api_key='your_key')
```

#### 2. Unsupported File Format

```python
# Error: ValueError: Invalid audio file

# Solution: Validate before transcribing
if transcriber.validate_audio_file('audio.xyz'):
    result = transcriber.transcribe_file('audio.xyz')
else:
    print("Unsupported format")
```

#### 3. File Too Large

```python
# Error: File too large (max 1GB)

# Solution: Check file size first
import os
file_size = os.path.getsize('audio.mp3')
max_size = 1024 * 1024 * 1024  # 1GB

if file_size <= max_size:
    result = transcriber.transcribe_file('audio.mp3')
else:
    print(f"File too large: {file_size / (1024**3):.2f}GB")
```

#### 4. Network Errors

```python
import requests

try:
    result = transcriber.transcribe_file('audio.mp3')
except requests.RequestException as e:
    print(f"Network error: {e}")
    # Implement retry logic
```

#### 5. Transcription Timeout

```python
# Error: TimeoutError: Transcription timed out

# Solution: Increase timeout
try:
    result = transcriber.wait_for_completion(
        transcript_id,
        timeout=7200  # 2 hours
    )
except TimeoutError:
    print("Transcription took too long")
```

### Comprehensive Error Handling Pattern

```python
from audio_transcriber import AudioTranscriber
import requests
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def safe_transcribe(file_path, max_retries=3):
    """Transcribe with comprehensive error handling."""
    transcriber = AudioTranscriber()

    # Validate file
    try:
        if not transcriber.validate_audio_file(file_path):
            return {'error': 'Invalid audio file format or size'}
    except FileNotFoundError:
        return {'error': f'File not found: {file_path}'}

    # Attempt transcription with retries
    for attempt in range(max_retries):
        try:
            logger.info(f"Attempt {attempt + 1}/{max_retries}")
            result = transcriber.transcribe_file(file_path)
            return {'success': True, 'result': result}

        except requests.ConnectionError:
            logger.warning(f"Connection error, retrying...")
            if attempt == max_retries - 1:
                return {'error': 'Connection failed after retries'}

        except requests.Timeout:
            logger.warning(f"Request timeout, retrying...")
            if attempt == max_retries - 1:
                return {'error': 'Request timed out'}

        except TimeoutError:
            return {'error': 'Transcription took too long'}

        except RuntimeError as e:
            return {'error': f'Transcription failed: {str(e)}'}

        except Exception as e:
            logger.error(f"Unexpected error: {e}")
            return {'error': f'Unexpected error: {str(e)}'}

    return {'error': 'Max retries exceeded'}

# Usage
result = safe_transcribe('audio.mp3')
if 'error' in result:
    print(f"Failed: {result['error']}")
else:
    print(f"Success: {result['result']['text'][:100]}...")
```

---

## Best Practices

### 1. API Key Security

**Never hardcode API keys in source code:**

```python
# BAD - Don't do this
transcriber = AudioTranscriber(api_key="abc123xyz")

# GOOD - Use environment variables
from dotenv import load_dotenv
load_dotenv()
transcriber = AudioTranscriber()  # Reads from env
```

### 2. File Validation

Always validate before transcribing:

```python
if transcriber.validate_audio_file(file_path):
    result = transcriber.transcribe_file(file_path)
else:
    raise ValueError("Invalid audio file")
```

### 3. Progress Tracking

The transcriber includes built-in progress bars. For custom progress tracking:

```python
import time

# Submit transcription
upload_url = transcriber.upload_audio_file('audio.mp3')
transcript_id = transcriber.submit_transcription(upload_url)

# Custom progress tracking
while True:
    status_data = transcriber.get_transcription_status(transcript_id)
    status = status_data['status']

    if status == 'completed':
        print("Done!")
        break
    elif status in ['error', 'rejected']:
        print(f"Failed: {status}")
        break
    else:
        print(f"Status: {status}")
        time.sleep(3)
```

### 4. Batch Processing

Process multiple files efficiently:

```python
import os
from pathlib import Path

def batch_transcribe(directory, output_dir):
    """Transcribe all audio files in a directory."""
    transcriber = AudioTranscriber()
    audio_extensions = {'.mp3', '.wav', '.m4a', '.flac'}

    # Create output directory
    os.makedirs(output_dir, exist_ok=True)

    # Get all audio files
    files = [
        f for f in Path(directory).rglob('*')
        if f.suffix.lower() in audio_extensions
    ]

    results = []
    for file_path in files:
        try:
            print(f"Processing: {file_path.name}")
            result = transcriber.transcribe_file(str(file_path))

            # Save transcript
            output_path = Path(output_dir) / f"{file_path.stem}.txt"
            transcriber.save_transcript(result, str(output_path), format='txt')

            results.append({
                'file': file_path.name,
                'success': True,
                'output': str(output_path)
            })

        except Exception as e:
            results.append({
                'file': file_path.name,
                'success': False,
                'error': str(e)
            })

    return results

# Usage
results = batch_transcribe('./audio_files', './transcripts')
successful = sum(1 for r in results if r['success'])
print(f"Processed {successful}/{len(results)} files successfully")
```

### 5. Memory Management

For large files or batch processing:

```python
def transcribe_with_cleanup(file_path):
    """Transcribe and free memory immediately."""
    transcriber = AudioTranscriber()
    result = transcriber.transcribe_file(file_path)

    # Extract only what you need
    text = result['text']
    duration = result.get('audio_duration')

    # Free memory by deleting large result object
    del result

    return text, duration
```

### 6. Language-Specific Transcription

```python
# Supported languages
LANGUAGES = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'nl': 'Dutch',
    'ja': 'Japanese',
    'zh': 'Chinese',
    'ko': 'Korean',
    # ... and many more
}

def transcribe_with_language(file_path, lang_code='en'):
    """Transcribe with specific language."""
    transcriber = AudioTranscriber()
    result = transcriber.transcribe_file(
        file_path,
        language_code=lang_code
    )
    return result
```

---

## Troubleshooting

### Issue: Import Error

```
ModuleNotFoundError: No module named 'audio_transcriber'
```

**Solution:**
- Ensure `audio_transcriber.py` is in your project directory or Python path
- Verify you're in the correct directory
- Check file permissions

---

### Issue: API Key Not Found

```
ValueError: AssemblyAI API key is required
```

**Solution:**
1. Check `.env` file exists and contains `ASSEMBLYAI_API_KEY=...`
2. Verify environment variable is set: `echo $ASSEMBLYAI_API_KEY` (Linux/Mac) or `echo %ASSEMBLYAI_API_KEY%` (Windows)
3. Load dotenv: `from dotenv import load_dotenv; load_dotenv()`

---

### Issue: Slow Transcription

**Causes:**
- Large file size
- Network speed
- AssemblyAI server load

**Solutions:**
- Use progress bars to monitor status
- Implement async processing for non-blocking behavior
- Consider splitting very large files

---

### Issue: Transcription Fails Silently

**Solution:**

Enable verbose logging:

```python
import logging

logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

transcriber = AudioTranscriber()
result = transcriber.transcribe_file('audio.mp3')
```

---

### Issue: JSON Output is Too Large

**Solution:**

Extract only necessary data:

```python
result = transcriber.transcribe_file('audio.mp3')

# Save minimal data
minimal_data = {
    'text': result['text'],
    'duration': result.get('audio_duration'),
    'confidence': result.get('confidence')
}

import json
with open('output.json', 'w') as f:
    json.dump(minimal_data, f, indent=2)
```

---

## Performance Tips

### 1. Reuse Transcriber Instance

```python
# BAD - Creates new instance each time
for file in files:
    transcriber = AudioTranscriber()  # Slow!
    result = transcriber.transcribe_file(file)

# GOOD - Reuse instance
transcriber = AudioTranscriber()
for file in files:
    result = transcriber.transcribe_file(file)
```

### 2. Parallel Processing (Advanced)

```python
from concurrent.futures import ThreadPoolExecutor
from audio_transcriber import AudioTranscriber

def transcribe_one(file_path):
    """Transcribe a single file."""
    transcriber = AudioTranscriber()
    return transcriber.transcribe_file(file_path)

# Process multiple files in parallel
files = ['audio1.mp3', 'audio2.mp3', 'audio3.mp3']

with ThreadPoolExecutor(max_workers=3) as executor:
    results = list(executor.map(transcribe_one, files))

for file, result in zip(files, results):
    print(f"{file}: {len(result['text'])} characters")
```

---

## Support and Additional Resources

- **AssemblyAI Documentation:** https://www.assemblyai.com/docs
- **API Reference:** https://www.assemblyai.com/docs/api-reference
- **Supported Languages:** https://www.assemblyai.com/docs/concepts/supported-languages

---

## License

This integration guide is provided as-is for use with the Audio Transcriber project (MIT License).
