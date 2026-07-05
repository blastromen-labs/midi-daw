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

/** Instrument role / mix grouping for a track (saved per track in the song). */
export const TRACK_CATEGORIES = [
  'Drums',
  'Perc',
  'Bass',
  'Sub',
  'Lead',
  'Melody',
  'Pad',
  'String',
  'Arp',
  'Pluck',
  'Keys',
  'Choir',
  'Chord',
  'FX',
  'Noise',
  'Atmos',
];

export function defaultTrackCategory(kind = 'midi') {
  return kind === 'drum' ? 'Drums' : 'Lead';
}

/** Coerce legacy or missing category values when loading a song. */
export function normalizeTrackCategory(track) {
  if (track?.category && TRACK_CATEGORIES.includes(track.category)) return track.category;
  return defaultTrackCategory(track?.kind ?? 'midi');
}

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
    category: defaultTrackCategory('midi'),
    patterns: [pattern],
    activePatternId: pattern.id,
    ghostTrackId: null,
    ghostPatternId: null,
    // Live mode fields — see engine/liveLauncher.js. playingPatternId is the
    // pattern actually sounding right now (null = follow activePatternId);
    // pendingPatternId/pendingLaunchBeat describe a queued-but-not-yet-live
    // launch waiting for the current pattern's loop to complete.
    liveLaunchMode: LIVE_LAUNCH_MODES.TOGGLE,
    liveSyncGrid: '1/16',
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
/** Built-in one-shots in public/drums/, keyed by default pad name. */
export const DEFAULT_DRUM_SAMPLE_FILES = {
  Kick: 'kick.wav',
  Snare: 'snare.wav',
  Clap: 'clap.wav',
  'Closed Hat': 'hihat-cl.wav',
  'Open Hat': 'hihat-op.wav',
  'Low Tom': 'tom-low.wav',
  'Hi Tom': 'tom-hi.wav',
  Rim: 'rim.wav',
  Zap: 'zap.wav',
};

export function defaultDrumSampleFile(padName) {
  return DEFAULT_DRUM_SAMPLE_FILES[padName] ?? null;
}

export const REVERB_DECAY_MIN = 0.15;
export const REVERB_DECAY_MAX = 5;
export const REVERB_DECAY_DEFAULT = 1.2;

export function createDrumPad(name, color) {
  const fileName = defaultDrumSampleFile(name) ?? '';
  return {
    id: uid(),
    name,
    color,
    fileName,
    volume: 1,
    // Retriggering this pad stops its own previous voice when true.
    cutBySelf: true,
    // Other pad ids whose hits choke this pad's playing voice.
    cutByPads: [],
    // Semitones relative to original pitch.
    pitch: 0,
    // Fraction of the source buffer to play (0–1).
    sampleLength: 1,
    // Fraction of the played region that fades out at the end (0 = hard cut).
    fadeOut: 0,
    // Dry/wet send to this pad's reverb bus (0 = off).
    reverb: 0,
    // Reverb tail length in seconds for this pad.
    reverbDecay: REVERB_DECAY_DEFAULT,
  };
}

/** Coerce legacy or missing pad fields when loading a song. */
export function normalizeDrumPad(pad) {
  if (!pad) return pad;
  if (pad.cutBySelf === undefined) pad.cutBySelf = true;
  if (!Array.isArray(pad.cutByPads)) pad.cutByPads = [];
  if (pad.pitch == null) pad.pitch = 0;
  if (pad.sampleLength == null) pad.sampleLength = 1;
  if (pad.fadeOut == null) pad.fadeOut = 0;
  if (pad.reverb == null) pad.reverb = 0;
  if (pad.reverbDecay == null) pad.reverbDecay = REVERB_DECAY_DEFAULT;
  pad.sampleLength = Math.max(0.01, Math.min(1, pad.sampleLength));
  pad.fadeOut = Math.max(0, Math.min(1, pad.fadeOut));
  pad.reverb = Math.max(0, Math.min(1, pad.reverb));
  pad.reverbDecay = Math.max(REVERB_DECAY_MIN, Math.min(REVERB_DECAY_MAX, pad.reverbDecay));
  pad.pitch = Math.max(-24, Math.min(24, pad.pitch));
  return pad;
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
  ['Zap', '#7df9ff'],
];

/** Palette for drum pad step colors — defaults plus accents for custom pads. */
export const DRUM_PAD_COLORS = [
  ...new Set([
    ...DEFAULT_DRUM_PADS.map(([, color]) => color),
    ...TRACK_ACCENT_COLORS,
    '#ff6b6b',
    '#4ecdc4',
    '#ffe66d',
    '#ffffff',
    '#8899aa',
    '#6b7280',
    '#f472b6',
    '#60a5fa',
  ]),
];

export function createDrumTrack(name = 'Drums 1', color = randomTrackColor(), patternSteps = 16) {
  const pattern = createPattern('Pattern 1', randomPatternColor(), patternSteps);
  return {
    id: uid(),
    kind: 'drum',
    name,
    color,
    category: defaultTrackCategory('drum'),
    patterns: [pattern],
    activePatternId: pattern.id,
    ghostTrackId: null,
    ghostPatternId: null,
    liveLaunchMode: LIVE_LAUNCH_MODES.TOGGLE,
    liveSyncGrid: '1/16',
    playingPatternId: null,
    pendingPatternId: null,
    pendingLaunchBeat: null,
    volume: 1,
    pads: DEFAULT_DRUM_PADS.map(([padName, color2]) => createDrumPad(padName, color2)),
  };
}

/** Migrate legacy track-level reverbDecay onto pads when loading old songs. */
export function normalizeDrumTrack(track) {
  if (track?.kind !== 'drum') return track;
  const legacyDecay = track.reverbDecay;
  if (legacyDecay != null) {
    for (const pad of track.pads ?? []) {
      if (pad.reverbDecay == null) pad.reverbDecay = legacyDecay;
    }
    delete track.reverbDecay;
  }
  return track;
}

/** Append default kit pads missing from saved drum tracks (e.g. Zap added after save). */
export function ensureDefaultDrumPads(tracks) {
  for (const track of tracks) {
    if (track.kind !== 'drum' || !Array.isArray(track.pads)) continue;
    normalizeDrumTrack(track);
    const names = new Set(track.pads.map((p) => p.name));
    for (const [padName, color] of DEFAULT_DRUM_PADS) {
      if (names.has(padName)) continue;
      track.pads.push(createDrumPad(padName, color));
      names.add(padName);
    }
    for (const pad of track.pads) normalizeDrumPad(pad);
    const padIds = new Set(track.pads.map((p) => p.id));
    for (const pad of track.pads) {
      pad.cutByPads = (pad.cutByPads ?? []).filter((id) => padIds.has(id));
    }
  }
}

// Step counts for 1–64 bars at 16 steps per bar (4 steps per beat).
export const STEPS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;

export const BAR_LENGTH_OPTIONS = [
  { bars: 1, steps: 16 },
  { bars: 2, steps: 32 },
  { bars: 4, steps: 64 },
  { bars: 8, steps: 128 },
  { bars: 16, steps: 256 },
  { bars: 32, steps: 512 },
  { bars: 64, steps: 1024 },
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
  { label: '1/64', value: 0.0625 },
];

/** How a pattern is triggered in Live mode — configured per track in the piano roll. */
export const LIVE_LAUNCH_MODES = {
  /** One click toggles loop on/off (default Live clip behavior). */
  TOGGLE: 'toggle',
  /** Hold to hear: loops muted in sync until the next grid line, then audibly while held. */
  HOLD: 'hold',
};

/** Grid the hold-to-play unmute aligns to when you press a clip. */
export const LIVE_SYNC_GRID_OPTIONS = [
  { label: '1/16', value: '1/16', beats: 0.25 },
  { label: '1/8', value: '1/8', beats: 0.5 },
  { label: '1/4', value: '1/4', beats: 1 },
  { label: '1 bar', value: '1bar', beats: BEATS_PER_BAR },
  { label: 'Track', value: 'track', beats: null },
];

export function liveSyncGridBeats(track, pattern) {
  const grid = track?.liveSyncGrid ?? '1/16';
  const opt = LIVE_SYNC_GRID_OPTIONS.find((o) => o.value === grid);
  if (opt?.beats != null) return opt.beats;
  return patternLoopEndBeat(pattern);
}

export function snapBeat(beat, snap) {
  if (!snap || snap <= 0) return beat;
  return Math.round(beat / snap) * snap;
}
