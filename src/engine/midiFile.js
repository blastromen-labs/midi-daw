import pkg from '@tonejs/midi';
import {
  BAR_LENGTH_OPTIONS,
  STEPS_PER_BEAT,
  createNote,
  stepsToBeats,
} from '../models/project.js';

const { Midi } = pkg;

/** Smallest bar-length option (in steps) that fits `endBeat`. */
export function patternStepsForEndBeat(endBeat) {
  const minSteps = Math.ceil(Math.max(0, endBeat) * STEPS_PER_BEAT);
  const fit = BAR_LENGTH_OPTIONS.find((o) => o.steps >= minSteps);
  return fit?.steps ?? BAR_LENGTH_OPTIONS[BAR_LENGTH_OPTIONS.length - 1].steps;
}

function midiVelocityTo127(velocity) {
  if (velocity == null) return 100;
  if (velocity <= 1) return Math.max(1, Math.min(127, Math.round(velocity * 127)));
  return Math.max(1, Math.min(127, Math.round(velocity)));
}

function note127ToMidiVelocity(velocity) {
  return Math.max(1, Math.min(127, Math.round(velocity ?? 100)));
}

/**
 * Parse a Standard MIDI File into pattern notes + suggested pattern length.
 * All tracks are merged — typical for single-instrument pattern import.
 *
 * Beat positions use the file's PPQ (ticks per quarter), so they stay
 * correct regardless of tempo.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {{ notes: import('../models/project.js').Note[], patternSteps: number, bpm: number | null }}
 */
export function importPatternFromMidi(arrayBuffer) {
  const midi = new Midi(arrayBuffer);
  const ppq = midi.header.ppq || 480;
  const notes = [];

  for (const track of midi.tracks) {
    for (const note of track.notes) {
      if (note.midi == null) continue;
      const startBeat = note.ticks / ppq;
      const duration = Math.max(0.0625, note.durationTicks / ppq);
      notes.push(
        createNote(
          note.midi,
          startBeat,
          duration,
          midiVelocityTo127(note.velocity),
        ),
      );
    }
  }

  notes.sort((a, b) => a.startBeat - b.startBeat || a.pitch - b.pitch);

  const endBeat = notes.reduce((max, n) => Math.max(max, n.startBeat + n.duration), 0);
  const patternSteps = patternStepsForEndBeat(endBeat);

  const bpm = midi.header.tempos?.[0]?.bpm ?? null;

  return { notes, patternSteps, bpm };
}

/**
 * Encode a pattern's notes as a single-track Standard MIDI File.
 *
 * @param {object} pattern
 * @param {import('../models/project.js').Note[]} pattern.notes
 * @param {number} [pattern.patternSteps]
 * @param {string} [pattern.name]
 * @param {{ bpm?: number, trackName?: string }} [options]
 * @returns {Uint8Array}
 */
export function exportPatternToMidi(pattern, { bpm = 120, trackName = 'Pattern' } = {}) {
  const midi = new Midi();
  midi.header.setTempo(bpm);

  const track = midi.addTrack();
  track.name = trackName;

  const loopEndBeat = stepsToBeats(pattern?.patternSteps ?? 16);

  for (const note of pattern?.notes ?? []) {
    if (note.pitch == null || note.startBeat == null) continue;
    if (note.startBeat < 0 || note.startBeat >= loopEndBeat) continue;

    const duration = Math.max(0.0625, note.duration ?? 0.25);
    track.addNote({
      midi: note.pitch,
      time: note.startBeat * (60 / bpm),
      duration: duration * (60 / bpm),
      // @tonejs/midi expects velocity in 0–1, not 0–127.
      velocity: note127ToMidiVelocity(note.velocity) / 127,
    });
  }

  return midi.toArray();
}

/** Trigger a browser download of a `.mid` file. */
export function downloadMidiFile(data, filename) {
  const safeName = filename.replace(/[^\w\s.-]/g, '_').trim() || 'pattern.mid';
  const name = safeName.toLowerCase().endsWith('.mid') ? safeName : `${safeName}.mid`;
  const blob = new Blob([data], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Read a user-selected `.mid` / `.midi` file as ArrayBuffer. */
export function readMidiFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}
