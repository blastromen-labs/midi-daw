let nextId = 1;
export function uid() {
  return `id-${nextId++}`;
}

/** Bump the uid counter past every `id-N` already present in a loaded project. */
export function syncUidCounter(root) {
  let max = nextId - 1;
  function walk(value) {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.id === 'string' && value.id.startsWith('id-')) {
      const n = Number.parseInt(value.id.slice(3), 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    for (const v of Object.values(value)) walk(v);
  }
  walk(root);
  nextId = max + 1;
}

export function createNote(pitch = 60, startBeat = 0, duration = 0.25, velocity = 100) {
  return { id: uid(), pitch, startBeat, duration, velocity };
}

// Accent swatches for the track menu — independent of piano-roll note color.
export const TRACK_ACCENT_COLORS = ['#a7d7af', '#6699ff', '#ff9d6c', '#e0779b', '#7ec8e3', '#e0c15c'];
// MIDI/synth notes in the piano roll always use this green, regardless of accent.
export const MIDI_NOTE_COLOR = '#a7d7af';

/** @param {string[]} [exclude] colors already used by other tracks */
export function randomTrackColor(exclude = []) {
  const pool = TRACK_ACCENT_COLORS.filter((c) => !exclude.includes(c));
  const choices = pool.length ? pool : TRACK_ACCENT_COLORS;
  return choices[Math.floor(Math.random() * choices.length)];
}

/** @param {string[]} [exclude] colors already used by sibling patterns */
export function randomPatternColor(exclude = []) {
  return randomTrackColor(exclude);
}

export function createPattern(name = 'Pattern 1', color = randomPatternColor(), patternSteps = 16, notes = []) {
  return {
    id: uid(),
    name,
    color,
    patternSteps,
    notes,
  };
}

export function getActivePattern(track) {
  if (!track?.patterns?.length) return null;
  return track.patterns.find((p) => p.id === track.activePatternId) ?? track.patterns[0];
}

/** Move a pattern within a track's patterns array (Live view drag reorder). */
export function reorderPatterns(track, fromIndex, toIndex) {
  if (!track?.patterns?.length) return;
  if (fromIndex === toIndex) return;
  if (fromIndex < 0 || fromIndex >= track.patterns.length) return;
  if (toIndex < 0 || toIndex >= track.patterns.length) return;
  const [pattern] = track.patterns.splice(fromIndex, 1);
  track.patterns.splice(toIndex, 0, pattern);
}

/** Source track + pattern shown as a non-editable reference overlay in the piano roll. */
export function getGhostSource(viewingTrack, tracks = []) {
  if (!viewingTrack?.ghostPatternId) return null;

  const sourceTrackId = viewingTrack.ghostTrackId ?? viewingTrack.id;
  const sourceTrack = tracks.find((t) => t.id === sourceTrackId);
  if (!sourceTrack?.patterns?.length) return null;

  if (
    sourceTrack.id === viewingTrack.id &&
    viewingTrack.ghostPatternId === viewingTrack.activePatternId
  ) {
    return null;
  }

  const pattern = sourceTrack.patterns.find((p) => p.id === viewingTrack.ghostPatternId);
  if (!pattern) return null;

  return { track: sourceTrack, pattern };
}

// Sentinel for playingPatternId/pendingPatternId meaning "this track is
// deliberately silent in Live mode" — distinct from `null`, which instead
// means "no Live-mode override yet, just follow activePatternId" (the
// default, so plain editing/playback behaves exactly as if Live mode didn't
// exist until you actually touch it). Clicking a playing clip again in Live
// mode arms this, toggling the track off once its pattern finishes looping.
export const STOPPED_PATTERN = '__stopped__';

// Which pattern a track plays during transport.
// Piano-roll mode always follows activePatternId (the tab selected in PatternBar).
// Live mode uses playingPatternId independently so you can edit one pattern
// while another loops; null there means "same as active", and STOPPED_PATTERN
// silences the track entirely.
export function getPlayingPattern(track, { useLiveLaunch = true } = {}) {
  if (!track?.patterns?.length) return null;
  if (!useLiveLaunch) return getActivePattern(track);
  if (track.playingPatternId === STOPPED_PATTERN) return null;
  const id = track.playingPatternId ?? track.activePatternId;
  return track.patterns.find((p) => p.id === id) ?? track.patterns[0];
}

// A pattern is "playing" if it's the one currently sounding for its track —
// each track only ever has one playing pattern at a time (playingPatternId
// is a single field), which is what guarantees two clips on the same track
// can never sound simultaneously in Live mode.
export function isPatternPlaying(track, patternId) {
  return getPlayingPattern(track)?.id === patternId;
}

// A pattern is "queued" once Live mode has armed it to replace the playing
// pattern once its loop completes — see engine/liveLauncher.js.
export function isPatternQueued(track, patternId) {
  return track?.pendingPatternId === patternId;
}

// True once Live mode has armed the track to go silent (rather than switch
// to another pattern) once the currently playing pattern's loop completes.
export function isTrackStopQueued(track) {
  return track?.pendingPatternId === STOPPED_PATTERN;
}

export function patternLoopEndBeat(pattern) {
  return (pattern?.patternSteps ?? 16) / 4;
}

export function createMidiTrack(name = 'MIDI 1', color = randomTrackColor(), patternSteps = 16) {
  const pattern = createPattern('Pattern 1', randomPatternColor(), patternSteps);
  return {
    id: uid(),
    kind: 'midi',
    name,
    color,
    patterns: [pattern],
    activePatternId: pattern.id,
    ghostTrackId: null,
    ghostPatternId: null,
    // Live mode fields — see engine/liveLauncher.js. playingPatternId is the
    // pattern actually sounding right now (null = follow activePatternId);
    // pendingPatternId/pendingLaunchBeat describe a queued-but-not-yet-live
    // launch waiting for the current pattern's loop to complete.
    playingPatternId: null,
    pendingPatternId: null,
    pendingLaunchBeat: null,
    midiOutputId: '',
    midiChannel: 0,
  };
}

// A pad is one row of a drum track's piano roll — not a MIDI note, a local
// audio sample. `fileName` is display-only; the decoded AudioBuffer itself
// lives in engine/sampler.js (keyed by pad.id), never in this reactive
// project state, for the same reason midi.js keeps its output cache outside
// of any reactive object — decoded audio buffers are large and not something
// Vue's reactivity should be wrapping/tracking.
export function createDrumPad(name, color) {
  return { id: uid(), name, color, fileName: '', volume: 1 };
}

export const DEFAULT_DRUM_PADS = [
  ['Kick', '#ff4444'],
  ['Snare', '#ffaa00'],
  ['Clap', '#aa66ff'],
  ['Closed Hat', '#44dd88'],
  ['Open Hat', '#2fd1c5'],
  ['Low Tom', '#c97b3d'],
  ['Hi Tom', '#e69a3d'],
  ['Rim', '#d16fae'],
];

export function createDrumTrack(name = 'Drums 1', color = randomTrackColor(), patternSteps = 16) {
  const pattern = createPattern('Pattern 1', randomPatternColor(), patternSteps);
  return {
    id: uid(),
    kind: 'drum',
    name,
    color,
    patterns: [pattern],
    activePatternId: pattern.id,
    ghostTrackId: null,
    ghostPatternId: null,
    playingPatternId: null,
    pendingPatternId: null,
    pendingLaunchBeat: null,
    volume: 1,
    pads: DEFAULT_DRUM_PADS.map(([padName, color2]) => createDrumPad(padName, color2)),
  };
}

// Step counts for 1/2/4/8 bars at 16 steps per bar (4 steps per beat).
export const STEPS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;

export const BAR_LENGTH_OPTIONS = [
  { bars: 1, steps: 16 },
  { bars: 2, steps: 32 },
  { bars: 4, steps: 64 },
  { bars: 8, steps: 128 },
];

export function trackLoopEndBeat(track) {
  return patternLoopEndBeat(getActivePattern(track));
}

export function trackPlayingLoopEndBeat(track, { useLiveLaunch = true } = {}) {
  return patternLoopEndBeat(getPlayingPattern(track, { useLiveLaunch }));
}

export function projectLoopEndBeat(tracks, { forPlayback = false, useLiveLaunch = true } = {}) {
  if (!tracks?.length) return 4;
  const endBeat =
    forPlayback && useLiveLaunch ? (t) => trackPlayingLoopEndBeat(t, { useLiveLaunch }) : trackLoopEndBeat;
  return Math.max(...tracks.map(endBeat));
}

export function createProject() {
  return {
    bpm: 120,
    // 'roll': piano-roll editing — playback follows each track's activePatternId.
    // 'live': session grid — playback follows playingPatternId / queued launches.
    sessionView: 'roll',
    sendMidiClock: false,
    clockOutputId: '',
    // 'internal': this app is the master clock (default).
    // 'external': follow incoming MIDI clock from another app (e.g. FL Studio).
    syncMode: 'internal',
    clockInputId: '',
    // Timeline marker — paste anchor and playback start position; null = not set.
    markerBeat: null,
    // User-drawn loop region on the timeline; null falls back to the full pattern length.
    loopRegion: null,
    tracks: [
      createDrumTrack('Drums 1', TRACK_ACCENT_COLORS[3], 16),
      createMidiTrack('Synth 1', TRACK_ACCENT_COLORS[1], 32),
      createMidiTrack('Synth 2', TRACK_ACCENT_COLORS[2], 64),
    ],
  };
}

export function noteName(pitch) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}

export const SNAP_VALUES = [
  { label: '1/4', value: 1 },
  { label: '1/8', value: 0.5 },
  { label: '1/16', value: 0.25 },
  { label: '1/32', value: 0.125 },
];

export function snapBeat(beat, snap) {
  if (!snap || snap <= 0) return beat;
  return Math.round(beat / snap) * snap;
}
