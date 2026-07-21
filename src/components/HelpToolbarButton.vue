<template>
  <div class="help-toolbar-button flex-shrink-0 flex flex-col items-center gap-px">
    <button
      type="button"
      class="daw-toolbar-icon-btn text-muted hover:text-white bg-surface-hover hover:bg-surface-active"
      title="Shortcuts help"
      aria-label="Shortcuts help"
      @click="open = true"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4" aria-hidden="true">
        <path
          fill-rule="evenodd"
          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0ZM8.94 6.94a.75.75 0 1 1-1.061-1.061 3 3 0 1 1 2.871 5.026v.345a.75.75 0 0 1-1.5 0v-.5c0-.72.57-1.172 1.081-1.287A1.5 1.5 0 1 0 8.94 6.94ZM10 15.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
    <span class="text-[7px] leading-none invisible select-none" aria-hidden="true">.</span>

    <ShortcutsHelpModal v-if="open" @close="open = false" />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import ShortcutsHelpModal from './ShortcutsHelpModal.vue';

const open = ref(false);

function onKeyDown(e) {
  if (open.value && e.key === 'Escape') {
    open.value = false;
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown));
onUnmounted(() => window.removeEventListener('keydown', onKeyDown));
</script>
