// Session/live-launch quantization — framework-agnostic, like every other
// engine/ module (see project-overview.mdc). Owns the rule "a clicked clip
// doesn't play immediately, it waits for the right boundary" so that rule
// lives in exactly one place instead of being reimplemented by the Live view
// and the scheduler separately.
//
// Design note: a newly-launched pattern is NOT restarted from its own beat 0.
// Instead it phase-locks to the master grid — the same absolute-beat
// arithmetic the scheduler already uses for ordinary playback (see
// trackSchedulingSegments in scheduler.js). That means the *quantize length*
// for a launch has to be a common multiple of both the currently-playing
// pattern's length and the newly-queued one's, not a fixed 1-bar grid —
// otherwise the switch can land in the middle of the new pattern's own loop
// (e.g. queuing a 2-bar pattern but committing on a 1-bar boundary lands on
// beat 4 of an 8-beat pattern, which sounds like nothing changed). Since
// every pattern length here is a whole number of bars from BAR_LENGTH_OPTIONS
// (powers of two up to 64 bars), each length evenly divides every larger one, so using
// Math.max(currentLen, targetLen) as the quantize grid is always a valid
// common multiple — it guarantees the current pattern finishes its own loop
// *and* the new one starts from its own beat 0.
import {
  BEATS_PER_BAR,
  getPlayingPattern,
  liveSyncGridBeats,
  patternLoopEndBeat,
  STOPPED_PATTERN,
} from '../models/project.js';

// The next grid line strictly after `currentAbsBeat` — "strictly after" so
// clicking a clip right on a grid line still waits for the *next* one rather
// than (depending on float rounding) sometimes firing immediately.
export function nextBoundaryBeat(currentAbsBeat, gridBeats) {
  const EPSILON = 1e-6;
  const index = Math.floor(currentAbsBeat / gridBeats + EPSILON);
  return (index + 1) * gridBeats;
}

// Single entry point for a clip click while the transport is running.
// Clicking...
//   - the pattern already playing        -> arms the track to go silent once
//                                            its loop completes (toggle off).
//   - the pattern/stop already queued    -> cancels that queue instead of
//                                            re-arming it a further cycle out.
//   - anything else                      -> arms it to replace the playing
//                                            pattern once both loops line up.
export function queuePatternToggle(track, patternId, currentAbsBeat) {
  if (!track) return;

  const currentPattern = getPlayingPattern(track);
  const isCurrentlyPlayingThis = track.playingPatternId !== STOPPED_PATTERN && currentPattern?.id === patternId;

  // Re-clicking the playing pattern while its own stop is already queued
  // cancels the stop (keeps it playing) instead of re-arming another one.
  if (isCurrentlyPlayingThis && track.pendingPatternId === STOPPED_PATTERN) {
    track.pendingPatternId = null;
    track.pendingLaunchBeat = null;
    return;
  }

  if (track.pendingPatternId === patternId) {
    track.pendingPatternId = null;
    track.pendingLaunchBeat = null;
    return;
  }

  if (isCurrentlyPlayingThis) {
    const quantizeBeats = Math.max(patternLoopEndBeat(currentPattern), BEATS_PER_BAR);
    track.pendingPatternId = STOPPED_PATTERN;
    track.pendingLaunchBeat = nextBoundaryBeat(currentAbsBeat, quantizeBeats);
    return;
  }

  const targetPattern = track.patterns?.find((p) => p.id === patternId);
  const quantizeBeats = Math.max(
    patternLoopEndBeat(currentPattern),
    patternLoopEndBeat(targetPattern),
    BEATS_PER_BAR
  );
  track.pendingPatternId = patternId;
  track.pendingLaunchBeat = nextBoundaryBeat(currentAbsBeat, quantizeBeats);
}

// Used when the transport is stopped — there's no running grid to quantize
// against, so the clip just becomes the track's playing pattern outright
// (the caller is expected to also start the transport).
export function launchPatternImmediately(track, patternId) {
  if (!track) return;
  track.playingPatternId = patternId;
  track.pendingPatternId = null;
  track.pendingLaunchBeat = null;
}

// The stopped-transport counterpart to launchPatternImmediately — unarms a
// track (so nothing on it plays once you press Play) without touching the
// transport itself.
export function stopTrackImmediately(track) {
  if (!track) return;
  track.playingPatternId = STOPPED_PATTERN;
  track.pendingPatternId = null;
  track.pendingLaunchBeat = null;
  clearTrackHoldState(track);
}

// Hold-to-play: the pattern loops phase-locked to the transport but stays
// muted until the next sync grid line, then audibly while the clip is held.
// Releasing stops the track outright — the muted loop does not linger.
export function holdPatternDown(track, patternId, currentAbsBeat) {
  if (!track) return;

  const pattern = track.patterns?.find((p) => p.id === patternId);
  if (!pattern) return;

  const syncBeats = liveSyncGridBeats(track, pattern);
  track.playingPatternId = patternId;
  track.holdActive = true;
  track.holdMuted = true;
  const boundary = nextBoundaryBeat(currentAbsBeat, syncBeats);
  // If we're already past the boundary (e.g. abs beat read after transport
  // start landed slightly late), unmute on the very next scheduler tick.
  track.pendingUnmuteBeat = boundary;
  track.pendingPatternId = null;
  track.pendingLaunchBeat = null;
}

export function holdPatternUp(track) {
  if (!track) return;
  clearTrackHoldState(track);
  track.playingPatternId = STOPPED_PATTERN;
}

export function commitDueUnmutes(tracks, currentAbsBeat) {
  const EPSILON = 1e-6;
  for (const track of tracks) {
    if (!track.holdMuted || track.pendingUnmuteBeat == null || !track.holdActive) continue;
    if (currentAbsBeat + EPSILON >= track.pendingUnmuteBeat) {
      track.holdMuted = false;
      track.pendingUnmuteBeat = null;
    }
  }
}

export function clearTrackHoldState(track) {
  if (!track) return;
  track.holdActive = false;
  track.holdMuted = false;
  track.pendingUnmuteBeat = null;
}

export function clearHoldState(tracks) {
  for (const track of tracks) clearTrackHoldState(track);
}

export function isTrackHoldMuted(track) {
  return !!track?.holdMuted;
}

export function isTrackHoldAudible(track, patternId) {
  if (!track?.holdActive) return false;
  if (track.holdMuted) return false;
  return track.playingPatternId === patternId;
}

// Called every scheduler tick with the current absolute (unwrapped) beat —
// promotes any queued launches/stops whose boundary has arrived. Cheap no-op
// scan when nothing is queued, so it's safe to call unconditionally from the
// hot path.
export function commitDuePatternLaunches(tracks, currentAbsBeat) {
  const EPSILON = 1e-6;
  for (const track of tracks) {
    if (track.pendingPatternId == null) continue;
    if (currentAbsBeat + EPSILON >= track.pendingLaunchBeat) {
      track.playingPatternId = track.pendingPatternId;
      track.pendingPatternId = null;
      track.pendingLaunchBeat = null;
    }
  }
}

// Queued-but-not-yet-live launches/stops only make sense relative to a
// running grid, so a stop clears them rather than leaving a stale "queued"
// clip lit in the Live view.
export function clearPendingLaunches(tracks) {
  for (const track of tracks) {
    track.pendingPatternId = null;
    track.pendingLaunchBeat = null;
  }
  clearHoldState(tracks);
}
