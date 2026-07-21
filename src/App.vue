<template>
  <div class="daw daw-shell" tabindex="0" @keydown="onKeyDown">
    <div class="flex-1 flex flex-col min-h-0 bg-panel rounded-lg border border-line overflow-hidden">
      <AppToolbar
        :view-mode="viewMode"
        :playing="playing"
        :bpm="project.bpm"
        :sync-mode="syncSettings.syncMode"
        :clock-input-id="syncSettings.clockInputId"
        :send-midi-clock="syncSettings.sendMidiClock"
        :clock-output-id="syncSettings.clockOutputId"
        :compact-navbar="globalSettings.compactNavbar"
        :midi-inputs="midiInputs"
        :midi-outputs="midiOutputs"
        :songs="songs"
        :active-song-id="currentSongId"
        @toggle-play="togglePlay"
        @bpm-change="setBpm"
        @view-mode-change="viewMode = $event"
        @select-song="selectSong"
        @update-song="updateSong"
        @create-song="createSong"
        @delete-song="deleteSong"
        @save-song-file="saveSongToFile"
        @load-song-file="loadSongFromFile"
        @load-song-file-error="onLoadSongFileError"
        @sync-mode-change="syncSettings.syncMode = $event"
        @clock-input-change="syncSettings.clockInputId = $event"
        @toggle-clock="syncSettings.sendMidiClock = !syncSettings.sendMidiClock"
        @clock-output-change="syncSettings.clockOutputId = $event"
        @compact-navbar-change="globalSettings.compactNavbar = $event"
      />

      <div class="flex-1 min-h-0">
        <PianoRoll
          v-show="viewMode === 'roll'"
          :toolbar-active="viewMode === 'roll'"
          :tracks="project.tracks"
          :active-track-id="activeTrackId"
          :playing="playing"
          :bpm="project.bpm"
          :midi-outputs="midiOutputs"
          :compact-navbar="globalSettings.compactNavbar"
          :marker-beat="project.markerBeat"
          :loop-region="project.loopRegion"
          :solo-preview="project.soloPreview"
          :scenes="project.scenes"
          @update-notes="updateNotes"
          @select-track="activeTrackId = $event"
          @select-pattern="selectPattern"
          @add-pattern="addPattern"
          @clone-pattern="clonePattern"
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
          @marker-change="project.markerBeat = $event"
          @loop-region-change="setLoopRegion"
          @bpm-change="setBpm"
          @hold-pattern-down="onHoldPatternDown"
          @hold-pattern-up="onHoldPatternUp"
          @preview-pattern="onPreviewPattern"
        />
        <LiveView
          v-show="viewMode === 'live'"
          :tracks="project.tracks"
          :scenes="project.scenes"
          :active-scene-id="activeSceneId"
          :playing="playing"
          @trigger-pattern="queueOrLaunchPattern"
          @hold-pattern-down="onHoldPatternDown"
          @hold-pattern-up="onHoldPatternUp"
          @reorder-patterns="reorderPatterns"
          @launch-scene="launchScene"
          @add-scene="startCreateScene"
          @edit-scene="startEditScene"
        />
      </div>
    </div>

    <SceneEditorModal
      v-if="sceneEditorOpen"
      :mode="sceneEditorMode"
      :initial="sceneEditorInitial"
      :tracks="project.tracks"
      :scenes="project.scenes"
      @save="commitSceneEditor"
      @cancel="closeSceneEditor"
      @delete="confirmDeleteScene"
    />

    <div
      v-if="midiError"
      class="fixed bottom-4 right-4 flex items-start gap-2 bg-red-900/90 text-red-200 pl-4 pr-2 py-2 rounded text-sm max-w-sm"
    >
      <span class="flex-1 pt-0.5">{{ midiError }}</span>
      <button
        type="button"
        class="shrink-0 w-6 h-6 rounded flex items-center justify-center text-red-300 hover:text-white hover:bg-red-800/80"
        title="Dismiss"
        aria-label="Dismiss"
        @click="midiError = ''"
      >
        ×
      </button>
    </div>
    <div v-if="fileError" class="fixed bottom-4 left-4 bg-red-900/90 text-red-200 px-4 py-2 rounded text-sm max-w-sm">
      {{ fileError }}
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch } from 'vue';
import AppToolbar from './components/AppToolbar.vue';
import PianoRoll from './components/PianoRoll.vue';
import LiveView from './components/LiveView.vue';
import SceneEditorModal from './components/SceneEditorModal.vue';
import {
  createProject,
  createMidiTrack,
  createDrumTrack,
  createDrumPad,
  createPattern,
  createScene,
  clonePattern as clonePatternModel,
  clearSceneFromPatterns,
  clearLinksToPattern,
  setPatternLinks,
  addPatternToScene,
  removePatternFromScene,
  normalizePatternSceneIds,
  defaultSceneName,
  getScenePatternRefs,
  randomTrackColor,
  randomPatternColor,
  getActivePattern,
  projectLoopEndBeat,
  reorderPatterns as reorderTrackPatterns,
  syncUidCounter,
  defaultDrumSampleFile,
  ensureDefaultDrumPads,
  normalizeProjectNotes,
  normalizeDrumTrack,
  normalizeDrumPad,
  LIVE_LAUNCH_MODES,
  patternLaunchMode,
} from './models/project.js';
import {
  loadSongLibrary,
  persistSongLibrary,
  serializeProject,
  deserializeProject,
  createSongEntry,
  downloadSongFile,
  parseSongFileJson,
} from './engine/songStorage.js';
import { loadGlobalSettings, persistGlobalSettings } from './engine/globalSettings.js';
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
import { clearSample, hasSample, loadSampleUrl } from './engine/sampler.js';
import { removeReverbBus } from './engine/reverb.js';
import { hasFileDrag } from './utils/audioFile.js';
import { isEditableTarget } from './utils/keyboard.js';
import {
  queueSceneLaunch,
  armSceneLoops,
  holdPatternUp,
} from './engine/liveLauncher.js';
import {
  resolveClipIntent,
  runLinkedClipIntent,
  holdLinkedPatternsDown,
  holdLinkedPatternsUp,
} from './engine/linkedLauncher.js';

const project = reactive(createProject());
const songs = ref([]);
const currentSongId = ref(null);
const playing = ref(false);
// 'roll': piano roll editor (default). 'live': session-style launch grid —
// toggled via Tab or the View control in either view's toolbar.
const viewMode = ref('roll');
const sceneEditorOpen = ref(false);
const sceneEditorMode = ref('create');
const sceneEditorId = ref(null);
const sceneEditorInitial = ref({ name: '' });
// Which scene button last claimed Live playback. Shared patterns must not light
// up every scene that contains them — only this id shows as playing/queued.
const activeSceneId = ref(null);
// Sync/clock routing is global — not per-song (scheduler still reads project.*).
const syncSettings = reactive({
  syncMode: 'internal',
  clockInputId: '',
  sendMidiClock: false,
  clockOutputId: '',
});
const globalSettings = reactive(loadGlobalSettings());
// Defaults to the first MIDI channel (falling back to whatever's first) so
// the piano roll opens on a familiar MIDI-note view rather than the drum pad list.
const activeTrackId = ref((project.tracks.find((t) => t.kind === 'midi') ?? project.tracks[0]).id);
const midiOutputs = ref([]);
const midiInputs = ref([]);
const midiError = ref('');
const fileError = ref('');

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

// Built-in samples in public/drums/ are engine-only buffers — reload them
// whenever project state is swapped in (song switch, load) since the cache
// was just cleared. Skips pads the user replaced with a custom fileName.
async function hydrateDefaultDrumSamples() {
  for (const track of project.tracks) {
    if (track.kind !== 'drum') continue;
    for (const pad of track.pads) {
      const defaultFile = defaultDrumSampleFile(pad.name);
      if (!defaultFile) continue;
      if (pad.fileName && pad.fileName !== defaultFile) continue;
      if (hasSample(pad.id)) continue;
      try {
        await loadSampleUrl(pad.id, `/drums/${defaultFile}`, defaultFile);
        if (!pad.fileName) pad.fileName = defaultFile;
      } catch (err) {
        console.warn(`Failed to load default drum sample for "${pad.name}":`, err);
      }
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
  ensureDefaultDrumPads(project.tracks);
  normalizeProjectNotes(project.tracks);

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
  void hydrateDefaultDrumSamples();
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
  const usedColors = songs.value.map((s) => s.color).filter(Boolean);
  const entry = createSongEntry(name, createProject(), randomTrackColor(usedColors));
  songs.value.push(entry);
  currentSongId.value = entry.id;
  replaceProject(entry.project, { preserveSelection: true });
  persistSongs();
}

function updateSong(songId, changes) {
  const song = songs.value.find((s) => s.id === songId);
  if (!song) return;
  if (changes.name != null) song.name = changes.name.trim() || song.name;
  if (changes.color != null) song.color = changes.color;
  if (changes.bpm != null) {
    const bpm = Math.max(40, Math.min(300, Math.round(Number(changes.bpm))));
    if (Number.isFinite(bpm)) {
      song.project = { ...song.project, bpm };
      if (songId === currentSongId.value) setBpm(bpm);
    }
  }
  song.updatedAt = new Date().toISOString();
  persistSongs();
}

function deleteSong(songId) {
  // Keep at least one song so the library / active project never go empty.
  if (songs.value.length <= 1) return;
  const idx = songs.value.findIndex((s) => s.id === songId);
  if (idx === -1) return;

  const wasActive = currentSongId.value === songId;
  // Discard pending autosave so we don't rewrite the deleted song's project.
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  songs.value.splice(idx, 1);

  if (wasActive) {
    const next = songs.value[Math.min(idx, songs.value.length - 1)];
    currentSongId.value = next.id;
    replaceProject(next.project, { preserveSelection: true });
  }
  persistSongs();
}

function applySyncSettingsFromProject(snapshot) {
  if (snapshot.syncMode != null) syncSettings.syncMode = snapshot.syncMode;
  if (snapshot.clockInputId != null) syncSettings.clockInputId = snapshot.clockInputId;
  if (snapshot.sendMidiClock != null) syncSettings.sendMidiClock = snapshot.sendMidiClock;
  if (snapshot.clockOutputId != null) syncSettings.clockOutputId = snapshot.clockOutputId;
}

function showFileError(message) {
  fileError.value = message;
  window.setTimeout(() => {
    if (fileError.value === message) fileError.value = '';
  }, 5000);
}

function saveSongToFile() {
  saveCurrentSong();
  const song = songs.value.find((s) => s.id === currentSongId.value);
  const name = song?.name ?? 'Untitled';
  applyGlobalSettingsToProject();
  downloadSongFile(name, project);
}

function loadSongFromFile(text) {
  let parsed;
  try {
    parsed = parseSongFileJson(text);
  } catch (err) {
    showFileError(err instanceof Error ? err.message : 'Could not load song file.');
    return;
  }

  saveCurrentSong();
  applySyncSettingsFromProject(parsed.project);
  const usedColors = songs.value.map((s) => s.color).filter(Boolean);
  const entry = createSongEntry(parsed.name, parsed.project, randomTrackColor(usedColors));
  songs.value.push(entry);
  currentSongId.value = entry.id;
  replaceProject(entry.project, { preserveSelection: true });
  persistSongs();
}

function onLoadSongFileError(message) {
  showFileError(message);
}

// Transport loop spans the longest track pattern (or a user-drawn loop region)
// so shorter patterns can repeat independently inside the scheduler.
function syncClockLoopFromTracks() {
  const useLiveLaunch = project.sessionView === 'live';
  const patternEndBeat = projectLoopEndBeat(project.tracks, {
    forPlayback: playing.value,
    useLiveLaunch,
    soloPreview: useLiveLaunch ? null : project.soloPreview,
  });
  const region = project.loopRegion;
  const loopStartBeat = region ? region.startBeat : 0;
  const loopEndBeat = region ? Math.min(region.endBeat, patternEndBeat) : patternEndBeat;
  for (const clock of [transport, externalClock]) {
    clock.loopStartBeat = loopStartBeat;
    clock.loopEndBeat = loopEndBeat;
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
    if (type === 'stop') {
      playing.value = false;
      activeSceneId.value = null;
    }
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

function onWindowDragOver(e) {
  if (hasFileDrag(e.dataTransfer)) e.preventDefault();
}

onMounted(async () => {
  window.addEventListener('dragover', onWindowDragOver);
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
  window.removeEventListener('dragover', onWindowDragOver);
  if (saveTimer) clearTimeout(saveTimer);
  saveCurrentSong();
  playback.stop();
  if (playingUnsub) playingUnsub();
  if (outputsUnsub) outputsUnsub();
  if (inputsUnsub) inputsUnsub();
  if (clockInputUnsub) clockInputUnsub();
});

watch(syncSettings, applyGlobalSettingsToProject, { deep: true, immediate: true });
watch(globalSettings, () => persistGlobalSettings(globalSettings), { deep: true });
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
  // launch that swaps in a differently-sized pattern (via liveLaunches)
  // wouldn't resize the transport's loop/wrap boundary while already playing.
  // In piano-roll mode, playback follows activePatternId instead, so loop
  // length must follow that same source of truth.
  () => [
    projectLoopEndBeat(project.tracks, {
      forPlayback: playing.value,
      useLiveLaunch: project.sessionView === 'live',
      soloPreview: project.sessionView === 'live' ? null : project.soloPreview,
    }),
    playing.value,
    project.sessionView,
    project.soloPreview,
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

function startPlayback(fromBeat, { keepSoloPreview = false } = {}) {
  if (project.syncMode === 'external') return;
  if (!keepSoloPreview) project.soloPreview = null;
  if (viewMode.value === 'live') {
    engageLivePlayback();
  } else {
    // Roll-view transport play must not inherit a stale sessionView === 'live'
    // from an earlier Live session or hold preview — that would re-arm Live
    // launch semantics and can sound Hold-mode tracks without a hold press.
    project.sessionView = 'roll';
  }
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
  activeSceneId.value = null;
  project.soloPreview = null;
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

function addPattern(trackId, config = {}) {
  const track = findTrack(trackId);
  if (!track?.patterns?.length) return;

  const active = getActivePattern(track);
  const usedColors = track.patterns.map((p) => p.color);
  const pattern = createPattern(
    config.name ?? `Pattern ${track.patterns.length + 1}`,
    config.color ?? randomPatternColor(usedColors),
    config.patternSteps ?? active?.patternSteps ?? 16
  );
  if (config.liveLaunchMode != null) pattern.liveLaunchMode = config.liveLaunchMode;
  if (config.liveSyncGrid != null) pattern.liveSyncGrid = config.liveSyncGrid;
  if (config.cutOthers != null) pattern.cutOthers = config.cutOthers;
  if (config.hiddenFromLive != null) pattern.hiddenFromLive = !!config.hiddenFromLive;
  if (config.sceneIds !== undefined) {
    pattern.sceneIds = Array.isArray(config.sceneIds) ? [...config.sceneIds] : [];
    normalizePatternSceneIds(pattern);
  }
  track.patterns.push(pattern);
  track.activePatternId = pattern.id;
  if (config.linkedPatternIds !== undefined) {
    setPatternLinks(project.tracks, pattern.id, config.linkedPatternIds);
  }
}

function clonePattern(trackId, sourcePatternId) {
  const track = findTrack(trackId);
  if (!track?.patterns?.length) return;

  const source =
    track.patterns.find((p) => p.id === sourcePatternId) ?? getActivePattern(track);
  if (!source) return;

  const pattern = clonePatternModel(source, track.patterns);
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
  if (!pattern) return;
  const { linkedPatternIds, ...rest } = changes ?? {};
  Object.assign(pattern, rest);
  if (changes?.sceneIds !== undefined) normalizePatternSceneIds(pattern);
  if (linkedPatternIds !== undefined) {
    setPatternLinks(project.tracks, patternId, linkedPatternIds);
  }
}

function deletePattern(trackId, patternId) {
  const track = findTrack(trackId);
  if (!track?.patterns || track.patterns.length <= 1) return;

  const idx = track.patterns.findIndex((p) => p.id === patternId);
  if (idx === -1) return;

  clearLinksToPattern(project.tracks, patternId);
  track.patterns.splice(idx, 1);

  if (track.activePatternId === patternId) {
    track.activePatternId = track.patterns[Math.max(0, idx - 1)].id;
  }
  if (track.liveLaunches) {
    track.liveLaunches = track.liveLaunches.filter((l) => l.patternId !== patternId);
  }
  if (track.pendingLaunches) {
    track.pendingLaunches = track.pendingLaunches.filter((p) => p.patternId !== patternId);
  }
  if (project.soloPreview?.trackId === trackId && project.soloPreview?.patternId === patternId) {
    project.soloPreview = null;
  }
  for (const t of project.tracks) {
    if (t.ghostTrackId === trackId && t.ghostPatternId === patternId) {
      t.ghostTrackId = null;
      t.ghostPatternId = null;
    }
  }
}

// Live mode click handling — Loop clips toggle; One Shot clips play once:
//   - stopped transport, different pattern -> launches it and starts playing.
//   - stopped transport, already-armed pattern -> un-arms it (stays stopped).
//   - playing transport, Loop: queue swap / toggle-off at the next boundary.
//   - playing transport, One Shot: queue a single playthrough, then auto-stop.
// Linked patterns (edit pattern → Linked patterns) receive the same start/stop
// intent, including clips hidden from Live. See engine/linkedLauncher.js.
function queueOrLaunchPattern(trackId, patternId) {
  const track = findTrack(trackId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  if (!track || !pattern) return;

  // Manual clip launch leaves scene mode — only scene buttons claim a scene.
  activeSceneId.value = null;
  engageLivePlayback();

  const intent = resolveClipIntent(track, pattern, playing.value);
  runLinkedClipIntent(project.tracks, patternId, intent, {
    transportPlaying: playing.value,
    startPlayback: () => startPlayback(),
    getAbsBeat: () => getActiveClock().getAbsoluteBeat(),
  });
}

// Remember which pattern started a Hold gesture so release can fan out to
// its link group (hold-up events only carry the track id today).
let activeHoldPatternId = null;

function onHoldPatternDown(trackId, patternId) {
  const track = findTrack(trackId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  if (!track || patternLaunchMode(pattern) !== LIVE_LAUNCH_MODES.HOLD) return;

  project.soloPreview = null;
  engageLivePlayback();
  if (!playing.value) {
    startPlayback();
  }
  // Read abs beat only after the transport is running — otherwise
  // getAbsoluteBeat() returns a stale wrapped position and the unmute
  // boundary may never arrive (silence forever while the playhead moves).
  activeHoldPatternId = patternId;
  holdLinkedPatternsDown(project.tracks, patternId, getActiveClock().getAbsoluteBeat());
}

function onHoldPatternUp(trackId) {
  const patternId = activeHoldPatternId;
  activeHoldPatternId = null;
  if (patternId) {
    holdLinkedPatternsUp(project.tracks, patternId);
    return;
  }
  const track = findTrack(trackId);
  if (!track) return;
  holdPatternUp(track);
}

// Roll-view ▶ on Loop / One Shot patterns — solo preview for one pattern
// without sounding every track from the main transport Play button.
function onPreviewPattern(trackId, patternId) {
  const track = findTrack(trackId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  const mode = patternLaunchMode(pattern);
  if (
    !track ||
    !pattern ||
    (mode !== LIVE_LAUNCH_MODES.TOGGLE && mode !== LIVE_LAUNCH_MODES.ONE_SHOT)
  ) {
    return;
  }

  const current = project.soloPreview;
  if (current?.trackId === trackId && current?.patternId === patternId) {
    project.soloPreview = null;
    if (playing.value) stopPlayback();
    return;
  }

  project.soloPreview = { trackId, patternId };
  syncClockLoopFromTracks();
  if (!playing.value) {
    startPlayback(undefined, { keepSoloPreview: true });
  }
}

function reorderPatterns(trackId, fromIndex, toIndex) {
  const track = findTrack(trackId);
  if (track) reorderTrackPatterns(track, fromIndex, toIndex);
}

function ensureScenes() {
  if (!Array.isArray(project.scenes)) project.scenes = [];
  return project.scenes;
}

function scenePatternIds(sceneId) {
  return getScenePatternRefs(project.tracks, sceneId).map(({ pattern }) => pattern.id);
}

/**
 * Apply scene membership from the editor for one scene only.
 * Patterns in the list gain this sceneId; patterns that leave lose only this sceneId
 * (membership in other scenes is preserved).
 */
function applyScenePatternMembership(sceneId, patternIds) {
  if (!sceneId) return;
  const wanted = new Set(patternIds ?? []);
  for (const track of project.tracks) {
    for (const pattern of track.patterns ?? []) {
      if (wanted.has(pattern.id)) {
        addPatternToScene(pattern, sceneId);
      } else {
        removePatternFromScene(pattern, sceneId);
      }
    }
  }
}

function startCreateScene() {
  sceneEditorMode.value = 'create';
  sceneEditorId.value = null;
  sceneEditorInitial.value = {
    name: defaultSceneName(ensureScenes()),
    sceneId: null,
    patternIds: [],
  };
  sceneEditorOpen.value = true;
}

function startEditScene(sceneId) {
  const scene = ensureScenes().find((s) => s.id === sceneId);
  if (!scene) return;
  sceneEditorMode.value = 'edit';
  sceneEditorId.value = scene.id;
  sceneEditorInitial.value = {
    name: scene.name,
    sceneId: scene.id,
    patternIds: scenePatternIds(scene.id),
  };
  sceneEditorOpen.value = true;
}

function closeSceneEditor() {
  sceneEditorOpen.value = false;
  sceneEditorId.value = null;
}

function commitSceneEditor(values) {
  const name = values?.name?.trim();
  if (!name) return;
  const scenes = ensureScenes();
  const patternIds = Array.isArray(values.patternIds) ? values.patternIds : [];
  if (sceneEditorMode.value === 'create') {
    const scene = createScene(name);
    scenes.push(scene);
    applyScenePatternMembership(scene.id, patternIds);
  } else if (sceneEditorId.value) {
    const scene = scenes.find((s) => s.id === sceneEditorId.value);
    if (scene) scene.name = name;
    applyScenePatternMembership(sceneEditorId.value, patternIds);
  }
  closeSceneEditor();
}

function confirmDeleteScene() {
  const sceneId = sceneEditorId.value;
  if (!sceneId) return;
  const scenes = ensureScenes();
  const idx = scenes.findIndex((s) => s.id === sceneId);
  if (idx === -1) return;
  scenes.splice(idx, 1);
  clearSceneFromPatterns(project.tracks, sceneId);
  if (activeSceneId.value === sceneId) activeSceneId.value = null;
  closeSceneEditor();
}

// Scene button — launch every assigned Loop / One Shot on one shared quantize
// boundary, and cut anything else that is playing/queued (exclusive scene).
// Claims activeSceneId so shared patterns don't light up other scenes in the UI.
function launchScene(sceneId) {
  const refs = getScenePatternRefs(project.tracks, sceneId).filter(
    ({ pattern }) => patternLaunchMode(pattern) !== LIVE_LAUNCH_MODES.HOLD
  );
  if (!refs.length) return;

  engageLivePlayback();
  activeSceneId.value = sceneId;

  if (!playing.value) {
    // Start at beat 0 with startBeat stamped so every clip begins at pattern
    // beat 0, and later switches can wait on each clip's real loop end.
    const { oneShots } = armSceneLoops(refs, project.tracks, { originBeat: 0 });
    startPlayback(0);
    if (oneShots.length) {
      queueSceneLaunch(oneShots, getActiveClock().getAbsoluteBeat(), project.tracks);
    }
    return;
  }

  queueSceneLaunch(refs, getActiveClock().getAbsoluteBeat(), project.tracks);
}

function updateTrack(trackId, changes) {
  const track = findTrack(trackId);
  if (track) {
    Object.assign(track, changes);
    if (track.kind === 'drum') normalizeDrumTrack(track);
  }
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
  if (config.hiddenFromLive != null) track.hiddenFromLive = !!config.hiddenFromLive;
  project.tracks.push(track);
  activeTrackId.value = track.id;
  if (kind === 'drum') void hydrateDefaultDrumSamples();
}

function removeTrack(trackId) {
  const idx = project.tracks.findIndex((t) => t.id === trackId);
  if (idx === -1) return;

  const track = project.tracks[idx];
  if (track.kind === 'drum') {
    for (const pad of track.pads) {
      clearSample(pad.id);
      removeReverbBus(pad.id);
    }
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
  if (pad) {
    Object.assign(pad, changes);
    normalizeDrumPad(pad);
  }
}

function addPad(trackId) {
  const track = findTrack(trackId);
  if (track?.kind !== 'drum') return;
  track.pads.push(createDrumPad(`Pad ${track.pads.length + 1}`, '#8899aa'));
}

function removePad(trackId, padId) {
  const track = findTrack(trackId);
  if (track?.kind !== 'drum') return;
  clearSample(padId);
  removeReverbBus(padId);
  for (const p of track.pads) {
    if (Array.isArray(p.cutByPads)) p.cutByPads = p.cutByPads.filter((id) => id !== padId);
  }
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
    if (isEditableTarget(target)) return;

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
