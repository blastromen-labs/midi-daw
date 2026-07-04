let nextId = 1;
export function uid() {
  return `id-${nextId++}`;
}

export function createNote(pitch = 60, startBeat = 0, duration = 0.25, velocity = 100) {
  return { id: uid(), pitch, startBeat, duration, velocity };
}

// Cycled through as new tracks (drum or MIDI) are added, so multiple tracks
// stay visually distinguishable in the piano roll instead of all sharing one color.
export const MIDI_TRACK_COLORS = ['#a7d7af', '#6699ff', '#ff9d6c', '#e0779b', '#7ec8e3', '#e0c15c'];

export function createMidiTrack(name = 'MIDI 1', colorIndex = 0) {
  return {
    id: uid(),
    kind: 'midi',
    name,
    color: MIDI_TRACK_COLORS[colorIndex % MIDI_TRACK_COLORS.length],
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
  return { id: uid(), name, color, fileName: '' };
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

export function createDrumTrack(name = 'Drums 1', colorIndex = 0) {
  return {
    id: uid(),
    kind: 'drum',
    name,
    color: MIDI_TRACK_COLORS[colorIndex % MIDI_TRACK_COLORS.length],
    pads: DEFAULT_DRUM_PADS.map(([padName, color2]) => createDrumPad(padName, color2)),
    // Note.pitch here is a pad id (string), not a MIDI pitch — it identifies
    // which pad's sample this note triggers. See createDrumPad above.
    notes: [],
  };
}

export function createProject() {
  return {
    bpm: 120,
    patternSteps: 16,
    loopStartBeat: 0,
    loopEndBeat: 4,
    sendMidiClock: true,
    clockOutputId: '',
    // 'internal': this app is the master clock (default).
    // 'external': follow incoming MIDI clock from another app (e.g. FL Studio).
    syncMode: 'internal',
    clockInputId: '',
    // Synth 1/2 keep their original color-cycle positions (green/blue) —
    // Drums gets a distinct slot later in the cycle instead of displacing them.
    tracks: [createDrumTrack('Drums 1', 3), createMidiTrack('Synth 1', 0), createMidiTrack('Synth 2', 1)],
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
