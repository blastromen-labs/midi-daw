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
//
// cutOthers (per pattern, default true): when false, a launch is layered onto
// liveLaunches instead of replacing them — so a One Shot can play over a Loop.
import {
  BEATS_PER_BAR,
  createLiveLaunch,
  getLiveLaunch,
  getPlayingPatterns,
  LIVE_LAUNCH_MODES,
  liveSyncGridBeats,
  patternCutsOthers,
  patternLaunchMode,
  patternLoopEndBeat,
} from '../models/project.js';

function nextBoundaryBeat(currentAbsBeat, gridBeats) {
  const EPSILON = 1e-6;
  const index = Math.floor(currentAbsBeat / gridBeats + EPSILON);
  return (index + 1) * gridBeats;
}

function findPattern(track, patternId) {
  return track?.patterns?.find((p) => p.id === patternId) ?? null;
}

function ensurePendingList(track) {
  if (!Array.isArray(track.pendingLaunches)) track.pendingLaunches = [];
  return track.pendingLaunches;
}

/** Max loop length among currently sounding patterns (for launch quantize). */
function playingQuantizeBeats(track) {
  const patterns = getPlayingPatterns(track);
  let max = BEATS_PER_BAR;
  for (const p of patterns) {
    max = Math.max(max, patternLoopEndBeat(p));
  }
  return max;
}

/**
 * When liveLaunches is still null (follow-active), a non-cutting launch must
 * materialize the active Loop into the list first — otherwise layering a
 * One Shot would drop the Loop that Play was already sounding.
 */
export function materializeFollowActive(track) {
  if (!track || track.liveLaunches != null) return;
  const active = track.patterns?.find((p) => p.id === track.activePatternId) ?? track.patterns?.[0];
  if (!active) {
    track.liveLaunches = [];
    return;
  }
  const mode = patternLaunchMode(active);
  if (mode === LIVE_LAUNCH_MODES.HOLD || mode === LIVE_LAUNCH_MODES.ONE_SHOT) {
    track.liveLaunches = [];
    return;
  }
  track.liveLaunches = [createLiveLaunch(active.id)];
}

function removeLaunch(track, patternId) {
  if (!track?.liveLaunches) return;
  track.liveLaunches = track.liveLaunches.filter((l) => l.patternId !== patternId);
}

function cancelPendingForPattern(track, patternId) {
  track.pendingLaunches = ensurePendingList(track).filter((p) => p.patternId !== patternId);
}

function queuePendingLaunch(track, patternId, launchBeat, cutOthers) {
  cancelPendingForPattern(track, patternId);
  ensurePendingList(track).push({ patternId, launchBeat, cutOthers });
}

function armLaunchStop(track, patternId, stopBeat) {
  const launch = getLiveLaunch(track, patternId);
  if (!launch) return;
  launch.stopBeat = stopBeat;
}

// Single entry point for a Loop clip click while the transport is running.
export function queuePatternToggle(track, patternId, currentAbsBeat) {
  if (!track) return;

  const targetPattern = findPattern(track, patternId);
  if (!targetPattern) return;

  const launch = getLiveLaunch(track, patternId);
  const following =
    track.liveLaunches == null &&
    getPlayingPatterns(track).some((p) => p.id === patternId);
  const isCurrentlyPlayingThis = !!launch || following;

  // Cancel a queued launch of this pattern.
  if (isPatternPending(track, patternId)) {
    cancelPendingForPattern(track, patternId);
    return;
  }

  // Cancel a queued stop (toggle-off) on this pattern.
  if (isCurrentlyPlayingThis && launch?.stopBeat != null) {
    launch.stopBeat = null;
    return;
  }

  if (isCurrentlyPlayingThis) {
    materializeFollowActive(track);
    const current = getLiveLaunch(track, patternId);
    const quantizeBeats = Math.max(patternLoopEndBeat(targetPattern), BEATS_PER_BAR);
    if (current) {
      current.stopBeat = nextBoundaryBeat(currentAbsBeat, quantizeBeats);
    }
    return;
  }

  const cutOthers = patternCutsOthers(targetPattern);
  const quantizeBeats = Math.max(
    playingQuantizeBeats(track),
    patternLoopEndBeat(targetPattern),
    BEATS_PER_BAR
  );
  queuePendingLaunch(track, patternId, nextBoundaryBeat(currentAbsBeat, quantizeBeats), cutOthers);
}

function isPatternPending(track, patternId) {
  return ensurePendingList(track).some((p) => p.patternId === patternId);
}

// One Shot click while transport is running.
export function queuePatternOneShot(track, patternId, currentAbsBeat) {
  if (!track) return;

  const targetPattern = findPattern(track, patternId);
  if (!targetPattern) return;

  if (isPatternPending(track, patternId)) {
    cancelPendingForPattern(track, patternId);
    return;
  }

  // Already playing through once — leave the armed auto-stop alone.
  if (getLiveLaunch(track, patternId)) return;

  const cutOthers = patternCutsOthers(targetPattern);
  const quantizeBeats = Math.max(
    playingQuantizeBeats(track),
    patternLoopEndBeat(targetPattern),
    BEATS_PER_BAR
  );
  queuePendingLaunch(track, patternId, nextBoundaryBeat(currentAbsBeat, quantizeBeats), cutOthers);
}

/** Arm a per-launch stop one pattern length after `fromAbsBeat` (One Shot only). */
export function armOneShotStop(track, patternId, fromAbsBeat) {
  if (!track || patternId == null) return;

  const pattern = findPattern(track, patternId);
  if (patternLaunchMode(pattern) !== LIVE_LAUNCH_MODES.ONE_SHOT) return;

  const len = patternLoopEndBeat(pattern);
  if (len <= 0) return;

  armLaunchStop(track, patternId, fromAbsBeat + len);
}

export function launchPatternImmediately(track, patternId) {
  if (!track) return;
  const pattern = findPattern(track, patternId);
  if (!pattern) return;

  const cutOthers = patternCutsOthers(pattern);
  if (cutOthers) {
    track.liveLaunches = [createLiveLaunch(patternId)];
  } else {
    materializeFollowActive(track);
    if (track.liveLaunches == null) track.liveLaunches = [];
    removeLaunch(track, patternId);
    track.liveLaunches.push(createLiveLaunch(patternId));
  }
  track.pendingLaunches = [];
}

export function stopTrackImmediately(track) {
  if (!track) return;
  track.liveLaunches = [];
  track.pendingLaunches = [];
}

export function stopPatternImmediately(track, patternId) {
  if (!track) return;
  materializeFollowActive(track);
  if (track.liveLaunches == null) {
    track.liveLaunches = [];
    return;
  }
  removeLaunch(track, patternId);
  cancelPendingForPattern(track, patternId);
}

// Hold-to-play: own launch slot; cutOthers decides whether other clips survive.
export function holdPatternDown(track, patternId, currentAbsBeat) {
  if (!track) return;

  const pattern = findPattern(track, patternId);
  if (!pattern) return;

  const syncBeats = liveSyncGridBeats(pattern);
  const boundary = nextBoundaryBeat(currentAbsBeat, syncBeats);
  const launch = createLiveLaunch(patternId, {
    holdActive: true,
    holdMuted: true,
    pendingUnmuteBeat: boundary,
  });

  if (patternCutsOthers(pattern)) {
    track.liveLaunches = [launch];
  } else {
    materializeFollowActive(track);
    if (track.liveLaunches == null) track.liveLaunches = [];
    removeLaunch(track, patternId);
    track.liveLaunches.push(launch);
  }
  // Drop pending starts that this hold would race with.
  track.pendingLaunches = [];
}

export function holdPatternUp(track) {
  if (!track?.liveLaunches) return;
  track.liveLaunches = track.liveLaunches.filter((l) => !l.holdActive);
}

export function commitDueUnmutes(tracks, currentAbsBeat) {
  const EPSILON = 1e-6;
  for (const track of tracks) {
    if (!track.liveLaunches) continue;
    for (const launch of track.liveLaunches) {
      if (!launch.holdMuted || launch.pendingUnmuteBeat == null || !launch.holdActive) continue;
      if (currentAbsBeat + EPSILON >= launch.pendingUnmuteBeat) {
        launch.holdMuted = false;
        launch.pendingUnmuteBeat = null;
      }
    }
  }
}

export function clearTrackHoldState(track) {
  if (!track?.liveLaunches) return;
  for (const launch of track.liveLaunches) {
    launch.holdActive = false;
    launch.holdMuted = false;
    launch.pendingUnmuteBeat = null;
  }
}

export function clearHoldState(tracks) {
  for (const track of tracks) clearTrackHoldState(track);
}

export function isTrackHoldMuted(track, patternId) {
  if (patternId) {
    const launch = getLiveLaunch(track, patternId);
    return !!launch?.holdMuted && !!launch.holdActive;
  }
  return !!track?.liveLaunches?.some((l) => l.holdActive && l.holdMuted);
}

export function isTrackHoldAudible(track, patternId) {
  const launch = getLiveLaunch(track, patternId);
  return isHoldLaunchAudible(launch);
}

function isHoldLaunchAudible(launch) {
  return !!launch?.holdActive && !launch.holdMuted;
}

function commitLaunch(track, pending) {
  const { patternId, cutOthers, launchBeat } = pending;
  if (cutOthers) {
    track.liveLaunches = [createLiveLaunch(patternId)];
  } else {
    materializeFollowActive(track);
    if (track.liveLaunches == null) track.liveLaunches = [];
    removeLaunch(track, patternId);
    track.liveLaunches.push(createLiveLaunch(patternId));
  }
  armOneShotStop(track, patternId, launchBeat);
}

export function commitDuePatternLaunches(tracks, currentAbsBeat) {
  const EPSILON = 1e-6;
  for (const track of tracks) {
    const pending = ensurePendingList(track);
    const due = pending.filter((p) => currentAbsBeat + EPSILON >= p.launchBeat);
    if (due.length) {
      track.pendingLaunches = pending.filter((p) => currentAbsBeat + EPSILON < p.launchBeat);
      for (const p of due) commitLaunch(track, p);
    }

    // Per-launch stops (toggle-off / one-shot end) — remove only that clip.
    if (track.liveLaunches?.length) {
      track.liveLaunches = track.liveLaunches.filter(
        (l) => l.stopBeat == null || currentAbsBeat + EPSILON < l.stopBeat
      );
    }
  }
}

// Transport stop: clear queues; drop One Shots / Holds so Play won't resume them.
// Loops stay in liveLaunches (same as keeping playingPatternId before).
export function clearPendingLaunches(tracks) {
  for (const track of tracks) {
    track.pendingLaunches = [];
    if (!track.liveLaunches) continue;
    track.liveLaunches = track.liveLaunches
      .filter((l) => {
        const pattern = findPattern(track, l.patternId);
        const mode = patternLaunchMode(pattern);
        return mode === LIVE_LAUNCH_MODES.TOGGLE;
      })
      .map((l) => createLiveLaunch(l.patternId));
  }
}
