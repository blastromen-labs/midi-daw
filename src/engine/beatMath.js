/** Convert beat position to seconds at a given tempo. */
export function beatsToSeconds(beat, bpm) {
  return (beat * 60) / bpm;
}

/** Convert seconds to beat position at a given tempo. */
export function secondsToBeats(sec, bpm) {
  return (sec * bpm) / 60;
}

/** Wrap an absolute beat into [loopStartBeat, loopEndBeat). */
export function wrapLoopBeat(beat, loopStartBeat, loopEndBeat) {
  const len = loopEndBeat - loopStartBeat;
  if (len <= 0) return beat;
  if (beat >= loopEndBeat) return loopStartBeat + ((beat - loopStartBeat) % len);
  if (beat < loopStartBeat) return loopStartBeat;
  return beat;
}
