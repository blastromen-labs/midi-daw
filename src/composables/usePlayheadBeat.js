import { ref, onMounted, onUnmounted } from 'vue';
import { transport } from '../engine/clock.js';

/**
 * Samples the transport's current beat via requestAnimationFrame instead of
 * listening to the audio scheduler's tick events. This keeps UI/animation work
 * fully decoupled from the timer that drives MIDI scheduling, so canvas redraws
 * or DOM updates never compete with (and delay) audio-critical scheduling work.
 */
export function usePlayheadBeat() {
  const beat = ref(transport.getCurrentBeat());
  let rafId = null;

  function tick() {
    beat.value = transport.getCurrentBeat();
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
