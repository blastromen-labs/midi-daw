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

/**
 * Next beat at which this sounding clip finishes its current loop.
 * Scene-restarted / One Shot clips align to launch.startBeat; ordinary
 * phase-locked Loops align to absolute 0. If we're exactly on a boundary,
 * that beat counts as "finished now" so a switch can land immediately.
 */
function nextPatternLoopEndBeat(currentAbsBeat, pattern, launch) {
  const len = patternLoopEndBeat(pattern);
  if (len <= 0) return nextBoundaryBeat(currentAbsBeat, BEATS_PER_BAR);
  const EPSILON = 1e-6;
  const origin = launch?.startBeat != null ? launch.startBeat : 0;
  const elapsed = Math.max(0, currentAbsBeat - origin);
  // ceil(elapsed/len) in "already finished" form: exact boundary → cycles stays.
  const cycles = Math.ceil(elapsed / len - EPSILON);
  return origin + Math.max(cycles, 1) * len;
}

/**
 * Scene-switch boundary: wait until every currently sounding clip has finished
 * its own loop (latest of those ends). Incoming scene length must not delay.
 * Falls back to the next bar when nothing is sounding.
 */
function sceneSwitchBeat(currentAbsBeat, tracks) {
  let launchBeat = null;
  for (const track of tracks ?? []) {
    for (const pattern of getPlayingPatterns(track)) {
      const end = nextPatternLoopEndBeat(
        currentAbsBeat,
        pattern,
        getLiveLaunch(track, pattern.id)
      );
      launchBeat = launchBeat == null ? end : Math.max(launchBeat, end);
    }
  }
  if (launchBeat == null) return nextBoundaryBeat(currentAbsBeat, BEATS_PER_BAR);
  // If every clip already finished at/before "now", still need a commit beat
  // at or after currentAbsBeat so pending launches fire on this tick.
  return Math.max(launchBeat, currentAbsBeat);
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

/** Cancel a queued launch for this pattern (no-op if none). */
export function cancelPendingPattern(track, patternId) {
  if (!track || !patternId) return;
  cancelPendingForPattern(track, patternId);
}

/** Clear a queued toggle-off / one-shot stop on this pattern. */
export function cancelQueuedStop(track, patternId) {
  const launch = getLiveLaunch(track, patternId);
  if (launch) launch.stopBeat = null;
}

function queuePendingLaunch(track, patternId, launchBeat, cutOthers, { restartFromStart = false } = {}) {
  cancelPendingForPattern(track, patternId);
  ensurePendingList(track).push({ patternId, launchBeat, cutOthers, restartFromStart });
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
    queuePatternStop(track, patternId, currentAbsBeat);
    return;
  }

  queuePatternStart(track, patternId, currentAbsBeat);
}

/** Queue a Loop start at the next shared loop/bar boundary (no-op if missing). */
export function queuePatternStart(track, patternId, currentAbsBeat) {
  if (!track) return;
  const targetPattern = findPattern(track, patternId);
  if (!targetPattern) return;

  const cutOthers = patternCutsOthers(targetPattern);
  const quantizeBeats = Math.max(
    playingQuantizeBeats(track),
    patternLoopEndBeat(targetPattern),
    BEATS_PER_BAR
  );
  queuePendingLaunch(track, patternId, nextBoundaryBeat(currentAbsBeat, quantizeBeats), cutOthers);
}

/** Queue a Loop stop at the next loop/bar boundary (no-op if not sounding). */
export function queuePatternStop(track, patternId, currentAbsBeat) {
  if (!track) return;
  const targetPattern = findPattern(track, patternId);
  if (!targetPattern) return;

  materializeFollowActive(track);
  const current = getLiveLaunch(track, patternId);
  const quantizeBeats = Math.max(patternLoopEndBeat(targetPattern), BEATS_PER_BAR);
  if (current) {
    current.stopBeat = nextBoundaryBeat(currentAbsBeat, quantizeBeats);
  }
}

function isPatternPending(track, patternId) {
  return ensurePendingList(track).some((p) => p.patternId === patternId);
}

// One Shot click while transport is running — launches on the pattern's sync
// grid (same options as Hold), then plays through once from pattern beat 0
// (not phase-locked — see originBeat scheduling in scheduler.js).
// Clicking again while it's already sounding re-queues a fresh playthrough
// from the start; clicking while still queued cancels that queue.
export function queuePatternOneShot(track, patternId, currentAbsBeat) {
  if (!track) return;

  const targetPattern = findPattern(track, patternId);
  if (!targetPattern) return;

  if (isPatternPending(track, patternId)) {
    cancelPendingForPattern(track, patternId);
    return;
  }

  const cutOthers = patternCutsOthers(targetPattern);
  const quantizeBeats = liveSyncGridBeats(targetPattern);
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
  const { patternId, cutOthers, launchBeat, restartFromStart } = pending;
  const pattern = findPattern(track, patternId);
  // One Shots and scene restarts record the absolute launch beat so the
  // scheduler can map pattern beat 0 → launchBeat instead of phase-locking.
  const restart =
    restartFromStart || patternLaunchMode(pattern) === LIVE_LAUNCH_MODES.ONE_SHOT;
  const launch = createLiveLaunch(patternId, restart ? { startBeat: launchBeat } : {});
  if (cutOthers) {
    track.liveLaunches = [launch];
  } else {
    materializeFollowActive(track);
    if (track.liveLaunches == null) track.liveLaunches = [];
    removeLaunch(track, patternId);
    track.liveLaunches.push(launch);
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

/**
 * Scene launch is exclusive: anything sounding (or queued) that is not in the
 * scene stops at `stopBeat`, so only the scene's patterns continue after the
 * shared boundary. Clears pending launches — the scene re-queues its own.
 */
function cutNonSceneOnTrack(track, scenePatternIds, stopBeat) {
  if (!track) return;

  track.pendingLaunches = [];

  if (track.liveLaunches == null) {
    // Follow-active: materialize so we can keep a scene member or stop a
    // non-scene active Loop at the scene boundary (same as a manual toggle-off).
    const active =
      track.patterns?.find((p) => p.id === track.activePatternId) ?? track.patterns?.[0];
    if (!active || patternLaunchMode(active) !== LIVE_LAUNCH_MODES.TOGGLE) {
      track.liveLaunches = [];
      return;
    }
    if (scenePatternIds.has(active.id)) {
      track.liveLaunches = [createLiveLaunch(active.id)];
      return;
    }
    track.liveLaunches = [createLiveLaunch(active.id, { stopBeat })];
    return;
  }

  for (const launch of track.liveLaunches) {
    if (scenePatternIds.has(launch.patternId)) {
      // Keep scene members that were mid toggle-off.
      if (launch.stopBeat != null) launch.stopBeat = null;
      continue;
    }
    launch.stopBeat = stopBeat;
  }
}

/**
 * Queue every launchable pattern in a scene onto one shared quantize boundary
 * so they land together. Cuts any playing/queued clip that is not in the scene
 * at that same boundary (scene replaces the current Live set).
 * Hold patterns are skipped — they need a press-and-hold gesture.
 *
 * Switch timing: wait until every *currently sounding* clip finishes its own
 * loop (relative to that clip's startBeat / phase origin) — never delay for
 * the incoming scene's lengths. At that shared boundary every incoming member
 * is (re)queued with restartFromStart so pattern beat 0 fires together,
 * including Loops that were already sounding (shared across scenes).
 *
 * @param {{ track: object, pattern: object }[]} refs
 * @param {number} currentAbsBeat
 * @param {object[]} [allTracks] every project track (needed to silence non-scene clips)
 * @returns {{ queued: number, skippedPlaying: number, launchBeat: number|null }}
 */
export function queueSceneLaunch(refs, currentAbsBeat, allTracks = []) {
  const launchable = [];
  for (const { track, pattern } of refs ?? []) {
    if (!track || !pattern) continue;
    const mode = patternLaunchMode(pattern);
    if (mode === LIVE_LAUNCH_MODES.HOLD) continue;
    launchable.push({ track, pattern, mode });
  }
  if (!launchable.length) return { queued: 0, skippedPlaying: 0, launchBeat: null };

  const scenePatternIds = new Set(launchable.map(({ pattern }) => pattern.id));
  const tracks = allTracks.length ? allTracks : [...new Set(launchable.map(({ track }) => track))];

  const launchBeat = sceneSwitchBeat(currentAbsBeat, tracks);

  for (const track of tracks) {
    cutNonSceneOnTrack(track, scenePatternIds, launchBeat);
  }

  // Multiple patterns on the same track in one scene must layer — otherwise
  // each cutOthers commit would wipe the previous clip at the shared boundary.
  const countByTrack = new Map();
  for (const { track } of launchable) {
    countByTrack.set(track, (countByTrack.get(track) ?? 0) + 1);
  }

  let queued = 0;
  for (const { track, pattern } of launchable) {
    const cutOthers =
      (countByTrack.get(track) ?? 0) > 1 ? false : patternCutsOthers(pattern);
    // Shared scene boundary; restartFromStart so every member begins at beat 0.
    queuePendingLaunch(track, pattern.id, launchBeat, cutOthers, { restartFromStart: true });
    queued += 1;
  }
  return { queued, skippedPlaying: 0, launchBeat };
}

/**
 * Arm every Loop in a scene immediately (transport stopped), silencing every
 * track first so nothing outside the scene is armed when Play starts.
 * One Shots are left for the caller to queue after Play starts.
 *
 * @param {{ track: object, pattern: object }[]} refs
 * @param {object[]} [allTracks]
 * @param {{ originBeat?: number|null }} [opts] absolute beat for pattern beat 0
 *   (so later scene switches can wait on each clip's true loop end)
 * @returns {{ loops: { track: object, pattern: object }[], oneShots: { track: object, pattern: object }[] }}
 */
export function armSceneLoops(refs, allTracks = [], { originBeat = null } = {}) {
  const loops = [];
  const oneShots = [];
  for (const { track, pattern } of refs ?? []) {
    if (!track || !pattern) continue;
    const mode = patternLaunchMode(pattern);
    if (mode === LIVE_LAUNCH_MODES.HOLD) continue;
    if (mode === LIVE_LAUNCH_MODES.ONE_SHOT) {
      oneShots.push({ track, pattern });
      continue;
    }
    loops.push({ track, pattern });
  }

  // Exclusive arm: clear every track, then put only scene Loops back.
  for (const track of allTracks) {
    track.liveLaunches = [];
    track.pendingLaunches = [];
  }

  const launchOpts = originBeat != null ? { startBeat: originBeat } : {};
  const countByTrack = new Map();
  for (const { track } of loops) {
    countByTrack.set(track, (countByTrack.get(track) ?? 0) + 1);
  }
  for (const { track, pattern } of loops) {
    if ((countByTrack.get(track) ?? 0) > 1) {
      if (track.liveLaunches == null) track.liveLaunches = [];
      removeLaunch(track, pattern.id);
      track.liveLaunches.push(createLiveLaunch(pattern.id, launchOpts));
      track.pendingLaunches = [];
    } else {
      const cutOthers = patternCutsOthers(pattern);
      if (cutOthers) {
        track.liveLaunches = [createLiveLaunch(pattern.id, launchOpts)];
      } else {
        materializeFollowActive(track);
        if (track.liveLaunches == null) track.liveLaunches = [];
        removeLaunch(track, pattern.id);
        track.liveLaunches.push(createLiveLaunch(pattern.id, launchOpts));
      }
      track.pendingLaunches = [];
    }
  }
  return { loops, oneShots };
}
