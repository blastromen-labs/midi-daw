<template>
  <div class="daw h-screen flex flex-col" tabindex="0" @keydown="onKeyDown">
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex-1 min-h-0">
        <PianoRoll
          v-show="viewMode === 'roll'"
          :tracks="project.tracks"
          :active-track-id="activeTrackId"
          :playing="playing"
          :midi-outputs="midiOutputs"
          :bpm="project.bpm"
          :send-midi-clock="project.sendMidiClock"
          :clock-output-id="project.clockOutputId"
          :sync-mode="project.syncMode"
          :clock-input-id="project.clockInputId"
          :midi-inputs="midiInputs"
          :marker-beat="project.markerBeat"
          :loop-region="project.loopRegion"
          @update-notes="updateNotes"
          @select-track="activeTrackId = $event"
          @select-pattern="selectPattern"
          @add-pattern="addPattern"
          @rename-pattern="renamePattern"
          @update-pattern="updatePattern"
          @delete-pattern="deletePattern"
          @route-change="updateMidiRoute"
          @add-track="addTrack"
          @rename-track="renameTrack"
          @update-pad="updatePad"
          @update-track="updateTrack"
          @add-pad="addPad"
          @remove-pad="removePad"
          @rename-pad="renamePad"
          @delete-track="removeTrack"
          @toggle-play="togglePlay"
          @marker-change="project.markerBeat = $event"
          @loop-region-change="setLoopRegion"
          @bpm-change="setBpm"
          @toggle-clock="project.sendMidiClock = !project.sendMidiClock"
          @clock-output-change="project.clockOutputId = $event"
          @sync-mode-change="project.syncMode = $event"
          @clock-input-change="project.clockInputId = $event"
          @view-mode-change="viewMode = $event"
        />
        <LiveView
          v-show="viewMode === 'live'"
          :tracks="project.tracks"
          :playing="playing"
          :bpm="project.bpm"
          :sync-mode="project.syncMode"
          :clock-input-id="project.clockInputId"
          :midi-inputs="midiInputs"
          @toggle-play="togglePlay"
          @bpm-change="setBpm"
          @clock-input-change="project.clockInputId = $event"
          @view-mode-change="viewMode = $event"
          @trigger-pattern="queueOrLaunchPattern"
          @edit-pattern="editPattern"
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
import PianoRoll from './components/PianoRoll.vue';
import LiveView from './components/LiveView.vue';
import {
  createProject,
  createMidiTrack,
  createDrumTrack,
  createDrumPad,
  createPattern,
  randomTrackColor,
  randomPatternColor,
  getActivePattern,
  isPatternPlaying,
  projectLoopEndBeat,
} from './models/project.js';
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
import { clearSample } from './engine/sampler.js';
import { queuePatternToggle, launchPatternImmediately, stopTrackImmediately } from './engine/liveLauncher.js';

const project = reactive(createProject());
const playing = ref(false);
// 'roll': piano roll editor (default). 'live': session-style launch grid —
// toggled via Tab or the View control in either view's toolbar.
const viewMode = ref('roll');
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

// Transport loop spans the longest track pattern (or a user-drawn loop region)
// so shorter patterns can repeat independently inside the scheduler.
function syncClockLoopFromTracks() {
  const patternEndBeat = projectLoopEndBeat(project.tracks, { forPlayback: playing.value });
  const region = project.loopRegion;
  const loopStartBeat = region ? region.startBeat : 0;
  const loopEndBeat = region ? Math.min(region.endBeat, patternEndBeat) : patternEndBeat;
  for (const clock of [transport, externalClock]) {
    clock.loopStartBeat = loopStartBeat;
    clock.loopEndBeat = loopEndBeat;
    clock.patternSteps = patternEndBeat * 4;
  }
}

function setLoopRegion(region) {
  project.loopRegion = region;
  syncClockLoopFromTracks();
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
    syncClockLoopFromTracks();
    setActiveClock(externalClock);
    bindPlayingListener(externalClock);

    if (project.clockInputId) {
      clockInputUnsub = listenToInput(project.clockInputId, (data) => externalClock.handleMessage(data));
    }

    playback.setProject(project);
    playback.start();
  } else {
    setActiveClock(transport);
    syncClockLoopFromTracks();
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
  // Reads projectLoopEndBeat with forPlayback matching the current playing
  // state, not just the edited pattern lengths — otherwise a Live-mode
  // launch that swaps in a differently-sized pattern (via playingPatternId)
  // wouldn't resize the transport's loop/wrap boundary while already playing.
  () => [projectLoopEndBeat(project.tracks, { forPlayback: playing.value }), playing.value],
  () => syncClockLoopFromTracks(),
  { immediate: true }
);

function togglePlay(fromBeat) {
  if (project.syncMode === 'external') return; // controlled by the incoming MIDI clock
  if (playing.value) {
    stopPlayback();
  } else {
    const beat =
      fromBeat ??
      (project.markerBeat != null ? project.markerBeat : undefined);
    startPlayback(beat);
  }
}

function startPlayback(fromBeat) {
  if (project.syncMode === 'external') return;
  playback.setProject(project);
  transport.bpm = project.bpm;
  syncClockLoopFromTracks();
  playback.start(fromBeat);
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

function findTrack(trackId) {
  return project.tracks.find((t) => t.id === trackId);
}

function updateNotes(trackId, patternId, notes) {
  const track = findTrack(trackId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  if (pattern) pattern.notes = notes;
}

function selectPattern(trackId, patternId) {
  const track = findTrack(trackId);
  if (track) track.activePatternId = patternId;
}

function addPattern(trackId) {
  const track = findTrack(trackId);
  if (!track?.patterns?.length) return;

  const active = getActivePattern(track);
  const usedColors = track.patterns.map((p) => p.color);
  const pattern = createPattern(
    `Pattern ${track.patterns.length + 1}`,
    randomPatternColor(usedColors),
    active?.patternSteps ?? 16
  );
  track.patterns.push(pattern);
  track.activePatternId = pattern.id;
}

function renamePattern(trackId, patternId, name) {
  const track = findTrack(trackId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  if (pattern) pattern.name = name;
}

function updatePattern(trackId, patternId, changes) {
  const track = findTrack(trackId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  if (pattern) Object.assign(pattern, changes);
}

function deletePattern(trackId, patternId) {
  const track = findTrack(trackId);
  if (!track?.patterns || track.patterns.length <= 1) return;

  const idx = track.patterns.findIndex((p) => p.id === patternId);
  if (idx === -1) return;

  track.patterns.splice(idx, 1);

  if (track.activePatternId === patternId) {
    track.activePatternId = track.patterns[Math.max(0, idx - 1)].id;
  }
  if (track.playingPatternId === patternId) {
    track.playingPatternId = null;
  }
  if (track.pendingPatternId === patternId) {
    track.pendingPatternId = null;
    track.pendingLaunchBeat = null;
  }
}

// Live mode click handling — a clip is a toggle:
//   - stopped transport, different pattern -> launches it and starts playing.
//   - stopped transport, already-armed pattern -> un-arms it (stays stopped).
//   - playing transport, different pattern -> arms it to take over once the
//     current pattern's loop completes.
//   - playing transport, the pattern that's already playing -> arms the
//     track to go silent once that same loop completes.
// See engine/liveLauncher.js for the quantizing rule and why patterns
// phase-lock to the grid instead of restarting from their own beat 0.
function queueOrLaunchPattern(trackId, patternId) {
  const track = findTrack(trackId);
  if (!track) return;

  if (!playing.value) {
    if (isPatternPlaying(track, patternId)) {
      stopTrackImmediately(track);
    } else {
      launchPatternImmediately(track, patternId);
      startPlayback();
    }
    return;
  }

  queuePatternToggle(track, patternId, getActiveClock().getAbsoluteBeat());
}

function editPattern(trackId, patternId) {
  const track = findTrack(trackId);
  if (track) track.activePatternId = patternId;
  activeTrackId.value = trackId;
  viewMode.value = 'roll';
}

function updateMidiRoute(trackId, changes) {
  const track = findTrack(trackId);
  if (track && track.kind === 'midi') Object.assign(track, changes);
}

function addTrack(kind) {
  const color = randomTrackColor(project.tracks.map((t) => t.color));
  const track =
    kind === 'drum'
      ? createDrumTrack(`Drums ${project.tracks.filter((t) => t.kind === 'drum').length + 1}`, color)
      : createMidiTrack(`MIDI ${project.tracks.filter((t) => t.kind === 'midi').length + 1}`, color);
  project.tracks.push(track);
  activeTrackId.value = track.id;
}

function renameTrack(trackId, name) {
  const track = findTrack(trackId);
  if (track) track.name = name;
}

function removeTrack(trackId) {
  const idx = project.tracks.findIndex((t) => t.id === trackId);
  if (idx === -1) return;

  const track = project.tracks[idx];
  if (track.kind === 'drum') {
    for (const pad of track.pads) clearSample(pad.id);
  }

  project.tracks.splice(idx, 1);

  if (activeTrackId.value === trackId) {
    const fallback = project.tracks[idx] ?? project.tracks[idx - 1];
    activeTrackId.value = fallback?.id;
  }
}

function updatePad(trackId, padId, changes) {
  const track = findTrack(trackId);
  if (track?.kind !== 'drum') return;
  const pad = track.pads.find((p) => p.id === padId);
  if (pad) Object.assign(pad, changes);
}

function updateTrack(trackId, changes) {
  const track = findTrack(trackId);
  if (track) Object.assign(track, changes);
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
    return;
  }

  if (e.code === 'Tab') {
    // Don't hijack Tab while the user is actually typing (renaming a track,
    // editing BPM, etc.) — same guard PianoRoll uses for its own shortcuts.
    const target = e.target;
    const isTextField =
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable ||
      (target?.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range'].includes(target.type));
    if (isTextField) return;

    e.preventDefault();
    viewMode.value = viewMode.value === 'roll' ? 'live' : 'roll';
  }
}
</script>

<style scoped>
.daw {
  background: #1d262b;
}
</style>
