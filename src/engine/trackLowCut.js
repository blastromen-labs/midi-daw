/**
 * Live HP: per-track high-pass cutoff. Tap latches at min Hz; hold+drag sweeps
 * min→max and clears on release. Frequency is shared across that track's
 * active sample voices so changes affect notes already ringing.
 *
 * Off = bypass (~20 Hz). On = TRACK_LOW_CUT_MIN_HZ…TRACK_LOW_CUT_MAX_HZ.
 */

import { getSharedAudioContext } from './audioContext.js';

export const TRACK_LOW_CUT_MIN_HZ = 200;
export const TRACK_LOW_CUT_MAX_HZ = 2000;
/** Near-DC highpass ≈ transparent; matches delay.js bypass convention. */
export const TRACK_LOW_CUT_BYPASS_HZ = 20;

/** Vertical drag distance (px) that spans min→max cutoff. */
export const TRACK_LOW_CUT_DRAG_PX = 140;

/** @type {Map<string, number>} trackId → cutoff Hz while pressed */
const cutHzByTrack = new Map();

/** @type {Map<string, Set<BiquadFilterNode>>} */
const filtersByTrack = new Map();

function clampCutHz(hz) {
  return Math.max(TRACK_LOW_CUT_MIN_HZ, Math.min(TRACK_LOW_CUT_MAX_HZ, hz));
}

function applyFilterHz(hpf, hz) {
  const c = getSharedAudioContext();
  const now = c.currentTime;
  // Short slew avoids zipper noise while still feeling immediate under the finger.
  hpf.frequency.setTargetAtTime(hz, now, 0.01);
}

function setFiltersForTrack(trackId, hz) {
  const set = filtersByTrack.get(trackId);
  if (!set) return;
  for (const hpf of set) applyFilterHz(hpf, hz);
}

/** Current Live HP cutoff for a track, or null when inactive. */
export function getTrackCutLowHz(trackId) {
  if (!trackId) return null;
  return cutHzByTrack.get(trackId) ?? null;
}

/**
 * Engage / update / release Live HP for a track.
 * Pass null (or non-finite) to turn off — filters return to bypass.
 */
export function setTrackCutLowHz(trackId, hz) {
  if (!trackId) return;
  if (hz == null || !Number.isFinite(hz)) {
    cutHzByTrack.delete(trackId);
    setFiltersForTrack(trackId, TRACK_LOW_CUT_BYPASS_HZ);
    return;
  }
  const clamped = clampCutHz(hz);
  cutHzByTrack.set(trackId, clamped);
  setFiltersForTrack(trackId, clamped);
}

/** Map upward drag (px) from press origin → cutoff Hz (log-scaled). */
export function cutLowHzFromDragPx(dragUpPx) {
  const t = Math.max(0, Math.min(1, dragUpPx / TRACK_LOW_CUT_DRAG_PX));
  const minL = Math.log(TRACK_LOW_CUT_MIN_HZ);
  const maxL = Math.log(TRACK_LOW_CUT_MAX_HZ);
  return Math.exp(minL + t * (maxL - minL));
}

/** Attach a per-voice HPF to the track's Live HP control (sampler.js). */
export function registerTrackLowCutFilter(trackId, hpf) {
  if (!trackId || !hpf) return;
  let set = filtersByTrack.get(trackId);
  if (!set) {
    set = new Set();
    filtersByTrack.set(trackId, set);
  }
  set.add(hpf);
  const hz = cutHzByTrack.get(trackId) ?? TRACK_LOW_CUT_BYPASS_HZ;
  hpf.frequency.value = hz;
}

export function unregisterTrackLowCutFilter(trackId, hpf) {
  if (!trackId || !hpf) return;
  const set = filtersByTrack.get(trackId);
  if (!set) return;
  set.delete(hpf);
  if (set.size === 0) filtersByTrack.delete(trackId);
}
