// Single Web Audio context shared by the transport clock and the drum sampler.
// Using one hardware-linked clock for both beat scheduling and sample triggers
// keeps _delayMs() conversions consistent — two separate AudioContexts drift
// relative to each other and to performance.now()-based Web MIDI timestamps.

let ctx = null;
/** @type {DynamicsCompressorNode | null} */
let masterLimiter = null;

export function getSharedAudioContext() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

// All drum/reverb output routes here instead of AudioContext.destination.
// A gentle master compressor catches stacked reverb tails and distorted hits
// that would otherwise clip and crackle during long, dense playback.
export function getMasterDestination() {
  const c = getSharedAudioContext();
  if (!masterLimiter) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -6;
    comp.knee.value = 12;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;
    comp.connect(c.destination);
    masterLimiter = comp;
  }
  return masterLimiter;
}

export async function resumeSharedAudioContext() {
  const c = getSharedAudioContext();
  if (c.state === 'suspended') await c.resume();
  return c;
}
