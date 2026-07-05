<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      @mousedown.self="emit('cancel')"
    >
      <div
        class="w-full max-w-sm bg-panel border border-line rounded-lg shadow-xl overflow-hidden"
        role="dialog"
        :aria-labelledby="titleId"
        @mousedown.stop
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-line">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-line/60" :style="{ background: draft.color }"></span>
            <h2 :id="titleId" class="text-sm font-semibold truncate">Edit pad</h2>
          </div>
          <button
            type="button"
            class="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-white hover:bg-surface-hover"
            title="Close"
            @click="emit('cancel')"
          >
            ×
          </button>
        </div>

        <div class="px-4 py-3 space-y-4">
          <section>
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Name</label>
            <input
              ref="nameInputRef"
              v-model="draft.name"
              type="text"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded outline-none focus:border-accent"
              @keydown.enter="submit"
            />
          </section>

          <section>
            <span class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Color</span>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="c in padColors"
                :key="c"
                type="button"
                class="w-4 h-4 rounded-sm ring-1 transition-shadow"
                :class="draft.color === c ? 'ring-white' : 'ring-transparent hover:ring-line-light'"
                :style="{ background: c }"
                :title="c"
                @click="draft.color = c"
              />
            </div>
          </section>

          <section class="border-t border-line pt-4">
            <span class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Sample</span>
            <p class="text-xs text-muted truncate mb-2" :title="sampleLabel">
              {{ sampleLabel }}
            </p>
            <div class="flex flex-wrap items-center gap-2">
              <button
                type="button"
                class="px-2.5 py-1.5 rounded text-xs bg-accent text-white hover:bg-accent-dim"
                @click="fileInputRef?.click()"
              >
                Choose file…
              </button>
              <button
                type="button"
                class="px-2.5 py-1.5 rounded text-xs bg-surface-hover text-muted hover:text-white hover:bg-surface-active"
                :disabled="!canPreview"
                @click="preview"
              >
                Preview
              </button>
              <button
                v-if="pad.fileName"
                type="button"
                class="px-2.5 py-1.5 rounded text-xs text-red-400 hover:text-red-300 hover:bg-surface-hover"
                @click="emit('clear-sample')"
              >
                Clear
              </button>
            </div>
            <p class="text-[10px] text-muted-dim mt-2">You can also drag and drop a file onto the pad row.</p>
            <input
              ref="fileInputRef"
              type="file"
              accept="audio/*,.aif,.aiff,.aifc,.wav,.caf,.flac,.mp3,.m4a,.aac,.ogg"
              class="hidden"
              @change="onFileChosen"
            />
          </section>

          <section class="border-t border-line pt-4">
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">
              Pad volume — {{ Math.round(draft.volume * 100) }}%
            </label>
            <VolumeSlider wide class="w-full" v-model="draft.volume" />
          </section>
        </div>

        <div class="flex items-center justify-between gap-2 px-4 py-3 border-t border-line bg-surface/40">
          <button
            v-if="canRemove"
            type="button"
            class="px-2 py-1.5 rounded text-xs text-red-400 hover:text-red-300 hover:bg-surface-hover"
            @click="emit('remove')"
          >
            Remove pad
          </button>
          <span v-else></span>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="px-3 py-1.5 rounded text-xs text-muted hover:text-white hover:bg-surface-hover"
              @click="emit('cancel')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent-dim"
              :disabled="!draft.name.trim()"
              @click="submit"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { DRUM_PAD_COLORS } from '../models/project.js';
import { playSample, resumeSamplerAudio, hasSample } from '../engine/sampler.js';
import VolumeSlider from './VolumeSlider.vue';

const PREVIEW_VELOCITY = 100;

const props = defineProps({
  pad: { type: Object, required: true },
  trackVolume: { type: Number, default: 1 },
  canRemove: { type: Boolean, default: false },
});

const emit = defineEmits(['save', 'load-sample', 'clear-sample', 'remove', 'cancel']);

const padColors = DRUM_PAD_COLORS;
const nameInputRef = ref(null);
const fileInputRef = ref(null);
const titleId = `drum-pad-editor-${Math.random().toString(36).slice(2, 9)}`;

const draft = reactive({
  name: '',
  color: padColors[0],
  volume: 1,
});

const sampleLabel = computed(() => props.pad.fileName || (hasSample(props.pad.id) ? 'Loaded sample' : 'No sample loaded'));
const canPreview = computed(() => hasSample(props.pad.id));

function syncFromPad() {
  draft.name = props.pad.name ?? '';
  draft.color = props.pad.color ?? padColors[0];
  draft.volume = props.pad.volume ?? 1;
}

watch(() => props.pad, syncFromPad, { immediate: true, deep: true });

function submit() {
  const name = draft.name.trim();
  if (!name) return;
  emit('save', { name, color: draft.color, volume: draft.volume });
}

function onFileChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) emit('load-sample', file);
}

function preview() {
  if (!canPreview.value) return;
  resumeSamplerAudio();
  const gainMul = (draft.volume ?? 1) * (props.trackVolume ?? 1);
  playSample(props.pad.id, PREVIEW_VELOCITY, 0, gainMul);
}

function onKeyDown(e) {
  if (e.key === 'Escape') emit('cancel');
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown);
  nextTick(() => nameInputRef.value?.focus());
});

onUnmounted(() => window.removeEventListener('keydown', onKeyDown));
</script>
