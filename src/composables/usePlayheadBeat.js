import { ref, onMounted, onUnmounted } from 'vue';
import { getActiveClock } from '../engine/activeClock.js';

// Shared rAF-sampling loop for both composables below — see the file-level
// comment on usePlayheadBeat for why this reads via requestAnimationFrame
// instead of a clock tick listener.
function useClockBeat(readBeat) {
  const beat = ref(readBeat());
  let rafId = null;

  function tick() {
    beat.value = readBeat();
    rafId = requestAnimationFrame(tick);
  }

  onMounted(() => {
    rafId = requestAnimationFrame(tick);
  });

  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  return beat;
}

/**
 * Samples the active clock's current beat via requestAnimationFrame instead of
 * listening to the audio scheduler's tick events. This keeps UI/animation work
 * fully decoupled from the timer that drives MIDI scheduling, so canvas redraws
 * or DOM updates never compete with (and delay) audio-critical scheduling work.
 * Automatically follows whichever clock (internal master or external MIDI
 * follower) is active, since it reads through getActiveClock() every frame.
 *
 * Wrapped to the transport's loop region — use for UI that shows position
 * within the currently looping timeline (e.g. the piano roll playhead).
 */
export function usePlayheadBeat() {
  return useClockBeat(() => getActiveClock().getCurrentBeat());
}

/**
 * Same rAF sampling as usePlayheadBeat, but unwrapped — an ever-increasing
 * beat count since the transport last started. Live mode uses this (mod a
 * pattern's own length) to render each clip's playback progress, since a
 * clip's phase is locked to the master bar grid rather than the transport's
 * loop region — see engine/liveLauncher.js for why.
 */
export function useAbsolutePlayheadBeat() {
  return useClockBeat(() => getActiveClock().getAbsoluteBeat());
}
