import { REVERB_DECAY_DEFAULT } from '../models/project.js';

/** Build playSample opts from a pad + its parent drum track (for cut-by + reverb). */
export function padPlaybackOpts(pad, track) {
  const trackPads = track?.pads ?? [];
  return {
    pitch: Number(pad.pitch) || 0,
    sampleLength: pad.sampleLength ?? 1,
    fadeOut: pad.fadeOut ?? 0,
    cutBySelf: pad.cutBySelf !== false,
    cutByPads: pad.cutByPads ?? [],
    trackPads,
    reverb: pad.reverb ?? 0,
    reverbDecay: pad.reverbDecay ?? REVERB_DECAY_DEFAULT,
  };
}

/** Minimal track shape for preview when only pads are available. */
export function previewTrackOpts({ pads }) {
  return { pads: pads ?? [] };
}
