import {
  sendNoteOn,
  sendNoteOff,
  broadcastClock,
  broadcastStart,
  broadcastStop,
  PPQN,
} from './midi.js';
import { playSample, resumeSamplerAudio } from './sampler.js';
import { transport } from './clock.js';
import { getActiveClock } from './activeClock.js';
import { getPlayingPattern, patternLoopEndBeat } from '../models/project.js';
import { commitDuePatternLaunches, clearPendingLaunches } from './liveLauncher.js';

// When notes are placed back-to-back (e.g. repeated 16th notes on the same
// pitch), the previous note's Off and the next note's On land on almost the
// exact same timestamp. Many synths handle that ambiguously — since it's the
// same note number/channel, the Off can be processed after the new On and
// silently kill the just-triggered note. Trimming a small, inaudible gap off
// every note's tail guarantees Off always lands clearly before the next On.
const NOTE_OFF_LEAD_MS = 5;
const MIN_GATE_MS = 10;

// `now`/`scheduleUntil` are captured once per tick, but the per-note startTime
// below is computed via a fresh clock read a moment later (during this loop).
// That fresh read is always marginally later than the stale snapshot — with a
// zero-width window (as external MIDI clock sync uses, since it only ever
// knows "now") that drift alone would fail the upper-bound check on almost
// every note. This slack absorbs that drift; it's negligible next to the
// internal clock's much larger lookahead window.
const SCHEDULE_WINDOW_SLACK_SEC = 0.05;

function trackLoopLengthBeats(track) {
  return patternLoopEndBeat(getPlayingPattern(track));
}

// When a Live-mode clip is queued, the scheduler's lookahead (SCHEDULE_AHEAD_SEC
// in clock.js) can extend past the pending launch boundary. Without capping the
// horizon, beat-0 notes from the outgoing pattern get scheduled for the next
// loop cycle right as the queued clip is supposed to take over — sounds like
// the current pattern restarting from the top.
function scheduleHorizonBeat(track, endAbsBeat) {
  const pending = track.pendingLaunchBeat;
  if (pending == null) return endAbsBeat;
  return Math.min(endAbsBeat, pending - 1e-6);
}

// Next absolute beat (>= absBeat) whose wrapped position equals noteBeat inside the loop.
function nextTransportLoopOccurrence(absBeat, noteBeat, loopStart, loopLen) {
  const rel = ((absBeat - loopStart) % loopLen + loopLen) % loopLen;
  const noteRel = noteBeat - loopStart;
  let delta = noteRel - rel;
  if (delta < -0.001) delta += loopLen;
  return absBeat + delta;
}

export class PlaybackEngine {
  constructor() {
    this.project = null;
    this._unsub = null;
    this._clock = null;
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

    // Drum tracks never have a MIDI output — they trigger local samples only.
    for (const track of this.project.tracks) {
      if (track.kind === 'midi' && track.midiOutputId) this._clockOutputs.add(track.midiOutputId);
    }
  }

  // Binds to whichever clock is active right now (internal master or an
  // external MIDI-clock follower) and stays bound to it until stop() is
  // called, even if the active clock is switched elsewhere mid-playback.
  start(fromBeat = null) {
    if (this._unsub) return;
    this._scheduledNotes.clear();
    this._updateClockOutputs();

    this._clock = getActiveClock();
    this._unsub = this._clock.onTick((type, data) => {
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
        case 'scheduleNotes':
          this._onScheduleNotes(data);
          break;
      }
    });

    resumeSamplerAudio();
    // Only the internal master clock needs an explicit play() — an external
    // clock is already listening for incoming MIDI Start/Stop and emits
    // 'start'/'stop' entirely on its own.
    if (this._clock === transport) transport.play(fromBeat);
  }

  stop() {
    if (this._clock === transport) transport.stop();
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
    this._scheduledNotes.clear();
    this._clock = null;
  }

  _delayMs(audioTime) {
    return Math.max(0, (audioTime - this._clock.currentTime) * 1000);
  }

  // Computes a Note Off delay that always lands at least MIN_GATE_MS after
  // noteOnDelay and, when possible, NOTE_OFF_LEAD_MS before the note's nominal
  // end — see NOTE_OFF_LEAD_MS comment above.
  _noteOffDelayMs(noteOnDelay, rawOffAudioTime) {
    const nominalOffDelay = this._delayMs(rawOffAudioTime);
    return Math.max(noteOnDelay + MIN_GATE_MS, nominalOffDelay - NOTE_OFF_LEAD_MS);
  }

  _onStart(data) {
    // _scheduledNotes is only cleared in start()/stop() above, but in External
    // Sync mode this engine is armed once and stays running across many
    // Stop/Start cycles from the external transport — each of those is a
    // 'start' tick here, not a fresh call to start(). Without clearing here
    // too, note-iteration keys from the previous play session stick around
    // and silently block re-triggering until enough loop cycles pass to
    // produce keys never seen before (the "catches up after a few seconds" bug).
    this._scheduledNotes.clear();

    if (!this.project?.sendMidiClock) return;
    broadcastStart([...this._clockOutputs], this._delayMs(data.time));
  }

  _onStop() {
    // Queued Live-mode launches only make sense against a running bar grid.
    if (this.project) clearPendingLaunches(this.project.tracks);
    if (!this.project?.sendMidiClock) return;
    broadcastStop([...this._clockOutputs]);
  }

  _onClock(data) {
    if (!this.project?.sendMidiClock) return;
    broadcastClock([...this._clockOutputs], this._delayMs(data.time));
  }

  _triggerMidiNote(track, note, onDelay, occurrence, clock) {
    sendNoteOn(track.midiOutputId, track.midiChannel, note.pitch, note.velocity, onDelay);
    const rawOffTime = clock.beatToAudioTime(occurrence + note.duration);
    sendNoteOff(track.midiOutputId, track.midiChannel, note.pitch, this._noteOffDelayMs(onDelay, rawOffTime));
  }

  // Drum notes fire a one-shot sample and are done — no note-off/gate to
  // compute. `note.pitch` holds the triggering pad's id (see createDrumPad
  // in models/project.js); if that pad was since removed, the note is
  // silently skipped rather than throwing.
  _triggerDrumNote(track, note, onDelay) {
    const pad = track.pads.find((p) => p.id === note.pitch);
    if (!pad) return;
    const gainMul = (pad.volume ?? 1) * (track.volume ?? 1);
    playSample(pad.id, note.velocity, onDelay, gainMul);
  }

  _onScheduleNotes({ now, scheduleUntil }) {
    if (!this.project) return;

    const clock = this._clock;
    const absBeat = clock.getAbsoluteBeat();
    // Promote any Live-mode launches whose bar has arrived before scheduling
    // this pass's notes, so newly-playing patterns take effect immediately
    // rather than a scheduler tick late.
    commitDuePatternLaunches(this.project.tracks, absBeat);
    const endAbsBeat = absBeat + clock.secToBeat(scheduleUntil - now) + 0.05;
    const useTransportLoop = !!this.project.loopRegion;
    const loopStart = clock.loopStartBeat;
    const loopEnd = clock.loopEndBeat;
    const transportLoopLen = clock.loopLengthBeats;

    for (const track of this.project.tracks) {
      if (track.kind === 'midi' && !track.midiOutputId) continue;

      const pattern = getPlayingPattern(track);
      if (!pattern) continue;

      const trackLoopLen = trackLoopLengthBeats(track);
      if (trackLoopLen <= 0) continue;

      const horizonBeat = scheduleHorizonBeat(track, endAbsBeat);

      for (const note of pattern.notes) {
        if (note.startBeat < 0 || note.startBeat >= trackLoopLen) continue;

        if (useTransportLoop) {
          // User loop region: only notes inside [loopStart, loopEnd), repeating every
          // transport loop cycle — not by full track length, so playback wraps at the
          // loop end instead of running past it toward the pattern tail.
          if (note.startBeat < loopStart || note.startBeat >= loopEnd) continue;

          let occurrence = nextTransportLoopOccurrence(absBeat, note.startBeat, loopStart, transportLoopLen);
          let cycle = Math.floor((occurrence - loopStart) / transportLoopLen);

          while (occurrence <= horizonBeat) {
            const startTime = clock.beatToAudioTime(occurrence);
            const noteKey = `n-${track.id}-${note.id}-t${cycle}`;

            if (
              !this._scheduledNotes.has(noteKey) &&
              startTime >= now - 0.002 &&
              startTime <= scheduleUntil + SCHEDULE_WINDOW_SLACK_SEC
            ) {
              this._scheduledNotes.add(noteKey);
              const onDelay = this._delayMs(startTime);
              if (track.kind === 'drum') {
                this._triggerDrumNote(track, note, onDelay);
              } else {
                this._triggerMidiNote(track, note, onDelay, occurrence, clock);
              }
            }
            occurrence += transportLoopLen;
            cycle++;
          }
          continue;
        }

        let occurrence = note.startBeat;
        if (occurrence < absBeat - 0.01) {
          const loopsElapsed = Math.floor((absBeat - note.startBeat) / trackLoopLen);
          occurrence = note.startBeat + loopsElapsed * trackLoopLen;
          if (occurrence < absBeat - 0.01) occurrence += trackLoopLen;
        }

        while (occurrence <= horizonBeat) {
          const startTime = clock.beatToAudioTime(occurrence);
          const iteration = Math.round((occurrence - note.startBeat) / trackLoopLen);
          const noteKey = `n-${track.id}-${note.id}-${iteration}`;

          if (
            !this._scheduledNotes.has(noteKey) &&
            startTime >= now - 0.002 &&
            startTime <= scheduleUntil + SCHEDULE_WINDOW_SLACK_SEC
          ) {
            this._scheduledNotes.add(noteKey);
            const onDelay = this._delayMs(startTime);
            if (track.kind === 'drum') {
              this._triggerDrumNote(track, note, onDelay);
            } else {
              this._triggerMidiNote(track, note, onDelay, occurrence, clock);
            }
          }
          occurrence += trackLoopLen;
        }
      }
    }
  }
}

export const playback = new PlaybackEngine();

export { PPQN };
