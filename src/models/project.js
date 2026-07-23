let nextId = 1;
export function uid() {
  return `id-${nextId++}`;
}

/** Bump the uid counter past every `id-N` already present in a loaded project. */
export function syncUidCounter(root) {
  let max = nextId - 1;
  function walk(value) {
    if (value == null) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== 'object') return;
    if (typeof value.id === 'string' && value.id.startsWith('id-')) {
      const n = Number.parseInt(value.id.slice(3), 10);
      if (!Number.isNaN(n)) max = Math.max(max, n);
    }
    for (const v of Object.values(value)) walk(v);
  }
  walk(root);
  nextId = max + 1;
}

/** Per-hit pitch tweak for drum notes (semitones relative to the pad's base pitch). */
export const NOTE_PITCH_OFFSET_MIN = -12;
export const NOTE_PITCH_OFFSET_MAX = 12;

export function clampNotePitchOffset(offset) {
  return Math.max(
    NOTE_PITCH_OFFSET_MIN,
    Math.min(NOTE_PITCH_OFFSET_MAX, Math.round(Number(offset) || 0))
  );
}

export function createNote(pitch = 60, startBeat = 0, duration = 0.25, velocity = 100, pitchOffset = 0) {
  return {
    id: uid(),
    pitch,
    startBeat,
    duration,
    velocity,
    pitchOffset: clampNotePitchOffset(pitchOffset),
  };
}

/** Coerce legacy or missing note fields when loading a song. */
export function normalizeNote(note) {
  if (!note) return note;
  if (note.pitchOffset == null) note.pitchOffset = 0;
  note.pitchOffset = clampNotePitchOffset(note.pitchOffset);
  return note;
}

/** Normalize every note in every pattern (e.g. after deserializing a song). */
export function normalizeProjectNotes(tracks) {
  for (const track of tracks ?? []) {
    for (const pattern of track.patterns ?? []) {
      for (const note of pattern.notes ?? []) normalizeNote(note);
    }
  }
}

// Accent swatches for the track menu — independent of piano-roll note color.
export const TRACK_ACCENT_COLORS = ['#a7d7af', '#6699ff', '#ff9d6c', '#e0779b', '#7ec8e3', '#e0c15c'];

/** Instrument role / mix grouping for a track (saved per track in the song). */
export const TRACK_CATEGORIES = [
  'Drums',
  'Perc',
  'Bass',
  'Sub',
  'Lead',
  'Melody',
  'Pad',
  'String',
  'Arp',
  'Pluck',
  'Keys',
  'Choir',
  'Vocals',
  'Chord',
  'FX',
  'Noise',
  'Atmos',
  'Lights',
  'Video',
  'Visuals',
];

export function defaultTrackCategory(kind = 'midi') {
  if (kind === 'drum') return 'Drums';
  if (kind === 'multisampler') return 'Keys';
  return 'Lead';
}

/** Coerce legacy or missing category values when loading a song. */
export function normalizeTrackCategory(track) {
  if (track?.category && TRACK_CATEGORIES.includes(track.category)) return track.category;
  return defaultTrackCategory(track?.kind ?? 'midi');
}

// MIDI/synth notes in the piano roll always use this green, regardless of accent.
export const MIDI_NOTE_COLOR = '#a7d7af';
// Same lightness as MIDI_NOTE_COLOR, but blue — flags notes whose time ranges
// overlap on the same pitch (accidental stacks).
export const MIDI_OVERLAP_NOTE_COLOR = '#8eb4f0';

/** True when two notes share any open time interval (abutting ends do not count). */
export function notesOverlapInTime(a, b) {
  return a.startBeat < b.startBeat + b.duration && b.startBeat < a.startBeat + a.duration;
}

/**
 * Ids of notes that overlap another note on the same pitch.
 * Grouped by pitch so cost stays reasonable on busy patterns.
 */
export function collectOverlappingNoteIds(notes) {
  const ids = new Set();
  if (!notes?.length) return ids;

  const byPitch = new Map();
  for (const note of notes) {
    let group = byPitch.get(note.pitch);
    if (!group) {
      group = [];
      byPitch.set(note.pitch, group);
    }
    group.push(note);
  }

  for (const group of byPitch.values()) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (!notesOverlapInTime(group[i], group[j])) continue;
        ids.add(group[i].id);
        ids.add(group[j].id);
      }
    }
  }
  return ids;
}

/** @param {string[]} [exclude] colors already used by other tracks */
export function randomTrackColor(exclude = []) {
  const pool = TRACK_ACCENT_COLORS.filter((c) => !exclude.includes(c));
  const choices = pool.length ? pool : TRACK_ACCENT_COLORS;
  return choices[Math.floor(Math.random() * choices.length)];
}

/** @param {string[]} [exclude] colors already used by sibling patterns */
export function randomPatternColor(exclude = []) {
  return randomTrackColor(exclude);
}

export function createPattern(name = 'Pattern 1', color = randomPatternColor(), patternSteps = 16, notes = []) {
  return {
    id: uid(),
    name,
    color,
    patternSteps,
    notes,
    // Live launch settings are per pattern so one track can mix Loop / Hold / One Shot.
    liveLaunchMode: 'toggle',
    liveSyncGrid: '1/16',
    // When true (default), launching this clip stops other clips on the same track.
    // Set false to layer (e.g. One Shot over a running Loop).
    cutOthers: true,
    // Optional membership in project-level Scenes (empty = not in any scene).
    // A pattern may belong to multiple scenes; scenes are shortcuts that
    // launch several patterns together in Live mode.
    sceneIds: [],
    // Cross-track pattern links (empty = none). Kept bidirectional — if A lists
    // B then B lists A — so Live enable/stop on either clip drives the whole
    // group (including patterns hidden from Live, e.g. lights).
    linkedPatternIds: [],
    // When true, clip is omitted from Live view (still plays via scenes / links).
    // Use for background / non-improvisational clips (e.g. lights).
    hiddenFromLive: false,
  };
}

/** Project-level named group of patterns for Live-mode batch launch. */
export function createScene(name = 'Scene 1') {
  return {
    id: uid(),
    name,
  };
}

/** Default name for a newly added scene. */
export function defaultSceneName(scenes = []) {
  const count = scenes.length + 1;
  const base = `Scene ${count}`;
  if (!scenes.some((s) => s.name === base)) return base;
  let i = count + 1;
  while (scenes.some((s) => s.name === `Scene ${i}`)) i++;
  return `Scene ${i}`;
}

/**
 * Normalize pattern scene membership to `sceneIds: string[]`.
 * Migrates legacy single `sceneId` and drops stale/duplicate ids.
 * @param {object} pattern
 * @param {Set<string>|null} [validSceneIds] when provided, filter to existing scenes
 * @returns {string[]}
 */
export function normalizePatternSceneIds(pattern, validSceneIds = null) {
  if (!pattern) return [];
  const fromArray = Array.isArray(pattern.sceneIds) ? pattern.sceneIds : null;
  const legacy = pattern.sceneId && typeof pattern.sceneId === 'string' ? [pattern.sceneId] : [];
  const raw = fromArray ?? legacy;
  const seen = new Set();
  const ids = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !id || seen.has(id)) continue;
    if (validSceneIds && !validSceneIds.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  pattern.sceneIds = ids;
  delete pattern.sceneId;
  return ids;
}

/** Whether a pattern is a member of the given scene. */
export function patternInScene(pattern, sceneId) {
  if (!pattern || !sceneId) return false;
  const ids = Array.isArray(pattern.sceneIds)
    ? pattern.sceneIds
    : pattern.sceneId
      ? [pattern.sceneId]
      : [];
  return ids.includes(sceneId);
}

/**
 * Resolve every pattern assigned to a scene across all tracks.
 * @returns {{ track: object, pattern: object }[]}
 */
export function getScenePatternRefs(tracks, sceneId) {
  if (!sceneId) return [];
  const refs = [];
  for (const track of tracks ?? []) {
    for (const pattern of track.patterns ?? []) {
      if (patternInScene(pattern, sceneId)) refs.push({ track, pattern });
    }
  }
  return refs;
}

/** Remove a scene id from every pattern when that scene is deleted. */
export function clearSceneFromPatterns(tracks, sceneId) {
  if (!sceneId) return;
  for (const track of tracks ?? []) {
    for (const pattern of track.patterns ?? []) {
      normalizePatternSceneIds(pattern);
      pattern.sceneIds = pattern.sceneIds.filter((id) => id !== sceneId);
    }
  }
}

/** Ensure `sceneId` is in the pattern's scene list (no-op if already present). */
export function addPatternToScene(pattern, sceneId) {
  if (!pattern || !sceneId) return;
  normalizePatternSceneIds(pattern);
  if (!pattern.sceneIds.includes(sceneId)) pattern.sceneIds.push(sceneId);
}

/** Remove `sceneId` from the pattern's scene list. */
export function removePatternFromScene(pattern, sceneId) {
  if (!pattern || !sceneId) return;
  normalizePatternSceneIds(pattern);
  pattern.sceneIds = pattern.sceneIds.filter((id) => id !== sceneId);
}

/**
 * Normalize `linkedPatternIds: string[]` — drop self, duplicates, and ids not
 * in `validPatternIds` when that set is provided.
 * @param {object} pattern
 * @param {Set<string>|null} [validPatternIds]
 * @returns {string[]}
 */
export function normalizePatternLinkedIds(pattern, validPatternIds = null) {
  if (!pattern) return [];
  const raw = Array.isArray(pattern.linkedPatternIds) ? pattern.linkedPatternIds : [];
  const seen = new Set();
  const ids = [];
  for (const id of raw) {
    if (typeof id !== 'string' || !id || id === pattern.id || seen.has(id)) continue;
    if (validPatternIds && !validPatternIds.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  pattern.linkedPatternIds = ids;
  return ids;
}

/** Find a pattern by id across all tracks. */
export function findPatternRef(tracks, patternId) {
  if (!patternId) return null;
  for (const track of tracks ?? []) {
    const pattern = track?.patterns?.find((p) => p.id === patternId);
    if (pattern) return { track, pattern };
  }
  return null;
}

/** Every pattern id currently present in the project. */
export function collectPatternIds(tracks) {
  const ids = new Set();
  for (const track of tracks ?? []) {
    for (const pattern of track.patterns ?? []) {
      if (pattern?.id) ids.add(pattern.id);
    }
  }
  return ids;
}

/**
 * Resolve the bidirectional link group for a pattern (self + transitive links).
 * @returns {{ track: object, pattern: object }[]}
 */
export function getLinkedPatternGroup(tracks, patternId) {
  const start = findPatternRef(tracks, patternId);
  if (!start) return [];

  const byId = new Map();
  for (const track of tracks ?? []) {
    for (const pattern of track.patterns ?? []) {
      if (pattern?.id) byId.set(pattern.id, { track, pattern });
    }
  }

  const group = [];
  const visited = new Set();
  const queue = [patternId];
  while (queue.length) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const ref = byId.get(id);
    if (!ref) continue;
    group.push(ref);
    for (const linkedId of normalizePatternLinkedIds(ref.pattern)) {
      if (!visited.has(linkedId)) queue.push(linkedId);
    }
  }
  return group;
}

/** Add a bidirectional link between two patterns (no-op if same / missing). */
export function linkPatterns(patternA, patternB) {
  if (!patternA || !patternB || patternA.id === patternB.id) return;
  normalizePatternLinkedIds(patternA);
  normalizePatternLinkedIds(patternB);
  if (!patternA.linkedPatternIds.includes(patternB.id)) {
    patternA.linkedPatternIds.push(patternB.id);
  }
  if (!patternB.linkedPatternIds.includes(patternA.id)) {
    patternB.linkedPatternIds.push(patternA.id);
  }
}

/** Remove a bidirectional link between two patterns. */
export function unlinkPatterns(patternA, patternB) {
  if (!patternA || !patternB) return;
  normalizePatternLinkedIds(patternA);
  normalizePatternLinkedIds(patternB);
  patternA.linkedPatternIds = patternA.linkedPatternIds.filter((id) => id !== patternB.id);
  patternB.linkedPatternIds = patternB.linkedPatternIds.filter((id) => id !== patternA.id);
}

/**
 * Replace a pattern's links with `linkedPatternIds`, keeping both sides in sync.
 * Drops self-links and unknown ids; never links two patterns on the same track.
 */
export function setPatternLinks(tracks, patternId, linkedPatternIds) {
  const primary = findPatternRef(tracks, patternId);
  if (!primary) return;

  const validIds = collectPatternIds(tracks);
  const desired = [];
  const seen = new Set();
  for (const id of Array.isArray(linkedPatternIds) ? linkedPatternIds : []) {
    if (typeof id !== 'string' || !id || id === patternId || seen.has(id)) continue;
    if (!validIds.has(id)) continue;
    const other = findPatternRef(tracks, id);
    // Cross-track only — same-track links fight cutOthers / Live grid semantics.
    if (!other || other.track.id === primary.track.id) continue;
    seen.add(id);
    desired.push(id);
  }

  const previous = [...normalizePatternLinkedIds(primary.pattern)];
  for (const id of previous) {
    if (desired.includes(id)) continue;
    const other = findPatternRef(tracks, id);
    if (other) unlinkPatterns(primary.pattern, other.pattern);
    else {
      primary.pattern.linkedPatternIds = primary.pattern.linkedPatternIds.filter((x) => x !== id);
    }
  }
  for (const id of desired) {
    if (previous.includes(id)) continue;
    const other = findPatternRef(tracks, id);
    if (other) linkPatterns(primary.pattern, other.pattern);
  }
  normalizePatternLinkedIds(primary.pattern, validIds);
}

/** Remove every link pointing at a deleted pattern. */
export function clearLinksToPattern(tracks, patternId) {
  if (!patternId) return;
  for (const track of tracks ?? []) {
    for (const pattern of track.patterns ?? []) {
      normalizePatternLinkedIds(pattern);
      pattern.linkedPatternIds = pattern.linkedPatternIds.filter((id) => id !== patternId);
    }
  }
}

/** Deep-copy notes with fresh ids (pattern clone, shift-drag duplicate, etc.). */
export function cloneNotes(notes) {
  return (notes ?? []).map((n) => ({ ...n, id: uid() }));
}

/** Pick a non-colliding name when duplicating a pattern. */
export function patternCloneName(patterns, sourceName) {
  const base = `${sourceName} copy`;
  if (!patterns.some((p) => p.name === base)) return base;
  let i = 2;
  while (patterns.some((p) => p.name === `${base} ${i}`)) i++;
  return `${base} ${i}`;
}

/** Clone a pattern's settings and piano-roll notes into a new pattern object. */
export function clonePattern(source, patterns) {
  const usedColors = patterns.map((p) => p.color);
  const pattern = createPattern(
    patternCloneName(patterns, source.name),
    randomPatternColor(usedColors),
    source.patternSteps ?? 16,
    cloneNotes(source.notes)
  );
  pattern.liveLaunchMode = source.liveLaunchMode ?? pattern.liveLaunchMode;
  pattern.liveSyncGrid = source.liveSyncGrid ?? pattern.liveSyncGrid;
  pattern.cutOthers = source.cutOthers ?? pattern.cutOthers;
  pattern.hiddenFromLive = !!source.hiddenFromLive;
  pattern.sceneIds = [...normalizePatternSceneIds(source)];
  // Clones start unlinked — copying pairs would silently attach the new clip
  // to the source's partners without an explicit edit.
  pattern.linkedPatternIds = [];
  return pattern;
}

/** Whether a track or pattern is hidden from Live view (still plays via scenes). */
export function isHiddenFromLive(item) {
  return item?.hiddenFromLive === true;
}

/** Live launch mode for a pattern (`toggle` / `hold` / `oneShot`). */
export function patternLaunchMode(pattern) {
  return pattern?.liveLaunchMode ?? LIVE_LAUNCH_MODES.TOGGLE;
}

/** Whether launching this pattern stops other same-track clips (default true). */
export function patternCutsOthers(pattern) {
  return pattern?.cutOthers !== false;
}

/** Empty Live launch slot — one sounding (or held) pattern on a track. */
export function createLiveLaunch(patternId, overrides = {}) {
  return {
    patternId,
    holdActive: false,
    holdMuted: false,
    pendingUnmuteBeat: null,
    stopBeat: null,
    // Absolute beat when this clip's content beat 0 fires. Set for One Shots
    // and scene-launched Loops so they restart from the beginning; ordinary
    // Loop clip launches leave this null and phase-lock to the master grid.
    startBeat: null,
    ...overrides,
  };
}

export function getActivePattern(track) {
  if (!track?.patterns?.length) return null;
  return track.patterns.find((p) => p.id === track.activePatternId) ?? track.patterns[0];
}

/** Move a pattern within a track's patterns array (Live view drag reorder). */
export function reorderPatterns(track, fromIndex, toIndex) {
  if (!track?.patterns?.length) return;
  if (fromIndex === toIndex) return;
  if (fromIndex < 0 || fromIndex >= track.patterns.length) return;
  if (toIndex < 0 || toIndex >= track.patterns.length) return;
  const [pattern] = track.patterns.splice(fromIndex, 1);
  track.patterns.splice(toIndex, 0, pattern);
}

/** Source track + pattern shown as a non-editable reference overlay in the piano roll. */
export function getGhostSource(viewingTrack, tracks = []) {
  if (!viewingTrack?.ghostPatternId) return null;

  const sourceTrackId = viewingTrack.ghostTrackId ?? viewingTrack.id;
  const sourceTrack = tracks.find((t) => t.id === sourceTrackId);
  if (!sourceTrack?.patterns?.length) return null;

  if (
    sourceTrack.id === viewingTrack.id &&
    viewingTrack.ghostPatternId === viewingTrack.activePatternId
  ) {
    return null;
  }

  const pattern = sourceTrack.patterns.find((p) => p.id === viewingTrack.ghostPatternId);
  if (!pattern) return null;

  return { track: sourceTrack, pattern };
}

// Legacy sentinel kept for migration of older in-memory / file snapshots.
export const STOPPED_PATTERN = '__stopped__';

function findTrackPattern(track, patternId) {
  return track?.patterns?.find((p) => p.id === patternId) ?? null;
}

function isHoldLaunchAudible(launch) {
  return !!launch?.holdActive && !launch.holdMuted;
}

/** Patterns that should sound right now (may be more than one when cutOthers is off). */
export function getPlayingPatterns(track, { useLiveLaunch = true, soloPreview = null } = {}) {
  if (!track?.patterns?.length) return [];
  if (!useLiveLaunch && soloPreview) {
    if (soloPreview.trackId !== track.id) return [];
    const pattern = findTrackPattern(track, soloPreview.patternId);
    return pattern ? [pattern] : [];
  }
  if (!useLiveLaunch) {
    const active = getActivePattern(track);
    if (!active) return [];
    if (patternLaunchMode(active) === LIVE_LAUNCH_MODES.HOLD) {
      const hold = track.liveLaunches?.find(
        (l) => l.patternId === active.id && isHoldLaunchAudible(l)
      );
      if (!hold) return [];
    }
    return [active];
  }

  // null = no Live override yet → follow active Loop only (Hold / One Shot stay silent).
  if (track.liveLaunches == null) {
    const active = getActivePattern(track);
    if (!active) return [];
    const mode = patternLaunchMode(active);
    if (mode === LIVE_LAUNCH_MODES.HOLD || mode === LIVE_LAUNCH_MODES.ONE_SHOT) return [];
    return [active];
  }

  const patterns = [];
  for (const launch of track.liveLaunches) {
    // Hold stays silent until the sync unmute; still counts as "playing" for UI via isPatternPlaying.
    if (launch.holdActive && launch.holdMuted) continue;
    const pattern = findTrackPattern(track, launch.patternId);
    if (pattern) patterns.push(pattern);
  }
  return patterns;
}

// Primary sounding pattern — longest concurrent clip (used for transport loop sizing).
export function getPlayingPattern(track, opts = {}) {
  const patterns = getPlayingPatterns(track, opts);
  if (!patterns.length) return null;
  return patterns.reduce((best, p) =>
    patternLoopEndBeat(p) >= patternLoopEndBeat(best) ? p : best
  );
}

export function isPatternPlaying(track, patternId) {
  if (!track || !patternId) return false;
  if (track.liveLaunches == null) {
    return getPlayingPatterns(track).some((p) => p.id === patternId);
  }
  return track.liveLaunches.some((l) => l.patternId === patternId);
}

export function getLiveLaunch(track, patternId) {
  return track?.liveLaunches?.find((l) => l.patternId === patternId) ?? null;
}

export function isPatternQueued(track, patternId) {
  return !!track?.pendingLaunches?.some((p) => p.patternId === patternId);
}

/** True when this clip is armed to stop at a boundary (toggle-off or one-shot end). */
export function isPatternStopQueued(track, patternId) {
  const launch = getLiveLaunch(track, patternId);
  return launch?.stopBeat != null;
}

/** @deprecated Use isPatternStopQueued — kept for call sites that mean "any stop on track". */
export function isTrackStopQueued(track) {
  return !!track?.liveLaunches?.some((l) => l.stopBeat != null);
}

export function createMidiTrack(name = 'MIDI 1', color = randomTrackColor(), patternSteps = 16) {
  const pattern = createPattern('Pattern 1', randomPatternColor(), patternSteps);
  return {
    id: uid(),
    kind: 'midi',
    name,
    color,
    category: defaultTrackCategory('midi'),
    patterns: [pattern],
    activePatternId: pattern.id,
    ghostTrackId: null,
    ghostPatternId: null,
    // Live mode runtime — see engine/liveLauncher.js.
    // liveLaunches: null = follow activePatternId; [] = silent; [...] = sounding clips
    // (multiple when a clip has cutOthers: false). pendingLaunches = queued starts.
    liveLaunches: null,
    pendingLaunches: [],
    midiOutputId: '',
    midiChannel: 0,
    // Instant mute — skips note scheduling (Live LED + any view). Same idea as pad.muted.
    muted: false,
    // Instant solo — when any track is soloed, only soloed tracks schedule.
    soloed: false,
    // When true, the whole track row is omitted from Live view (patterns still
    // play via scenes). Prefer over per-pattern hide for background tracks.
    hiddenFromLive: false,
  };
}

// A pad is one row of a drum track's piano roll — not a MIDI note, a local
// audio sample. `fileName` is display-only; the decoded AudioBuffer itself
// lives in engine/sampler.js (keyed by pad.id), never in this reactive
// project state, for the same reason midi.js keeps its output cache outside
// of any reactive object — decoded audio buffers are large and not something
// Vue's reactivity should be wrapping/tracking.
/** Built-in one-shots in public/drums/, keyed by default pad name. */
export const DEFAULT_DRUM_SAMPLE_FILES = {
  Kick: 'kick.wav',
  Snare: 'snare.wav',
  Clap: 'clap.wav',
  'Closed Hat': 'hihat-cl.wav',
  'Open Hat': 'hihat-op.wav',
  'Low Tom': 'tom-low.wav',
  'Hi Tom': 'tom-hi.wav',
  Rim: 'rim.wav',
  Zap: 'zap.wav',
};

export function defaultDrumSampleFile(padName) {
  return DEFAULT_DRUM_SAMPLE_FILES[padName] ?? null;
}

export const REVERB_DECAY_MIN = 0.15;
export const REVERB_DECAY_MAX = 5;
export const REVERB_DECAY_DEFAULT = 1.2;

export const PAD_GAIN_MIN = 0.25;
export const PAD_GAIN_MAX = 2;
export const PAD_GAIN_DEFAULT = 1;

// Stereo delay (drum pads + multi-sampler zones) — L/R taps in ms or tempo sync.
export const DELAY_MS_MIN = 1;
export const DELAY_MS_MAX = 2000;
export const DELAY_LEFT_MS_DEFAULT = 250;
export const DELAY_RIGHT_MS_DEFAULT = 375;
export const DELAY_FEEDBACK_DEFAULT = 0.35;
export const DELAY_FEEDBACK_MAX = 0.95;
export const DELAY_LEFT_SYNC_DEFAULT = '1/8';
export const DELAY_RIGHT_SYNC_DEFAULT = '1/4';
export const DELAY_LOW_CUT_HZ = 200;

/** Musical note values for tempo-synced delay taps (beats at current BPM). */
export const DELAY_SYNC_OPTIONS = [
  { label: '1/64', value: '1/64', beats: 0.0625 },
  { label: '1/32', value: '1/32', beats: 0.125 },
  { label: '1/16T', value: '1/16T', beats: 1 / 6 },
  { label: '1/16', value: '1/16', beats: 0.25 },
  { label: '1/8T', value: '1/8T', beats: 1 / 3 },
  { label: '1/8', value: '1/8', beats: 0.5 },
  { label: '3/16', value: '3/16', beats: 0.75 },
  { label: '1/4T', value: '1/4T', beats: 2 / 3 },
  { label: '1/4', value: '1/4', beats: 1 },
  { label: '3/8', value: '3/8', beats: 1.5 },
  { label: '1/2', value: '1/2', beats: 2 },
  { label: '1 bar', value: '1bar', beats: 4 },
];

export function delaySyncBeats(value) {
  const opt = DELAY_SYNC_OPTIONS.find((o) => o.value === value);
  return opt?.beats ?? 0.5;
}

/** Default delay fields shared by drum pads and multi-sampler zones. */
export function createDelayDefaults() {
  return {
    // Wet send amount (0 = off). Parallel to dry — not a dry/wet crossfade.
    delay: 0,
    delayFeedback: DELAY_FEEDBACK_DEFAULT,
    // false = millisecond taps; true = tempo-sync note values.
    delaySync: false,
    delayLeftMs: DELAY_LEFT_MS_DEFAULT,
    delayRightMs: DELAY_RIGHT_MS_DEFAULT,
    delayLeftSync: DELAY_LEFT_SYNC_DEFAULT,
    delayRightSync: DELAY_RIGHT_SYNC_DEFAULT,
    // High-pass the delay input at DELAY_LOW_CUT_HZ when true.
    delayCutLow: false,
  };
}

/** Coerce/clamp delay fields on a pad or zone (mutates in place). */
export function normalizeDelayFields(obj) {
  if (!obj) return obj;
  if (obj.delay == null) obj.delay = 0;
  if (obj.delayFeedback == null) obj.delayFeedback = DELAY_FEEDBACK_DEFAULT;
  if (obj.delaySync === undefined) obj.delaySync = false;
  if (obj.delayLeftMs == null) obj.delayLeftMs = DELAY_LEFT_MS_DEFAULT;
  if (obj.delayRightMs == null) obj.delayRightMs = DELAY_RIGHT_MS_DEFAULT;
  if (!obj.delayLeftSync || !DELAY_SYNC_OPTIONS.some((o) => o.value === obj.delayLeftSync)) {
    obj.delayLeftSync = DELAY_LEFT_SYNC_DEFAULT;
  }
  if (!obj.delayRightSync || !DELAY_SYNC_OPTIONS.some((o) => o.value === obj.delayRightSync)) {
    obj.delayRightSync = DELAY_RIGHT_SYNC_DEFAULT;
  }
  if (obj.delayCutLow === undefined) obj.delayCutLow = false;
  obj.delay = Math.max(0, Math.min(1, Number(obj.delay) || 0));
  obj.delayFeedback = Math.max(
    0,
    Math.min(DELAY_FEEDBACK_MAX, Number(obj.delayFeedback) || 0)
  );
  obj.delaySync = !!obj.delaySync;
  obj.delayLeftMs = Math.max(
    DELAY_MS_MIN,
    Math.min(DELAY_MS_MAX, Math.round(Number(obj.delayLeftMs) || DELAY_LEFT_MS_DEFAULT))
  );
  obj.delayRightMs = Math.max(
    DELAY_MS_MIN,
    Math.min(DELAY_MS_MAX, Math.round(Number(obj.delayRightMs) || DELAY_RIGHT_MS_DEFAULT))
  );
  obj.delayCutLow = !!obj.delayCutLow;
  return obj;
}

export function createDrumPad(name, color) {
  const fileName = defaultDrumSampleFile(name) ?? '';
  return {
    id: uid(),
    name,
    color,
    fileName,
    volume: 1,
    muted: false,
    // Retriggering this pad stops its own previous voice when true.
    cutBySelf: true,
    // Other pad ids whose hits choke this pad's playing voice.
    cutByPads: [],
    // Semitones relative to original pitch.
    pitch: 0,
    // Fraction of the source buffer to play (0–1).
    sampleLength: 1,
    // Fraction of the played region that fades out at the end (0 = hard cut).
    fadeOut: 0,
    // Dry/wet send to this pad's reverb bus (0 = off).
    reverb: 0,
    // Reverb tail length in seconds for this pad.
    reverbDecay: REVERB_DECAY_DEFAULT,
    // Pre-fx drive into the distortion stage (1 = unity).
    gain: PAD_GAIN_DEFAULT,
    // Saturation amount (0 = clean).
    distortion: 0,
    ...createDelayDefaults(),
  };
}

/** Coerce legacy or missing pad fields when loading a song. */
export function normalizeDrumPad(pad) {
  if (!pad) return pad;
  if (pad.cutBySelf === undefined) pad.cutBySelf = true;
  if (!Array.isArray(pad.cutByPads)) pad.cutByPads = [];
  if (pad.pitch == null) pad.pitch = 0;
  if (pad.sampleLength == null) pad.sampleLength = 1;
  if (pad.fadeOut == null) pad.fadeOut = 0;
  if (pad.reverb == null) pad.reverb = 0;
  if (pad.muted === undefined) pad.muted = false;
  if (pad.reverbDecay == null) pad.reverbDecay = REVERB_DECAY_DEFAULT;
  if (pad.gain == null) pad.gain = PAD_GAIN_DEFAULT;
  if (pad.distortion == null) pad.distortion = 0;
  pad.sampleLength = Math.max(0.01, Math.min(1, pad.sampleLength));
  pad.fadeOut = Math.max(0, Math.min(1, pad.fadeOut));
  pad.reverb = Math.max(0, Math.min(1, pad.reverb));
  pad.reverbDecay = Math.max(REVERB_DECAY_MIN, Math.min(REVERB_DECAY_MAX, pad.reverbDecay));
  pad.gain = Math.max(PAD_GAIN_MIN, Math.min(PAD_GAIN_MAX, pad.gain));
  pad.distortion = Math.max(0, Math.min(1, pad.distortion));
  pad.pitch = Math.max(-24, Math.min(24, pad.pitch));
  normalizeDelayFields(pad);
  return pad;
}

export const DEFAULT_DRUM_PADS = [
  ['Kick', '#ff4444'],
  ['Snare', '#ffaa00'],
  ['Clap', '#aa66ff'],
  ['Closed Hat', '#44dd88'],
  ['Open Hat', '#2fd1c5'],
  ['Low Tom', '#c97b3d'],
  ['Hi Tom', '#e69a3d'],
  ['Rim', '#d16fae'],
  ['Zap', '#7df9ff'],
];

/** Palette for drum pad step colors — defaults plus accents for custom pads. */
export const DRUM_PAD_COLORS = [
  ...new Set([
    ...DEFAULT_DRUM_PADS.map(([, color]) => color),
    ...TRACK_ACCENT_COLORS,
    '#ff6b6b',
    '#4ecdc4',
    '#ffe66d',
    '#ffffff',
    '#8899aa',
    '#6b7280',
    '#f472b6',
    '#60a5fa',
  ]),
];

export function createDrumTrack(name = 'Drums 1', color = randomTrackColor(), patternSteps = 16) {
  const pattern = createPattern('Pattern 1', randomPatternColor(), patternSteps);
  return {
    id: uid(),
    kind: 'drum',
    name,
    color,
    category: defaultTrackCategory('drum'),
    patterns: [pattern],
    activePatternId: pattern.id,
    ghostTrackId: null,
    ghostPatternId: null,
    liveLaunches: null,
    pendingLaunches: [],
    volume: 1,
    pads: DEFAULT_DRUM_PADS.map(([padName, color2]) => createDrumPad(padName, color2)),
    // Instant mute — skips note scheduling (Live LED + any view). Same idea as pad.muted.
    muted: false,
    // Instant solo — when any track is soloed, only soloed tracks schedule.
    soloed: false,
    // When true, the whole track row is omitted from Live view (patterns still
    // play via scenes). Prefer over per-pattern hide for background tracks.
    hiddenFromLive: false,
  };
}

/** Migrate legacy track-level reverbDecay onto pads when loading old songs. */
export function normalizeDrumTrack(track) {
  if (track?.kind !== 'drum') return track;
  const legacyDecay = track.reverbDecay;
  if (legacyDecay != null) {
    for (const pad of track.pads ?? []) {
      if (pad.reverbDecay == null) pad.reverbDecay = legacyDecay;
    }
    delete track.reverbDecay;
  }
  return track;
}

/** Append default kit pads missing from saved drum tracks (e.g. Zap added after save). */
export function ensureDefaultDrumPads(tracks) {
  for (const track of tracks) {
    if (track.kind !== 'drum' || !Array.isArray(track.pads)) continue;
    normalizeDrumTrack(track);
    const names = new Set(track.pads.map((p) => p.name));
    for (const [padName, color] of DEFAULT_DRUM_PADS) {
      if (names.has(padName)) continue;
      track.pads.push(createDrumPad(padName, color));
      names.add(padName);
    }
    for (const pad of track.pads) normalizeDrumPad(pad);
    const padIds = new Set(track.pads.map((p) => p.id));
    for (const pad of track.pads) {
      pad.cutByPads = (pad.cutByPads ?? []).filter((id) => padIds.has(id));
    }
  }
}

// Multi-sampler zones map a keyboard range (inclusive MIDI pitches) onto one
// audio sample. Unlike drum pads, notes keep numeric MIDI pitches 0–127 and
// the piano roll is identical to a MIDI track — playback pitch-shifts the
// zone's sample relative to `rootNote` (the unshifted key).
//
// `fileName` is display-only; decoded AudioBuffers live in engine/sampler.js
// keyed by zone.id (same IndexedDB path as drum pads).

/** Clamp a MIDI note number into the valid 0–127 range. */
export function clampMidiNote(note, fallback = 60) {
  const n = Number(note);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(127, Math.round(n)));
}

export function createSampleZone({
  name = 'Sample 1',
  lowNote = 0,
  highNote = 127,
  rootNote = 60,
} = {}) {
  let low = clampMidiNote(lowNote, 0);
  let high = clampMidiNote(highNote, 127);
  if (high < low) [low, high] = [high, low];
  const root = clampMidiNote(rootNote, 60);
  return {
    id: uid(),
    name,
    fileName: '',
    lowNote: low,
    highNote: high,
    // MIDI pitch at which the sample plays at its original rate.
    rootNote: root,
    // Extra semitone offset on top of note−rootNote mapping (±24, like drum pads).
    pitch: 0,
    volume: 1,
    muted: false,
    // Samples-editor UI: collapse zone parameters to title + note range.
    minimized: false,
    // Same local FX chain as drum pads (see createDrumPad / sampler.js).
    gain: PAD_GAIN_DEFAULT,
    distortion: 0,
    reverb: 0,
    reverbDecay: REVERB_DECAY_DEFAULT,
    ...createDelayDefaults(),
  };
}

/** Coerce legacy or missing zone fields when loading a song. */
export function normalizeSampleZone(zone) {
  if (!zone) return zone;
  zone.lowNote = clampMidiNote(zone.lowNote, 0);
  zone.highNote = clampMidiNote(zone.highNote, 127);
  if (zone.highNote < zone.lowNote) {
    const tmp = zone.lowNote;
    zone.lowNote = zone.highNote;
    zone.highNote = tmp;
  }
  zone.rootNote = clampMidiNote(zone.rootNote, 60);
  if (zone.pitch == null) zone.pitch = 0;
  zone.pitch = Math.max(-24, Math.min(24, Math.round(Number(zone.pitch) || 0)));
  if (zone.volume == null) zone.volume = 1;
  zone.volume = Math.max(0, Math.min(1, Number(zone.volume) || 0));
  if (zone.muted === undefined) zone.muted = false;
  if (zone.minimized === undefined) zone.minimized = false;
  zone.minimized = !!zone.minimized;
  if (typeof zone.name !== 'string' || !zone.name) zone.name = 'Sample';
  if (typeof zone.fileName !== 'string') zone.fileName = '';
  if (zone.gain == null) zone.gain = PAD_GAIN_DEFAULT;
  if (zone.distortion == null) zone.distortion = 0;
  if (zone.reverb == null) zone.reverb = 0;
  if (zone.reverbDecay == null) zone.reverbDecay = REVERB_DECAY_DEFAULT;
  zone.gain = Math.max(PAD_GAIN_MIN, Math.min(PAD_GAIN_MAX, Number(zone.gain) || PAD_GAIN_DEFAULT));
  zone.distortion = Math.max(0, Math.min(1, Number(zone.distortion) || 0));
  zone.reverb = Math.max(0, Math.min(1, Number(zone.reverb) || 0));
  zone.reverbDecay = Math.max(
    REVERB_DECAY_MIN,
    Math.min(REVERB_DECAY_MAX, Number(zone.reverbDecay) || REVERB_DECAY_DEFAULT)
  );
  normalizeDelayFields(zone);
  return zone;
}

export function createMultiSamplerTrack(
  name = 'Sampler 1',
  color = randomTrackColor(),
  patternSteps = 16
) {
  const pattern = createPattern('Pattern 1', randomPatternColor(), patternSteps);
  return {
    id: uid(),
    kind: 'multisampler',
    name,
    color,
    category: defaultTrackCategory('multisampler'),
    patterns: [pattern],
    activePatternId: pattern.id,
    ghostTrackId: null,
    ghostPatternId: null,
    liveLaunches: null,
    pendingLaunches: [],
    volume: 1,
    // One empty zone covering the full keyboard — loading a single sample
    // maps it chromatically across every key until the user splits ranges.
    zones: [createSampleZone({ name: 'Sample 1', lowNote: 0, highNote: 127, rootNote: 60 })],
    muted: false,
    soloed: false,
    hiddenFromLive: false,
  };
}

/** Ensure multi-sampler tracks always have at least one normalized zone. */
export function ensureMultiSamplerZones(tracks) {
  for (const track of tracks ?? []) {
    if (track.kind !== 'multisampler') continue;
    if (!Array.isArray(track.zones) || track.zones.length === 0) {
      track.zones = [createSampleZone()];
    }
    for (const zone of track.zones) normalizeSampleZone(zone);
    if (track.volume == null) track.volume = 1;
    track.volume = Math.max(0, Math.min(1, Number(track.volume) || 0));
  }
}

// Step counts for 1–64 bars at 16 steps per bar (4 steps per beat).
export const STEPS_PER_BEAT = 4;
export const BEATS_PER_BAR = 4;

export const BAR_LENGTH_OPTIONS = [
  { bars: 1, steps: 16 },
  { bars: 2, steps: 32 },
  { bars: 4, steps: 64 },
  { bars: 8, steps: 128 },
  { bars: 16, steps: 256 },
  { bars: 32, steps: 512 },
  { bars: 64, steps: 1024 },
];

export function stepsToBeats(steps) {
  return steps / STEPS_PER_BEAT;
}

export function beatsToSteps(beats) {
  return beats * STEPS_PER_BEAT;
}

export function patternLoopEndBeat(pattern) {
  return stepsToBeats(pattern?.patternSteps ?? 16);
}

/** Human-readable bar length for a pattern's step count. */
export function patternStepsLabel(steps, { compact = false } = {}) {
  const opt = BAR_LENGTH_OPTIONS.find((o) => o.steps === steps);
  if (!opt) return `${stepsToBeats(steps)}b`;
  if (compact) return `${opt.bars}b`;
  return `${opt.bars} bar${opt.bars > 1 ? 's' : ''}`;
}

export function trackLoopEndBeat(track) {
  return patternLoopEndBeat(getActivePattern(track));
}

export function trackPlayingLoopEndBeat(track, { useLiveLaunch = true, soloPreview = null } = {}) {
  const patterns = getPlayingPatterns(track, { useLiveLaunch, soloPreview });
  if (!patterns.length) return 0;
  return Math.max(...patterns.map(patternLoopEndBeat));
}

export function projectLoopEndBeat(tracks, { forPlayback = false, useLiveLaunch = true, soloPreview = null } = {}) {
  if (!tracks?.length) return 4;
  if (forPlayback && soloPreview && !useLiveLaunch) {
    const track = tracks.find((t) => t.id === soloPreview.trackId);
    const pattern = track?.patterns?.find((p) => p.id === soloPreview.patternId);
    return patternLoopEndBeat(pattern) || 4;
  }
  const endBeat =
    forPlayback && useLiveLaunch
      ? (t) => trackPlayingLoopEndBeat(t, { useLiveLaunch, soloPreview })
      : trackLoopEndBeat;
  return Math.max(...tracks.map(endBeat));
}

export function createProject() {
  return {
    bpm: 120,
    // 'roll': piano-roll editing — playback follows each track's activePatternId.
    // 'live': session grid — playback follows liveLaunches / pendingLaunches.
    sessionView: 'roll',
    sendMidiClock: false,
    clockOutputId: '',
    // 'internal': this app is the master clock (default).
    // 'external': follow incoming MIDI clock from another app (e.g. FL Studio).
    syncMode: 'internal',
    clockInputId: '',
    // Timeline marker — paste anchor and playback start position; null = not set.
    markerBeat: null,
    // User-drawn loop region on the timeline; null falls back to the full pattern length.
    loopRegion: null,
    // Roll-view ▶ preview — { trackId, patternId } or null; not persisted.
    soloPreview: null,
    // Named pattern groups for Live-mode scene launch (patterns opt in via sceneIds).
    scenes: [],
    tracks: [
      createDrumTrack('Drums 1', TRACK_ACCENT_COLORS[3], 16),
      createMidiTrack('Synth 1', TRACK_ACCENT_COLORS[1], 32),
      createMidiTrack('Synth 2', TRACK_ACCENT_COLORS[2], 64),
    ],
  };
}

export function noteName(pitch) {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(pitch / 12) - 1;
  return `${names[pitch % 12]}${octave}`;
}

export const SNAP_VALUES = [
  { label: '1/4', value: 1 },
  { label: '1/8', value: 0.5 },
  { label: '1/16', value: 0.25 },
  { label: '1/32', value: 0.125 },
  { label: '1/64', value: 0.0625 },
];

/** Len menu — whole/half/quarter notes through 1/64, ordered 1, 2, 4, 8, … */
export const NOTE_LENGTH_VALUES = [
  { label: '1/1', value: BEATS_PER_BAR },
  { label: '1/2', value: 2 },
  { label: '1/4', value: 1 },
  { label: '1/8', value: 0.5 },
  { label: '1/16', value: 0.25 },
  { label: '1/32', value: 0.125 },
  { label: '1/64', value: 0.0625 },
];

/** Toolbar label for a snap option — compact mode drops the redundant "1/" prefix. */
export function snapOptionLabel(entry, compact = false) {
  if (!compact) return entry.label;
  if (!entry.label.startsWith('1/')) return entry.label;
  return entry.label.slice(2);
}

/** How a pattern is triggered in Live mode — configured per pattern. */
export const LIVE_LAUNCH_MODES = {
  /** One click toggles loop on/off (default Live clip behavior). */
  TOGGLE: 'toggle',
  /** Hold to hear: loops muted in sync until the next grid line, then audibly while held. */
  HOLD: 'hold',
  /** One click plays the pattern through once, then the track goes silent. */
  ONE_SHOT: 'oneShot',
};

/** Grid Hold unmute / One Shot launch aligns to when you trigger a clip. */
export const LIVE_SYNC_GRID_OPTIONS = [
  { label: '1/16', value: '1/16', beats: 0.25 },
  { label: '1/8', value: '1/8', beats: 0.5 },
  { label: '1/4', value: '1/4', beats: 1 },
  { label: '1 bar', value: '1bar', beats: BEATS_PER_BAR },
  { label: 'Track', value: 'track', beats: null },
];

export function liveSyncGridBeats(pattern) {
  const grid = pattern?.liveSyncGrid ?? '1/16';
  const opt = LIVE_SYNC_GRID_OPTIONS.find((o) => o.value === grid);
  if (opt?.beats != null) return opt.beats;
  return patternLoopEndBeat(pattern);
}

export function snapBeat(beat, snap) {
  if (!snap || snap <= 0) return beat;
  return Math.round(beat / snap) * snap;
}
