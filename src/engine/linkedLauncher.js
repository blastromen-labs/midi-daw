// Cross-track linked-pattern launch fan-out. Live clip clicks resolve intent
// from the *primary* pattern, then apply that same start/stop/cancel to every
// pattern in its bidirectional link group (including hidden clips).
import {
  getLinkedPatternGroup,
  isPatternPlaying,
  isPatternQueued,
  isPatternStopQueued,
  LIVE_LAUNCH_MODES,
  patternLaunchMode,
} from '../models/project.js';
import {
  cancelPendingPattern,
  cancelQueuedStop,
  holdPatternDown,
  holdPatternUp,
  launchPatternImmediately,
  queuePatternOneShot,
  queuePatternStart,
  queuePatternStop,
  stopPatternImmediately,
} from './liveLauncher.js';

/**
 * What a Live clip click on this pattern means right now.
 * @returns {'stop-immediate'|'launch-immediate'|'oneshot-start'|'cancel-pending'|'cancel-stop'|'queue-stop'|'queue-start'}
 */
export function resolveClipIntent(track, pattern, transportPlaying) {
  const mode = patternLaunchMode(pattern);
  const isOneShot = mode === LIVE_LAUNCH_MODES.ONE_SHOT;
  const patternId = pattern.id;

  if (!transportPlaying) {
    if (isPatternPlaying(track, patternId)) return 'stop-immediate';
    if (isOneShot) return 'oneshot-start';
    return 'launch-immediate';
  }

  if (isPatternQueued(track, patternId)) return 'cancel-pending';

  if (isOneShot) return 'queue-start';

  if (isPatternPlaying(track, patternId) && isPatternStopQueued(track, patternId)) {
    return 'cancel-stop';
  }
  if (isPatternPlaying(track, patternId)) return 'queue-stop';
  return 'queue-start';
}

function isOneShotPattern(pattern) {
  return patternLaunchMode(pattern) === LIVE_LAUNCH_MODES.ONE_SHOT;
}

/**
 * Apply a resolved intent to one pattern. Start/stop mechanics respect that
 * pattern's own launch mode (Loop vs One Shot); cancel/stop only fire when
 * the target is actually in the matching state so out-of-sync links heal
 * toward the primary's intent instead of toggling the wrong way.
 */
export function applyClipIntent(track, pattern, intent, absBeat) {
  if (!track || !pattern) return;

  const patternId = pattern.id;
  const isOneShot = isOneShotPattern(pattern);

  switch (intent) {
    case 'stop-immediate':
      stopPatternImmediately(track, patternId);
      break;
    case 'cancel-pending':
      cancelPendingPattern(track, patternId);
      break;
    case 'cancel-stop':
      cancelQueuedStop(track, patternId);
      break;
    case 'queue-stop':
      if (isPatternQueued(track, patternId)) {
        cancelPendingPattern(track, patternId);
      } else if (isPatternPlaying(track, patternId)) {
        if (isOneShot) {
          // One Shots auto-stop; treat stop intent as an immediate cut.
          stopPatternImmediately(track, patternId);
        } else {
          queuePatternStop(track, patternId, absBeat);
        }
      }
      break;
    case 'queue-start':
      if (isPatternStopQueued(track, patternId)) {
        cancelQueuedStop(track, patternId);
      } else if (!isPatternPlaying(track, patternId) && !isPatternQueued(track, patternId)) {
        if (isOneShot) {
          queuePatternOneShot(track, patternId, absBeat);
        } else {
          queuePatternStart(track, patternId, absBeat);
        }
      }
      break;
    default:
      break;
  }
}

/**
 * Fan out a Live clip action across the primary pattern's link group.
 * `startPlayback` is called when the intent needs a running transport
 * (so One Shot abs-beat quantization is valid).
 *
 * @param {object[]} tracks
 * @param {string} primaryPatternId
 * @param {string} intent from resolveClipIntent
 * @param {{ startPlayback: () => void, getAbsBeat: () => number, transportPlaying: boolean }} opts
 */
export function runLinkedClipIntent(tracks, primaryPatternId, intent, opts) {
  const group = getLinkedPatternGroup(tracks, primaryPatternId);
  if (!group.length) return;

  if (intent === 'stop-immediate' || intent === 'cancel-pending' || intent === 'cancel-stop') {
    for (const { track, pattern } of group) {
      applyClipIntent(track, pattern, intent, 0);
    }
    return;
  }

  if (intent === 'launch-immediate') {
    // Arm Loops while stopped, then start transport, then queue One Shots
    // (they need a live abs beat for sync-grid quantization).
    for (const { track, pattern } of group) {
      if (!isOneShotPattern(pattern)) {
        launchPatternImmediately(track, pattern.id);
      }
    }
    if (!opts.transportPlaying) opts.startPlayback();
    const absBeat = opts.getAbsBeat();
    for (const { track, pattern } of group) {
      if (isOneShotPattern(pattern)) {
        queuePatternOneShot(track, pattern.id, absBeat);
      }
    }
    return;
  }

  if (intent === 'oneshot-start') {
    if (!opts.transportPlaying) opts.startPlayback();
    const absBeat = opts.getAbsBeat();
    for (const { track, pattern } of group) {
      if (isOneShotPattern(pattern)) {
        queuePatternOneShot(track, pattern.id, absBeat);
      } else {
        launchPatternImmediately(track, pattern.id);
      }
    }
    return;
  }

  // Playing-transport queue start/stop — shared abs beat so boundaries align.
  const absBeat = opts.getAbsBeat();
  for (const { track, pattern } of group) {
    applyClipIntent(track, pattern, intent, absBeat);
  }
}

/** Hold-press: hold-mode links use hold; Loop/One Shot links arm/launch. */
export function holdLinkedPatternsDown(tracks, primaryPatternId, absBeat) {
  for (const { track, pattern } of getLinkedPatternGroup(tracks, primaryPatternId)) {
    const mode = patternLaunchMode(pattern);
    if (mode === LIVE_LAUNCH_MODES.HOLD) {
      holdPatternDown(track, pattern.id, absBeat);
    } else if (mode === LIVE_LAUNCH_MODES.ONE_SHOT) {
      queuePatternOneShot(track, pattern.id, absBeat);
    } else {
      launchPatternImmediately(track, pattern.id);
    }
  }
}

/** Hold-release: drop holds and stop non-hold links in the same group. */
export function holdLinkedPatternsUp(tracks, primaryPatternId) {
  for (const { track, pattern } of getLinkedPatternGroup(tracks, primaryPatternId)) {
    if (patternLaunchMode(pattern) === LIVE_LAUNCH_MODES.HOLD) {
      holdPatternUp(track);
    } else {
      stopPatternImmediately(track, pattern.id);
    }
  }
}
