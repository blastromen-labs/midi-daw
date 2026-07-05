/** Build playSample opts from a pad + its track pad list (for cut-by). */
export function padPlaybackOpts(pad, trackPads = []) {
  return {
    pitch: pad.pitch ?? 0,
    sampleLength: pad.sampleLength ?? 1,
    fadeOut: pad.fadeOut ?? 0,
    cutBySelf: pad.cutBySelf !== false,
    cutByPads: pad.cutByPads ?? [],
    trackPads,
  };
}
