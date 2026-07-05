// Drum-track sample engine: loads user-provided audio files and plays them
// back as one-shots. Replaces the old built-in synthesized drum sounds
// (drumSynth.js) now that drum tracks are sample-based piano-roll channels.
//
// Decoded AudioBuffers are engine-only state, keyed by pad id, and are never
// stored on the reactive project (see createDrumPad in models/project.js) —
// mirrors how midi.js keeps its output cache outside of any reactive object.

import { getSharedAudioContext, resumeSharedAudioContext } from './audioContext.js';

export async function resumeSamplerAudio() {
  return resumeSharedAudioContext();
}

const bufferCache = new Map(); // padId -> AudioBuffer

// Decodes the given File/Blob and caches it under padId, replacing whatever
// sample (if any) was previously assigned to that pad. Returns the decoded
// buffer's duration in seconds, handy for UI feedback.
export async function loadSampleFile(padId, file) {
  const c = await resumeSamplerAudio();
  const arrayBuffer = await file.arrayBuffer();
  const buffer = await c.decodeAudioData(arrayBuffer);
  bufferCache.set(padId, buffer);
  return buffer.duration;
}

export function clearSample(padId) {
  bufferCache.delete(padId);
}

export function hasSample(padId) {
  return bufferCache.has(padId);
}

// `delayMs` is relative to the shared transport AudioContext's currentTime —
// same convention as _delayMs() in scheduler.js. Using the shared context
// (see audioContext.js) keeps drum hits aligned with MIDI note scheduling.
// `gainMul` scales the hit after velocity (pad volume × track volume).
export function playSample(padId, velocity = 100, delayMs = 0, gainMul = 1) {
  const buffer = bufferCache.get(padId);
  if (!buffer) return;

  const c = getSharedAudioContext();
  const src = c.createBufferSource();
  src.buffer = buffer;

  const gain = c.createGain();
  const velGain = Math.max(0, Math.min(1, velocity / 127));
  gain.gain.value = Math.max(0, Math.min(1, velGain * gainMul));

  src.connect(gain);
  gain.connect(c.destination);

  const when = c.currentTime + Math.max(0, delayMs) / 1000;
  src.start(when);
}
