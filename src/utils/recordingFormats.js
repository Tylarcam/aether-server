export const RECORDING_OUTPUT_FORMATS = ['wav', 'mp3', 'webm'];

export const DEFAULT_RECORDING_OUTPUT_FORMAT = 'wav';

export const RECORDING_FORMAT_OPTIONS = [
  { value: 'wav', label: 'WAV — universal (Mac & Windows)' },
  { value: 'mp3', label: 'MP3 — compressed, widely supported' },
  { value: 'webm', label: 'WebM — smallest file size' },
];

export function normalizeRecordingFormat(format) {
  return RECORDING_OUTPUT_FORMATS.includes(format)
    ? format
    : DEFAULT_RECORDING_OUTPUT_FORMAT;
}

export function getRecordingMimeType(format) {
  switch (normalizeRecordingFormat(format)) {
    case 'mp3':
      return 'audio/mpeg';
    case 'webm':
      return 'audio/webm';
    case 'wav':
    default:
      return 'audio/wav';
  }
}
