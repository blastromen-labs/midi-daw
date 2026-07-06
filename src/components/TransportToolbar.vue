<template>
  <ToolbarField v-if="syncMode !== 'external'">
    <button
      class="daw-toolbar-icon-btn rounded-full text-xs font-bold transition-all"
      :class="playing ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-accent hover:bg-accent-dim text-white'"
      :title="playing ? 'Stop' : 'Play'"
      @click="$emit('toggle-play')"
    >
      {{ playing ? '■' : '▶' }}
    </button>
  </ToolbarField>
  <ToolbarField v-if="syncMode !== 'external'" label="BPM">
    <input
      type="number"
      :value="bpm"
      min="40"
      max="300"
      class="toolbar-compact w-[2.5rem] bg-surface border border-line-light rounded text-xs text-center flex-shrink-0"
      title="BPM"
      @change="(e) => $emit('bpm-change', Number(e.target.value))"
    />
  </ToolbarField>
  <ToolbarField v-else label="Sync">
    <span
      class="w-1.5 h-1.5 rounded-full flex-shrink-0"
      :class="playing ? 'bg-green-500 animate-pulse' : 'bg-surface-hover'"
      :title="!clockInputId ? 'External sync — choose input in Settings' : playing ? 'Synced — playing' : 'Waiting for clock…'"
    ></span>
  </ToolbarField>
</template>

<script setup>
import ToolbarField from './ToolbarField.vue';

defineProps({
  playing: { type: Boolean, default: false },
  bpm: { type: Number, default: 120 },
  syncMode: { type: String, default: 'internal' },
  clockInputId: { type: String, default: '' },
});

defineEmits(['toggle-play', 'bpm-change']);
</script>
