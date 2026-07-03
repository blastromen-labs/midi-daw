<template>
  <div class="drum-sequencer bg-panel rounded-lg border border-zinc-800 overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2 bg-surface border-b border-zinc-800">
      <h2 class="text-sm font-semibold text-accent uppercase tracking-wider">Drum Machine</h2>
      <span class="text-xs text-zinc-500">808-style · 4 tracks</span>
    </div>

    <div class="p-4 space-y-1">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="flex items-center gap-2 group"
      >
        <!-- Track label -->
        <div class="w-20 flex-shrink-0">
          <div class="text-xs font-semibold" :style="{ color: track.color }">{{ track.name }}</div>
          <MidiRouteSelect
            :output-id="track.midiOutputId"
            :channel="track.midiChannel"
            :outputs="midiOutputs"
            @output-change="(id) => $emit('route-change', track.id, { midiOutputId: id })"
            @channel-change="(ch) => $emit('route-change', track.id, { midiChannel: ch })"
          />
        </div>

        <!-- Step buttons -->
        <div class="flex gap-1 flex-1">
          <button
            v-for="(step, i) in track.steps"
            :key="i"
            class="step-btn flex-1 h-10 rounded-sm transition-all relative"
            :class="[
              step.active ? 'step-active' : 'step-inactive',
              currentStep === i && playing ? 'step-current' : '',
            ]"
            :style="step.active ? { '--track-color': track.color } : {}"
            @click="toggleStep(track.id, i)"
            @contextmenu.prevent="clearStep(track.id, i)"
          >
            <div
              v-if="step.active"
              class="absolute inset-1 rounded-sm opacity-80"
              :style="{ background: track.color, opacity: step.velocity / 127 * 0.8 + 0.2 }"
            ></div>
          </button>
        </div>
      </div>

      <!-- Beat markers -->
      <div class="flex items-center gap-2 ml-[5.5rem]">
        <div class="flex gap-1 flex-1">
          <div
            v-for="i in stepCount"
            :key="i"
            class="flex-1 text-center text-[10px] text-zinc-600"
          >
            {{ (i - 1) % 4 === 0 ? Math.floor((i - 1) / 4) + 1 : '' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { transport } from '../engine/clock.js';
import { usePlayheadBeat } from '../composables/usePlayheadBeat.js';
import MidiRouteSelect from './MidiRouteSelect.vue';

const props = defineProps({
  tracks: { type: Array, required: true },
  playing: Boolean,
  midiOutputs: { type: Array, default: () => [] },
});

const emit = defineEmits(['toggle-step', 'route-change']);

const stepCount = computed(() => props.tracks[0]?.steps.length ?? 16);

// Sampled via requestAnimationFrame, decoupled from the audio scheduler's timer
// so DOM updates here never delay MIDI-critical scheduling work.
const liveBeat = usePlayheadBeat();
const currentStep = computed(() => {
  const steps = stepCount.value || 16;
  return Math.floor(liveBeat.value * transport.stepsPerBeat) % steps;
});

function toggleStep(trackId, stepIndex) {
  emit('toggle-step', trackId, stepIndex);
}

function clearStep(trackId, stepIndex) {
  emit('toggle-step', trackId, stepIndex, false);
}
</script>

<style scoped>
.step-btn {
  background: #1a1a22;
  border: 1px solid #2a2a35;
}

.step-inactive:hover {
  background: #222230;
  border-color: #3a3a48;
}

.step-active {
  border-color: var(--track-color, #ff6b35);
}

.step-current {
  box-shadow: 0 0 8px rgba(255, 107, 53, 0.6);
  border-color: #ff6b35 !important;
}
</style>
