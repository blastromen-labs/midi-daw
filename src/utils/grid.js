/** Map a beat position to horizontal pixels; optional offset for lane padding. */
export function beatToX(beat, beatWidth, offset = 0) {
  return beat * beatWidth + offset;
}
