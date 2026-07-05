// AIFF / AIFF-C PCM decoder for browser drum samples.
// decodeAudioData supports WAV but often rejects macOS .aif files (especially
// AIFC/sowt little-endian PCM). This handles the common uncompressed cases.

function fourCC(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

/** 80-bit IEEE extended sample rate in the AIFF COMM chunk. */
function readExtended80(view, offset) {
  const expon = view.getUint16(offset);
  let sign = 1;
  let exp = expon;
  if (expon & 0x8000) {
    sign = -1;
    exp = expon & 0x7fff;
  }
  if (exp === 0) return 0;
  if (exp === 0x7fff) return sign * Infinity;

  const hi = view.getUint32(offset + 2);
  const lo = view.getUint32(offset + 6);
  const mantissa = hi * 2 ** 32 + lo;
  return sign * mantissa * 2 ** (exp - 16446);
}

export function isAiffBuffer(arrayBuffer) {
  if (arrayBuffer.byteLength < 12) return false;
  const view = new DataView(arrayBuffer);
  return fourCC(view, 0) === 'FORM' && (fourCC(view, 8) === 'AIFF' || fourCC(view, 8) === 'AIFC');
}

function parseAiff(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  if (fourCC(view, 0) !== 'FORM') throw new Error('Not AIFF: missing FORM header');

  const formType = fourCC(view, 8);
  if (formType !== 'AIFF' && formType !== 'AIFC') {
    throw new Error(`Unsupported AIFF container: ${formType}`);
  }

  let numChannels = 0;
  let numFrames = 0;
  let sampleSize = 0;
  let sampleRate = 44100;
  let compression = formType === 'AIFF' ? 'NONE' : '';
  let soundData = null;

  let offset = 12;
  while (offset + 8 <= arrayBuffer.byteLength) {
    const chunkId = fourCC(view, offset);
    const chunkSize = view.getUint32(offset + 4);
    const dataStart = offset + 8;
    if (dataStart + chunkSize > arrayBuffer.byteLength) break;

    if (chunkId === 'COMM') {
      numChannels = view.getUint16(dataStart);
      numFrames = view.getUint32(dataStart + 2);
      sampleSize = view.getUint16(dataStart + 6);
      sampleRate = readExtended80(view, dataStart + 8);
      if (formType === 'AIFC' && chunkSize >= 22) {
        compression = fourCC(view, dataStart + 18);
      }
    } else if (chunkId === 'SSND') {
      const ssndOffset = view.getUint32(dataStart);
      const blockSize = view.getUint32(dataStart + 4);
      // Sound data begins after the 8-byte SSND header fields, plus any offset.
      const pcmStart = dataStart + 8 + ssndOffset + blockSize;
      const pcmBytes = chunkSize - 8 - ssndOffset - blockSize;
      if (pcmStart >= 0 && pcmBytes > 0 && pcmStart + pcmBytes <= arrayBuffer.byteLength) {
        soundData = new Uint8Array(arrayBuffer, pcmStart, pcmBytes);
      }
    }

    offset = dataStart + chunkSize + (chunkSize & 1);
  }

  if (!numChannels || !numFrames || !sampleSize || !soundData) {
    throw new Error('AIFF missing COMM or SSND data');
  }

  if (!Number.isFinite(sampleRate) || sampleRate <= 0) sampleRate = 44100;

  return { numChannels, numFrames, sampleSize, sampleRate, compression, soundData };
}

function readSampleInt(view, byteOffset, bits, littleEndian) {
  if (bits === 8) {
    const v = view.getUint8(byteOffset);
    return (v - 128) / 128;
  }
  if (bits === 16) {
    return view.getInt16(byteOffset, littleEndian) / 32768;
  }
  if (bits === 24) {
    let v;
    if (littleEndian) {
      v = view.getUint8(byteOffset) | (view.getUint8(byteOffset + 1) << 8) | (view.getUint8(byteOffset + 2) << 16);
    } else {
      v = (view.getUint8(byteOffset) << 16) | (view.getUint8(byteOffset + 1) << 8) | view.getUint8(byteOffset + 2);
    }
    if (v & 0x800000) v |= ~0xffffff;
    return v / 8388608;
  }
  if (bits === 32) {
    return view.getInt32(byteOffset, littleEndian) / 2147483648;
  }
  throw new Error(`Unsupported AIFF bit depth: ${bits}`);
}

function readSampleFloat32(view, byteOffset, littleEndian) {
  return view.getFloat32(byteOffset, littleEndian);
}

function fillChannelData(channelData, soundData, numChannels, numFrames, sampleSize, compression) {
  const codec = (compression || 'NONE').trim();
  const littleEndian = codec === 'sowt';
  const bytesPerSample = Math.ceil(sampleSize / 8);
  const frameBytes = bytesPerSample * numChannels;
  const view = new DataView(soundData.buffer, soundData.byteOffset, soundData.byteLength);
  const maxFrames = Math.min(numFrames, Math.floor(soundData.length / frameBytes));

  if (codec === 'fl32' || codec === 'FL32') {
    for (let frame = 0; frame < maxFrames; frame++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const off = frame * frameBytes + ch * 4;
        channelData[ch][frame] = readSampleFloat32(view, off, littleEndian);
      }
    }
    return maxFrames;
  }

  if (codec !== 'NONE' && codec !== 'twos' && codec !== 'sowt' && codec !== '') {
    throw new Error(`Unsupported AIFF compression: ${codec}`);
  }

  for (let frame = 0; frame < maxFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const off = frame * frameBytes + ch * bytesPerSample;
      channelData[ch][frame] = readSampleInt(view, off, sampleSize, littleEndian);
    }
  }
  return maxFrames;
}

/** Decode AIFF/AIFF-C PCM into an AudioBuffer. */
export function decodeAiffToAudioBuffer(arrayBuffer, audioContext) {
  const { numChannels, numFrames, sampleSize, sampleRate, compression, soundData } =
    parseAiff(arrayBuffer);

  const buffer = audioContext.createBuffer(numChannels, numFrames, sampleRate);
  const channelData = [];
  for (let ch = 0; ch < numChannels; ch++) channelData.push(buffer.getChannelData(ch));

  const written = fillChannelData(channelData, soundData, numChannels, numFrames, sampleSize, compression);
  if (written < numFrames) {
    for (let ch = 0; ch < numChannels; ch++) {
      channelData[ch].fill(0, written);
    }
  }

  return buffer;
}

export function isAiffFile(file) {
  if (!file) return false;
  const name = file.name?.toLowerCase() ?? '';
  return /\.aif{1,2}c?$/.test(name);
}
