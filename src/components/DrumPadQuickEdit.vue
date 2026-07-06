<template>
  <div
    class="drum-pad-quick-edit absolute top-full left-0 right-0 z-30 px-2 py-2 bg-panel border border-line border-t-0 shadow-lg pointer-events-auto"
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
</template>

<script setup>
import { computed } from 'vue';
import {
  REVERB_DECAY_MIN,
  REVERB_DECAY_MAX,
  REVERB_DECAY_DEFAULT,
  PAD_GAIN_MIN,
  PAD_GAIN_MAX,
  PAD_GAIN_DEFAULT,
} from '../models/project.js';

const props = defineProps({
  pad: { type: Object, required: true },
});

const emit = defineEmits(['update']);

const pitchLabel = computed(() => {
  const p = props.pad.pitch ?? 0;
  if (p === 0) return 'Original';
  return p > 0 ? `+${p} st` : `${p} st`;
});

const decayLabel = computed(() => {
  const sec = props.pad.reverbDecay ?? REVERB_DECAY_DEFAULT;
  return sec >= 1 ? `${sec.toFixed(1)}s` : `${Math.round(sec * 1000)}ms`;
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
