<template>
  <!-- overflow-x-auto is a safety net for narrow/portrait tablets — everything
       above already fits an iPad landscape width without needing it, but this
       keeps the bar usable (scrollable) rather than visually breaking if it
       ever doesn't. Labels below are mostly dropped in favor of `title`
       tooltips to keep the always-visible footprint small. -->
  <div class="transport-bar flex items-center gap-1.5 px-2 py-1.5 bg-panel border-b border-line overflow-x-auto">
    <button
      class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all flex-shrink-0"
      :class="playButtonClass"
      :disabled="syncMode === 'external'"
      :title="playButtonTitle"
      @click="$emit('toggle-play')"
    >
      {{ playing ? '■' : '▶' }}
    </button>

    <input
      type="number"
      :value="displayBpm"
      min="40"
      max="300"
      :disabled="syncMode === 'external'"
      class="w-12 bg-surface border border-line-light rounded px-1 py-1 text-xs text-center disabled:opacity-60 flex-shrink-0"
      :title="syncMode === 'external' ? 'Tempo detected from incoming MIDI clock' : 'BPM'"
      @change="onBpmChange"
    />

    <span
      class="text-xs font-mono text-accent flex-shrink-0 w-12 text-center tabular-nums"
      title="Position (bar.beat.step)"
    >
      {{ positionDisplay }}
    </span>

    <div class="h-5 w-px bg-line-light flex-shrink-0"></div>

    <select :value="patternSteps" @change="onStepsChange" class="text-xs flex-shrink-0" title="Pattern length">
      <option :value="16">16 (1 bar)</option>
      <option :value="32">32 (2 bars)</option>
      <option :value="64">64 (4 bars)</option>
    </select>

    <button
      class="w-7 h-4 rounded-full transition-colors relative flex-shrink-0"
      :class="sendMidiClock ? 'bg-accent' : 'bg-surface-hover'"
      title="Send MIDI clock to connected outputs"
      @click="$emit('toggle-clock')"
    >
      <span
        class="absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all"
        :class="sendMidiClock ? 'left-3.5' : 'left-0.5'"
      ></span>
    </button>

    <div class="h-5 w-px bg-line-light flex-shrink-0"></div>

    <div
      class="flex items-center gap-0.5 flex-shrink-0"
      title="Sync: Internal (this app is the master clock) or External (follow an incoming MIDI clock, e.g. FL Studio)"
    >
      <button
        class="px-1.5 py-0.5 rounded text-[10px] leading-none"
        :class="syncMode === 'internal' ? 'bg-accent text-white' : 'bg-surface-hover hover:bg-surface-active'"
        @click="$emit('sync-mode-change', 'internal')"
      >
        Int
      </button>
      <button
        class="px-1.5 py-0.5 rounded text-[10px] leading-none"
        :class="syncMode === 'external' ? 'bg-accent text-white' : 'bg-surface-hover hover:bg-surface-active'"
        @click="$emit('sync-mode-change', 'external')"
      >
        Ext
      </button>
    </div>

    <template v-if="syncMode === 'external'">
      <select
        :value="clockInputId"
        @change="onClockInChange"
        class="text-xs max-w-28 flex-shrink-0"
        title="MIDI clock input to follow"
      >
        <option value="">Input…</option>
        <option v-for="d in midiInputs" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
      <span
        class="w-1.5 h-1.5 rounded-full flex-shrink-0"
        :class="playing ? 'bg-green-500 animate-pulse' : 'bg-surface-hover'"
        :title="!clockInputId ? 'No input selected' : playing ? 'Synced — playing' : 'Waiting for clock…'"
      ></span>
    </template>

    <select
      :value="clockOutputId"
      @change="onClockOutChange"
      class="text-xs max-w-28 ml-auto flex-shrink-0"
      title="MIDI clock output"
    >
      <option value="">All outputs</option>
      <option v-for="d in midiOutputs" :key="d.id" :value="d.id">{{ d.name }}</option>
    </select>
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
    return props.playing ? 'bg-green-600' : 'bg-surface-hover opacity-50 cursor-not-allowed';
  }
  return props.playing ? 'bg-red-600 hover:bg-red-500' : 'bg-accent hover:bg-accent-dim';
});

const playButtonTitle = computed(() => {
  if (props.syncMode === 'external') return 'Controlled by the incoming external MIDI clock';
  return props.playing ? 'Stop' : 'Play';
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
