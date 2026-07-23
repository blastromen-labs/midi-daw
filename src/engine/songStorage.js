import {
  uid,
  normalizeTrackCategory,
  normalizePatternSceneIds,
  normalizePatternLinkedIds,
  collectPatternIds,
  findPatternRef,
  linkPatterns,
  randomTrackColor,
} from '../models/project.js';
import { sanitizeFilename } from '../utils/filename.js';

const SONGS_KEY = 'midi-daw:songs';
const CURRENT_SONG_KEY = 'midi-daw:currentSongId';
const LIVE_SONG_ORDER_KEY = 'midi-daw:liveSongOrder';
const STORAGE_VERSION = 1;
const SONG_FILE_FORMAT = 'midi-daw-song';
const SONG_FILE_VERSION = 1;

/** Project fields persisted to localStorage and song files (Live-mode runtime excluded). */
const PERSISTED_PROJECT_SCALAR_KEYS = [
  'bpm',
  'sendMidiClock',
  'clockOutputId',
  'syncMode',
  'clockInputId',
  'markerBeat',
  'loopRegion',
  'scenes',
];

/** Fields stripped before persisting — Live-mode runtime only. */
const EPHEMERAL_TRACK_FIELDS = [
  'liveLaunches',
  'pendingLaunches',
  // Legacy scalars from older builds.
  'playingPatternId',
  'pendingPatternId',
  'pendingLaunchBeat',
  'holdActive',
  'holdMuted',
  'pendingUnmuteBeat',
];

function stripEphemeralTrackFields(track) {
  const copy = { ...track };
  for (const key of EPHEMERAL_TRACK_FIELDS) delete copy[key];
  return copy;
}

/** Deep-clone project state suitable for localStorage and JSON export. */
export function serializeProject(project) {
  const snapshot = {
    tracks: project.tracks.map(stripEphemeralTrackFields),
  };
  for (const key of PERSISTED_PROJECT_SCALAR_KEYS) {
    if (project[key] !== undefined) snapshot[key] = project[key];
  }
  return JSON.parse(JSON.stringify(snapshot));
}

/** Restore a saved project snapshot; Live-mode fields start cleared. */
export function deserializeProject(data) {
  const project = JSON.parse(JSON.stringify(data));
  project.bpm = project.bpm ?? 120;
  project.sessionView = project.sessionView ?? 'roll';
  project.syncMode = project.syncMode ?? 'internal';
  project.clockInputId = project.clockInputId ?? '';
  project.sendMidiClock = project.sendMidiClock ?? false;
  project.clockOutputId = project.clockOutputId ?? '';
  project.markerBeat = project.markerBeat ?? null;
  project.loopRegion = project.loopRegion ?? null;
  project.soloPreview = null;
  project.scenes = Array.isArray(project.scenes)
    ? project.scenes
        .filter((s) => s && typeof s.id === 'string')
        .map((s) => ({
          id: s.id,
          name: (typeof s.name === 'string' && s.name.trim()) || 'Scene',
        }))
    : [];
  const sceneIds = new Set(project.scenes.map((s) => s.id));
  project.tracks = project.tracks ?? [];
  const patternIds = collectPatternIds(project.tracks);
  for (const track of project.tracks) {
    track.liveLaunches = null;
    track.pendingLaunches = [];
    track.category = normalizeTrackCategory(track);
    track.muted = !!track.muted;
    track.soloed = !!track.soloed;
    track.hiddenFromLive = !!track.hiddenFromLive;
    // Live HP is momentary engine state — never persist a stuck cut.
    delete track.cutLow;
    delete track.cutLowHz;
    // Migrate legacy track-level launch settings onto each pattern, then drop
    // them from the track so launch mode is always per-pattern going forward.
    const legacyMode = track.liveLaunchMode ?? 'toggle';
    const legacyGrid = track.liveSyncGrid ?? '1/16';
    for (const pattern of track.patterns ?? []) {
      pattern.liveLaunchMode = pattern.liveLaunchMode ?? legacyMode;
      pattern.liveSyncGrid = pattern.liveSyncGrid ?? legacyGrid;
      pattern.cutOthers = pattern.cutOthers ?? true;
      pattern.hiddenFromLive = !!pattern.hiddenFromLive;
      // Migrate legacy sceneId → sceneIds[]; drop stale / unknown scene refs.
      normalizePatternSceneIds(pattern, sceneIds);
      // Drop stale / unknown linked-pattern refs.
      normalizePatternLinkedIds(pattern, patternIds);
    }
    delete track.liveLaunchMode;
    delete track.liveSyncGrid;
    delete track.playingPatternId;
    delete track.pendingPatternId;
    delete track.pendingLaunchBeat;
    delete track.holdActive;
    delete track.holdMuted;
    delete track.pendingUnmuteBeat;
  }
  // Drop same-track links and mirror remaining pairs so either side can edit.
  for (const track of project.tracks) {
    for (const pattern of track.patterns ?? []) {
      const ids = [...(pattern.linkedPatternIds ?? [])];
      pattern.linkedPatternIds = [];
      for (const linkedId of ids) {
        const other = findPatternRef(project.tracks, linkedId);
        if (!other || other.track.id === track.id) continue;
        linkPatterns(pattern, other.pattern);
      }
      normalizePatternLinkedIds(pattern, patternIds);
    }
  }
  return project;
}

export function createSongEntry(name, project, color) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: name.trim() || 'Untitled',
    color: color ?? randomTrackColor(),
    createdAt: now,
    updatedAt: now,
    project: serializeProject(project),
  };
}

function normalizeSongColors(songs) {
  const used = [];
  for (const song of songs) {
    if (!song.color) {
      song.color = randomTrackColor(used);
    }
    used.push(song.color);
  }
}

function loadLiveSongOrder() {
  try {
    const raw = localStorage.getItem(LIVE_SONG_ORDER_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function loadSongLibrary() {
  try {
    const raw = localStorage.getItem(SONGS_KEY);
    if (!raw) return { songs: [], currentSongId: null, liveSongOrder: [] };
    const parsed = JSON.parse(raw);
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.songs)) {
      return { songs: [], currentSongId: null, liveSongOrder: [] };
    }
    normalizeSongColors(parsed.songs);
    const currentSongId = localStorage.getItem(CURRENT_SONG_KEY);
    return {
      songs: parsed.songs,
      currentSongId,
      liveSongOrder: loadLiveSongOrder(),
    };
  } catch {
    return { songs: [], currentSongId: null, liveSongOrder: [] };
  }
}

export function persistSongLibrary(songs, currentSongId, liveSongOrder = null) {
  localStorage.setItem(
    SONGS_KEY,
    JSON.stringify({ version: STORAGE_VERSION, songs })
  );
  if (currentSongId) localStorage.setItem(CURRENT_SONG_KEY, currentSongId);
  else localStorage.removeItem(CURRENT_SONG_KEY);
  if (liveSongOrder != null) {
    localStorage.setItem(LIVE_SONG_ORDER_KEY, JSON.stringify(liveSongOrder));
  }
}

export function sanitizeSongFilename(name) {
  return sanitizeFilename(name);
}

/** Build the on-disk JSON payload for one song. */
export function buildSongFileExport(name, project) {
  return {
    format: SONG_FILE_FORMAT,
    version: SONG_FILE_VERSION,
    name: (name || 'Untitled').trim() || 'Untitled',
    savedAt: new Date().toISOString(),
    project: serializeProject(project),
  };
}

/** Trigger a browser download of the song as a `.json` file. */
export function downloadSongFile(name, project) {
  const payload = buildSongFileExport(name, project);
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${sanitizeSongFilename(name)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Parse song file text. Accepts the wrapped export format or a bare legacy
 * project object that only contains `tracks`.
 */
export function parseSongFileJson(text) {
  const data = JSON.parse(text);
  if (
    data?.format === SONG_FILE_FORMAT &&
    data.version === SONG_FILE_VERSION &&
    data.project
  ) {
    return {
      name: (data.name || 'Untitled').trim() || 'Untitled',
      project: deserializeProject(data.project),
    };
  }
  if (Array.isArray(data?.tracks)) {
    return {
      name: 'Imported',
      project: deserializeProject(data),
    };
  }
  throw new Error('Unrecognized song file — expected a midi-daw song export.');
}
