<template>
  <div class="transport-bar flex items-center gap-4 px-4 py-2 bg-panel border-b border-zinc-800">
    <button
      class="w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold transition-all"
      :class="playButtonClass"
      :disabled="syncMode === 'external'"
      :title="syncMode === 'external' ? 'Controlled by the incoming external MIDI clock' : ''"
      @click="$emit('toggle-play')"
    >
      {{ playing ? '■' : '▶' }}
    </button>

    <button
      class="w-8 h-8 rounded bg-zinc-700 hover:bg-zinc-600 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
      :disabled="syncMode === 'external'"
      @click="$emit('stop')"
      title="Stop"
    >
      ■
    </button>

    <div class="flex items-center gap-2">
      <label class="text-xs text-zinc-400">BPM</label>
      <input
        type="number"
        :value="displayBpm"
        min="40"
        max="300"
        :disabled="syncMode === 'external'"
        class="w-16 bg-surface border border-zinc-700 rounded px-2 py-1 text-sm text-center disabled:opacity-60"
        :title="syncMode === 'external' ? 'Detected from incoming MIDI clock' : ''"
        @change="onBpmChange"
      />
    </div>

    <div class="flex items-center gap-2">
      <label class="text-xs text-zinc-400">Position</label>
      <span class="text-sm font-mono text-accent">{{ positionDisplay }}</span>
    </div>

    <div class="h-6 w-px bg-zinc-700"></div>

    <div class="flex items-center gap-2">
      <label class="text-xs text-zinc-400">Steps</label>
      <select :value="patternSteps" @change="onStepsChange" class="text-sm">
        <option :value="16">16 (1 bar)</option>
        <option :value="32">32 (2 bars)</option>
        <option :value="64">64 (4 bars)</option>
      </select>
    </div>

    <div class="flex items-center gap-2">
      <label class="text-xs text-zinc-400">MIDI Clock</label>
      <button
        class="w-10 h-5 rounded-full transition-colors relative"
        :class="sendMidiClock ? 'bg-accent' : 'bg-zinc-600'"
        @click="$emit('toggle-clock')"
      >
        <span
          class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
          :class="sendMidiClock ? 'left-5' : 'left-0.5'"
        ></span>
      </button>
    </div>

    <div class="h-6 w-px bg-zinc-700"></div>

    <div class="flex items-center gap-2">
      <label class="text-xs text-zinc-400" title="Internal: this app is the master clock. External: follow incoming MIDI clock from another app (e.g. FL Studio).">Sync</label>
      <button
        class="px-2 py-0.5 rounded text-xs"
        :class="syncMode === 'internal' ? 'bg-accent text-white' : 'bg-zinc-700'"
        @click="$emit('sync-mode-change', 'internal')"
      >
        Internal
      </button>
      <button
        class="px-2 py-0.5 rounded text-xs"
        :class="syncMode === 'external' ? 'bg-accent text-white' : 'bg-zinc-700'"
        @click="$emit('sync-mode-change', 'external')"
      >
        External
      </button>
    </div>

    <div v-if="syncMode === 'external'" class="flex items-center gap-2">
      <label class="text-xs text-zinc-400">Clock In</label>
      <select :value="clockInputId" @change="onClockInChange" class="text-sm max-w-40">
        <option value="">Select input...</option>
        <option v-for="d in midiInputs" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
      <span class="w-2 h-2 rounded-full flex-shrink-0" :class="playing ? 'bg-green-500 animate-pulse' : 'bg-zinc-600'"></span>
      <span class="text-xs text-zinc-400 whitespace-nowrap">
        {{ !clockInputId ? 'No input selected' : playing ? 'Synced — playing' : 'Waiting for clock…' }}
      </span>
    </div>

    <div class="flex items-center gap-2 ml-auto">
      <label class="text-xs text-zinc-400">Clock Out</label>
      <select :value="clockOutputId" @change="onClockOutChange" class="text-sm max-w-48">
        <option value="">All outputs</option>
        <option v-for="d in midiOutputs" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { usePlayheadBeat, useActiveClockBpm } from '../composables/usePlayheadBeat.js';

const props = defineProps({
  playing: Boolean,
  bpm: Number,
  patternSteps: Number,
  sendMidiClock: Boolean,
  clockOutputId: String,
  midiOutputs: { type: Array, default: () => [] },
  syncMode: { type: String, default: 'internal' },
  clockInputId: { type: String, default: '' },
  midiInputs: { type: Array, default: () => [] },
});

const emit = defineEmits([
  'toggle-play',
  'stop',
  'bpm-change',
  'steps-change',
  'toggle-clock',
  'clock-output-change',
  'sync-mode-change',
  'clock-input-change',
]);

// Sampled via requestAnimationFrame, decoupled from the audio scheduler's timer
// so these text updates never delay MIDI-critical scheduling work. Both follow
// whichever clock (internal master or external MIDI follower) is active.
const liveBeat = usePlayheadBeat();
const liveBpm = useActiveClockBpm();

const displayBpm = computed(() => (props.syncMode === 'external' ? Math.round(liveBpm.value) : props.bpm));

const playButtonClass = computed(() => {
  if (props.syncMode === 'external') {
    return props.playing ? 'bg-green-600' : 'bg-zinc-700 opacity-50 cursor-not-allowed';
  }
  return props.playing ? 'bg-red-600 hover:bg-red-500' : 'bg-accent hover:bg-accent-dim';
});

const positionDisplay = computed(() => {
  const beat = liveBeat.value;
  const bar = Math.floor(beat / 4) + 1;
  const beatInBar = Math.floor(beat % 4) + 1;
  const step = Math.floor((beat % 1) * 4) + 1;
  return `${bar}.${beatInBar}.${step}`;
});

function onBpmChange(e) {
  emit('bpm-change', Number(e.target.value));
}

function onStepsChange(e) {
  emit('steps-change', Number(e.target.value));
}

function onClockOutChange(e) {
  emit('clock-output-change', e.target.value);
}

function onClockInChange(e) {
  emit('clock-input-change', e.target.value);
}
</script>
