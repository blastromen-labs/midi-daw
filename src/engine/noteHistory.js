/** Max snapshots retained for piano-roll note undo/redo. */
export const NOTE_HISTORY_LIMIT = 10;

export function cloneNotes(notes) {
  return (notes ?? []).map((n) => ({ ...n }));
}

/**
 * Snapshot stack for pattern note edits. Continuous gestures (move/resize/paint)
 * call beginGroup() so only the pre-gesture state is recorded once; discrete
 * edits record on each commit via record().
 */
export function createNoteHistory(limit = NOTE_HISTORY_LIMIT) {
  const undoStack = [];
  const redoStack = [];
  let grouped = false;
  let pendingRecord = false;

  function pushUndo(notes) {
    undoStack.push(cloneNotes(notes));
    if (undoStack.length > limit) undoStack.shift();
    redoStack.length = 0;
  }

  return {
    /**
     * Record the notes state from *before* an edit. Inside an open group this
     * only runs once (on the first commit of that gesture).
     */
    record(notes) {
      if (grouped) {
        if (!pendingRecord) return;
        pendingRecord = false;
      }
      pushUndo(notes);
    },

    /** Open a multi-commit gesture; the next record() captures the baseline. */
    beginGroup() {
      if (grouped) return;
      grouped = true;
      pendingRecord = true;
    },

    endGroup() {
      grouped = false;
      pendingRecord = false;
    },

    undo(currentNotes) {
      if (!undoStack.length) return null;
      this.endGroup();
      redoStack.push(cloneNotes(currentNotes));
      if (redoStack.length > limit) redoStack.shift();
      return undoStack.pop();
    },

    redo(currentNotes) {
      if (!redoStack.length) return null;
      this.endGroup();
      undoStack.push(cloneNotes(currentNotes));
      if (undoStack.length > limit) undoStack.shift();
      return redoStack.pop();
    },

    clear() {
      undoStack.length = 0;
      redoStack.length = 0;
      this.endGroup();
    },

    get canUndo() {
      return undoStack.length > 0;
    },

    get canRedo() {
      return redoStack.length > 0;
    },
  };
}
