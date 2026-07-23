<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      @mousedown.self="emit('close')"
    >
      <div
        class="w-full max-w-lg bg-panel border border-line rounded-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
        role="dialog"
        :aria-labelledby="titleId"
        @mousedown.stop
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-line flex-shrink-0">
          <div class="min-w-0">
            <h2 :id="titleId" class="text-sm font-semibold truncate">
              Samples — {{ trackName }}
            </h2>
            <p class="text-[10px] text-muted-dim mt-0.5 leading-snug">
              Assign audio to keyboard ranges. One sample defaults to the full keyboard (C-2–G8);
              notes play pitch-shifted from each zone’s root key.
            </p>
          </div>
          <button
            type="button"
            class="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-white hover:bg-surface-hover flex-shrink-0"
            title="Close"
            @click="emit('close')"
          >
            ×
          </button>
        </div>

        <div class="px-4 py-3 space-y-3 overflow-y-auto flex-1 min-h-0">
          <div
            v-for="zone in zones"
            :key="zone.id"
            class="rounded-md border border-line bg-surface/40 p-3"
            :class="[
              zone.minimized ? 'space-y-0' : 'space-y-2.5',
              dragOverZoneId === zone.id ? 'ring-1 ring-accent/60 bg-accent/10' : '',
            ]"
            @dragenter.prevent="onZoneDragOver(zone.id, $event)"
            @dragover.prevent="onZoneDragOver(zone.id, $event)"
            @dragleave="onZoneDragLeave(zone.id, $event)"
            @drop.prevent="onZoneDrop(zone.id, $event)"
          >
            <!-- Compact header: always visible (title + range when minimized). -->
            <div class="flex items-center gap-2 min-w-0">
              <button
                type="button"
                class="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white hover:bg-surface-hover flex-shrink-0"
                :title="zone.minimized ? 'Expand zone' : 'Minimize zone'"
                @click="emit('update-zone', zone.id, { minimized: !zone.minimized })"
              >
                <span class="text-[10px] leading-none select-none" aria-hidden="true">
                  {{ zone.minimized ? '▸' : '▾' }}
                </span>
              </button>

              <template v-if="zone.minimized">
                <button
                  type="button"
                  class="flex-1 min-w-0 flex items-center gap-2 text-left rounded px-1 py-0.5 hover:bg-surface-hover/60"
                  :title="`${zone.name} — click to expand`"
                  @click="emit('update-zone', zone.id, { minimized: false })"
                >
                  <span class="text-xs truncate font-medium">{{ zone.name }}</span>
                  <span class="text-[10px] text-muted-dim truncate flex-shrink-0">
                    {{ rangeLabel(zone) }}
                  </span>
                </button>
              </template>
              <template v-else>
                <input
                  type="text"
                  class="flex-1 min-w-0 text-xs py-1 px-2 bg-surface border border-line-light rounded outline-none focus:border-accent"
                  :value="zone.name"
                  title="Zone name"
                  @change="onNameChange(zone.id, $event.target.value)"
                />
              </template>

              <button
                type="button"
                class="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-white hover:bg-surface-hover flex-shrink-0"
                :title="zone.muted ? 'Unmute zone' : 'Mute zone'"
                @click="emit('update-zone', zone.id, { muted: !zone.muted })"
              >
                <span
                  class="w-2 h-2 rounded-full ring-1"
                  :class="
                    zone.muted
                      ? 'bg-[#1a2420] ring-line/50'
                      : 'bg-[#4ade80] ring-[#4ade80]/50'
                  "
                />
              </button>
              <button
                type="button"
                class="px-2 py-1 rounded text-[10px] text-muted hover:text-white hover:bg-surface-hover flex-shrink-0"
                title="Preview at root note"
                :disabled="!zone.fileName"
                @click="preview(zone)"
              >
                ▶
              </button>
              <button
                v-if="zones.length > 1 && !zone.minimized"
                type="button"
                class="px-2 py-1 rounded text-[10px] text-red-400 hover:text-red-300 hover:bg-surface-hover flex-shrink-0"
                title="Remove zone"
                @click="emit('remove-zone', zone.id)"
              >
                ✕
              </button>
            </div>

            <template v-if="!zone.minimized">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="px-2.5 py-1.5 rounded text-xs bg-accent text-white hover:bg-accent-dim"
                  @click="pickFile(zone.id)"
                >
                  {{ zone.fileName ? 'Replace…' : 'Load sample…' }}
                </button>
                <button
                  v-if="zone.fileName"
                  type="button"
                  class="px-2.5 py-1.5 rounded text-xs text-red-400 hover:text-red-300 hover:bg-surface-hover"
                  @click="emit('clear-sample', zone.id)"
                >
                  Clear
                </button>
                <span
                  class="text-[10px] text-muted-dim truncate min-w-0 flex-1"
                  :title="zone.fileName || 'No sample loaded'"
                >
                  {{ zone.fileName || 'Drop an audio file here' }}
                </span>
              </div>

              <div class="grid grid-cols-3 gap-2">
                <label class="block min-w-0">
                  <span class="text-[9px] uppercase tracking-wider text-muted-dim block mb-1">Low</span>
                  <select
                    class="w-full text-xs py-1 px-1 bg-surface border border-line-light rounded"
                    :value="zone.lowNote"
                    @change="onRangeChange(zone, 'lowNote', $event.target.value)"
                  >
                    <option v-for="p in midiNotes" :key="`l-${zone.id}-${p}`" :value="p">
                      {{ noteLabel(p) }}
                    </option>
                  </select>
                </label>
                <label class="block min-w-0">
                  <span class="text-[9px] uppercase tracking-wider text-muted-dim block mb-1">High</span>
                  <select
                    class="w-full text-xs py-1 px-1 bg-surface border border-line-light rounded"
                    :value="zone.highNote"
                    @change="onRangeChange(zone, 'highNote', $event.target.value)"
                  >
                    <option v-for="p in midiNotes" :key="`h-${zone.id}-${p}`" :value="p">
                      {{ noteLabel(p) }}
                    </option>
                  </select>
                </label>
                <label class="block min-w-0">
                  <span class="text-[9px] uppercase tracking-wider text-muted-dim block mb-1">Root</span>
                  <select
                    class="w-full text-xs py-1 px-1 bg-surface border border-line-light rounded"
                    :value="zone.rootNote"
                    @change="emit('update-zone', zone.id, { rootNote: Number($event.target.value) })"
                  >
                    <option v-for="p in midiNotes" :key="`r-${zone.id}-${p}`" :value="p">
                      {{ noteLabel(p) }}
                    </option>
                  </select>
                </label>
              </div>

              <label class="block">
                <span class="text-[9px] uppercase tracking-wider text-muted-dim block mb-1">
                  Volume — {{ Math.round((zone.volume ?? 1) * 100) }}%
                </span>
                <VolumeSlider
                  wide
                  class="w-full"
                  :model-value="zone.volume ?? 1"
                  :title="`${zone.name} volume`"
                  @update:model-value="(v) => emit('update-zone', zone.id, { volume: v })"
                />
              </label>

              <div>
                <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
                  Pitch — {{ pitchLabel(zone) }}
                </label>
                <input
                  type="range"
                  min="-24"
                  max="24"
                  step="1"
                  :value="zone.pitch ?? 0"
                  class="w-full accent-accent"
                  @input="emit('update-zone', zone.id, { pitch: Number($event.target.value) })"
                />
              </div>

              <div class="border-t border-line pt-2.5 space-y-2">
                <div>
                  <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
                    Gain — {{ Math.round((zone.gain ?? 1) * 100) }}%
                  </label>
                  <input
                    type="range"
                    :min="PAD_GAIN_MIN"
                    :max="PAD_GAIN_MAX"
                    step="0.01"
                    :value="zone.gain ?? PAD_GAIN_DEFAULT"
                    class="w-full accent-accent"
                    @input="emit('update-zone', zone.id, { gain: Number($event.target.value) })"
                  />
                </div>

                <div>
                  <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
                    Distortion — {{ Math.round((zone.distortion ?? 0) * 100) }}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    :value="zone.distortion ?? 0"
                    class="w-full accent-accent"
                    @input="emit('update-zone', zone.id, { distortion: Number($event.target.value) })"
                  />
                </div>

                <div>
                  <div class="flex items-center justify-between gap-2 mb-0.5">
                    <label class="text-[9px] uppercase tracking-wider text-muted-dim">
                      Reverb — {{ Math.round((zone.reverb ?? 0) * 100) }}%
                    </label>
                    <button
                      type="button"
                      class="px-1.5 py-0.5 rounded text-[9px] ring-1"
                      :class="
                        (zone.reverb ?? 0) > 0
                          ? 'bg-accent/25 ring-accent text-white'
                          : 'bg-surface-hover ring-line-light text-muted hover:text-white'
                      "
                      @click="
                        emit('update-zone', zone.id, {
                          reverb: (zone.reverb ?? 0) > 0 ? 0 : 0.35,
                        })
                      "
                    >
                      {{ (zone.reverb ?? 0) > 0 ? 'On' : 'Off' }}
                    </button>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    :value="zone.reverb ?? 0"
                    class="w-full accent-accent"
                    @input="emit('update-zone', zone.id, { reverb: Number($event.target.value) })"
                  />
                </div>

                <div>
                  <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
                    Decay — {{ decayLabel(zone) }}
                  </label>
                  <input
                    type="range"
                    :min="REVERB_DECAY_MIN"
                    :max="REVERB_DECAY_MAX"
                    step="0.05"
                    :value="zone.reverbDecay ?? REVERB_DECAY_DEFAULT"
                    class="w-full accent-accent"
                    @input="emit('update-zone', zone.id, { reverbDecay: Number($event.target.value) })"
                  />
                </div>

                <DelayControls
                  class="border-t border-line pt-2"
                  :model="zone"
                  @update="(changes) => emit('update-zone', zone.id, changes)"
                />
              </div>
            </template>
          </div>
        </div>

        <div class="flex items-center gap-2 px-4 py-3 border-t border-line bg-surface/40 flex-shrink-0">
          <button
            type="button"
            class="px-3 py-1.5 rounded text-xs text-muted hover:text-white hover:bg-surface-hover"
            title="Add another keyboard range"
            @click="emit('add-zone')"
          >
            + Zone
          </button>
          <button
            type="button"
            class="ml-auto px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent-dim"
            @click="emit('close')"
          >
            Done
          </button>
        </div>

        <input
          ref="fileInputRef"
          type="file"
          accept="audio/*,.aif,.aiff,.aifc,.wav,.caf,.flac,.mp3,.m4a,.aac,.ogg"
          class="hidden"
          @change="onFileChosen"
        />
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue';
import {
  noteName,
  REVERB_DECAY_MIN,
  REVERB_DECAY_MAX,
  REVERB_DECAY_DEFAULT,
  PAD_GAIN_MIN,
  PAD_GAIN_MAX,
  PAD_GAIN_DEFAULT,
} from '../models/project.js';
import { playSample, resumeSamplerAudio, hasSample } from '../engine/sampler.js';
import { zonePlaybackOpts } from '../engine/sampleZones.js';
import { audioFileFromDataTransfer, acceptFileDrag } from '../utils/audioFile.js';
import VolumeSlider from './VolumeSlider.vue';
import DelayControls from './DelayControls.vue';

const PREVIEW_VELOCITY = 100;

const props = defineProps({
  trackName: { type: String, default: 'Sampler' },
  zones: { type: Array, required: true },
  trackVolume: { type: Number, default: 1 },
});

const emit = defineEmits([
  'close',
  'update-zone',
  'add-zone',
  'remove-zone',
  'load-sample',
  'clear-sample',
]);

const titleId = `sample-zone-editor-${Math.random().toString(36).slice(2, 9)}`;
const fileInputRef = ref(null);
const pendingZoneId = ref(null);
const dragOverZoneId = ref(null);

const midiNotes = Array.from({ length: 128 }, (_, i) => i);

function noteLabel(pitch) {
  return `${noteName(pitch)} (${pitch})`;
}

function rangeLabel(zone) {
  return `${noteName(zone.lowNote)} – ${noteName(zone.highNote)}`;
}

function pitchLabel(zone) {
  const p = zone.pitch ?? 0;
  if (p === 0) return 'Original';
  return p > 0 ? `+${p} st` : `${p} st`;
}

function decayLabel(zone) {
  const sec = zone.reverbDecay ?? REVERB_DECAY_DEFAULT;
  return sec >= 1 ? `${sec.toFixed(1)}s` : `${Math.round(sec * 1000)}ms`;
}

function onNameChange(zoneId, name) {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return;
  emit('update-zone', zoneId, { name: trimmed });
}

function onRangeChange(zone, field, raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return;
  const changes = { [field]: value };
  // Keep the inclusive range ordered when the user picks a crossed pair.
  if (field === 'lowNote' && value > zone.highNote) changes.highNote = value;
  if (field === 'highNote' && value < zone.lowNote) changes.lowNote = value;
  emit('update-zone', zone.id, changes);
}

function pickFile(zoneId) {
  pendingZoneId.value = zoneId;
  fileInputRef.value?.click();
}

function onFileChosen(e) {
  const file = e.target.files?.[0];
  const zoneId = pendingZoneId.value;
  e.target.value = '';
  pendingZoneId.value = null;
  if (file && zoneId) emit('load-sample', zoneId, file);
}

function onZoneDragOver(zoneId, e) {
  if (!acceptFileDrag(e)) return;
  dragOverZoneId.value = zoneId;
}

function onZoneDragLeave(zoneId, e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    if (dragOverZoneId.value === zoneId) dragOverZoneId.value = null;
  }
}

function onZoneDrop(zoneId, e) {
  dragOverZoneId.value = null;
  const file = audioFileFromDataTransfer(e.dataTransfer);
  if (file) emit('load-sample', zoneId, file);
}

function preview(zone) {
  if (!hasSample(zone.id)) return;
  resumeSamplerAudio();
  const gainMul = (zone.volume ?? 1) * (props.trackVolume ?? 1);
  playSample(zone.id, PREVIEW_VELOCITY, 0, gainMul, zonePlaybackOpts(zone, zone.rootNote));
}
</script>
