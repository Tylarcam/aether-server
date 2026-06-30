// Audio export helpers for the offscreen recorder (plain script, no bundler).
const RECORDING_OUTPUT_FORMATS = ['wav', 'mp3', 'webm'];
const DEFAULT_RECORDING_OUTPUT_FORMAT = 'wav';

function normalizeRecordingFormat(format) {
  return RECORDING_OUTPUT_FORMATS.includes(format) ? format : DEFAULT_RECORDING_OUTPUT_FORMAT;
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function encodeWAV(audioBuffer) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  const samples = audioBuffer.length;
  const blockAlign = numChannels * bitDepth / 8;
  const byteRate = sampleRate * blockAlign;
  const dataLength = samples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      let sample = audioBuffer.getChannelData(ch)[i];
      sample = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return buffer;
}

function floatTo16BitPCM(float32Array) {
  const int16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const sample = Math.max(-1, Math.min(1, float32Array[i]));
    int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
  }
  return int16;
}

function concatUint8Arrays(chunks) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function encodeMP3(audioBuffer, kbps = 128) {
  const numChannels = audioBuffer.numberOfChannels;
  const sampleRate = audioBuffer.sampleRate;
  const mp3encoder = new lamejs.Mp3Encoder(numChannels, sampleRate, kbps);
  const sampleBlockSize = 1152;
  const mp3Data = [];
  const left = floatTo16BitPCM(audioBuffer.getChannelData(0));
  const right = numChannels > 1 ? floatTo16BitPCM(audioBuffer.getChannelData(1)) : left;

  for (let i = 0; i < left.length; i += sampleBlockSize) {
    const leftChunk = left.subarray(i, i + sampleBlockSize);
    const rightChunk = right.subarray(i, i + sampleBlockSize);
    const mp3buf = numChannels > 1
      ? mp3encoder.encodeBuffer(leftChunk, rightChunk)
      : mp3encoder.encodeBuffer(leftChunk);
    if (mp3buf.length > 0) mp3Data.push(new Uint8Array(mp3buf));
  }

  const flush = mp3encoder.flush();
  if (flush.length > 0) mp3Data.push(new Uint8Array(flush));

  return concatUint8Arrays(mp3Data);
}

async function convertWebmToFormat(webmBlob, format) {
  const normalized = normalizeRecordingFormat(format);

  if (normalized === 'webm') {
    return {
      blob: webmBlob,
      mimeType: 'audio/webm',
      ext: 'webm'
    };
  }

  const arrayBuffer = await webmBlob.arrayBuffer();
  const audioCtx = new AudioContext();
  let audioBuffer;

  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } finally {
    await audioCtx.close().catch(() => {});
  }

  if (normalized === 'wav') {
    return {
      blob: new Blob([encodeWAV(audioBuffer)], { type: 'audio/wav' }),
      mimeType: 'audio/wav',
      ext: 'wav'
    };
  }

  if (normalized === 'mp3') {
    return {
      blob: new Blob([encodeMP3(audioBuffer)], { type: 'audio/mpeg' }),
      mimeType: 'audio/mpeg',
      ext: 'mp3'
    };
  }

  throw new Error(`Unsupported recording format: ${format}`);
}
