import { ref, onMounted, onUnmounted } from 'vue';

const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';

/**
 * True on touch-first devices (tablets, phones) where hover-based UI and
 * fine pointer targets are unreliable. Used to show tablet-specific editing
 * affordances (e.g. the floating tool FAB) without affecting desktop mice.
 */
export function useCoarsePointer() {
  const isCoarsePointer = ref(false);
  let mql = null;

  function sync() {
    isCoarsePointer.value = !!mql?.matches;
  }

  onMounted(() => {
    mql = window.matchMedia(COARSE_POINTER_QUERY);
    sync();
    mql.addEventListener('change', sync);
  });

  onUnmounted(() => {
    mql?.removeEventListener('change', sync);
  });

  return { isCoarsePointer };
}
