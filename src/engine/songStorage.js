import { uid, normalizeTrackCategory } from '../models/project.js';

const SONGS_KEY = 'midi-daw:songs';
const CURRENT_SONG_KEY = 'midi-daw:currentSongId';
const STORAGE_VERSION = 1;

/** Fields stripped before persisting — Live-mode runtime only. */
const EPHEMERAL_TRACK_FIELDS = [
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

/** Deep-clone project state suitable for localStorage. */
export function serializeProject(project) {
  return JSON.parse(
    JSON.stringify({
      bpm: project.bpm,
      markerBeat: project.markerBeat,
      loopRegion: project.loopRegion,
      tracks: project.tracks.map(stripEphemeralTrackFields),
    })
  );
}

/** Restore a saved project snapshot; Live-mode fields start cleared. */
export function deserializeProject(data) {
  const project = JSON.parse(JSON.stringify(data));
  for (const track of project.tracks ?? []) {
    track.playingPatternId = null;
    track.pendingPatternId = null;
    track.pendingLaunchBeat = null;
    track.holdActive = false;
    track.holdMuted = false;
    track.pendingUnmuteBeat = null;
    track.liveLaunchMode = track.liveLaunchMode ?? 'toggle';
    track.liveSyncGrid = track.liveSyncGrid ?? '1/16';
    track.category = normalizeTrackCategory(track);
  }
  return project;
}

export function createSongEntry(name, project) {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name: name.trim() || 'Untitled',
    createdAt: now,
    updatedAt: now,
    project: serializeProject(project),
  };
}

export function loadSongLibrary() {
  try {
    const raw = localStorage.getItem(SONGS_KEY);
    if (!raw) return { songs: [], currentSongId: null };
    const parsed = JSON.parse(raw);
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.songs)) {
      return { songs: [], currentSongId: null };
    }
    const currentSongId = localStorage.getItem(CURRENT_SONG_KEY);
    return { songs: parsed.songs, currentSongId };
  } catch {
    return { songs: [], currentSongId: null };
  }
}

export function persistSongLibrary(songs, currentSongId) {
  localStorage.setItem(
    SONGS_KEY,
    JSON.stringify({ version: STORAGE_VERSION, songs })
  );
  if (currentSongId) localStorage.setItem(CURRENT_SONG_KEY, currentSongId);
  else localStorage.removeItem(CURRENT_SONG_KEY);
}
