// Single Web Audio context shared by the transport clock and the drum sampler.
// Using one hardware-linked clock for both beat scheduling and sample triggers
// keeps _delayMs() conversions consistent — two separate AudioContexts drift
// relative to each other and to performance.now()-based Web MIDI timestamps.

let ctx = null;

export function getSharedAudioContext() {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export async function resumeSharedAudioContext() {
  const c = getSharedAudioContext();
  if (c.state === 'suspended') await c.resume();
  return c;
}
