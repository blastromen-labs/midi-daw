// Per-pad/zone stereo delay bus: independent L/R taps (ms or tempo-sync),
// shared feedback, wet amount (applied at the send), optional 200 Hz low-cut.

import { getSharedAudioContext, getMasterDestination } from './audioContext.js';
import { getActiveClock } from './activeClock.js';
import {
  DELAY_FEEDBACK_DEFAULT,
  DELAY_FEEDBACK_MAX,
  DELAY_LOW_CUT_HZ,
  DELAY_MS_MAX,
  DELAY_SYNC_OPTIONS,
  delaySyncBeats,
} from '../models/project.js';

const MAX_DELAY_SEC = DELAY_MS_MAX / 1000;
const MIN_DELAY_SEC = 0.001;

/** @type {Map<string, DelayBus>} */
const buses = new Map();

/**
 * @typedef {{
 *   input: GainNode,
 *   hpf: BiquadFilterNode,
 *   delayL: DelayNode,
 *   delayR: DelayNode,
 *   feedbackL: GainNode,
 *   feedbackR: GainNode,
 *   panL: StereoPannerNode,
 *   panR: StereoPannerNode,
 *   wet: GainNode,
 * }} DelayBus
 */

function clampSec(sec) {
  return Math.max(MIN_DELAY_SEC, Math.min(MAX_DELAY_SEC, Number(sec) || MIN_DELAY_SEC));
}

function clampFeedback(feedback) {
  return Math.max(0, Math.min(DELAY_FEEDBACK_MAX, Number(feedback) || 0));
}

function ensureBus(id) {
  const key = id || 'default';
  let bus = buses.get(key);
  if (bus) return bus;

  const c = getSharedAudioContext();
  const input = c.createGain();
  const hpf = c.createBiquadFilter();
  hpf.type = 'highpass';
  // 20 Hz ≈ bypass; DELAY_LOW_CUT_HZ when cut-low is enabled.
  hpf.frequency.value = 20;
  hpf.Q.value = 0.707;

  const delayL = c.createDelay(MAX_DELAY_SEC);
  const delayR = c.createDelay(MAX_DELAY_SEC);
  delayL.delayTime.value = 0.25;
  delayR.delayTime.value = 0.375;

  const feedbackL = c.createGain();
  const feedbackR = c.createGain();
  feedbackL.gain.value = DELAY_FEEDBACK_DEFAULT;
  feedbackR.gain.value = DELAY_FEEDBACK_DEFAULT;

  const panL = c.createStereoPanner();
  const panR = c.createStereoPanner();
  panL.pan.value = -1;
  panR.pan.value = 1;

  const wet = c.createGain();
  wet.gain.value = 1;

  input.connect(hpf);
  hpf.connect(delayL);
  hpf.connect(delayR);

  delayL.connect(feedbackL);
  feedbackL.connect(delayL);
  delayR.connect(feedbackR);
  feedbackR.connect(delayR);

  delayL.connect(panL);
  delayR.connect(panR);
  panL.connect(wet);
  panR.connect(wet);
  wet.connect(getMasterDestination());

  bus = { input, hpf, delayL, delayR, feedbackL, feedbackR, panL, panR, wet };
  buses.set(key, bus);
  return bus;
}

/** Resolve L/R delay times in seconds from pad/zone fields + current BPM. */
export function resolveDelayTimes(source, bpm = 120) {
  const tempo = Math.max(40, Math.min(300, Number(bpm) || 120));
  if (source?.delaySync) {
    const leftBeats = delaySyncBeats(source.delayLeftSync);
    const rightBeats = delaySyncBeats(source.delayRightSync);
    const beatSec = 60 / tempo;
    return {
      leftSec: clampSec(leftBeats * beatSec),
      rightSec: clampSec(rightBeats * beatSec),
    };
  }
  return {
    leftSec: clampSec((Number(source?.delayLeftMs) || 250) / 1000),
    rightSec: clampSec((Number(source?.delayRightMs) || 375) / 1000),
  };
}

/**
 * Send bus for a pad/zone stereo delay. Updates tap times / feedback / HPF
 * on every call so tempo-sync tracks live BPM changes.
 */
export function getDelayInput(id, settings = {}) {
  const bus = ensureBus(id);
  const c = getSharedAudioContext();
  const now = c.currentTime;
  const leftSec = clampSec(settings.leftSec);
  const rightSec = clampSec(settings.rightSec);
  const feedback = clampFeedback(settings.feedback ?? DELAY_FEEDBACK_DEFAULT);
  const cutLow = !!settings.cutLow;

  bus.delayL.delayTime.setTargetAtTime(leftSec, now, 0.015);
  bus.delayR.delayTime.setTargetAtTime(rightSec, now, 0.015);
  bus.feedbackL.gain.setTargetAtTime(feedback, now, 0.015);
  bus.feedbackR.gain.setTargetAtTime(feedback, now, 0.015);
  bus.hpf.frequency.setTargetAtTime(cutLow ? DELAY_LOW_CUT_HZ : 20, now, 0.015);
  return bus.input;
}

/** Convenience: resolve times from source fields using the active clock BPM. */
export function getDelayInputFromSource(id, source) {
  const bpm = getActiveClock()?.bpm ?? 120;
  const { leftSec, rightSec } = resolveDelayTimes(source, bpm);
  return getDelayInput(id, {
    leftSec,
    rightSec,
    feedback: source?.delayFeedback,
    cutLow: source?.delayCutLow,
  });
}

export function removeDelayBus(id) {
  const bus = buses.get(id);
  if (!bus) return;
  try {
    bus.input.disconnect();
    bus.hpf.disconnect();
    bus.delayL.disconnect();
    bus.delayR.disconnect();
    bus.feedbackL.disconnect();
    bus.feedbackR.disconnect();
    bus.panL.disconnect();
    bus.panR.disconnect();
    bus.wet.disconnect();
  } catch {
    // Nodes may already be torn down.
  }
  buses.delete(id);
}

export { DELAY_SYNC_OPTIONS };
