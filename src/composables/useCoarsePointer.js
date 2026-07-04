import { ref, onMounted, onUnmounted } from 'vue';

const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';

/**
 * True on touch-first devices (tablets, phones) where hover-based UI and
 * fine pointer targets are unreliable. Used for default tool-menu visibility
 * on touch-first devices; the menu itself is available on all screen types.
 */
export function useCoarsePointer() {
  let mql = typeof window !== 'undefined' ? window.matchMedia(COARSE_POINTER_QUERY) : null;
  const isCoarsePointer = ref(!!mql?.matches);

  function sync() {
    isCoarsePointer.value = !!mql?.matches;
  }

  onMounted(() => {
    if (!mql) mql = window.matchMedia(COARSE_POINTER_QUERY);
    sync();
    mql.addEventListener('change', sync);
  });

  onUnmounted(() => {
    mql?.removeEventListener('change', sync);
  });

  return { isCoarsePointer };
}
