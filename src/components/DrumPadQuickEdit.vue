<template>
  <Teleport to="body">
    <div
      ref="panelRef"
      class="drum-pad-quick-edit fixed z-50 px-2 py-2 bg-panel border border-line rounded-md shadow-lg pointer-events-auto overflow-y-auto overscroll-contain touch-pan-y"
      :style="panelStyle"
      @mousedown.stop
      @touchstart.stop
    >
      <div class="space-y-2">
        <div>
          <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
            Pitch — {{ pitchLabel }}
          </label>
          <input
            type="range"
            min="-24"
            max="24"
            step="1"
            :value="pad.pitch ?? 0"
            class="w-full accent-accent"
            @input="onPitch"
          />
        </div>

        <div>
          <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
            Gain — {{ Math.round((pad.gain ?? 1) * 100) }}%
          </label>
          <input
            type="range"
            :min="PAD_GAIN_MIN"
            :max="PAD_GAIN_MAX"
            step="0.01"
            :value="pad.gain ?? PAD_GAIN_DEFAULT"
            class="w-full accent-accent"
            @input="onGain"
          />
        </div>

        <div>
          <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
            Distortion — {{ Math.round((pad.distortion ?? 0) * 100) }}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="pad.distortion ?? 0"
            class="w-full accent-accent"
            @input="onDistortion"
          />
        </div>

        <div>
          <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
            Reverb — {{ Math.round((pad.reverb ?? 0) * 100) }}%
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="pad.reverb ?? 0"
            class="w-full accent-accent"
            @input="onReverb"
          />
        </div>

        <div>
          <label class="text-[9px] uppercase tracking-wider text-muted-dim block mb-0.5">
            Decay — {{ decayLabel }}
          </label>
          <input
            type="range"
            :min="REVERB_DECAY_MIN"
            :max="REVERB_DECAY_MAX"
            step="0.05"
            :value="pad.reverbDecay ?? REVERB_DECAY_DEFAULT"
            class="w-full accent-accent"
            @input="onReverbDecay"
          />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, ref, watch, nextTick, onMounted, onUnmounted } from 'vue';
import {
  REVERB_DECAY_MIN,
  REVERB_DECAY_MAX,
  REVERB_DECAY_DEFAULT,
  PAD_GAIN_MIN,
  PAD_GAIN_MAX,
  PAD_GAIN_DEFAULT,
} from '../models/project.js';

const PANEL_GAP = 4;
const VIEWPORT_MARGIN = 8;
const ESTIMATED_PANEL_HEIGHT = 240;
const MIN_PANEL_HEIGHT = 120;
const MAX_PANEL_HEIGHT = 320;

const props = defineProps({
  pad: { type: Object, required: true },
  anchorEl: { type: Object, default: null },
});

const emit = defineEmits(['update']);

const panelRef = ref(null);
const panelStyle = ref({ visibility: 'hidden' });

const pitchLabel = computed(() => {
  const p = props.pad.pitch ?? 0;
  if (p === 0) return 'Original';
  return p > 0 ? `+${p} st` : `${p} st`;
});

const decayLabel = computed(() => {
  const sec = props.pad.reverbDecay ?? REVERB_DECAY_DEFAULT;
  return sec >= 1 ? `${sec.toFixed(1)}s` : `${Math.round(sec * 1000)}ms`;
});

function updatePosition() {
  const anchor = props.anchorEl;
  if (!anchor) return;

  const rect = anchor.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const panel = panelRef.value;
  const measuredHeight = panel?.offsetHeight || ESTIMATED_PANEL_HEIGHT;
  const preferredHeight = Math.min(measuredHeight, MAX_PANEL_HEIGHT);

  const spaceBelow = Math.max(0, viewportH - rect.bottom - VIEWPORT_MARGIN);
  const spaceAbove = Math.max(0, rect.top - VIEWPORT_MARGIN);
  const opensUpward = spaceBelow < preferredHeight && spaceAbove > spaceBelow;

  const maxHeight = Math.max(
    MIN_PANEL_HEIGHT,
    Math.min(MAX_PANEL_HEIGHT, opensUpward ? spaceAbove - PANEL_GAP : spaceBelow - PANEL_GAP)
  );

  let left = rect.left;
  const panelWidth = Math.max(rect.width, 160);
  left = Math.min(left, viewportW - VIEWPORT_MARGIN - panelWidth);
  left = Math.max(VIEWPORT_MARGIN, left);

  if (opensUpward) {
    panelStyle.value = {
      left: `${left}px`,
      width: `${panelWidth}px`,
      bottom: `${viewportH - rect.top + PANEL_GAP}px`,
      top: 'auto',
      maxHeight: `${maxHeight}px`,
      visibility: 'visible',
      WebkitOverflowScrolling: 'touch',
    };
    return;
  }

  panelStyle.value = {
    left: `${left}px`,
    width: `${panelWidth}px`,
    top: `${rect.bottom + PANEL_GAP}px`,
    bottom: 'auto',
    maxHeight: `${maxHeight}px`,
    visibility: 'visible',
    WebkitOverflowScrolling: 'touch',
  };
}

function schedulePositionUpdate() {
  nextTick(() => {
    updatePosition();
    nextTick(updatePosition);
  });
}

function onWindowChange() {
  updatePosition();
}

watch(
  () => props.anchorEl,
  () => schedulePositionUpdate(),
  { immediate: true }
);

onMounted(() => {
  schedulePositionUpdate();
  window.addEventListener('resize', onWindowChange);
  window.addEventListener('scroll', onWindowChange, true);
});

onUnmounted(() => {
  window.removeEventListener('resize', onWindowChange);
  window.removeEventListener('scroll', onWindowChange, true);
});

function onPitch(e) {
  emit('update', { pitch: Number(e.target.value) });
}

function onGain(e) {
  emit('update', { gain: Number(e.target.value) });
}

function onDistortion(e) {
  emit('update', { distortion: Number(e.target.value) });
}

function onReverb(e) {
  emit('update', { reverb: Number(e.target.value) });
}

function onReverbDecay(e) {
  emit('update', { reverbDecay: Number(e.target.value) });
}
</script>
