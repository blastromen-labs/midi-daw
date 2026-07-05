<template>
  <div class="daw h-screen flex flex-col" tabindex="0" @keydown="onKeyDown">
    <div class="flex-1 flex flex-col min-h-0">
      <div class="flex-1 min-h-0">
        <PianoRoll
          v-show="viewMode === 'roll'"
          :songs="songs"
          :active-song-id="currentSongId"
          :tracks="project.tracks"
          :active-track-id="activeTrackId"
          :playing="playing"
          :midi-outputs="midiOutputs"
          :bpm="project.bpm"
          :send-midi-clock="syncSettings.sendMidiClock"
          :clock-output-id="syncSettings.clockOutputId"
          :sync-mode="syncSettings.syncMode"
          :clock-input-id="syncSettings.clockInputId"
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
          @add-track="addTrack"
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
          @toggle-clock="syncSettings.sendMidiClock = !syncSettings.sendMidiClock"
          @clock-output-change="syncSettings.clockOutputId = $event"
          @sync-mode-change="syncSettings.syncMode = $event"
          @clock-input-change="syncSettings.clockInputId = $event"
          @view-mode-change="viewMode = $event"
          @hold-pattern-down="onHoldPatternDown"
          @hold-pattern-up="onHoldPatternUp"
          @select-song="selectSong"
          @rename-song="renameSong"
          @create-song="createSong"
        />
        <LiveView
          v-show="viewMode === 'live'"
          :songs="songs"
          :active-song-id="currentSongId"
          :tracks="project.tracks"
          :playing="playing"
          :bpm="project.bpm"
          :sync-mode="syncSettings.syncMode"
          :clock-input-id="syncSettings.clockInputId"
          :send-midi-clock="syncSettings.sendMidiClock"
          :clock-output-id="syncSettings.clockOutputId"
          :midi-inputs="midiInputs"
          :midi-outputs="midiOutputs"
          @toggle-play="togglePlay"
          @bpm-change="setBpm"
          @sync-mode-change="syncSettings.syncMode = $event"
          @clock-input-change="syncSettings.clockInputId = $event"
          @toggle-clock="syncSettings.sendMidiClock = !syncSettings.sendMidiClock"
          @clock-output-change="syncSettings.clockOutputId = $event"
          @view-mode-change="viewMode = $event"
          @trigger-pattern="queueOrLaunchPattern"
          @hold-pattern-down="onHoldPatternDown"
          @hold-pattern-up="onHoldPatternUp"
          @edit-pattern="editPattern"
          @reorder-patterns="reorderPatterns"
          @select-song="selectSong"
          @rename-song="renameSong"
          @create-song="createSong"
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
  reorderPatterns as reorderTrackPatterns,
  syncUidCounter,
  LIVE_LAUNCH_MODES,
} from './models/project.js';
import {
  loadSongLibrary,
  persistSongLibrary,
  serializeProject,
  deserializeProject,
  createSongEntry,
} from './engine/songStorage.js';
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
import { queuePatternToggle, launchPatternImmediately, stopTrackImmediately, holdPatternDown, holdPatternUp } from './engine/liveLauncher.js';

const project = reactive(createProject());
const songs = ref([]);
const currentSongId = ref(null);
const playing = ref(false);
// 'roll': piano roll editor (default). 'live': session-style launch grid —
// toggled via Tab or the View control in either view's toolbar.
const viewMode = ref('roll');
// Sync/clock routing is global — not per-song (scheduler still reads project.*).
const syncSettings = reactive({
  syncMode: 'internal',
  clockInputId: '',
  sendMidiClock: false,
  clockOutputId: '',
});
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
let saveTimer = null;

function clearDrumSamples() {
  for (const track of project.tracks) {
    if (track.kind === 'drum') {
      for (const pad of track.pads) clearSample(pad.id);
    }
  }
}

function getTrackIndex(tracks, trackId) {
  const idx = tracks.findIndex((t) => t.id === trackId);
  return idx === -1 ? 0 : idx;
}

function getPatternIndex(track) {
  if (!track?.patterns?.length) return 0;
  const idx = track.patterns.findIndex((p) => p.id === track.activePatternId);
  return idx === -1 ? 0 : idx;
}

function applySessionSelection(tracks, trackIndex, patternIndex) {
  if (!tracks.length) {
    activeTrackId.value = null;
    return;
  }
  const ti = Math.min(Math.max(0, trackIndex), tracks.length - 1);
  const track = tracks[ti];
  activeTrackId.value = track.id;
  if (track.patterns?.length) {
    const pi = Math.min(Math.max(0, patternIndex), track.patterns.length - 1);
    track.activePatternId = track.patterns[pi].id;
  }
}

function applyGlobalSettingsToProject() {
  project.syncMode = syncSettings.syncMode;
  project.clockInputId = syncSettings.clockInputId;
  project.sendMidiClock = syncSettings.sendMidiClock;
  project.clockOutputId = syncSettings.clockOutputId;
}

function engageLivePlayback() {
  project.sessionView = 'live';
}

function replaceProject(snapshot, { preserveSelection = false } = {}) {
  let trackIndex = 0;
  let patternIndex = 0;
  if (preserveSelection && activeTrackId.value) {
    trackIndex = getTrackIndex(project.tracks, activeTrackId.value);
    patternIndex = getPatternIndex(project.tracks[trackIndex]);
  }

  clearDrumSamples();
  stopPlayback();
  const loaded = deserializeProject(snapshot);
  syncUidCounter(loaded);
  for (const key of Object.keys(project)) delete project[key];
  Object.assign(project, loaded);

  if (preserveSelection) {
    applySessionSelection(project.tracks, trackIndex, patternIndex);
  } else {
    activeTrackId.value =
      (project.tracks.find((t) => t.kind === 'midi') ?? project.tracks[0])?.id ?? null;
  }
  // View mode and sync settings are global — not per-song.
  applyGlobalSettingsToProject();
  syncClockLoopFromTracks();
  playback.setProject(project);
  engageSyncMode();
}

function persistSongs() {
  persistSongLibrary(songs.value, currentSongId.value);
}

function saveCurrentSong() {
  if (!currentSongId.value) return;
  const song = songs.value.find((s) => s.id === currentSongId.value);
  if (!song) return;
  song.project = serializeProject(project);
  song.updatedAt = new Date().toISOString();
  persistSongs();
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveCurrentSong, 400);
}

function initSongLibrary() {
  const { songs: stored, currentSongId: storedId } = loadSongLibrary();
  if (stored.length === 0) {
    const entry = createSongEntry('Untitled', createProject());
    songs.value = [entry];
    currentSongId.value = entry.id;
    replaceProject(entry.project);
    persistSongs();
    return;
  }
  songs.value = stored;
  const id = stored.some((s) => s.id === storedId) ? storedId : stored[0].id;
  currentSongId.value = id;
  const song = stored.find((s) => s.id === id);
  replaceProject(song.project);
}

function selectSong(songId) {
  if (songId === currentSongId.value) return;
  saveCurrentSong();
  currentSongId.value = songId;
  const song = songs.value.find((s) => s.id === songId);
  if (song) replaceProject(song.project, { preserveSelection: true });
  persistSongs();
}

function createSong(name) {
  saveCurrentSong();
  const entry = createSongEntry(name, createProject());
  songs.value.push(entry);
  currentSongId.value = entry.id;
  replaceProject(entry.project, { preserveSelection: true });
  persistSongs();
}

function renameSong(songId, name) {
  const song = songs.value.find((s) => s.id === songId);
  if (!song) return;
  song.name = name.trim() || song.name;
  song.updatedAt = new Date().toISOString();
  persistSongs();
}

// Transport loop spans the longest track pattern (or a user-drawn loop region)
// so shorter patterns can repeat independently inside the scheduler.
function syncClockLoopFromTracks() {
  const patternEndBeat = projectLoopEndBeat(project.tracks, {
    forPlayback: playing.value,
    useLiveLaunch: project.sessionView === 'live',
  });
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

  initSongLibrary();
});

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer);
  saveCurrentSong();
  playback.stop();
  if (playingUnsub) playingUnsub();
  if (outputsUnsub) outputsUnsub();
  if (inputsUnsub) inputsUnsub();
  if (clockInputUnsub) clockInputUnsub();
});

watch(syncSettings, applyGlobalSettingsToProject, { deep: true, immediate: true });
watch(() => [syncSettings.syncMode, syncSettings.clockInputId], engageSyncMode);

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
  // In piano-roll mode, playback follows activePatternId instead, so loop
  // length must follow that same source of truth.
  () => [
    projectLoopEndBeat(project.tracks, {
      forPlayback: playing.value,
      useLiveLaunch: project.sessionView === 'live',
    }),
    playing.value,
    project.sessionView,
  ],
  () => syncClockLoopFromTracks(),
  { immediate: true }
);

watch(
  project,
  () => scheduleSave(),
  { deep: true }
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
  project.sessionView = 'roll';
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
  for (const t of project.tracks) {
    if (t.ghostTrackId === trackId && t.ghostPatternId === patternId) {
      t.ghostTrackId = null;
      t.ghostPatternId = null;
    }
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

  engageLivePlayback();

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

function onHoldPatternDown(trackId, patternId) {
  const track = findTrack(trackId);
  if (!track || track.liveLaunchMode !== LIVE_LAUNCH_MODES.HOLD) return;

  engageLivePlayback();
  if (!playing.value) {
    startPlayback();
  }
  // Read abs beat only after the transport is running — otherwise
  // getAbsoluteBeat() returns a stale wrapped position and the unmute
  // boundary may never arrive (silence forever while the playhead moves).
  holdPatternDown(track, patternId, getActiveClock().getAbsoluteBeat());
}

function onHoldPatternUp(trackId) {
  const track = findTrack(trackId);
  if (!track || track.liveLaunchMode !== LIVE_LAUNCH_MODES.HOLD) return;
  holdPatternUp(track);
}

function editPattern(trackId, patternId) {
  const track = findTrack(trackId);
  if (track) track.activePatternId = patternId;
  activeTrackId.value = trackId;
  viewMode.value = 'roll';
}

function reorderPatterns(trackId, fromIndex, toIndex) {
  const track = findTrack(trackId);
  if (track) reorderTrackPatterns(track, fromIndex, toIndex);
}

function updateTrack(trackId, changes) {
  const track = findTrack(trackId);
  if (track) Object.assign(track, changes);
}

function addTrack(kind, config = {}) {
  const color = config.color ?? randomTrackColor(project.tracks.map((t) => t.color));
  const midiCount = project.tracks.filter((t) => t.kind === 'midi').length;
  const drumCount = project.tracks.filter((t) => t.kind === 'drum').length;
  const defaultName = kind === 'drum' ? `Drums ${drumCount + 1}` : `MIDI ${midiCount + 1}`;
  const track =
    kind === 'drum'
      ? createDrumTrack(config.name ?? defaultName, color)
      : createMidiTrack(config.name ?? defaultName, color);
  if (kind === 'midi') {
    track.midiOutputId = config.midiOutputId ?? '';
    track.midiChannel = config.midiChannel ?? 0;
  }
  if (kind === 'drum' && config.volume != null) track.volume = config.volume;
  if (config.category) track.category = config.category;
  project.tracks.push(track);
  activeTrackId.value = track.id;
}

function removeTrack(trackId) {
  const idx = project.tracks.findIndex((t) => t.id === trackId);
  if (idx === -1) return;

  const track = project.tracks[idx];
  if (track.kind === 'drum') {
    for (const pad of track.pads) clearSample(pad.id);
  }

  project.tracks.splice(idx, 1);

  for (const t of project.tracks) {
    if (t.ghostTrackId === trackId) {
      t.ghostTrackId = null;
      t.ghostPatternId = null;
    }
  }

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
