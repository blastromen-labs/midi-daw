<template>
  <ToolbarField label="View" :title="buttonTitle">
    <button
      type="button"
      class="daw-toolbar-icon-btn bg-surface-hover text-muted hover:text-white hover:bg-surface-active transition-colors"
      :title="buttonTitle"
      :aria-label="buttonTitle"
      @click="toggle"
    >
      <!-- Pattern icon — shown while in Live mode -->
      <svg
        v-if="mode === 'live'"
        viewBox="0 0 24 24"
        class="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M4 7h16M4 12h16M4 17h10" stroke-linecap="round" />
        <rect x="14" y="14" width="6" height="4" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
      <!-- Live icon — shown while in Pattern mode -->
      <svg
        v-else
        viewBox="0 0 24 24"
        class="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <rect x="4" y="4" width="7" height="7" rx="1" />
        <rect x="13" y="4" width="7" height="7" rx="1" />
        <rect x="4" y="13" width="7" height="7" rx="1" />
        <rect x="13" y="13" width="7" height="7" rx="1" />
      </svg>
    </button>
  </ToolbarField>
</template>

<script setup>
import { computed } from 'vue';
import ToolbarField from './ToolbarField.vue';

const props = defineProps({
  mode: {
    type: String,
    required: true,
    validator: (v) => v === 'roll' || v === 'live',
  },
});

const emit = defineEmits(['view-mode-change']);

const buttonTitle = computed(() =>
  props.mode === 'roll' ? 'Switch to Live (Tab)' : 'Switch to Pattern (Tab)',
);

function toggle() {
  emit('view-mode-change', props.mode === 'roll' ? 'live' : 'roll');
}
</script>
