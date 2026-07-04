<template>
  <div class="drum-sequencer bg-panel rounded-lg border border-line overflow-hidden">
    <div class="flex items-center justify-between px-4 py-2 bg-surface border-b border-line">
      <h2 class="text-sm font-semibold text-accent uppercase tracking-wider">Drum Machine</h2>
      <span class="text-xs text-muted-dim">808-style · 4 tracks</span>
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
            class="flex-1 text-center text-[10px] text-muted-dim"
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
import { getActiveClock } from '../engine/activeClock.js';
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
// so DOM updates here never delay MIDI-critical scheduling work. Follows
// whichever clock (internal master or external MIDI follower) is active.
const liveBeat = usePlayheadBeat();
const currentStep = computed(() => {
  const steps = stepCount.value || 16;
  return Math.floor(liveBeat.value * getActiveClock().stepsPerBeat) % steps;
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
  background: #25333c;
  border: 1px solid #324450;
}

.step-inactive:hover {
  background: #2c3d47;
  border-color: #3f5561;
}

.step-active {
  border-color: var(--track-color, #6fae78);
}

.step-current {
  box-shadow: 0 0 8px rgba(111, 174, 120, 0.6);
  border-color: #6fae78 !important;
}
</style>
