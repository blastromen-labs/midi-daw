// Per-track algorithmic room reverb for drum one-shots. Each drum track owns one
// convolver bus; decay is regenerated when the track's reverbDecay changes.

import { getSharedAudioContext } from './audioContext.js';
import { REVERB_DECAY_DEFAULT } from '../models/project.js';

/** @type {Map<string, { input: GainNode, convolver: ConvolverNode, wet: GainNode, decaySec: number }>} */
const buses = new Map();

function createImpulseResponse(ctx, durationSec) {
  const dur = Math.max(0.15, durationSec);
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * dur);
  const decayExponent = 2.2 + 1.8 / dur;
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < impulse.numberOfChannels; ch++) {
    const channel = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decayExponent);
    }
  }
  return impulse;
}

function ensureBus(trackId, decaySec) {
  const id = trackId || 'default';
  const c = getSharedAudioContext();
  let bus = buses.get(id);
  if (!bus) {
    const input = c.createGain();
    const convolver = c.createConvolver();
    const wet = c.createGain();
    wet.gain.value = 0.9;
    input.connect(convolver);
    convolver.connect(wet);
    wet.connect(c.destination);
    bus = { input, convolver, wet, decaySec: -1 };
    buses.set(id, bus);
  }
  if (Math.abs(bus.decaySec - decaySec) > 0.001) {
    bus.convolver.buffer = createImpulseResponse(c, decaySec);
    bus.decaySec = decaySec;
  }
  return bus;
}

/** Send bus for a drum track's shared convolver reverb. */
export function getReverbInput(trackId, decaySec = REVERB_DECAY_DEFAULT) {
  return ensureBus(trackId, decaySec).input;
}

export function removeReverbBus(trackId) {
  buses.delete(trackId);
}
