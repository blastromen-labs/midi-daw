<template>
  <div
    ref="listRef"
    class="drum-pad-list flex flex-col w-full"
    @dragenter.capture.prevent="onListDragOver"
    @dragover.capture.prevent="onListDragOver"
    @dragleave.capture="onListDragLeave"
    @drop.capture.prevent="onListDrop"
  >
    <div
      v-for="pad in pads"
      :key="pad.id"
      class="pad-row flex items-start gap-1 px-1 py-1 border-b border-line/60 group transition-colors pointer-events-none"
      :class="dragOverPadId === pad.id ? 'bg-accent/15 ring-1 ring-inset ring-accent/50' : ''"
      :style="{ height: rowHeight + 'px' }"
      :data-pad-id="pad.id"
    >
      <button
        type="button"
        class="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-line/60 pointer-events-auto"
        :style="{ background: pad.color }"
        title="Click to preview sample"
        @click.stop.prevent="preview(pad)"
      ></button>

      <div class="flex-1 min-w-0 flex flex-col justify-start gap-px pointer-events-none pt-px">
        <span class="text-[11px] leading-none truncate px-0.5">{{ pad.name }}</span>
        <span
          v-if="pad.fileName"
          class="text-[9px] leading-tight text-muted-dim truncate px-0.5"
          :title="pad.fileName"
        >{{ pad.fileName }}</span>
      </div>

      <button
        type="button"
        class="w-2 h-2 rounded-full flex-shrink-0 self-center pointer-events-auto ring-1 transition-all"
        :class="
          pad.muted
            ? 'bg-[#1a2420] ring-line/50'
            : 'bg-[#4ade80] ring-[#4ade80]/50 shadow-[0_0_5px_rgba(74,222,128,0.55)]'
        "
        :title="pad.muted ? 'Unmute pad' : 'Mute pad'"
        @click.stop="toggleMute(pad)"
      ></button>

      <VolumeSlider
        drum
        class="pointer-events-auto self-center"
        :model-value="pad.volume ?? 1"
        :title="`${pad.name} volume`"
        @update:model-value="(v) => $emit('update-pad', pad.id, { volume: v })"
      />

      <button
        type="button"
        class="px-2 py-1 rounded text-[10px] min-w-[2.25rem] min-h-[1.375rem] flex-shrink-0 self-center pointer-events-auto bg-surface-hover text-muted hover:text-white hover:bg-surface-active"
        title="Edit pad — name, color, sample"
        @click="openEditor(pad.id)"
      >
        Edit
      </button>
    </div>

    <button
      class="w-full text-[10px] text-muted hover:text-white hover:bg-surface-hover py-1 pointer-events-auto"
      title="Add another pad row"
      @click="$emit('add-pad')"
    >
      + Pad
    </button>

    <DrumPadEditorModal
      v-if="editingPad"
      :pad="editingPad"
      :all-pads="pads"
      :track-volume="trackVolume"
      :can-remove="pads.length > 1"
      @save="onEditorSave"
      @load-sample="onEditorLoadSample"
      @clear-sample="onEditorClearSample"
      @remove="onEditorRemove"
      @cancel="editingPadId = null"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import { playSample, resumeSamplerAudio } from '../engine/sampler.js';
import { padPlaybackOpts, previewTrackOpts } from '../engine/padPlayback.js';
import { audioFileFromDataTransfer, acceptFileDrag } from '../utils/audioFile.js';
import VolumeSlider from './VolumeSlider.vue';
import DrumPadEditorModal from './DrumPadEditorModal.vue';

const PREVIEW_VELOCITY = 100;

const props = defineProps({
  pads: { type: Array, required: true },
  rowHeight: { type: Number, required: true },
  trackVolume: { type: Number, default: 1 },
});

const emit = defineEmits(['load-sample', 'clear-sample', 'add-pad', 'remove-pad', 'rename-pad', 'update-pad']);

const listRef = ref(null);
const dragOverPadId = ref(null);
const editingPadId = ref(null);

const editingPad = computed(() => props.pads.find((p) => p.id === editingPadId.value) ?? null);

function padAtClientY(clientY) {
  const el = listRef.value;
  if (!el) return null;
  const y = clientY - el.getBoundingClientRect().top;
  const idx = Math.floor(y / props.rowHeight);
  if (idx < 0 || idx >= props.pads.length) return null;
  return props.pads[idx];
}

function onListDragOver(e) {
  if (!acceptFileDrag(e)) return;
  dragOverPadId.value = padAtClientY(e.clientY)?.id ?? null;
}

function onListDragLeave(e) {
  if (!listRef.value?.contains(e.relatedTarget)) dragOverPadId.value = null;
}

function onListDrop(e) {
  dragOverPadId.value = null;
  e.stopPropagation();
  const pad = padAtClientY(e.clientY);
  const file = audioFileFromDataTransfer(e.dataTransfer);
  if (!pad || !file) return;
  emit('load-sample', pad.id, file);
}

function openEditor(padId) {
  editingPadId.value = padId;
}

function onEditorSave(changes) {
  if (!editingPadId.value) return;
  const padId = editingPadId.value;
  emit('rename-pad', padId, changes.name);
  emit('update-pad', padId, {
    color: changes.color,
    volume: changes.volume,
    cutBySelf: changes.cutBySelf,
    cutByPads: changes.cutByPads,
    pitch: changes.pitch,
    sampleLength: changes.sampleLength,
    fadeOut: changes.fadeOut,
    reverb: changes.reverb,
    reverbDecay: changes.reverbDecay,
    gain: changes.gain,
    distortion: changes.distortion,
  });
  editingPadId.value = null;
}

function onEditorLoadSample(file) {
  if (!editingPadId.value) return;
  emit('load-sample', editingPadId.value, file);
}

function onEditorClearSample() {
  if (!editingPadId.value) return;
  emit('clear-sample', editingPadId.value);
}

function onEditorRemove() {
  if (!editingPadId.value) return;
  const padId = editingPadId.value;
  editingPadId.value = null;
  emit('remove-pad', padId);
}

function toggleMute(pad) {
  emit('update-pad', pad.id, { muted: !pad.muted });
}

function preview(pad) {
  if (pad.muted) return;
  resumeSamplerAudio();
  const gainMul = (pad.volume ?? 1) * (props.trackVolume ?? 1);
  const track = previewTrackOpts({ pads: props.pads });
  playSample(pad.id, PREVIEW_VELOCITY, 0, gainMul, padPlaybackOpts(pad, track));
}
</script>
