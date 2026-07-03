<template>
  <div class="daw h-screen flex flex-col" tabindex="0" @keydown="onKeyDown">
    <TransportBar
      :playing="playing"
      :bpm="project.bpm"
      :pattern-steps="project.patternSteps"
      :send-midi-clock="project.sendMidiClock"
      :clock-output-id="project.clockOutputId"
      :midi-outputs="midiOutputs"
      @toggle-play="togglePlay"
      @stop="stopPlayback"
      @bpm-change="setBpm"
      @steps-change="setPatternSteps"
      @toggle-clock="project.sendMidiClock = !project.sendMidiClock"
      @clock-output-change="project.clockOutputId = $event"
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
import { initMidi, listOutputs, onOutputsChanged } from './engine/midi.js';
import { transport } from './engine/clock.js';
import { playback } from './engine/scheduler.js';

const project = reactive(createProject());
const playing = ref(false);
const activeMidiTrackId = ref(project.midiTracks[0].id);
const midiOutputs = ref([]);
const midiError = ref('');

let stopUnsub = null;
let outputsUnsub = null;

onMounted(async () => {
  try {
    await initMidi();
    midiOutputs.value = listOutputs();
    // Keeps the output list live when a device is plugged in/unplugged, so
    // newly connected USB MIDI gear shows up without reloading the page.
    outputsUnsub = onOutputsChanged((outputs) => {
      midiOutputs.value = outputs;
    });
  } catch (e) {
    midiError.value = 'MIDI not available — use Chrome/Edge for external synth control';
  }

  playback.setProject(project);

  // Kept in case the transport is ever stopped from somewhere other than the
  // play/stop button (e.g. a future "stop at end of song" feature).
  stopUnsub = transport.onTick((type) => {
    if (type === 'stop') playing.value = false;
  });
});

onUnmounted(() => {
  stopPlayback();
  if (stopUnsub) stopUnsub();
  if (outputsUnsub) outputsUnsub();
});

watch(
  () => project.bpm,
  (bpm) => {
    transport.bpm = bpm;
  },
  { immediate: true }
);

watch(
  () => [project.patternSteps, project.loopEndBeat],
  () => {
    transport.patternSteps = project.patternSteps;
    transport.loopEndBeat = project.loopEndBeat;
    transport.loopStartBeat = project.loopStartBeat;
  },
  { immediate: true }
);

function togglePlay() {
  if (playing.value) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  playback.setProject(project);
  transport.bpm = project.bpm;
  transport.patternSteps = project.patternSteps;
  transport.loopStartBeat = project.loopStartBeat;
  transport.loopEndBeat = project.loopEndBeat;
  playback.start();
  playing.value = true;
}

function stopPlayback() {
  playback.stop();
  playing.value = false;
}

function setBpm(bpm) {
  project.bpm = Math.max(40, Math.min(300, bpm));
  transport.bpm = project.bpm;
}

function setPatternSteps(steps) {
  project.patternSteps = steps;
  project.loopEndBeat = steps / 4;
  transport.patternSteps = steps;
  transport.loopEndBeat = project.loopEndBeat;

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
  const track = createMidiTrack(`Synth ${n}`);
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
