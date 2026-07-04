<template>
  <div class="drum-pad-list flex flex-col w-full">
    <div
      v-for="pad in pads"
      :key="pad.id"
      class="pad-row flex items-center gap-1 px-1 border-b border-line/60 group"
      :style="{ height: rowHeight + 'px' }"
    >
      <button
        class="w-2.5 h-2.5 rounded-sm flex-shrink-0"
        :style="{ background: pad.color }"
        title="Click to preview sample"
        @mousedown.prevent="preview(pad)"
        @touchstart.prevent="preview(pad)"
      ></button>

      <input
        :value="pad.name"
        class="pad-name flex-1 min-w-0 bg-transparent text-[11px] leading-tight truncate outline-none focus:bg-surface-hover rounded px-0.5"
        @change="(e) => $emit('rename-pad', pad.id, e.target.value)"
      />

      <VolumeSlider
        :model-value="pad.volume ?? 1"
        :title="`${pad.name} volume`"
        @update:model-value="(v) => $emit('update-pad', pad.id, { volume: v })"
      />

      <button
        class="px-1 py-0.5 rounded text-[9px] flex-shrink-0"
        :class="pad.fileName ? 'bg-surface-hover text-muted hover:bg-surface-active' : 'bg-accent/80 text-white hover:bg-accent'"
        :title="pad.fileName || 'Load a sample from your computer'"
        @click="browse(pad)"
      >
        {{ pad.fileName ? '···' : 'Load' }}
      </button>

      <button
        v-if="pad.fileName"
        class="opacity-0 group-hover:opacity-100 text-[10px] text-muted-dim hover:text-white flex-shrink-0"
        title="Clear sample"
        @click="$emit('clear-sample', pad.id)"
      >
        ✕
      </button>

      <button
        v-if="pads.length > 1"
        class="opacity-0 group-hover:opacity-100 text-[10px] text-muted-dim hover:text-red-400 flex-shrink-0"
        title="Remove pad"
        @click="$emit('remove-pad', pad.id)"
      >
        🗑
      </button>
    </div>

    <button
      class="w-full text-[10px] text-muted hover:text-white hover:bg-surface-hover py-1"
      title="Add another pad row"
      @click="$emit('add-pad')"
    >
      + Pad
    </button>

    <input ref="fileInput" type="file" accept="audio/*" class="hidden" @change="onFileChosen" />
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { playSample, resumeSamplerAudio } from '../engine/sampler.js';
import VolumeSlider from './VolumeSlider.vue';

const PREVIEW_VELOCITY = 100;

const props = defineProps({
  pads: { type: Array, required: true },
  rowHeight: { type: Number, required: true },
  trackVolume: { type: Number, default: 1 },
});

const emit = defineEmits(['load-sample', 'clear-sample', 'add-pad', 'remove-pad', 'rename-pad', 'update-pad']);

const fileInput = ref(null);
const pendingPadId = ref(null);

function preview(pad) {
  resumeSamplerAudio();
  const gainMul = (pad.volume ?? 1) * (props.trackVolume ?? 1);
  playSample(pad.id, PREVIEW_VELOCITY, 0, gainMul);
}

function browse(pad) {
  pendingPadId.value = pad.id;
  fileInput.value.click();
}

function onFileChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file || !pendingPadId.value) return;
  emit('load-sample', pendingPadId.value, file);
  pendingPadId.value = null;
}
</script>

<style scoped>
.pad-name::-webkit-scrollbar {
  display: none;
}
</style>
