let nextId = 1;
export function uid() {
  return `id-${nextId++}`;
}

export const DRUM_TYPES = [
  { type: 'kick', name: 'Kick', color: '#ff4444', midiNote: 36 },
  { type: 'snare', name: 'Snare', color: '#ffaa00', midiNote: 38 },
  { type: 'hihat', name: 'Hi-Hat', color: '#44dd88', midiNote: 42 },
  { type: 'clap', name: 'Clap', color: '#aa66ff', midiNote: 39 },
];

export function createStep(active = false, velocity = 100) {
  return { active, velocity };
}

export function createDrumTrack(typeDef, steps = 16) {
  return {
    id: uid(),
    type: typeDef.type,
    name: typeDef.name,
    color: typeDef.color,
    midiNote: typeDef.midiNote,
    midiOutputId: '',
    midiChannel: 9,
    steps: Array.from({ length: steps }, () => createStep()),
  };
}

export function createNote(pitch = 60, startBeat = 0, duration = 0.25, velocity = 100) {
  return { id: uid(), pitch, startBeat, duration, velocity };
}

export function createMidiTrack(name = 'MIDI 1') {
  return {
    id: uid(),
    name,
    color: '#6699ff',
    midiOutputId: '',
    midiChannel: 0,
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
    drumTracks: DRUM_TYPES.map((d) => createDrumTrack(d)),
    midiTracks: [createMidiTrack('Synth 1'), createMidiTrack('Synth 2')],
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
