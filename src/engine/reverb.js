// Per-pad algorithmic room reverb for drum one-shots. Each pad with reverb owns
// one convolver bus; decay is regenerated when that pad's reverbDecay changes.

import { getSharedAudioContext, getMasterDestination } from './audioContext.js';
import { REVERB_DECAY_DEFAULT } from '../models/project.js';

/** @type {Map<string, { input: GainNode, convolver: ConvolverNode, wet: GainNode, decaySec: number }>} */
const buses = new Map();

function createImpulseResponse(ctx, durationSec) {
  const dur = Math.max(0.15, durationSec);
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * dur);
  const decayExponent = 2.2 + 1.8 / dur;
  const impulse = ctx.createBuffer(2, length, rate);
  let peak = 0;
  for (let ch = 0; ch < impulse.numberOfChannels; ch++) {
    const channel = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const sample = (Math.random() * 2 - 1) * Math.pow(1 - t, decayExponent);
      channel[i] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
  }
  // Random IRs can be very hot; normalize so dense patterns don't stack into
  // runaway clipping as overlapping tails accumulate on the convolver bus.
  if (peak > 0) {
    const scale = 0.45 / peak;
    for (let ch = 0; ch < impulse.numberOfChannels; ch++) {
      const channel = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) channel[i] *= scale;
    }
  }
  return impulse;
}

function ensureBus(padId, decaySec) {
  const id = padId || 'default';
  const c = getSharedAudioContext();
  let bus = buses.get(id);
  if (!bus) {
    const input = c.createGain();
    const convolver = c.createConvolver();
    const wet = c.createGain();
    wet.gain.value = 0.75;
    input.connect(convolver);
    convolver.connect(wet);
    wet.connect(getMasterDestination());
    bus = { input, convolver, wet, decaySec: -1 };
    buses.set(id, bus);
  }
  if (Math.abs(bus.decaySec - decaySec) > 0.001) {
    bus.convolver.buffer = createImpulseResponse(c, decaySec);
    bus.decaySec = decaySec;
  }
  return bus;
}

/** Send bus for a pad's convolver reverb. */
export function getReverbInput(padId, decaySec = REVERB_DECAY_DEFAULT) {
  return ensureBus(padId, decaySec).input;
}

export function removeReverbBus(padId) {
  const bus = buses.get(padId);
  if (!bus) return;
  try {
    bus.input.disconnect();
    bus.convolver.disconnect();
    bus.wet.disconnect();
  } catch {
    // Nodes may already be torn down.
  }
  buses.delete(padId);
}
