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
    <div class="flex items-center gap-px">
      <input
        type="number"
        :value="bpm"
        :min="MIN_BPM"
        :max="MAX_BPM"
        class="toolbar-compact w-[2.5rem] bg-surface border border-line-light rounded text-xs text-center flex-shrink-0"
        title="BPM"
        @change="(e) => $emit('bpm-change', Number(e.target.value))"
      />
      <div class="flex flex-col self-stretch w-3.5">
        <button
          type="button"
          class="flex-1 min-h-0 flex items-center justify-center rounded-sm text-[6px] leading-none text-muted hover:text-white hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none"
          title="Increase BPM"
          :disabled="bpm >= MAX_BPM"
          @click="nudgeBpm(1)"
        >
          ▲
        </button>
        <button
          type="button"
          class="flex-1 min-h-0 flex items-center justify-center rounded-sm text-[6px] leading-none text-muted hover:text-white hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none"
          title="Decrease BPM"
          :disabled="bpm <= MIN_BPM"
          @click="nudgeBpm(-1)"
        >
          ▼
        </button>
      </div>
    </div>
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

const MIN_BPM = 40;
const MAX_BPM = 300;

const props = defineProps({
  playing: { type: Boolean, default: false },
  bpm: { type: Number, default: 120 },
  syncMode: { type: String, default: 'internal' },
  clockInputId: { type: String, default: '' },
});

const emit = defineEmits(['toggle-play', 'bpm-change']);

function nudgeBpm(delta) {
  const next = Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(props.bpm + delta)));
  if (next !== props.bpm) emit('bpm-change', next);
}
</script>
