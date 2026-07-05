<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      @mousedown.self="emit('cancel')"
    >
      <div
        class="w-full max-w-md bg-panel border border-line rounded-lg shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
        role="dialog"
        :aria-labelledby="titleId"
        @mousedown.stop
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-line flex-shrink-0">
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

        <div class="px-4 py-3 space-y-4 overflow-y-auto flex-1 min-h-0">
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

          <section v-if="canPreview" class="border-t border-line pt-4 space-y-3">
            <div>
              <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">
                Pitch — {{ pitchLabel }}
              </label>
              <input
                v-model.number="draft.pitch"
                type="range"
                min="-24"
                max="24"
                step="1"
                class="w-full accent-accent"
              />
            </div>

            <div>
              <span class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Length &amp; fade</span>
              <p class="text-[10px] text-muted-dim mb-2">
                Drag the end handle for length. Drag the fade slope to taper the tail.
              </p>
              <SampleWaveformEditor
                :peaks="waveformPeaks"
                :duration="waveformDuration"
                :sample-length="draft.sampleLength"
                :fade-out="draft.fadeOut"
                :pitch="draft.pitch"
                :color="draft.color"
                @update:sample-length="draft.sampleLength = $event"
                @update:fade-out="draft.fadeOut = $event"
              />
            </div>
          </section>

          <section class="border-t border-line pt-4">
            <span class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Cut by</span>
            <p class="text-[10px] text-muted-dim mb-2">
              Long hits stop when a selected pad retriggers. Leave all off for no cutting.
            </p>
            <div class="flex flex-wrap gap-1.5">
              <button
                type="button"
                class="px-2 py-1 rounded text-[11px] ring-1 transition-colors"
                :class="draft.cutBySelf ? 'bg-accent/25 ring-accent text-white' : 'bg-surface-hover ring-line-light text-muted hover:text-white'"
                @click="draft.cutBySelf = !draft.cutBySelf"
              >
                Self
              </button>
              <button
                v-for="other in otherPads"
                :key="other.id"
                type="button"
                class="px-2 py-1 rounded text-[11px] ring-1 transition-colors max-w-[7rem] truncate"
                :class="draft.cutByPads.includes(other.id) ? 'bg-accent/25 ring-accent text-white' : 'bg-surface-hover ring-line-light text-muted hover:text-white'"
                :title="other.name"
                @click="toggleCutBy(other.id)"
              >
                {{ other.name }}
              </button>
            </div>
          </section>

          <section class="border-t border-line pt-4">
            <div class="flex items-center justify-between gap-2 mb-1.5">
              <label class="text-[10px] uppercase tracking-wider text-muted-dim">
                Reverb — {{ Math.round(draft.reverb * 100) }}%
              </label>
              <button
                type="button"
                class="px-2 py-0.5 rounded text-[10px] ring-1 transition-colors"
                :class="draft.reverb > 0 ? 'bg-accent/25 ring-accent text-white' : 'bg-surface-hover ring-line-light text-muted hover:text-white'"
                @click="draft.reverb = draft.reverb > 0 ? 0 : 0.35"
              >
                {{ draft.reverb > 0 ? 'On' : 'Off' }}
              </button>
            </div>
            <input
              v-model.number="draft.reverb"
              type="range"
              min="0"
              max="1"
              step="0.01"
              class="w-full accent-accent"
            />
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mt-3 mb-1.5">
              Decay — {{ decayLabel }}
            </label>
            <input
              v-model.number="draftReverbDecay"
              type="range"
              :min="REVERB_DECAY_MIN"
              :max="REVERB_DECAY_MAX"
              step="0.05"
              class="w-full accent-accent"
              @input="onReverbDecayInput"
            />
          </section>

          <section class="border-t border-line pt-4">
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">
              Pad volume — {{ Math.round(draft.volume * 100) }}%
            </label>
            <VolumeSlider wide class="w-full" v-model="draft.volume" />
          </section>
        </div>

        <div class="flex items-center justify-between gap-2 px-4 py-3 border-t border-line bg-surface/40 flex-shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <button
              v-if="canRemove"
              type="button"
              class="px-2 py-1.5 rounded text-xs text-red-400 hover:text-red-300 hover:bg-surface-hover"
              @click="emit('remove')"
            >
              Remove pad
            </button>
            <button
              type="button"
              class="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent-dim disabled:opacity-40 disabled:cursor-not-allowed"
              title="Preview with current settings"
              :disabled="!canPreview"
              @click="preview"
            >
              <span aria-hidden="true">▶</span>
              Play
            </button>
          </div>
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
import { DRUM_PAD_COLORS, REVERB_DECAY_MIN, REVERB_DECAY_MAX, REVERB_DECAY_DEFAULT } from '../models/project.js';
import {
  playSample,
  resumeSamplerAudio,
  hasSample,
  getSampleWaveformPeaks,
  getSampleDuration,
} from '../engine/sampler.js';
import { padPlaybackOpts, previewTrackOpts } from '../engine/padPlayback.js';
import VolumeSlider from './VolumeSlider.vue';
import SampleWaveformEditor from './SampleWaveformEditor.vue';

const PREVIEW_VELOCITY = 100;

const props = defineProps({
  pad: { type: Object, required: true },
  allPads: { type: Array, default: () => [] },
  trackId: { type: String, required: true },
  trackVolume: { type: Number, default: 1 },
  reverbDecay: { type: Number, default: REVERB_DECAY_DEFAULT },
  canRemove: { type: Boolean, default: false },
});

const emit = defineEmits(['save', 'load-sample', 'clear-sample', 'remove', 'cancel', 'update-reverb-decay']);

const padColors = DRUM_PAD_COLORS;
const nameInputRef = ref(null);
const fileInputRef = ref(null);
const titleId = `drum-pad-editor-${Math.random().toString(36).slice(2, 9)}`;

const draft = reactive({
  name: '',
  color: padColors[0],
  volume: 1,
  cutBySelf: true,
  cutByPads: [],
  pitch: 0,
  sampleLength: 1,
  fadeOut: 0,
  reverb: 0,
});

const draftReverbDecay = ref(REVERB_DECAY_DEFAULT);

const sampleLabel = computed(() => props.pad.fileName || (hasSample(props.pad.id) ? 'Loaded sample' : 'No sample loaded'));
const canPreview = computed(() => hasSample(props.pad.id));
const otherPads = computed(() => props.allPads.filter((p) => p.id !== props.pad.id));
const decayLabel = computed(() => {
  const sec = draftReverbDecay.value ?? REVERB_DECAY_DEFAULT;
  return sec >= 1 ? `${sec.toFixed(1)}s` : `${Math.round(sec * 1000)}ms`;
});
const pitchLabel = computed(() => {
  const p = draft.pitch ?? 0;
  if (p === 0) return 'Original';
  return p > 0 ? `+${p} st` : `${p} st`;
});

const waveformPeaks = ref([]);
const waveformDuration = ref(0);

function refreshWaveform() {
  const data = getSampleWaveformPeaks(props.pad.id);
  waveformPeaks.value = data?.peaks ?? [];
  waveformDuration.value = data?.duration ?? getSampleDuration(props.pad.id);
}

function syncFromPad() {
  draft.name = props.pad.name ?? '';
  draft.color = props.pad.color ?? padColors[0];
  draft.volume = props.pad.volume ?? 1;
  draft.cutBySelf = props.pad.cutBySelf !== false;
  draft.cutByPads = [...(props.pad.cutByPads ?? [])];
  draft.pitch = props.pad.pitch ?? 0;
  draft.sampleLength = props.pad.sampleLength ?? 1;
  draft.fadeOut = props.pad.fadeOut ?? 0;
  draft.reverb = props.pad.reverb ?? 0;
  draftReverbDecay.value = props.reverbDecay ?? REVERB_DECAY_DEFAULT;
  refreshWaveform();
}

watch(() => props.reverbDecay, (v) => {
  draftReverbDecay.value = v ?? REVERB_DECAY_DEFAULT;
});

watch(() => props.pad, syncFromPad, { immediate: true, deep: true });
watch(() => props.pad.fileName, refreshWaveform);

function toggleCutBy(padId) {
  const idx = draft.cutByPads.indexOf(padId);
  if (idx === -1) draft.cutByPads.push(padId);
  else draft.cutByPads.splice(idx, 1);
}

function onReverbDecayInput() {
  const v = Math.max(REVERB_DECAY_MIN, Math.min(REVERB_DECAY_MAX, draftReverbDecay.value));
  draftReverbDecay.value = v;
  emit('update-reverb-decay', v);
}

function submit() {
  const name = draft.name.trim();
  if (!name) return;
  emit('save', {
    name,
    color: draft.color,
    volume: draft.volume,
    cutBySelf: draft.cutBySelf,
    cutByPads: [...draft.cutByPads],
    pitch: draft.pitch,
    sampleLength: draft.sampleLength,
    fadeOut: draft.fadeOut,
    reverb: draft.reverb,
  });
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
  const previewPad = {
    id: props.pad.id,
    cutBySelf: draft.cutBySelf,
    cutByPads: draft.cutByPads,
    pitch: draft.pitch,
    sampleLength: draft.sampleLength,
    fadeOut: draft.fadeOut,
    reverb: draft.reverb,
  };
  const track = previewTrackOpts({
    id: props.trackId,
    pads: props.allPads,
    reverbDecay: draftReverbDecay.value,
    volume: props.trackVolume,
  });
  playSample(props.pad.id, PREVIEW_VELOCITY, 0, gainMul, padPlaybackOpts(previewPad, track));
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
