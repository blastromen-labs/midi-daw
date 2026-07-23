<template>
  <div class="daw daw-shell" tabindex="0" @keydown="onKeyDown">
    <div class="flex-1 flex flex-col min-h-0 bg-panel rounded-lg border border-line overflow-hidden">
      <AppToolbar
        :view-mode="viewMode"
        :playing="playing"
        :bpm="mixBpm"
        :sync-mode="syncSettings.syncMode"
        :clock-input-id="syncSettings.clockInputId"
        :send-midi-clock="syncSettings.sendMidiClock"
        :clock-output-id="syncSettings.clockOutputId"
        :compact-navbar="globalSettings.compactNavbar"
        :midi-inputs="midiInputs"
        :midi-outputs="midiOutputs"
        :songs="songs"
        :active-song-id="currentSongId"
        :show-hidden="showHiddenLive"
        :edit-mode="liveEditMode"
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
        @toggle-show-hidden="showHiddenLive = !showHiddenLive"
        @toggle-edit-mode="liveEditMode = !liveEditMode"
      />

      <div class="relative flex-1 min-h-0 overflow-hidden">
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
          @hold-pattern-down="onRollHoldPatternDown"
          @hold-pattern-up="onRollHoldPatternUp"
          @preview-pattern="onPreviewPattern"
        />
        <LiveView
          v-show="viewMode === 'live'"
          class="absolute inset-0"
          :live-songs="liveSongs"
          :active-scene-by-song="activeSceneBySong"
          :playing="playing"
          :show-hidden="showHiddenLive"
          :edit-mode="liveEditMode"
          :midi-outputs="midiOutputs"
          @trigger-pattern="queueOrLaunchPattern"
          @hold-pattern-down="onHoldPatternDown"
          @hold-pattern-up="onHoldPatternUp"
          @reorder-patterns="reorderPatterns"
          @launch-scene="launchScene"
          @add-scene="startCreateScene"
          @edit-scene="startEditScene"
          @edit-track="startEditLiveTrack"
          @toggle-track-mute="toggleTrackMute"
          @toggle-track-solo="toggleTrackSolo"
          @edit-pattern="startEditLivePattern"
          @open-pattern-roll="openPatternInRoll"
          @move-song="onMoveLiveSong"
        />
      </div>
    </div>

    <SceneEditorModal
      v-if="sceneEditorOpen"
      :mode="sceneEditorMode"
      :initial="sceneEditorInitial"
      :tracks="sceneEditorTracks"
      :scenes="sceneEditorScenes"
      @save="commitSceneEditor"
      @cancel="closeSceneEditor"
      @delete="confirmDeleteScene"
    />

    <!-- Live quick-edit: same modals as Roll menus, hosted here so any song in the set is editable. -->
    <PatternEditorModal
      v-if="patternEditorOpen"
      mode="edit"
      :initial="patternEditorInitial"
      :scenes="patternEditorScenes"
      :tracks="patternEditorTracks"
      :track-id="patternEditorTrackId"
      :pattern-id="patternEditorPatternId"
      :can-delete="patternEditorCanDelete"
      @save="commitLivePatternEditor"
      @delete="confirmDeleteLivePattern"
      @cancel="closePatternEditor"
    />

    <TrackEditorModal
      v-if="trackEditorOpen"
      mode="edit"
      :kind="trackEditorKind"
      :initial="trackEditorInitial"
      :midi-outputs="midiOutputs"
      @save="commitLiveTrackEditor"
      @live-update="onLiveTrackEditorLiveUpdate"
      @revert="onLiveTrackEditorRevert"
      @delete="confirmDeleteLiveTrack"
      @cancel="closeTrackEditor"
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
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import AppToolbar from './components/AppToolbar.vue';
import PianoRoll from './components/PianoRoll.vue';
import LiveView from './components/LiveView.vue';
import SceneEditorModal from './components/SceneEditorModal.vue';
import PatternEditorModal from './components/PatternEditorModal.vue';
import TrackEditorModal from './components/TrackEditorModal.vue';
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
import {
  normalizeLiveSongOrder,
  moveLiveSong,
  snapshotLiveRuntime,
} from './engine/liveSet.js';
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
import {
  clearSample,
  hasSample,
  loadSampleUrl,
  restoreStoredSample,
} from './engine/sampler.js';
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
/** Ordered song ids shown as stacked blocks in Live view. */
const liveSongOrder = ref([]);
/**
 * Background song projects kept in memory for Live mixing (not the edit-focus
 * song). Keyed by song id; includes liveLaunches so clips keep sounding when
 * the user switches which song they're editing.
 */
const songRuntimes = reactive({});
const playing = ref(false);
/** Transport / toolbar tempo — may differ from the edit-focus song's written BPM during a Live scene take-over. */
const mixBpm = ref(120);
// 'roll': piano roll editor (default). 'live': session-style launch grid —
// toggled via Tab or the View control in either view's toolbar.
const viewMode = ref('roll');
/** Live UI: show tracks/patterns marked Hide from Live (still play via scenes). */
const showHiddenLive = ref(false);
/** Live UI: show pen buttons that open track/pattern/scene settings modals. */
const liveEditMode = ref(false);
const sceneEditorOpen = ref(false);
const sceneEditorMode = ref('create');
const sceneEditorId = ref(null);
const sceneEditorSongId = ref(null);
const sceneEditorInitial = ref({ name: '' });

const patternEditorOpen = ref(false);
const patternEditorSongId = ref(null);
const patternEditorTrackId = ref(null);
const patternEditorPatternId = ref(null);
const patternEditorInitial = ref({});

const trackEditorOpen = ref(false);
const trackEditorSongId = ref(null);
const trackEditorTrackId = ref(null);
const trackEditorKind = ref('midi');
const trackEditorInitial = ref({});
// Per-song: which scene button last claimed Live playback in that song.
const activeSceneBySong = reactive({});
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
/** Deferred scene tempo: applied when absBeat reaches atBeat (same boundary as the scene). */
let pendingSceneTempo = null;

function getProjectForSong(songId) {
  if (!songId || songId === currentSongId.value) return project;
  return songRuntimes[songId] ?? null;
}

/** Every track across the Live-set order — used by the scheduler for multi-song mixes. */
function getAllLiveTracks() {
  const tracks = [];
  for (const id of liveSongOrder.value) {
    const proj = getProjectForSong(id);
    if (proj?.tracks?.length) tracks.push(...proj.tracks);
  }
  return tracks.length ? tracks : project.tracks;
}

function clearDrumSamplesForTracks(tracks, { discardStored = false } = {}) {
  for (const track of tracks ?? []) {
    if (track.kind === 'drum') {
      for (const pad of track.pads ?? []) clearSample(pad.id, { discardStored });
    }
  }
}

function clearDrumSamples({ discardStored = false } = {}) {
  clearDrumSamplesForTracks(project.tracks, { discardStored });
}

// Reload drum audio into the engine cache after project swap / refresh.
// Custom samples come back from IndexedDB; built-ins re-fetch from /drums/.
async function hydrateDrumSamplesForTracks(tracks) {
  for (const track of tracks ?? []) {
    if (track.kind !== 'drum') continue;
    for (const pad of track.pads ?? []) {
      if (hasSample(pad.id)) continue;

      const restored = await restoreStoredSample(pad.id, pad.fileName || '');
      if (restored) continue;

      const defaultFile = defaultDrumSampleFile(pad.name);
      if (!defaultFile) continue;
      // Pad still shows a custom fileName but bytes are missing (pre-persistence
      // song, or storage cleared) — don't overwrite the label with the default.
      if (pad.fileName && pad.fileName !== defaultFile) continue;
      try {
        await loadSampleUrl(pad.id, `/drums/${defaultFile}`, defaultFile);
        if (!pad.fileName) pad.fileName = defaultFile;
      } catch (err) {
        console.warn(`Failed to load default drum sample for "${pad.name}":`, err);
      }
    }
  }
}

async function hydrateDefaultDrumSamples() {
  await hydrateDrumSamplesForTracks(project.tracks);
}

function ensureSongRuntime(songId) {
  if (!songId || songId === currentSongId.value) return project;
  if (songRuntimes[songId]) return songRuntimes[songId];
  const song = songs.value.find((s) => s.id === songId);
  if (!song) return null;
  const loaded = deserializeProject(song.project);
  ensureDefaultDrumPads(loaded.tracks);
  normalizeProjectNotes(loaded.tracks);
  loaded.syncMode = syncSettings.syncMode;
  loaded.clockInputId = syncSettings.clockInputId;
  loaded.sendMidiClock = syncSettings.sendMidiClock;
  loaded.clockOutputId = syncSettings.clockOutputId;
  songRuntimes[songId] = loaded;
  syncUidCounter({ project, songRuntimes, songs: songs.value });
  void hydrateDrumSamplesForTracks(loaded.tracks);
  return loaded;
}

function ensureAllLiveRuntimes() {
  liveSongOrder.value = normalizeLiveSongOrder(liveSongOrder.value, songs.value);
  for (const id of liveSongOrder.value) ensureSongRuntime(id);
}

const liveSongs = computed(() =>
  liveSongOrder.value.map((id) => {
    const meta = songs.value.find((s) => s.id === id);
    const proj = getProjectForSong(id);
    return {
      id,
      name: meta?.name ?? 'Untitled',
      color: meta?.color ?? '#6699ff',
      bpm: proj?.bpm ?? meta?.project?.bpm ?? 120,
      tracks: proj?.tracks ?? [],
      scenes: proj?.scenes ?? [],
    };
  })
);

const sceneEditorTracks = computed(
  () => getProjectForSong(sceneEditorSongId.value)?.tracks ?? project.tracks
);
const sceneEditorScenes = computed(
  () => getProjectForSong(sceneEditorSongId.value)?.scenes ?? project.scenes
);

const patternEditorTracks = computed(
  () => getProjectForSong(patternEditorSongId.value)?.tracks ?? project.tracks
);
const patternEditorScenes = computed(
  () => getProjectForSong(patternEditorSongId.value)?.scenes ?? project.scenes
);
const patternEditorCanDelete = computed(() => {
  const track = findTrack(patternEditorTrackId.value, patternEditorSongId.value);
  return (track?.patterns?.length ?? 0) > 1;
});

function clearActiveScenes() {
  for (const key of Object.keys(activeSceneBySong)) delete activeSceneBySong[key];
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
  for (const id of liveSongOrder.value) {
    if (id === currentSongId.value) continue;
    const runtime = songRuntimes[id];
    if (runtime) runtime.sessionView = 'live';
  }
  ensureAllLiveRuntimes();
  playback.setLiveTracksGetter(getAllLiveTracks);
}

function adoptProjectData(loaded, { preserveSelection = false, clearSamples = true, doStop = true } = {}) {
  let trackIndex = 0;
  let patternIndex = 0;
  if (preserveSelection && activeTrackId.value) {
    trackIndex = getTrackIndex(project.tracks, activeTrackId.value);
    patternIndex = getPatternIndex(project.tracks[trackIndex]);
  }

  if (clearSamples) clearDrumSamples();
  if (doStop) stopPlayback();

  syncUidCounter({ loaded, project, songRuntimes, songs: songs.value });
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
  playback.setLiveTracksGetter(getAllLiveTracks);
  if (doStop) engageSyncMode();
  void hydrateDefaultDrumSamples();
}

function replaceProject(snapshot, { preserveSelection = false, clearSamples = true, doStop = true } = {}) {
  const loaded = deserializeProject(snapshot);
  adoptProjectData(loaded, { preserveSelection, clearSamples, doStop });
}

function persistSongs() {
  persistSongLibrary(songs.value, currentSongId.value, liveSongOrder.value);
}

function saveSongById(songId) {
  if (!songId) return;
  const song = songs.value.find((s) => s.id === songId);
  if (!song) return;
  const proj = getProjectForSong(songId);
  if (!proj) return;
  song.project = serializeProject(proj);
  song.updatedAt = new Date().toISOString();
}

function saveCurrentSong() {
  saveSongById(currentSongId.value);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCurrentSong();
    for (const id of Object.keys(songRuntimes)) saveSongById(id);
    persistSongs();
  }, 400);
}

function initSongLibrary() {
  const { songs: stored, currentSongId: storedId, liveSongOrder: storedOrder } = loadSongLibrary();
  if (stored.length === 0) {
    const entry = createSongEntry('Untitled', createProject());
    songs.value = [entry];
    currentSongId.value = entry.id;
    liveSongOrder.value = [entry.id];
    replaceProject(entry.project);
    persistSongs();
    return;
  }
  songs.value = stored;
  const id = stored.some((s) => s.id === storedId) ? storedId : stored[0].id;
  currentSongId.value = id;
  liveSongOrder.value = normalizeLiveSongOrder(storedOrder, stored);
  const song = stored.find((s) => s.id === id);
  replaceProject(song.project);
  ensureAllLiveRuntimes();
}

function selectSong(songId) {
  if (songId === currentSongId.value) return;

  // Keep sounding Live clips when switching edit focus mid-mix — park the
  // outgoing song's runtime (with liveLaunches) instead of tearing the clock down.
  const keepLiveMix =
    playing.value && (viewMode.value === 'live' || project.sessionView === 'live');

  if (keepLiveMix) {
    songRuntimes[currentSongId.value] = snapshotLiveRuntime(project);
  } else {
    delete songRuntimes[currentSongId.value];
  }

  saveCurrentSong();
  currentSongId.value = songId;

  const runtime = songRuntimes[songId];
  if (runtime) {
    delete songRuntimes[songId];
    adoptProjectData(runtime, {
      preserveSelection: true,
      clearSamples: !keepLiveMix,
      doStop: !keepLiveMix,
    });
  } else {
    const song = songs.value.find((s) => s.id === songId);
    if (song) {
      replaceProject(song.project, {
        preserveSelection: true,
        clearSamples: !keepLiveMix,
        doStop: !keepLiveMix,
      });
    }
  }

  if (keepLiveMix) project.sessionView = 'live';
  persistSongs();
  ensureAllLiveRuntimes();
}

function createSong(name) {
  saveCurrentSong();
  const usedColors = songs.value.map((s) => s.color).filter(Boolean);
  const entry = createSongEntry(name, createProject(), randomTrackColor(usedColors));
  songs.value.push(entry);
  liveSongOrder.value = normalizeLiveSongOrder([...liveSongOrder.value, entry.id], songs.value);
  currentSongId.value = entry.id;
  replaceProject(entry.project, { preserveSelection: true });
  persistSongs();
  ensureAllLiveRuntimes();
}

function onMoveLiveSong(songId, direction) {
  liveSongOrder.value = moveLiveSong(liveSongOrder.value, songId, direction);
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
      const runtime = getProjectForSong(songId);
      if (runtime) runtime.bpm = bpm;
      // Transport tempo only follows the edit-focus song — other songs show
      // their written BPM as a Live hint while the mix stays on the master clock.
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

  const song = songs.value[idx];
  const runtime = songRuntimes[songId];
  // Drop stored custom samples for this song's pads — they won't be referenced.
  // Active song lives in `project`, not songRuntimes.
  const tracksForCleanup = wasActive
    ? project.tracks
    : (runtime?.tracks ?? song?.project?.tracks);
  if (tracksForCleanup) {
    clearDrumSamplesForTracks(tracksForCleanup, { discardStored: true });
  }
  if (runtime) delete songRuntimes[songId];
  delete activeSceneBySong[songId];
  songs.value.splice(idx, 1);
  liveSongOrder.value = normalizeLiveSongOrder(
    liveSongOrder.value.filter((id) => id !== songId),
    songs.value
  );

  if (wasActive) {
    const next = songs.value[Math.min(idx, songs.value.length - 1)];
    currentSongId.value = next.id;
    const nextRuntime = songRuntimes[next.id];
    if (nextRuntime) {
      delete songRuntimes[next.id];
      adoptProjectData(nextRuntime, { preserveSelection: true });
    } else {
      replaceProject(next.project, { preserveSelection: true });
    }
  }
  persistSongs();
  ensureAllLiveRuntimes();
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
  liveSongOrder.value = normalizeLiveSongOrder([...liveSongOrder.value, entry.id], songs.value);
  currentSongId.value = entry.id;
  replaceProject(entry.project, { preserveSelection: true });
  persistSongs();
  ensureAllLiveRuntimes();
}

function onLoadSongFileError(message) {
  showFileError(message);
}

// Transport loop spans the longest track pattern (or a user-drawn loop region)
// so shorter patterns can repeat independently inside the scheduler.
function syncClockLoopFromTracks() {
  const useLiveLaunch = project.sessionView === 'live';
  const tracks = useLiveLaunch ? getAllLiveTracks() : project.tracks;
  const patternEndBeat = projectLoopEndBeat(tracks, {
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
      clearActiveScenes();
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
  playback.setLiveTracksGetter(getAllLiveTracks);
  playback.setLiveBoundaryHandler(onLiveBoundary);
});

onUnmounted(() => {
  window.removeEventListener('dragover', onWindowDragOver);
  if (saveTimer) clearTimeout(saveTimer);
  saveCurrentSong();
  for (const id of Object.keys(songRuntimes)) saveSongById(id);
  persistSongs();
  playback.setLiveTracksGetter(null);
  playback.setLiveBoundaryHandler(null);
  playback.stop();
  if (playingUnsub) playingUnsub();
  if (outputsUnsub) outputsUnsub();
  if (inputsUnsub) inputsUnsub();
  if (clockInputUnsub) clockInputUnsub();
});

watch(syncSettings, applyGlobalSettingsToProject, { deep: true, immediate: true });
watch(globalSettings, () => persistGlobalSettings(globalSettings), { deep: true });
watch(() => [syncSettings.syncMode, syncSettings.clockInputId], engageSyncMode);

watch(viewMode, (mode) => {
  if (mode === 'live') {
    ensureAllLiveRuntimes();
    playback.setLiveTracksGetter(getAllLiveTracks);
  }
});

watch(
  () => project.bpm,
  (bpm) => {
    mixBpm.value = bpm;
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
  // Live mode spans every song in the set so a longer clip in a background
  // song still expands the transport wrap.
  () => [
    projectLoopEndBeat(
      project.sessionView === 'live' ? getAllLiveTracks() : project.tracks,
      {
        forPlayback: playing.value,
        useLiveLaunch: project.sessionView === 'live',
        soloPreview: project.sessionView === 'live' ? null : project.soloPreview,
      }
    ),
    playing.value,
    project.sessionView,
    project.soloPreview,
    liveSongOrder.value.join(','),
  ],
  () => syncClockLoopFromTracks(),
  { immediate: true }
);

watch(
  project,
  () => scheduleSave(),
  { deep: true }
);

watch(
  songRuntimes,
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

function startPlayback(fromBeat, { keepSoloPreview = false, forceLive = false } = {}) {
  if (project.syncMode === 'external') return;
  if (!keepSoloPreview) project.soloPreview = null;
  if (viewMode.value === 'live' || forceLive) {
    engageLivePlayback();
  } else {
    // Roll-view transport play must not inherit a stale sessionView === 'live'
    // from an earlier Live session or hold preview — that would re-arm Live
    // launch semantics and can sound Hold-mode tracks without a hold press.
    project.sessionView = 'roll';
    playback.setLiveTracksGetter(null);
  }
  playback.setProject(project);
  // Prefer mixBpm so a Live scene take-over from another song keeps its tempo
  // when startPlayback runs immediately after applyMixTempo.
  transport.bpm = mixBpm.value;
  syncClockLoopFromTracks();
  playback.start(fromBeat);
  playing.value = true;
}

function stopPlayback() {
  if (project.syncMode === 'external') return; // Stop is driven by the incoming clock
  playback.stop();
  playing.value = false;
  clearActiveScenes();
  clearPendingSceneTempo();
  project.soloPreview = null;
  project.sessionView = 'roll';
  for (const id of Object.keys(songRuntimes)) {
    if (songRuntimes[id]) songRuntimes[id].sessionView = 'roll';
  }
}

function setBpm(bpm) {
  const next = Math.max(40, Math.min(300, bpm));
  project.bpm = next;
  mixBpm.value = next;
  if (project.syncMode === 'internal') transport.bpm = next;
}

/** Snap the shared clock to a song's tempo without rewriting another song's stored BPM. */
function applyMixTempo(bpm, { songId = null } = {}) {
  const next = Math.max(40, Math.min(300, Math.round(Number(bpm)) || 120));
  mixBpm.value = next;
  if (project.syncMode === 'internal') {
    // Re-anchor while playing so the playhead doesn't scrub when BPM changes
    // at a scene boundary mid-transport.
    if (transport.playing) transport.setBpmPreservingPosition(next);
    else transport.bpm = next;
  }
  if (songId == null || songId === currentSongId.value) {
    project.bpm = next;
  }
}

function queueSceneTempo(bpm, songId, atBeat) {
  pendingSceneTempo = {
    bpm: Math.max(40, Math.min(300, Math.round(Number(bpm)) || 120)),
    songId,
    atBeat,
  };
}

function clearPendingSceneTempo() {
  pendingSceneTempo = null;
}

/** Scheduler Live-boundary hook — apply deferred scene tempo with the clips. */
function onLiveBoundary(absBeat) {
  const pending = pendingSceneTempo;
  if (!pending || absBeat + 1e-6 < pending.atBeat) return;
  pendingSceneTempo = null;
  applyMixTempo(pending.bpm, { songId: pending.songId });
}

function findTrack(trackId, songId = currentSongId.value) {
  return getProjectForSong(songId)?.tracks?.find((t) => t.id === trackId) ?? null;
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

function updatePattern(trackId, patternId, changes, songId = currentSongId.value) {
  const songProject = getProjectForSong(songId);
  const track = findTrack(trackId, songId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  if (!pattern || !songProject) return;
  const { linkedPatternIds, ...rest } = changes ?? {};
  Object.assign(pattern, rest);
  if (changes?.sceneIds !== undefined) normalizePatternSceneIds(pattern);
  if (linkedPatternIds !== undefined) {
    setPatternLinks(songProject.tracks, patternId, linkedPatternIds);
  }
}

function deletePattern(trackId, patternId, songId = currentSongId.value) {
  const songProject = getProjectForSong(songId);
  const track = findTrack(trackId, songId);
  if (!track?.patterns || track.patterns.length <= 1 || !songProject) return;

  const idx = track.patterns.findIndex((p) => p.id === patternId);
  if (idx === -1) return;

  clearLinksToPattern(songProject.tracks, patternId);
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
  if (
    songId === currentSongId.value &&
    project.soloPreview?.trackId === trackId &&
    project.soloPreview?.patternId === patternId
  ) {
    project.soloPreview = null;
  }
  for (const t of songProject.tracks) {
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
// songId scopes the launch so clips from another song can join the mix.
function queueOrLaunchPattern(songId, trackId, patternId) {
  const songProject = getProjectForSong(songId) ?? ensureSongRuntime(songId);
  const track = songProject?.tracks?.find((t) => t.id === trackId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  if (!track || !pattern || !songProject) return;

  // Manual clip launch leaves scene mode for that song only.
  delete activeSceneBySong[songId];
  engageLivePlayback();

  const intent = resolveClipIntent(track, pattern, playing.value);
  runLinkedClipIntent(songProject.tracks, patternId, intent, {
    transportPlaying: playing.value,
    startPlayback: () => startPlayback(undefined, { forceLive: true }),
    getAbsBeat: () => getActiveClock().getAbsoluteBeat(),
  });
}

// Remember which pattern started a Hold gesture so release can fan out to
// its link group (hold-up events only carry the track id today).
let activeHoldPatternId = null;
let activeHoldSongId = null;

function onHoldPatternDown(songId, trackId, patternId) {
  const songProject = getProjectForSong(songId) ?? ensureSongRuntime(songId);
  const track = songProject?.tracks?.find((t) => t.id === trackId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  if (!track || !songProject || patternLaunchMode(pattern) !== LIVE_LAUNCH_MODES.HOLD) return;

  project.soloPreview = null;
  engageLivePlayback();
  if (!playing.value) {
    startPlayback(undefined, { forceLive: true });
  }
  // Read abs beat only after the transport is running — otherwise
  // getAbsoluteBeat() returns a stale wrapped position and the unmute
  // boundary may never arrive (silence forever while the playhead moves).
  activeHoldPatternId = patternId;
  activeHoldSongId = songId;
  holdLinkedPatternsDown(songProject.tracks, patternId, getActiveClock().getAbsoluteBeat());
}

function onHoldPatternUp(songId, trackId) {
  const patternId = activeHoldPatternId;
  const holdSongId = activeHoldSongId ?? songId;
  activeHoldPatternId = null;
  activeHoldSongId = null;
  const songProject = getProjectForSong(holdSongId) ?? ensureSongRuntime(holdSongId);
  if (patternId && songProject) {
    holdLinkedPatternsUp(songProject.tracks, patternId);
    return;
  }
  const track = songProject?.tracks?.find((t) => t.id === trackId) ?? findTrack(trackId, holdSongId);
  if (!track) return;
  holdPatternUp(track);
}

/** Piano roll Hold gestures are always for the edit-focus song. */
function onRollHoldPatternDown(trackId, patternId) {
  onHoldPatternDown(currentSongId.value, trackId, patternId);
}

function onRollHoldPatternUp(trackId) {
  onHoldPatternUp(currentSongId.value, trackId);
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

function reorderPatterns(songId, trackId, fromIndex, toIndex) {
  const track = findTrack(trackId, songId);
  if (track) reorderTrackPatterns(track, fromIndex, toIndex);
}

function ensureScenes(songId = currentSongId.value) {
  const songProject = getProjectForSong(songId) ?? ensureSongRuntime(songId) ?? project;
  if (!Array.isArray(songProject.scenes)) songProject.scenes = [];
  return songProject.scenes;
}

function scenePatternIds(songId, sceneId) {
  const tracks = getProjectForSong(songId)?.tracks ?? project.tracks;
  return getScenePatternRefs(tracks, sceneId).map(({ pattern }) => pattern.id);
}

/**
 * Apply scene membership from the editor for one scene only.
 * Patterns in the list gain this sceneId; patterns that leave lose only this sceneId
 * (membership in other scenes is preserved).
 */
function applyScenePatternMembership(songId, sceneId, patternIds) {
  if (!sceneId) return;
  const tracks = getProjectForSong(songId)?.tracks ?? project.tracks;
  const wanted = new Set(patternIds ?? []);
  for (const track of tracks) {
    for (const pattern of track.patterns ?? []) {
      if (wanted.has(pattern.id)) {
        addPatternToScene(pattern, sceneId);
      } else {
        removePatternFromScene(pattern, sceneId);
      }
    }
  }
}

function startCreateScene(songId = currentSongId.value) {
  const sid = songId ?? currentSongId.value;
  sceneEditorSongId.value = sid;
  sceneEditorMode.value = 'create';
  sceneEditorId.value = null;
  sceneEditorInitial.value = {
    name: defaultSceneName(ensureScenes(sid)),
    sceneId: null,
    patternIds: [],
  };
  sceneEditorOpen.value = true;
}

function startEditScene(songId, sceneId) {
  const sid = songId ?? currentSongId.value;
  const scene = ensureScenes(sid).find((s) => s.id === sceneId);
  if (!scene) return;
  sceneEditorSongId.value = sid;
  sceneEditorMode.value = 'edit';
  sceneEditorId.value = scene.id;
  sceneEditorInitial.value = {
    name: scene.name,
    sceneId: scene.id,
    patternIds: scenePatternIds(sid, scene.id),
  };
  sceneEditorOpen.value = true;
}

function closeSceneEditor() {
  sceneEditorOpen.value = false;
  sceneEditorId.value = null;
  sceneEditorSongId.value = null;
}

function commitSceneEditor(values) {
  const name = values?.name?.trim();
  if (!name) return;
  const sid = sceneEditorSongId.value ?? currentSongId.value;
  const scenes = ensureScenes(sid);
  const patternIds = Array.isArray(values.patternIds) ? values.patternIds : [];
  if (sceneEditorMode.value === 'create') {
    const scene = createScene(name);
    scenes.push(scene);
    applyScenePatternMembership(sid, scene.id, patternIds);
  } else if (sceneEditorId.value) {
    const scene = scenes.find((s) => s.id === sceneEditorId.value);
    if (scene) scene.name = name;
    applyScenePatternMembership(sid, sceneEditorId.value, patternIds);
  }
  closeSceneEditor();
}

function confirmDeleteScene() {
  const sceneId = sceneEditorId.value;
  const sid = sceneEditorSongId.value ?? currentSongId.value;
  if (!sceneId) return;
  const scenes = ensureScenes(sid);
  const idx = scenes.findIndex((s) => s.id === sceneId);
  if (idx === -1) return;
  scenes.splice(idx, 1);
  const tracks = getProjectForSong(sid)?.tracks ?? project.tracks;
  clearSceneFromPatterns(tracks, sceneId);
  if (activeSceneBySong[sid] === sceneId) delete activeSceneBySong[sid];
  closeSceneEditor();
}

function patternToEditorDraft(pattern) {
  return {
    name: pattern.name,
    color: pattern.color,
    patternSteps: pattern.patternSteps ?? 16,
    liveLaunchMode: pattern.liveLaunchMode ?? 'toggle',
    liveSyncGrid: pattern.liveSyncGrid ?? '1/16',
    cutOthers: pattern.cutOthers !== false,
    hiddenFromLive: !!pattern.hiddenFromLive,
    sceneIds: Array.isArray(pattern.sceneIds)
      ? [...pattern.sceneIds]
      : pattern.sceneId
        ? [pattern.sceneId]
        : [],
    linkedPatternIds: Array.isArray(pattern.linkedPatternIds)
      ? [...pattern.linkedPatternIds]
      : [],
  };
}

function trackToEditorDraft(track) {
  return {
    name: track.name,
    color: track.color,
    category: track.category,
    midiOutputId: track.midiOutputId ?? '',
    midiChannel: track.midiChannel ?? 0,
    volume: track.volume ?? 1,
    hiddenFromLive: !!track.hiddenFromLive,
  };
}

function startEditLivePattern(songId, trackId, patternId) {
  const track = findTrack(trackId, songId);
  const pattern = track?.patterns?.find((p) => p.id === patternId);
  if (!pattern) return;
  patternEditorSongId.value = songId;
  patternEditorTrackId.value = trackId;
  patternEditorPatternId.value = patternId;
  patternEditorInitial.value = patternToEditorDraft(pattern);
  patternEditorOpen.value = true;
}

/** Jump from a Live clip into Roll with that song/track/pattern selected for note editing. */
function openPatternInRoll(songId, trackId, patternId) {
  if (songId !== currentSongId.value) selectSong(songId);
  const track = findTrack(trackId);
  if (!track?.patterns?.some((p) => p.id === patternId)) return;
  activeTrackId.value = trackId;
  selectPattern(trackId, patternId);
  viewMode.value = 'roll';
}

function closePatternEditor() {
  patternEditorOpen.value = false;
  patternEditorSongId.value = null;
  patternEditorTrackId.value = null;
  patternEditorPatternId.value = null;
}

function commitLivePatternEditor(values) {
  const songId = patternEditorSongId.value;
  const trackId = patternEditorTrackId.value;
  const patternId = patternEditorPatternId.value;
  if (songId && trackId && patternId) {
    updatePattern(trackId, patternId, values, songId);
  }
  closePatternEditor();
}

function confirmDeleteLivePattern() {
  const songId = patternEditorSongId.value;
  const trackId = patternEditorTrackId.value;
  const patternId = patternEditorPatternId.value;
  if (songId && trackId && patternId) {
    deletePattern(trackId, patternId, songId);
  }
  closePatternEditor();
}

function startEditLiveTrack(songId, trackId) {
  const track = findTrack(trackId, songId);
  if (!track) return;
  trackEditorSongId.value = songId;
  trackEditorTrackId.value = trackId;
  trackEditorKind.value = track.kind;
  trackEditorInitial.value = trackToEditorDraft(track);
  trackEditorOpen.value = true;
}

function closeTrackEditor() {
  trackEditorOpen.value = false;
  trackEditorSongId.value = null;
  trackEditorTrackId.value = null;
}

function commitLiveTrackEditor(values) {
  const songId = trackEditorSongId.value;
  const trackId = trackEditorTrackId.value;
  if (songId && trackId) {
    updateTrack(trackId, values, songId);
  }
  closeTrackEditor();
}

function onLiveTrackEditorLiveUpdate(changes) {
  const songId = trackEditorSongId.value;
  const trackId = trackEditorTrackId.value;
  if (songId && trackId) updateTrack(trackId, changes, songId);
}

function onLiveTrackEditorRevert(changes) {
  const songId = trackEditorSongId.value;
  const trackId = trackEditorTrackId.value;
  if (songId && trackId) updateTrack(trackId, changes, songId);
}

function confirmDeleteLiveTrack() {
  const songId = trackEditorSongId.value;
  const trackId = trackEditorTrackId.value;
  if (songId && trackId) {
    removeTrack(trackId, songId);
  }
  closeTrackEditor();
}

// Scene button — exclusive take-over across the whole Live set: cut every
// sounding/queued clip in every song, launch this scene's patterns, and snap
// the transport tempo to the scene's song at the same boundary (not on click).
// Manual clip launches still layer across songs; only scenes claim the mix.
function launchScene(songId, sceneId) {
  const songProject = getProjectForSong(songId) ?? ensureSongRuntime(songId);
  if (!songProject) return;
  const refs = getScenePatternRefs(songProject.tracks, sceneId).filter(
    ({ pattern }) => patternLaunchMode(pattern) !== LIVE_LAUNCH_MODES.HOLD
  );
  if (!refs.length) return;

  engageLivePlayback();
  clearActiveScenes();
  activeSceneBySong[songId] = sceneId;

  // Cut non-scene clips on every Live-set track so a scene from song B stops
  // whatever was still running from song A (and vice versa).
  const allTracks = getAllLiveTracks();
  const sceneBpm = songProject.bpm ?? 120;

  if (!playing.value) {
    // Stopped: scene arms immediately, so tempo can follow right away.
    clearPendingSceneTempo();
    applyMixTempo(sceneBpm, { songId });
    // Start at beat 0 with startBeat stamped so every clip begins at pattern
    // beat 0, and later switches can wait on each clip's real loop end.
    const { oneShots } = armSceneLoops(refs, allTracks, { originBeat: 0 });
    startPlayback(0, { forceLive: true });
    if (oneShots.length) {
      queueSceneLaunch(oneShots, getActiveClock().getAbsoluteBeat(), allTracks);
    }
    return;
  }

  const { launchBeat } = queueSceneLaunch(
    refs,
    getActiveClock().getAbsoluteBeat(),
    allTracks
  );
  // Keep the current mix tempo until the shared scene boundary — then snap.
  if (launchBeat != null) queueSceneTempo(sceneBpm, songId, launchBeat);
  else applyMixTempo(sceneBpm, { songId });
}

function updateTrack(trackId, changes, songId = currentSongId.value) {
  const track = findTrack(trackId, songId);
  if (track) {
    Object.assign(track, changes);
    if (track.kind === 'drum') normalizeDrumTrack(track);
  }
}

/** Instant Live-view mute LED — toggles track.muted (scheduler skips muted tracks). */
function toggleTrackMute(songId, trackId) {
  const track = findTrack(trackId, songId);
  if (!track) return;
  updateTrack(trackId, { muted: !track.muted }, songId);
}

/** Right-click on the mute LED — toggles track.soloed (additive across Live set). */
function toggleTrackSolo(songId, trackId) {
  const track = findTrack(trackId, songId);
  if (!track) return;
  updateTrack(trackId, { soloed: !track.soloed }, songId);
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

function removeTrack(trackId, songId = currentSongId.value) {
  const songProject = getProjectForSong(songId);
  if (!songProject) return;
  const idx = songProject.tracks.findIndex((t) => t.id === trackId);
  if (idx === -1) return;

  const track = songProject.tracks[idx];
  if (track.kind === 'drum') {
    for (const pad of track.pads) {
      clearSample(pad.id, { discardStored: true });
      removeReverbBus(pad.id);
    }
  }

  songProject.tracks.splice(idx, 1);

  for (const t of songProject.tracks) {
    if (t.ghostTrackId === trackId) {
      t.ghostTrackId = null;
      t.ghostPatternId = null;
    }
  }

  if (songId === currentSongId.value && activeTrackId.value === trackId) {
    const fallback = songProject.tracks[idx] ?? songProject.tracks[idx - 1];
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
  clearSample(padId, { discardStored: true });
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
