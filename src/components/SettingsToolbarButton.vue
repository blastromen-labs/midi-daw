<template>
  <div class="settings-toolbar-button flex-shrink-0 flex flex-col items-center gap-px">
    <button
      type="button"
      class="daw-toolbar-icon-btn text-muted hover:text-white bg-surface-hover hover:bg-surface-active"
      title="Settings"
      @click="open = true"
    >
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-4 h-4" aria-hidden="true">
        <path
          fill-rule="evenodd"
          d="M7.84 1.804A1 1 0 0 1 8.82 1h2.36a1 1 0 0 1 .98.804l.331 1.652a6.993 6.993 0 0 1 1.929 1.115l1.598-.54a1 1 0 0 1 1.186.447l1.18 2.044a1 1 0 0 1-.205 1.251l-1.267 1.113a7.047 7.047 0 0 1 0 2.228l1.267 1.113a1 1 0 0 1 .206 1.25l-1.18 2.045a1 1 0 0 1-1.187.447l-1.598-.54a6.993 6.993 0 0 1-1.929 1.115l-.33 1.652a1 1 0 0 1-.98.804H8.82a1 1 0 0 1-.98-.804l-.331-1.652a6.993 6.993 0 0 1-1.929-1.115l-1.598.54a1 1 0 0 1-1.186-.447l-1.18-2.044a1 1 0 0 1 .205-1.251l1.267-1.113a7.047 7.047 0 0 1 0-2.228L2.14 6.993a1 1 0 0 1-.206-1.25l1.18-2.045a1 1 0 0 1 1.187-.447l1.598.54A6.993 6.993 0 0 1 7.928 1.804l.331-1.652ZM10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"
          clip-rule="evenodd"
        />
      </svg>
    </button>
    <span class="text-[7px] leading-none invisible select-none" aria-hidden="true">.</span>

    <GlobalSettingsModal
      v-if="open"
      :sync-mode="syncMode"
      :clock-input-id="clockInputId"
      :send-midi-clock="sendMidiClock"
      :clock-output-id="clockOutputId"
      :compact-navbar="compactNavbar"
      :midi-inputs="midiInputs"
      :midi-outputs="midiOutputs"
      @close="open = false"
      @sync-mode-change="(v) => emit('sync-mode-change', v)"
      @clock-input-change="(v) => emit('clock-input-change', v)"
      @toggle-clock="emit('toggle-clock')"
      @clock-output-change="(v) => emit('clock-output-change', v)"
      @compact-navbar-change="(v) => emit('compact-navbar-change', v)"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import GlobalSettingsModal from './GlobalSettingsModal.vue';

defineProps({
  syncMode: { type: String, default: 'internal' },
  clockInputId: { type: String, default: '' },
  sendMidiClock: Boolean,
  clockOutputId: { type: String, default: '' },
  compactNavbar: Boolean,
  midiInputs: { type: Array, default: () => [] },
  midiOutputs: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'sync-mode-change',
  'clock-input-change',
  'toggle-clock',
  'clock-output-change',
  'compact-navbar-change',
]);

const open = ref(false);

function onKeyDown(e) {
  if (open.value && e.key === 'Escape') {
    open.value = false;
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown));
onUnmounted(() => window.removeEventListener('keydown', onKeyDown));
</script>
