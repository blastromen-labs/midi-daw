import {
  sendNoteOn,
  sendNoteOff,
  broadcastClock,
  broadcastStart,
  broadcastStop,
  PPQN,
} from './midi.js';
import { playSample, resumeSamplerAudio } from './sampler.js';
import { padPlaybackOpts } from './padPlayback.js';
import { transport } from './clock.js';
import { getActiveClock } from './activeClock.js';
import { getPlayingPattern, patternLoopEndBeat, STOPPED_PATTERN } from '../models/project.js';
import { commitDuePatternLaunches, commitDueUnmutes, clearPendingLaunches } from './liveLauncher.js';

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

// If the main thread stalls and the scheduler wakes after a note's ideal time,
// the old `now - 2ms` cutoff rejected it on every subsequent tick too (the
// note was never deduped, but always "too late") — a silent drop. Late notes
// within one 16th of the tick snapshot are fired immediately instead.
const MAX_LATE_NOTE_GRACE_SEC = 0.15;

// Splits a track's [rangeStart, rangeEnd) schedule window around a pending
// Live-mode launch boundary, so each pattern is only ever scheduled for the
// span it's actually sounding during:
//   - no queued launch, or its boundary is beyond this window  -> one segment
//     for the currently-playing pattern across the whole window.
//   - boundary falls inside this window                        -> two segments:
//     the outgoing pattern up to the boundary, and the incoming (pending)
//     pattern from the boundary onward.
//
// The second segment matters because commitDuePatternLaunches (which flips
// playingPatternId) only runs once per scheduler tick, checked against the
// *current* beat with no lookahead — unlike every other note, which gets
// scheduled SCHEDULE_AHEAD_SEC (clock.js) ahead of when it actually sounds.
// Without this, the incoming pattern's first note(s) only get scheduled once
// promotion happens to run on a tick at or after the boundary, by which point
// the audio timestamp for a beat-0 note can already be so close to (or
// behind) "now" that it misses the scheduler's own "not too late" tolerance
// and gets silently dropped — the queued pattern's opening note(s) go missing.
// Splitting the window lets the incoming pattern be scheduled ahead of time,
// exactly like the outgoing one, so both sides of the switch get the same
// timing guarantees.
function trackSchedulingSegments(track, rangeStart, rangeEnd, useLiveLaunch) {
  const currentPattern = getPlayingPattern(track, { useLiveLaunch });
  const launchBeat = track.pendingLaunchBeat;

  if (
    !useLiveLaunch ||
    track.pendingPatternId == null ||
    launchBeat == null ||
    launchBeat > rangeEnd
  ) {
    return [{ pattern: currentPattern, rangeStart, rangeEnd }];
  }

  const segments = [
    { pattern: currentPattern, rangeStart, rangeEnd: Math.min(rangeEnd, launchBeat - 1e-6) },
  ];

  const nextPattern =
    track.pendingPatternId === STOPPED_PATTERN ? null : track.patterns?.find((p) => p.id === track.pendingPatternId);
  if (nextPattern) {
    segments.push({ pattern: nextPattern, rangeStart: Math.max(rangeStart, launchBeat), rangeEnd });
  }

  return segments;
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
    playSample(pad.id, note.velocity, onDelay, gainMul, padPlaybackOpts(pad, track));
  }

  // Shared by both scheduling branches below: dedups by noteKey and checks
  // the note's audio timestamp actually falls inside this tick's schedulable
  // window before triggering it.
  _maybeScheduleNote(track, note, occurrence, noteKey, now, scheduleUntil, clock) {
    if (this._scheduledNotes.has(noteKey)) return;

    const startTime = clock.beatToAudioTime(occurrence);
    if (startTime > scheduleUntil + SCHEDULE_WINDOW_SLACK_SEC) return;

    const lateGraceSec = Math.min(MAX_LATE_NOTE_GRACE_SEC, clock.beatToSec(0.25));
    if (startTime < now - lateGraceSec) return;

    this._scheduledNotes.add(noteKey);
    const onDelay = this._delayMs(startTime);
    if (track.kind === 'drum') {
      this._triggerDrumNote(track, note, onDelay);
    } else {
      this._triggerMidiNote(track, note, onDelay, occurrence, clock);
    }
  }

  _onScheduleNotes({ now, scheduleUntil }) {
    if (!this.project) return;

    const clock = this._clock;
    const absBeat = clock.getAbsoluteBeat();
    const useLiveLaunch = this.project.sessionView === 'live';
    // Promote any Live-mode launches whose bar has arrived before scheduling
    // this pass's notes, so playingPatternId/pendingPatternId (and the Live
    // view's queued/playing indicators) flip at the right time. The note
    // scheduling below doesn't depend on this having run yet — it reaches
    // across a pending boundary itself via trackSchedulingSegments — this is
    // purely about keeping the track's state/UI in sync with the transport.
    if (useLiveLaunch) {
      commitDuePatternLaunches(this.project.tracks, absBeat);
      commitDueUnmutes(this.project.tracks, absBeat);
    }
    const endAbsBeat = absBeat + clock.secToBeat(scheduleUntil - now) + 0.05;
    const useTransportLoop = !!this.project.loopRegion;
    const loopStart = clock.loopStartBeat;
    const loopEnd = clock.loopEndBeat;
    const transportLoopLen = clock.loopLengthBeats;

    for (const track of this.project.tracks) {
      if (track.kind === 'midi' && !track.midiOutputId) continue;
      if (useLiveLaunch && track.holdMuted) continue;

      for (const { pattern, rangeStart, rangeEnd } of trackSchedulingSegments(
        track,
        absBeat,
        endAbsBeat,
        useLiveLaunch
      )) {
        if (!pattern || rangeEnd < rangeStart) continue;

        const trackLoopLen = patternLoopEndBeat(pattern);
        if (trackLoopLen <= 0) continue;

        for (const note of pattern.notes) {
          if (note.startBeat < 0 || note.startBeat >= trackLoopLen) continue;

          if (useTransportLoop) {
            // User loop region: only notes inside [loopStart, loopEnd), repeating every
            // transport loop cycle — not by full track length, so playback wraps at the
            // loop end instead of running past it toward the pattern tail.
            if (note.startBeat < loopStart || note.startBeat >= loopEnd) continue;

            let occurrence = nextTransportLoopOccurrence(rangeStart, note.startBeat, loopStart, transportLoopLen);
            let cycle = Math.floor((occurrence - loopStart) / transportLoopLen + 1e-9);

            while (occurrence <= rangeEnd + 1e-9) {
              const noteKey = `n-${track.id}-${note.id}-t${cycle}`;
              this._maybeScheduleNote(track, note, occurrence, noteKey, now, scheduleUntil, clock);
              cycle++;
              occurrence += transportLoopLen;
            }
            continue;
          }

          let iteration = 0;
          if (note.startBeat < rangeStart - 0.01) {
            iteration = Math.floor((rangeStart - note.startBeat) / trackLoopLen);
            if (note.startBeat + iteration * trackLoopLen < rangeStart - 0.01) iteration++;
          }

          while (true) {
            const occurrence = note.startBeat + iteration * trackLoopLen;
            if (occurrence > rangeEnd + 1e-9) break;

            const noteKey = `n-${track.id}-${note.id}-${iteration}`;
            this._maybeScheduleNote(track, note, occurrence, noteKey, now, scheduleUntil, clock);
            iteration++;
          }
        }
      }
    }
  }
}

export const playback = new PlaybackEngine();

export { PPQN };
