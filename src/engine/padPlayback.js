import { REVERB_DECAY_DEFAULT } from '../models/project.js';

/** Build playSample opts from a pad + its parent drum track (for cut-by + reverb). */
export function padPlaybackOpts(pad, track, notePitchOffset = 0) {
  const trackPads = track?.pads ?? [];
  const pitch = (Number(pad.pitch) || 0) + (Number(notePitchOffset) || 0);
  return {
    pitch: Math.max(-24, Math.min(24, pitch)),
    sampleLength: pad.sampleLength ?? 1,
    fadeOut: pad.fadeOut ?? 0,
    cutBySelf: pad.cutBySelf !== false,
    cutByPads: pad.cutByPads ?? [],
    trackPads,
    reverb: pad.reverb ?? 0,
    reverbDecay: pad.reverbDecay ?? REVERB_DECAY_DEFAULT,
    gain: pad.gain ?? 1,
    distortion: pad.distortion ?? 0,
  };
}

/** Minimal track shape for preview when only pads are available. */
export function previewTrackOpts({ pads }) {
  return { pads: pads ?? [] };
}
