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
      @bpm-change="setBpm"
      @steps-change="setPatternSteps"
      @toggle-clock="project.sendMidiClock = !project.sendMidiClock"
      @clock-output-change="project.clockOutputId = $event"
      @sync-mode-change="project.syncMode = $event"
      @clock-input-change="project.clockInputId = $event"
    />

    <div class="flex-1 flex flex-col min-h-0 p-3 gap-3">
      <div class="flex-1 min-h-0">
        <PianoRoll
          :tracks="project.tracks"
          :active-track-id="activeTrackId"
          :loop-end-beat="project.loopEndBeat"
          :playing="playing"
          :midi-outputs="midiOutputs"
          @update-notes="updateNotes"
          @select-track="activeTrackId = $event"
          @route-change="updateMidiRoute"
          @add-track="addTrack"
          @rename-track="renameTrack"
          @update-pad="updatePad"
          @add-pad="addPad"
          @remove-pad="removePad"
          @rename-pad="renamePad"
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
import PianoRoll from './components/PianoRoll.vue';
import { createProject, createMidiTrack, createDrumTrack, createDrumPad } from './models/project.js';
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
// Defaults to the first MIDI channel (falling back to whatever's first) so
// the piano roll opens on a familiar MIDI-note view rather than the drum pad list.
const activeTrackId = ref((project.tracks.find((t) => t.kind === 'midi') ?? project.tracks[0]).id);
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
}

function findTrack(trackId) {
  return project.tracks.find((t) => t.id === trackId);
}

function updateNotes(trackId, notes) {
  const track = findTrack(trackId);
  if (track) track.notes = notes;
}

function updateMidiRoute(trackId, changes) {
  const track = findTrack(trackId);
  if (track && track.kind === 'midi') Object.assign(track, changes);
}

function addTrack(kind) {
  const n = project.tracks.length + 1;
  const track =
    kind === 'drum'
      ? createDrumTrack(`Drums ${project.tracks.filter((t) => t.kind === 'drum').length + 1}`, n)
      : createMidiTrack(`MIDI ${project.tracks.filter((t) => t.kind === 'midi').length + 1}`, n);
  project.tracks.push(track);
  activeTrackId.value = track.id;
}

function renameTrack(trackId, name) {
  const track = findTrack(trackId);
  if (track) track.name = name;
}

function updatePad(trackId, padId, changes) {
  const track = findTrack(trackId);
  if (track?.kind !== 'drum') return;
  const pad = track.pads.find((p) => p.id === padId);
  if (pad) Object.assign(pad, changes);
}

function addPad(trackId) {
  const track = findTrack(trackId);
  if (track?.kind !== 'drum') return;
  track.pads.push(createDrumPad(`Pad ${track.pads.length + 1}`, '#8899aa'));
}

function removePad(trackId, padId) {
  const track = findTrack(trackId);
  if (track?.kind !== 'drum') return;
  track.pads = track.pads.filter((p) => p.id !== padId);
  // Notes that triggered the removed pad become orphaned (harmlessly
  // skipped by the scheduler — see _triggerDrumNote in scheduler.js) rather
  // than deleted outright, so undo-by-re-adding-the-pad "just works".
}

function renamePad(trackId, padId, name) {
  const track = findTrack(trackId);
  if (track?.kind !== 'drum') return;
  const pad = track.pads.find((p) => p.id === padId);
  if (pad) pad.name = name;
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
  background: #1d262b;
}
</style>
