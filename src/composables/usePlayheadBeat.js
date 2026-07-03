import { ref, onMounted, onUnmounted } from 'vue';
import { getActiveClock } from '../engine/activeClock.js';

/**
 * Samples the active clock's current beat via requestAnimationFrame instead of
 * listening to the audio scheduler's tick events. This keeps UI/animation work
 * fully decoupled from the timer that drives MIDI scheduling, so canvas redraws
 * or DOM updates never compete with (and delay) audio-critical scheduling work.
 * Automatically follows whichever clock (internal master or external MIDI
 * follower) is active, since it reads through getActiveClock() every frame.
 */
export function usePlayheadBeat() {
  const beat = ref(getActiveClock().getCurrentBeat());
  let rafId = null;

  function tick() {
    beat.value = getActiveClock().getCurrentBeat();
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
 * Same idea, but samples the active clock's current bpm — useful for
 * displaying live-detected tempo while following an external MIDI clock.
 */
export function useActiveClockBpm() {
  const bpm = ref(getActiveClock().bpm);
  let rafId = null;

  function tick() {
    bpm.value = getActiveClock().bpm;
    rafId = requestAnimationFrame(tick);
  }

  onMounted(() => {
    rafId = requestAnimationFrame(tick);
  });

  onUnmounted(() => {
    if (rafId) cancelAnimationFrame(rafId);
  });

  return bpm;
}
