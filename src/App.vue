<template>
  <div class="daw h-screen flex flex-col" tabindex="0" @keydown="onKeyDown">
    <TransportBar
      :playing="playing"
      :bpm="project.bpm"
      :pattern-steps="project.patternSteps"
      :send-midi-clock="project.sendMidiClock"
      :clock-output-id="project.clockOutputId"
      :midi-outputs="midiOutputs"
      :sync-mode="project.syncMode"
      :clock-input-id="project.clockInputId"
      :midi-inputs="midiInputs"
      @toggle-play="togglePlay"
      @stop="stopPlayback"
      @bpm-change="setBpm"
      @steps-change="setPatternSteps"
      @toggle-clock="project.sendMidiClock = !project.sendMidiClock"
      @clock-output-change="project.clockOutputId = $event"
      @sync-mode-change="project.syncMode = $event"
      @clock-input-change="project.clockInputId = $event"
    />

    <div class="flex-1 flex flex-col min-h-0 p-3 gap-3">
      <DrumSequencer
        :tracks="project.drumTracks"
        :playing="playing"
        :midi-outputs="midiOutputs"
        @toggle-step="toggleDrumStep"
        @route-change="updateDrumRoute"
      />

      <div class="flex-1 min-h-0">
        <PianoRoll
          :tracks="project.midiTracks"
          :active-track-id="activeMidiTrackId"
          :loop-end-beat="project.loopEndBeat"
          :playing="playing"
          :midi-outputs="midiOutputs"
          @update-notes="updateMidiNotes"
          @select-track="activeMidiTrackId = $event"
          @route-change="updateMidiRoute"
          @add-track="addMidiTrack"
          @rename-track="renameMidiTrack"
        />
      </div>
    </div>

    <div v-if="midiError" class="fixed bottom-4 right-4 bg-red-900/90 text-red-200 px-4 py-2 rounded text-sm">
      {{ midiError }}
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import TransportBar from './components/TransportBar.vue';
import DrumSequencer from './components/DrumSequencer.vue';
import PianoRoll from './components/PianoRoll.vue';
import { createProject, createMidiTrack } from './models/project.js';
import {
  initMidi,
  listOutputs,
  listInputs,
  onOutputsChanged,
  onInputsChanged,
  listenToInput,
} from './engine/midi.js';
import { transport } from './engine/clock.js';
import { externalClock } from './engine/externalClock.js';
import { getActiveClock, setActiveClock } from './engine/activeClock.js';
import { playback } from './engine/scheduler.js';

const project = reactive(createProject());
const playing = ref(false);
const activeMidiTrackId = ref(project.midiTracks[0].id);
const midiOutputs = ref([]);
const midiInputs = ref([]);
const midiError = ref('');

let playingUnsub = null; // tracks 'start'/'stop' on whichever clock is currently active
let outputsUnsub = null;
let inputsUnsub = null;
let clockInputUnsub = null; // subscription to the selected external MIDI clock input

// Song-structure settings (not tempo) apply to both clocks so switching sync
// mode mid-project doesn't lose pattern length/loop range.
function applyPatternSettings(clock) {
  clock.patternSteps = project.patternSteps;
  clock.loopStartBeat = project.loopStartBeat;
  clock.loopEndBeat = project.loopEndBeat;
}

function bindPlayingListener(clock) {
  if (playingUnsub) playingUnsub();
  playingUnsub = clock.onTick((type) => {
    if (type === 'start') playing.value = true;
    if (type === 'stop') playing.value = false;
  });
}

// Applies project.syncMode: swaps the active clock, (re)connects the chosen
// MIDI input to the external clock follower, and arms the playback engine so
// it's already listening the instant an external Start message arrives.
function engageSyncMode() {
  if (clockInputUnsub) {
    clockInputUnsub();
    clockInputUnsub = null;
  }
  playback.stop();

  if (project.syncMode === 'external') {
    applyPatternSettings(externalClock);
    setActiveClock(externalClock);
    bindPlayingListener(externalClock);

    if (project.clockInputId) {
      clockInputUnsub = listenToInput(project.clockInputId, (data) => externalClock.handleMessage(data));
    }

    playback.setProject(project);
    playback.start();
  } else {
    setActiveClock(transport);
    applyPatternSettings(transport);
    transport.bpm = project.bpm;
    bindPlayingListener(transport);
    playing.value = false;
  }
}

onMounted(async () => {
  try {
    await initMidi();
    midiOutputs.value = listOutputs();
    midiInputs.value = listInputs();
    // Keeps the device lists live when something is plugged in/unplugged, so
    // newly connected USB MIDI gear shows up without reloading the page.
    outputsUnsub = onOutputsChanged((outputs) => {
      midiOutputs.value = outputs;
    });
    inputsUnsub = onInputsChanged((inputs) => {
      midiInputs.value = inputs;
    });
  } catch (e) {
    midiError.value = 'MIDI not available — use Chrome/Edge for external synth control';
  }

  playback.setProject(project);
  engageSyncMode();
});

onUnmounted(() => {
  playback.stop();
  if (playingUnsub) playingUnsub();
  if (outputsUnsub) outputsUnsub();
  if (inputsUnsub) inputsUnsub();
  if (clockInputUnsub) clockInputUnsub();
});

watch(() => [project.syncMode, project.clockInputId], engageSyncMode);

watch(
  () => project.bpm,
  (bpm) => {
    // External mode's tempo is detected from the incoming clock, not user-set.
    if (project.syncMode === 'internal') transport.bpm = bpm;
  },
  { immediate: true }
);

watch(
  () => [project.patternSteps, project.loopEndBeat],
  () => {
    applyPatternSettings(transport);
    applyPatternSettings(externalClock);
  },
  { immediate: true }
);

function togglePlay() {
  if (project.syncMode === 'external') return; // controlled by the incoming MIDI clock
  if (playing.value) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (project.syncMode === 'external') return;
  playback.setProject(project);
  transport.bpm = project.bpm;
  applyPatternSettings(transport);
  playback.start();
  playing.value = true;
}

function stopPlayback() {
  if (project.syncMode === 'external') return; // Stop is driven by the incoming clock
  playback.stop();
  playing.value = false;
}

function setBpm(bpm) {
  project.bpm = Math.max(40, Math.min(300, bpm));
  if (project.syncMode === 'internal') transport.bpm = project.bpm;
}

function setPatternSteps(steps) {
  project.patternSteps = steps;
  project.loopEndBeat = steps / 4;
  applyPatternSettings(transport);
  applyPatternSettings(externalClock);

  for (const track of project.drumTracks) {
    if (track.steps.length < steps) {
      const extra = Array.from({ length: steps - track.steps.length }, () => ({ active: false, velocity: 100 }));
      track.steps.push(...extra);
    } else if (track.steps.length > steps) {
      track.steps.length = steps;
    }
  }
}

function toggleDrumStep(trackId, stepIndex, forceOff) {
  const track = project.drumTracks.find((t) => t.id === trackId);
  if (!track) return;
  const step = track.steps[stepIndex];
  if (forceOff === false) {
    step.active = false;
  } else {
    step.active = !step.active;
    if (step.active) step.velocity = 100;
  }
}

function updateDrumRoute(trackId, changes) {
  const track = project.drumTracks.find((t) => t.id === trackId);
  if (track) Object.assign(track, changes);
}

function updateMidiNotes(trackId, notes) {
  const track = project.midiTracks.find((t) => t.id === trackId);
  if (track) track.notes = notes;
}

function updateMidiRoute(trackId, changes) {
  const track = project.midiTracks.find((t) => t.id === trackId);
  if (track) Object.assign(track, changes);
}

function addMidiTrack() {
  const n = project.midiTracks.length + 1;
  const track = createMidiTrack(`Synth ${n}`, project.midiTracks.length);
  project.midiTracks.push(track);
  activeMidiTrackId.value = track.id;
}

function renameMidiTrack(trackId, name) {
  const track = project.midiTracks.find((t) => t.id === trackId);
  if (track) track.name = name;
}

function onKeyDown(e) {
  if (e.code === 'Space') {
    e.preventDefault();
    togglePlay();
  }
}
</script>

<style scoped>
.daw {
  background: #0d0d10;
}
</style>
