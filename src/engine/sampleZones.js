/**
 * Multi-sampler zone helpers — find which sample covers a MIDI pitch and
 * build playSample opts with root-relative pitch shift + pad-equivalent FX.
 *
 * Overlap policy: first matching zone in `track.zones` wins (array order).
 */

import { REVERB_DECAY_DEFAULT, DELAY_FEEDBACK_DEFAULT } from '../models/project.js';

/** First unmuted zone whose inclusive [lowNote, highNote] covers `pitch`. */
export function findZoneForPitch(zones, pitch) {
  if (!zones?.length) return null;
  const p = Number(pitch);
  if (!Number.isFinite(p)) return null;
  return zones.find((z) => !z.muted && p >= z.lowNote && p <= z.highNote) ?? null;
}

/** Semitones to shift the sample: note vs root + zone pitch + per-note offset. */
export function zonePitchOffset(zone, notePitch, notePitchOffset = 0) {
  return (
    (Number(notePitch) || 0) -
    (Number(zone?.rootNote) || 60) +
    (Number(zone?.pitch) || 0) +
    (Number(notePitchOffset) || 0)
  );
}

/** playSample opts for a multi-sampler hit (wide pitch + drum-pad FX). */
export function zonePlaybackOpts(zone, notePitch, notePitchOffset = 0, { durationSec } = {}) {
  const opts = {
    pitch: zonePitchOffset(zone, notePitch, notePitchOffset),
    // Full MIDI keyboard vs a single root can exceed ±24 semitones.
    widePitch: true,
    // Same FX fields drum pads pass through padPlaybackOpts → playSample.
    gain: zone?.gain ?? 1,
    distortion: zone?.distortion ?? 0,
    reverb: zone?.reverb ?? 0,
    reverbDecay: zone?.reverbDecay ?? REVERB_DECAY_DEFAULT,
    delay: zone?.delay ?? 0,
    delayFeedback: zone?.delayFeedback ?? DELAY_FEEDBACK_DEFAULT,
    delaySync: !!zone?.delaySync,
    delayLeftMs: zone?.delayLeftMs,
    delayRightMs: zone?.delayRightMs,
    delayLeftSync: zone?.delayLeftSync,
    delayRightSync: zone?.delayRightSync,
    delayCutLow: !!zone?.delayCutLow,
  };
  if (durationSec != null && Number.isFinite(durationSec)) {
    opts.durationSec = Math.max(0.01, durationSec);
  }
  return opts;
}
