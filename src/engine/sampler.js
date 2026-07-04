// Drum-track sample engine: loads user-provided audio files and plays them
// back as one-shots. Replaces the old built-in synthesized drum sounds
// (drumSynth.js) now that drum tracks are sample-based piano-roll channels.
//
// Decoded AudioBuffers are engine-only state, keyed by pad id, and are never
// stored on the reactive project (see createDrumPad in models/project.js) —
// mirrors how midi.js keeps its output cache outside of any reactive object.

let ctx = null;

function getCtx() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export async function resumeSamplerAudio() {
  const c = getCtx();
  if (c.state === 'suspended') await c.resume();
  return c;
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

// `delayMs` is a relative delay from now, in the SAME convention as
// toAbsoluteTimestamp() in midi.js — every caller computes "how many ms from
// now should this fire" once, and this is the one place that turns it into
// an absolute AudioContext time. Keeping one time base for one-shot sample
// triggers (rather than mixing in a caller's own AudioContext.currentTime,
// which may belong to a different context entirely) avoids a class of bugs
// where drum hits drift or fire immediately because "now" meant two
// different things — this bit the old drumSynth.js when following an
// external MIDI clock, whose notion of "now" is performance.now()-based,
// not tied to any particular AudioContext.
// `gainMul` scales the hit after velocity (pad volume × track volume).
export function playSample(padId, velocity = 100, delayMs = 0, gainMul = 1) {
  const buffer = bufferCache.get(padId);
  if (!buffer) return;

  const c = getCtx();
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
