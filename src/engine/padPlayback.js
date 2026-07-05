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
    trackId: track?.id ?? 'default',
    reverbDecay: track?.reverbDecay ?? REVERB_DECAY_DEFAULT,
    reverb: pad.reverb ?? 0,
  };
}

/** Minimal track shape for preview when only id/pads/decay are available. */
export function previewTrackOpts({ id, pads, reverbDecay, volume }) {
  return {
    id: id ?? 'default',
    pads: pads ?? [],
    reverbDecay: reverbDecay ?? REVERB_DECAY_DEFAULT,
    volume: volume ?? 1,
  };
}
