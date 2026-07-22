/**
 * Live-set helpers — ordered list of songs shown as stacked blocks in Live view.
 * Each song keeps its own tracks/patterns/scenes; the shared clock drives them all
 * so clips from different songs can mix without swapping the active project.
 */

/** Normalize a stored order against the current library; append any missing songs. */
export function normalizeLiveSongOrder(order, songs) {
  const ids = new Set((songs ?? []).map((s) => s.id));
  const next = [];
  for (const id of order ?? []) {
    if (ids.has(id) && !next.includes(id)) next.push(id);
  }
  for (const song of songs ?? []) {
    if (!next.includes(song.id)) next.push(song.id);
  }
  return next;
}

/** Move a song one slot up/down in the live order. Returns a new array. */
export function moveLiveSong(order, songId, direction) {
  const next = [...(order ?? [])];
  const idx = next.indexOf(songId);
  if (idx === -1) return next;
  const target = direction === 'up' ? idx - 1 : idx + 1;
  if (target < 0 || target >= next.length) return next;
  const [item] = next.splice(idx, 1);
  next.splice(target, 0, item);
  return next;
}

/**
 * Deep-clone a runtime project including Live ephemeral fields (liveLaunches,
 * pendingLaunches). Used when parking a song in the background during a mix so
 * sounding clips survive an edit-focus song switch.
 */
export function snapshotLiveRuntime(project) {
  return JSON.parse(JSON.stringify(project));
}
