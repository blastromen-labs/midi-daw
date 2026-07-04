let nextId = 1;
export function uid() {
  return `id-${nextId++}`;
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

export function createMidiTrack(name = 'MIDI 1', color = randomTrackColor(), patternSteps = 16) {
  return {
    id: uid(),
    kind: 'midi',
    name,
    color,
    patternSteps,
    midiOutputId: '',
    midiChannel: 0,
    // Note.pitch here is a real MIDI pitch number (0-127).
    notes: [],
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
  return {
    id: uid(),
    kind: 'drum',
    name,
    color,
    patternSteps,
    volume: 1,
    pads: DEFAULT_DRUM_PADS.map(([padName, color2]) => createDrumPad(padName, color2)),
    // Note.pitch here is a pad id (string), not a MIDI pitch — it identifies
    // which pad's sample this note triggers. See createDrumPad above.
    notes: [],
  };
}

// Step counts for 1/2/4/8 bars at 16 steps per bar (4 steps per beat).
export const BAR_LENGTH_OPTIONS = [
  { bars: 1, steps: 16 },
  { bars: 2, steps: 32 },
  { bars: 4, steps: 64 },
  { bars: 8, steps: 128 },
];

export function trackLoopEndBeat(track) {
  return (track?.patternSteps ?? 16) / 4;
}

export function projectLoopEndBeat(tracks) {
  if (!tracks?.length) return 4;
  return Math.max(...tracks.map(trackLoopEndBeat));
}

export function createProject() {
  return {
    bpm: 120,
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
