import {
  sendNoteOn,
  sendNoteOff,
  broadcastClock,
  broadcastStart,
  broadcastStop,
  PPQN,
} from './midi.js';
import { playDrum, resumeAudio } from './drumSynth.js';
import { transport } from './clock.js';

// When notes are placed back-to-back (e.g. repeated 16th notes on the same
// pitch), the previous note's Off and the next note's On land on almost the
// exact same timestamp. Many synths handle that ambiguously — since it's the
// same note number/channel, the Off can be processed after the new On and
// silently kill the just-triggered note. Trimming a small, inaudible gap off
// every note's tail guarantees Off always lands clearly before the next On.
const NOTE_OFF_LEAD_MS = 5;
const MIN_GATE_MS = 10;

export class PlaybackEngine {
  constructor() {
    this.project = null;
    this._unsub = null;
    this._clockOutputs = new Set();
    this._scheduledNotes = new Set();
  }

  setProject(project) {
    this.project = project;
    this._updateClockOutputs();
  }

  _updateClockOutputs() {
    this._clockOutputs.clear();
    if (!this.project) return;

    if (this.project.clockOutputId) {
      this._clockOutputs.add(this.project.clockOutputId);
    }

    for (const track of [...this.project.drumTracks, ...this.project.midiTracks]) {
      if (track.midiOutputId) this._clockOutputs.add(track.midiOutputId);
    }
  }

  start() {
    if (this._unsub) return;
    this._scheduledNotes.clear();
    this._updateClockOutputs();

    this._unsub = transport.onTick((type, data) => {
      switch (type) {
        case 'start':
          this._onStart(data);
          break;
        case 'stop':
          this._onStop();
          break;
        case 'clock':
          this._onClock(data);
          break;
        case 'step':
          this._onStep(data);
          break;
        case 'scheduleNotes':
          this._onScheduleNotes(data);
          break;
      }
    });

    resumeAudio();
    transport.play();
  }

  stop() {
    transport.stop();
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
    this._scheduledNotes.clear();
  }

  _delayMs(audioTime) {
    return Math.max(0, (audioTime - transport.currentTime) * 1000);
  }

  // Computes a Note Off delay that always lands at least MIN_GATE_MS after
  // noteOnDelay and, when possible, NOTE_OFF_LEAD_MS before the note's nominal
  // end — see NOTE_OFF_LEAD_MS comment above.
  _noteOffDelayMs(noteOnDelay, rawOffAudioTime) {
    const nominalOffDelay = this._delayMs(rawOffAudioTime);
    return Math.max(noteOnDelay + MIN_GATE_MS, nominalOffDelay - NOTE_OFF_LEAD_MS);
  }

  _onStart(data) {
    if (!this.project?.sendMidiClock) return;
    broadcastStart([...this._clockOutputs], this._delayMs(data.time));
  }

  _onStop() {
    if (!this.project?.sendMidiClock) return;
    broadcastStop([...this._clockOutputs]);
  }

  _onClock(data) {
    if (!this.project?.sendMidiClock) return;
    broadcastClock([...this._clockOutputs], this._delayMs(data.time));
  }

  _onStep(data) {
    if (!this.project) return;
    const { step, time } = data;

    for (const track of this.project.drumTracks) {
      const s = track.steps[step % track.steps.length];
      if (!s?.active) continue;

      playDrum(track.type, time, s.velocity);

      if (track.midiOutputId) {
        const onDelay = this._delayMs(time);
        sendNoteOn(track.midiOutputId, track.midiChannel, track.midiNote, s.velocity, onDelay);
        const rawOffTime = time + transport.beatToSec(0.2);
        sendNoteOff(track.midiOutputId, track.midiChannel, track.midiNote, this._noteOffDelayMs(onDelay, rawOffTime));
      }
    }
  }

  _onScheduleNotes({ now, scheduleUntil }) {
    if (!this.project) return;

    const loopLen = transport.loopLengthBeats;
    if (loopLen <= 0) return;

    const absBeat = transport.getAbsoluteBeat();
    const endAbsBeat = absBeat + transport.secToBeat(scheduleUntil - now) + 0.05;

    for (const track of this.project.midiTracks) {
      if (!track.midiOutputId) continue;

      for (const note of track.notes) {
        if (note.startBeat < transport.loopStartBeat || note.startBeat >= transport.loopEndBeat) continue;

        let occurrence = note.startBeat;
        if (occurrence < absBeat - 0.01) {
          const loopsElapsed = Math.floor((absBeat - note.startBeat) / loopLen);
          occurrence = note.startBeat + loopsElapsed * loopLen;
          if (occurrence < absBeat - 0.01) occurrence += loopLen;
        }

        while (occurrence <= endAbsBeat) {
          const startTime = transport.beatToAudioTime(occurrence);
          const iteration = Math.round((occurrence - note.startBeat) / loopLen);
          const noteKey = `n-${track.id}-${note.id}-${iteration}`;

          if (!this._scheduledNotes.has(noteKey) && startTime >= now - 0.002 && startTime <= scheduleUntil) {
            this._scheduledNotes.add(noteKey);
            const onDelay = this._delayMs(startTime);
            sendNoteOn(track.midiOutputId, track.midiChannel, note.pitch, note.velocity, onDelay);
            const rawOffTime = transport.beatToAudioTime(occurrence + note.duration);
            sendNoteOff(track.midiOutputId, track.midiChannel, note.pitch, this._noteOffDelayMs(onDelay, rawOffTime));
          }
          occurrence += loopLen;
        }
      }
    }
  }
}

export const playback = new PlaybackEngine();

export { PPQN };
