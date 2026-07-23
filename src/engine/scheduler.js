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
import { findZoneForPitch, zonePlaybackOpts } from './sampleZones.js';
import { transport } from './clock.js';
import { getActiveClock } from './activeClock.js';
import {
  getLiveLaunch,
  getPlayingPatterns,
  LIVE_LAUNCH_MODES,
  patternLaunchMode,
  patternLoopEndBeat,
} from '../models/project.js';
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

// Builds schedule segments for every pattern sounding (or about to sound) on
// a track in [rangeStart, rangeEnd). Supports concurrent clips when cutOthers
// is false, and clips each launch at its own stopBeat / pending cut boundary.
//
// Pending starts are included ahead of commitDuePatternLaunches because that
// commit only runs against the *current* beat with no lookahead — without
// pre-scheduling the incoming pattern, its opening notes can miss the
// scheduler's late-note tolerance (same reason as the old single-pending split).
function trackSchedulingSegments(track, rangeStart, rangeEnd, useLiveLaunch, soloPreview) {
  if (!useLiveLaunch) {
    const patterns = getPlayingPatterns(track, { useLiveLaunch, soloPreview });
    return patterns.map((pattern) => ({ pattern, rangeStart, rangeEnd, originBeat: null }));
  }

  const segments = [];
  const pending = track.pendingLaunches ?? [];

  // cutOthers pending launches: Loop swaps cut everything; Hold/One Shot fills
  // only cut other fills so a queued/sounding Loop is never truncated by them.
  let loopCutBeat = null;
  let fillCutBeat = null;
  for (const p of pending) {
    if (!p.cutOthers) continue;
    if (p.launchBeat == null || p.launchBeat > rangeEnd) continue;
    const pendingPattern = track.patterns?.find((pat) => pat.id === p.patternId);
    const mode = patternLaunchMode(pendingPattern);
    if (mode === LIVE_LAUNCH_MODES.HOLD || mode === LIVE_LAUNCH_MODES.ONE_SHOT) {
      if (fillCutBeat == null || p.launchBeat < fillCutBeat) fillCutBeat = p.launchBeat;
    } else if (loopCutBeat == null || p.launchBeat < loopCutBeat) {
      loopCutBeat = p.launchBeat;
    }
  }

  const sounding = getPlayingPatterns(track, { useLiveLaunch, soloPreview });
  for (const pattern of sounding) {
    const launch = getLiveLaunch(track, pattern.id);
    const soundingMode = patternLaunchMode(pattern);
    const isFill =
      soundingMode === LIVE_LAUNCH_MODES.HOLD || soundingMode === LIVE_LAUNCH_MODES.ONE_SHOT;
    let end = rangeEnd;
    if (launch?.stopBeat != null) end = Math.min(end, launch.stopBeat - 1e-6);
    if (loopCutBeat != null) end = Math.min(end, loopCutBeat - 1e-6);
    if (isFill && fillCutBeat != null) end = Math.min(end, fillCutBeat - 1e-6);
    // Pending re-launch of the same clip (scene restart / One Shot retrigger):
    // end the current sounding segment before that beat so we don't double-schedule.
    const pendingSelf = pending.find((p) => p.patternId === pattern.id && p.launchBeat != null);
    if (pendingSelf) end = Math.min(end, pendingSelf.launchBeat - 1e-6);
    if (end >= rangeStart) {
      // Any launch with startBeat set (One Shot or scene-restarted Loop) origins
      // content beat 0 there; null startBeat → phase-lock below.
      segments.push({
        pattern,
        rangeStart,
        rangeEnd: end,
        originBeat: launch?.startBeat ?? null,
      });
    }
  }

  for (const p of pending) {
    if (!p.patternId || p.launchBeat == null || p.launchBeat > rangeEnd) continue;
    const pattern = track.patterns?.find((pat) => pat.id === p.patternId);
    if (!pattern) continue;
    const start = Math.max(rangeStart, p.launchBeat);
    let end = rangeEnd;
    const isOneShot = patternLaunchMode(pattern) === LIVE_LAUNCH_MODES.ONE_SHOT;
    // One Shot: schedule only through one length from the launch boundary.
    if (isOneShot) {
      const len = patternLoopEndBeat(pattern);
      if (len > 0) end = Math.min(end, p.launchBeat + len - 1e-6);
    }
    if (end >= start) {
      const restart = isOneShot || p.restartFromStart;
      segments.push({
        pattern,
        rangeStart: start,
        rangeEnd: end,
        // Restart launches (One Shot / scene) use the queued beat as content origin.
        originBeat: restart ? p.launchBeat : null,
      });
    }
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
    // Optional () => Track[] for Live multi-song mixes. When set, scheduling /
    // commit / clock-output discovery walk these tracks in addition to (or
    // instead of, if the getter already includes them) project.tracks.
    // Kept as a getter so App can park/swap song runtimes without rebinding.
    this._getLiveTracks = null;
    // Optional (absBeat) => void — fires after Live launches commit each tick so
    // App can apply deferred work (e.g. scene tempo) on the same boundary.
    this._onLiveBoundary = null;
    this._unsub = null;
    this._clock = null;
    this._clockOutputs = new Set();
    this._scheduledNotes = new Set();
  }

  setProject(project) {
    this.project = project;
    this._updateClockOutputs();
  }

  /**
   * Provide tracks from every song in the Live set. Pass null to schedule only
   * the active project (piano-roll / single-song behaviour).
   * @param {null|(() => object[])} getter
   */
  setLiveTracksGetter(getter) {
    this._getLiveTracks = typeof getter === 'function' ? getter : null;
    this._updateClockOutputs();
  }

  /** @param {null|((absBeat: number) => void)} handler */
  setLiveBoundaryHandler(handler) {
    this._onLiveBoundary = typeof handler === 'function' ? handler : null;
  }

  /** Tracks the scheduler should sound this tick. */
  _schedulingTracks() {
    if (this._getLiveTracks) {
      const tracks = this._getLiveTracks();
      if (Array.isArray(tracks)) return tracks;
    }
    return this.project?.tracks ?? [];
  }

  _updateClockOutputs() {
    this._clockOutputs.clear();
    if (!this.project) return;

    if (this.project.clockOutputId) {
      this._clockOutputs.add(this.project.clockOutputId);
    }

    // Drum tracks never have a MIDI output — they trigger local samples only.
    for (const track of this._schedulingTracks()) {
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
    // Clear across the whole Live set so background songs don't keep stale queues.
    if (this.project) clearPendingLaunches(this._schedulingTracks());
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
    if (!pad || pad.muted) return;
    const gainMul = (pad.volume ?? 1) * (track.volume ?? 1);
    playSample(pad.id, note.velocity, onDelay, gainMul, padPlaybackOpts(pad, track, note.pitchOffset));
  }

  // Multi-sampler: `note.pitch` is a MIDI number (same as MIDI tracks). Look up
  // the zone covering that key and pitch-shift the sample relative to rootNote.
  // Gate by note.duration so long samples don't ring past the roll note end.
  _triggerMultiSamplerNote(track, note, onDelay, clock) {
    const zone = findZoneForPitch(track.zones, note.pitch);
    if (!zone) return;
    const gainMul = (zone.volume ?? 1) * (track.volume ?? 1);
    const durationSec = clock.beatToSec(Math.max(0.01, note.duration ?? 0.25));
    playSample(
      zone.id,
      note.velocity,
      onDelay,
      gainMul,
      zonePlaybackOpts(zone, note.pitch, note.pitchOffset, { durationSec, track })
    );
  }

  // Shared by scheduling branches below: dedups by noteKey and checks
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
    } else if (track.kind === 'multisampler') {
      this._triggerMultiSamplerNote(track, note, onDelay, clock);
    } else {
      this._triggerMidiNote(track, note, onDelay, occurrence, clock);
    }
  }

  _onScheduleNotes({ now, scheduleUntil }) {
    if (!this.project) return;

    const clock = this._clock;
    const absBeat = clock.getAbsoluteBeat();
    const useLiveLaunch = this.project.sessionView === 'live';
    const soloPreview = useLiveLaunch ? null : this.project.soloPreview ?? null;
    // Promote any Live-mode launches whose bar has arrived before scheduling
    // this pass's notes, so liveLaunches / pendingLaunches (and the Live
    // view's queued/playing indicators) flip at the right time. The note
    // scheduling below doesn't depend on this having run yet — it reaches
    // across a pending boundary itself via trackSchedulingSegments — this is
    // purely about keeping the track's state/UI in sync with the transport.
    const tracks = this._schedulingTracks();
    if (useLiveLaunch) {
      commitDuePatternLaunches(tracks, absBeat);
      commitDueUnmutes(tracks, absBeat);
      // After commits so tempo/scene side-effects land with the new clips, and
      // before note scheduling so this tick's notes use the updated clock.
      this._onLiveBoundary?.(absBeat);
    }
    const endAbsBeat = absBeat + clock.secToBeat(scheduleUntil - now) + 0.05;
    const useTransportLoop = !!this.project.loopRegion;
    const loopStart = clock.loopStartBeat;
    const loopEnd = clock.loopEndBeat;
    const transportLoopLen = clock.loopLengthBeats;

    // Solo is additive: if any track is soloed, only those tracks sound
    // (still respecting mute). Same rule across the whole Live scheduling set.
    const anySolo = tracks.some((t) => t.soloed);

    for (const track of tracks) {
      if (track.muted) continue;
      if (anySolo && !track.soloed) continue;
      if (track.kind === 'midi' && !track.midiOutputId) continue;

      for (const { pattern, rangeStart, rangeEnd, originBeat } of trackSchedulingSegments(
        track,
        absBeat,
        endAbsBeat,
        useLiveLaunch,
        soloPreview
      )) {
        if (!pattern || rangeEnd < rangeStart) continue;

        const trackLoopLen = patternLoopEndBeat(pattern);
        if (trackLoopLen <= 0) continue;

        // Content origin: pattern beat 0 maps to originBeat (One Shot / scene
        // restart). Loops with a null origin keep phase-locking below.
        if (originBeat != null) {
          for (const note of pattern.notes) {
            if (note.startBeat < 0 || note.startBeat >= trackLoopLen) continue;

            let iteration = 0;
            const first = originBeat + note.startBeat;
            if (first < rangeStart - 0.01) {
              iteration = Math.floor((rangeStart - first) / trackLoopLen);
              if (first + iteration * trackLoopLen < rangeStart - 0.01) iteration++;
            }

            while (true) {
              const occurrence = first + iteration * trackLoopLen;
              if (occurrence > rangeEnd + 1e-9) break;
              const noteKey = `n-${track.id}-${pattern.id}-${note.id}-o${originBeat}-${iteration}`;
              this._maybeScheduleNote(track, note, occurrence, noteKey, now, scheduleUntil, clock);
              iteration++;
            }
          }
          continue;
        }

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
              // Include pattern id so layered same-track clips can't collide in the dedupe set.
              const noteKey = `n-${track.id}-${pattern.id}-${note.id}-t${cycle}`;
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

            const noteKey = `n-${track.id}-${pattern.id}-${note.id}-${iteration}`;
            this._maybeScheduleNote(track, note, occurrence, noteKey, now, scheduleUntil, clock);
            iteration++;
          }
        }
      }
    }
  }
}

export const playback = new PlaybackEngine();
