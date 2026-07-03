<template>
  <div class="piano-roll flex flex-col bg-panel rounded-lg border border-zinc-800 overflow-hidden h-full">
    <!-- Toolbar -->
    <div class="flex items-center gap-3 px-3 py-2 bg-surface border-b border-zinc-800 flex-shrink-0">
      <select :value="activeTrackId" @change="onTrackSelect" class="text-sm font-semibold">
        <option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>

      <input
        :value="activeTrack?.name"
        @change="onRename"
        class="bg-transparent border-b border-zinc-700 text-sm px-1 w-24 focus:border-accent outline-none"
      />

      <div class="h-4 w-px bg-zinc-700"></div>

      <MidiRouteSelect
        v-if="activeTrack"
        :output-id="activeTrack.midiOutputId"
        :channel="activeTrack.midiChannel"
        :outputs="midiOutputs"
        @output-change="(id) => updateRoute({ midiOutputId: id })"
        @channel-change="(ch) => updateRoute({ midiChannel: ch })"
      />

      <div class="h-4 w-px bg-zinc-700"></div>

      <label class="text-xs text-zinc-400">Snap</label>
      <select v-model="snap" class="text-xs">
        <option v-for="s in snapValues" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>

      <label class="text-xs text-zinc-400 ml-1" title="Length of newly drawn notes — independent of Snap">Length</label>
      <select v-model="noteLength" class="text-xs">
        <option v-for="s in snapValues" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>

      <div class="h-4 w-px bg-zinc-700"></div>

      <button
        class="text-xs text-zinc-400 hover:text-white tabular-nums"
        title="Cmd/Ctrl + scroll to zoom — click to reset"
        @click="resetZoom"
      >
        Zoom {{ zoomPercent }}%
      </button>

      <label class="text-xs text-zinc-400 ml-2">Draw</label>
      <button
        class="px-2 py-0.5 rounded text-xs"
        :class="tool === 'draw' ? 'bg-accent text-white' : 'bg-zinc-700'"
        @click="tool = 'draw'"
      >
        ✏
      </button>
      <button
        class="px-2 py-0.5 rounded text-xs"
        :class="tool === 'select' ? 'bg-accent text-white' : 'bg-zinc-700'"
        @click="tool = 'select'"
      >
        ↖
      </button>
      <button
        class="px-2 py-0.5 rounded text-xs"
        :class="tool === 'erase' ? 'bg-accent text-white' : 'bg-zinc-700'"
        @click="tool = 'erase'"
      >
        ✕
      </button>

      <button
        class="ml-auto px-2 py-0.5 rounded text-xs bg-zinc-700 hover:bg-zinc-600"
        @click="$emit('add-track')"
      >
        + Track
      </button>
    </div>

    <!-- Canvas area -->
    <div class="flex flex-1 min-h-0 overflow-hidden" ref="containerRef">
      <!-- Piano keys -->
      <div class="flex-shrink-0 w-12 overflow-hidden bg-zinc-900 border-r border-zinc-800" ref="keysRef">
        <canvas
          ref="keysCanvas"
          :width="48"
          :height="canvasHeight"
          class="block cursor-pointer"
          @mousedown="onKeyMouseDown"
          @mousemove="onKeyMouseMove"
        ></canvas>
      </div>

      <!-- Grid -->
      <div class="flex-1 overflow-auto" ref="scrollRef" @scroll="onScroll" @wheel="onWheel">
        <div class="relative" :style="{ width: gridWidth + 'px', height: canvasHeight + 'px' }">
          <canvas
            ref="gridCanvas"
            :width="gridWidth"
            :height="canvasHeight"
            class="absolute top-0 left-0"
            :class="gridCursorClass"
            @mousedown="onMouseDown"
            @mousemove="onMouseMove"
            @mouseup="onMouseUp"
            @mouseleave="onMouseUp"
            @contextmenu="onGridContextMenu"
          ></canvas>
          <!-- Cheap overlay redrawn every animation frame; keeps the expensive
               grid/notes canvas untouched so it never competes with the audio scheduler. -->
          <canvas
            ref="playheadCanvas"
            :width="gridWidth"
            :height="canvasHeight"
            class="absolute top-0 left-0 pointer-events-none"
          ></canvas>
          <div
            v-if="marqueeRect"
            class="absolute border border-accent bg-accent/20 pointer-events-none"
            :style="marqueeStyle"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { noteName, SNAP_VALUES, snapBeat, createNote, uid } from '../models/project.js';
import { usePlayheadBeat } from '../composables/usePlayheadBeat.js';
import { getActiveClock } from '../engine/activeClock.js';
import { sendNoteOn, sendNoteOff } from '../engine/midi.js';
import MidiRouteSelect from './MidiRouteSelect.vue';

const PREVIEW_VELOCITY = 100;
const RESIZE_HANDLE_PX = 6;
const MIN_PREVIEW_MS = 60;

const props = defineProps({
  tracks: { type: Array, required: true },
  activeTrackId: String,
  loopEndBeat: { type: Number, default: 4 },
  playing: Boolean,
  midiOutputs: { type: Array, default: () => [] },
});

const liveBeat = usePlayheadBeat();

const emit = defineEmits(['update-notes', 'select-track', 'route-change', 'add-track', 'rename-track']);

const ROW_HEIGHT = 14;
const DEFAULT_BEAT_WIDTH = 80;
const MIN_BEAT_WIDTH = 20;
const MAX_BEAT_WIDTH = 320;
const ZOOM_STEP = 1.12;
const LOW_PITCH = 36;
const HIGH_PITCH = 84;
const TOTAL_ROWS = HIGH_PITCH - LOW_PITCH + 1;

const snapValues = SNAP_VALUES;
const snap = ref(0.25);
// Independent from `snap` (grid/placement resolution) so you can e.g. place
// 1/32-length notes while snapping their position to a 1/16 grid.
const noteLength = ref(0.25);
const tool = ref('draw');
const beatWidth = ref(DEFAULT_BEAT_WIDTH);
const zoomPercent = computed(() => Math.round((beatWidth.value / DEFAULT_BEAT_WIDTH) * 100));

const containerRef = ref(null);
const scrollRef = ref(null);
const keysRef = ref(null);
const gridCanvas = ref(null);
const keysCanvas = ref(null);
const playheadCanvas = ref(null);

const canvasHeight = TOTAL_ROWS * ROW_HEIGHT;
const gridWidth = computed(() => props.loopEndBeat * beatWidth.value);

const activeTrack = computed(() => props.tracks.find((t) => t.id === props.activeTrackId));

const drag = ref(null);
const selectedNoteIds = ref(new Set());
const marqueeRect = ref(null);
const previewingPitch = ref(null);
const hoverResize = ref(false);
const hoverMove = ref(false);

const gridCursorClass = computed(() => {
  if (drag.value?.type === 'move') return 'cursor-grabbing';
  if (hoverResize.value) return 'cursor-ew-resize';
  if (hoverMove.value) return 'cursor-grab';
  return 'cursor-crosshair';
});

const marqueeStyle = computed(() => {
  const r = marqueeRect.value;
  if (!r) return {};
  return {
    left: Math.min(r.x1, r.x2) + 'px',
    top: Math.min(r.y1, r.y2) + 'px',
    width: Math.abs(r.x2 - r.x1) + 'px',
    height: Math.abs(r.y2 - r.y1) + 'px',
  };
});

function pitchToY(pitch) {
  return (HIGH_PITCH - pitch) * ROW_HEIGHT;
}

function yToPitch(y) {
  return HIGH_PITCH - Math.floor(y / ROW_HEIGHT);
}

function beatToX(beat) {
  return beat * beatWidth.value;
}

// Rounds to the nearest grid line — used for continuous drag feedback
// (moving/resizing an already-selected note), where snapping to whichever
// line is closest to the cursor feels natural.
function xToBeat(x) {
  return snapBeat(x / beatWidth.value, snap.value);
}

// Floors to the start of the grid cell the cursor is currently inside — used
// when placing a new note, so it lands in the cell you're hovering rather
// than snapping to whichever grid line happens to be nearest your cursor.
function xToBeatCell(x) {
  const s = snap.value || 0.125;
  return Math.floor(x / beatWidth.value / s) * s;
}

// The exact, unsnapped beat under the cursor — used to hit-test existing
// notes so hovering anywhere within a note always finds that note, regardless
// of the current grid/snap setting.
function xToRawBeat(x) {
  return x / beatWidth.value;
}

function onTrackSelect(e) {
  emit('select-track', e.target.value);
}

function onRename(e) {
  emit('rename-track', props.activeTrackId, e.target.value);
}

function updateRoute(changes) {
  emit('route-change', props.activeTrackId, changes);
}

function getNotes() {
  return activeTrack.value?.notes ?? [];
}

function emitNotes(notes) {
  emit('update-notes', props.activeTrackId, notes);
}

function findNoteAt(beat, pitch) {
  return getNotes().find(
    (n) => n.pitch === pitch && beat >= n.startBeat && beat < n.startBeat + n.duration
  );
}

// Finds a note whose right edge (in pixels) is close enough to x, on the same
// pitch row as y, so the user can grab and drag it to change the note's length.
function findResizeHandle(x, y) {
  const pitch = yToPitch(y);
  return getNotes().find((n) => {
    if (n.pitch !== pitch) return false;
    const endX = beatToX(n.startBeat + n.duration);
    return Math.abs(x - endX) <= RESIZE_HANDLE_PX;
  });
}

function eventToGridPos(e) {
  // getBoundingClientRect() is already relative to the scrolled viewport, so it
  // accounts for scroll position on its own — do not add scrollLeft/scrollTop again.
  const rect = gridCanvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  return {
    x,
    y,
    rawBeat: xToRawBeat(x),
    cellBeat: xToBeatCell(x),
    pitch: yToPitch(y),
  };
}

// Rectangle-selects every note whose box intersects the current marquee drag,
// in beat/pitch space so it stays correct at any zoom level.
function updateMarqueeSelection() {
  const r = marqueeRect.value;
  if (!r) return;

  const xMin = Math.min(r.x1, r.x2);
  const xMax = Math.max(r.x1, r.x2);
  const yMin = Math.min(r.y1, r.y2);
  const yMax = Math.max(r.y1, r.y2);

  const beatMin = xMin / beatWidth.value;
  const beatMax = xMax / beatWidth.value;
  const pitchTop = yToPitch(yMin);
  const pitchBottom = yToPitch(yMax);

  const selected = getNotes().filter((n) => {
    const overlapsX = n.startBeat + n.duration > beatMin && n.startBeat < beatMax;
    const overlapsY = n.pitch <= pitchTop && n.pitch >= pitchBottom;
    return overlapsX && overlapsY;
  });

  // Shift + Cmd/Ctrl drag adds to whatever was already selected before this
  // marquee started, so you can build up a scattered selection with several
  // separate drags. Plain Cmd/Ctrl drag replaces the selection each time.
  if (drag.value?.additive) {
    selectedNoteIds.value = new Set([...drag.value.baseSelection, ...selected.map((n) => n.id)]);
  } else {
    selectedNoteIds.value = new Set(selected.map((n) => n.id));
  }
}

// Shared by right-button paint-delete and the erase tool: removes whichever
// note is under (beat, pitch), if any, and drops it from the selection too.
function eraseNoteAt(beat, pitch) {
  const existing = findNoteAt(beat, pitch);
  if (!existing) return;
  if (selectedNoteIds.value.has(existing.id)) {
    const next = new Set(selectedNoteIds.value);
    next.delete(existing.id);
    selectedNoteIds.value = next;
  }
  emitNotes(getNotes().filter((n) => n.id !== existing.id));
}

function onMouseDown(e) {
  const { x, y, rawBeat, cellBeat, pitch } = eventToGridPos(e);

  // Right mouse button always paint-deletes — hold and drag to erase multiple
  // notes in one stroke, regardless of tool.
  if (e.button === 2) {
    eraseNoteAt(rawBeat, pitch);
    drag.value = { type: 'erasePaint' };
    return;
  }

  // Cmd/Ctrl + drag always starts a rubber-band multi-select, regardless of tool.
  // Adding Shift makes it additive, keeping whatever was already selected so
  // you can build up a scattered selection with several separate drags.
  if (e.metaKey || e.ctrlKey) {
    drag.value = { type: 'marquee', additive: e.shiftKey, baseSelection: new Set(selectedNoteIds.value) };
    marqueeRect.value = { x1: x, y1: y, x2: x, y2: y };
    return;
  }

  if (tool.value === 'erase') {
    eraseNoteAt(rawBeat, pitch);
    drag.value = { type: 'erasePaint' };
    return;
  }

  // Grabbing a note's right edge resizes it, regardless of draw/select tool —
  // matches FL Studio's "drag the tail to change length" convention. If the
  // grabbed note is part of a multi-selection, the whole selection resizes
  // together by the same amount.
  const resizeTarget = findResizeHandle(x, y);
  if (resizeTarget) {
    const group =
      selectedNoteIds.value.has(resizeTarget.id) && selectedNoteIds.value.size > 1
        ? getNotes().filter((n) => selectedNoteIds.value.has(n.id))
        : [resizeTarget];
    selectedNoteIds.value = new Set(group.map((n) => n.id));
    drag.value = {
      type: 'resize',
      anchorOrigStartBeat: resizeTarget.startBeat,
      anchorOrigDuration: resizeTarget.duration,
      origDurations: new Map(group.map((n) => [n.id, n.duration])),
    };
    return;
  }

  const existing = findNoteAt(rawBeat, pitch);

  // Shift + drag on a note duplicates it (and the rest of the selection, if
  // it's part of one), leaves the originals in place, and immediately starts
  // dragging the copies — matches FL Studio's "hold Shift to clone" convention.
  if (existing && e.shiftKey) {
    const sourceGroup =
      selectedNoteIds.value.has(existing.id) && selectedNoteIds.value.size > 1
        ? getNotes().filter((n) => selectedNoteIds.value.has(n.id))
        : [existing];

    const clones = sourceGroup.map((n) => ({ ...n, id: uid() }));
    const anchorClone = clones[sourceGroup.findIndex((n) => n.id === existing.id)];

    emitNotes([...getNotes(), ...clones]);
    selectedNoteIds.value = new Set(clones.map((n) => n.id));

    drag.value = {
      type: 'move',
      startX: x,
      startY: y,
      anchorOrigBeat: anchorClone.startBeat,
      anchorOrigPitch: anchorClone.pitch,
      origPositions: new Map(clones.map((n) => [n.id, { beat: n.startBeat, pitch: n.pitch }])),
    };
    return;
  }

  // Grabbing any note's body moves it (and the rest of the selection, if it's
  // part of one) — works in any tool except erase, so you don't have to
  // switch away from draw just to nudge a note you just placed.
  if (existing) {
    const keepSelection = selectedNoteIds.value.has(existing.id) && selectedNoteIds.value.size > 1;
    if (!keepSelection) selectedNoteIds.value = new Set([existing.id]);

    const group = getNotes().filter((n) => selectedNoteIds.value.has(n.id));
    drag.value = {
      type: 'move',
      startX: x,
      startY: y,
      anchorOrigBeat: existing.startBeat,
      anchorOrigPitch: existing.pitch,
      origPositions: new Map(group.map((n) => [n.id, { beat: n.startBeat, pitch: n.pitch }])),
    };
    return;
  }

  if (tool.value === 'select') {
    selectedNoteIds.value = new Set();
    return;
  }

  if (tool.value === 'draw') {
    const note = createNote(pitch, cellBeat, noteLength.value, 100);
    emitNotes([...getNotes(), note]);
    selectedNoteIds.value = new Set([note.id]);
    previewNotePulse(note.pitch, note.velocity, note.duration);
    // Hold and drag to paint more notes into new cells in one stroke.
    drag.value = { type: 'paintAdd', lastCell: `${cellBeat}:${pitch}` };
  }
}

// Briefly sounds a note when it's drawn, so you can hear the pitch you just
// placed without having to press play. Output/channel are captured up front
// so a later routing change can't cause the note-off to go to the wrong place.
function previewNotePulse(pitch, velocity, durationBeats) {
  const track = activeTrack.value;
  if (!track?.midiOutputId) return;
  const { midiOutputId, midiChannel } = track;

  sendNoteOn(midiOutputId, midiChannel, pitch, velocity);
  const ms = Math.max(MIN_PREVIEW_MS, getActiveClock().beatToSec(durationBeats) * 1000);
  setTimeout(() => sendNoteOff(midiOutputId, midiChannel, pitch), ms);
}

// Actual deletion happens on mousedown/mousemove (see eraseNoteAt) so right-drag
// can paint-delete across multiple notes; this just suppresses the native menu.
function onGridContextMenu(e) {
  e.preventDefault();
}

function onMouseMove(e) {
  const { x, y, rawBeat, cellBeat, pitch } = eventToGridPos(e);

  if (!drag.value) {
    if (tool.value === 'erase') {
      hoverResize.value = false;
      hoverMove.value = false;
      return;
    }
    const resizeNote = findResizeHandle(x, y);
    hoverResize.value = !!resizeNote;
    hoverMove.value = !resizeNote && !!findNoteAt(xToRawBeat(x), yToPitch(y));
    return;
  }

  if (drag.value.type === 'erasePaint') {
    eraseNoteAt(rawBeat, pitch);
    return;
  }

  if (drag.value.type === 'paintAdd') {
    const cellKey = `${cellBeat}:${pitch}`;
    if (cellKey === drag.value.lastCell) return;
    drag.value.lastCell = cellKey;

    if (!findNoteAt(rawBeat, pitch)) {
      const note = createNote(pitch, cellBeat, noteLength.value, 100);
      emitNotes([...getNotes(), note]);
      previewNotePulse(note.pitch, note.velocity, note.duration);
    }
    return;
  }

  if (drag.value.type === 'marquee') {
    marqueeRect.value = { ...marqueeRect.value, x2: x, y2: y };
    updateMarqueeSelection();
    return;
  }

  if (drag.value.type === 'move') {
    const dx = x - drag.value.startX;
    const dy = y - drag.value.startY;
    const newAnchorBeat = snapBeat(drag.value.anchorOrigBeat + dx / beatWidth.value, snap.value);
    const newAnchorPitch = yToPitch(pitchToY(drag.value.anchorOrigPitch) + dy);
    const deltaBeat = newAnchorBeat - drag.value.anchorOrigBeat;
    const deltaPitch = newAnchorPitch - drag.value.anchorOrigPitch;

    emitNotes(
      getNotes().map((n) => {
        const orig = drag.value.origPositions.get(n.id);
        if (!orig) return n;
        return {
          ...n,
          startBeat: Math.max(0, orig.beat + deltaBeat),
          pitch: Math.max(LOW_PITCH, Math.min(HIGH_PITCH, orig.pitch + deltaPitch)),
        };
      })
    );
  } else if (drag.value.type === 'resize') {
    const minDuration = snap.value || 0.125;
    const endBeat = xToBeat(x);
    const newAnchorDuration = Math.max(minDuration, endBeat - drag.value.anchorOrigStartBeat);
    const deltaDuration = newAnchorDuration - drag.value.anchorOrigDuration;

    emitNotes(
      getNotes().map((n) => {
        const origDuration = drag.value.origDurations.get(n.id);
        if (origDuration === undefined) return n;
        return { ...n, duration: Math.max(minDuration, origDuration + deltaDuration) };
      })
    );
  }
}

function onMouseUp() {
  if (drag.value?.type === 'marquee') marqueeRect.value = null;
  drag.value = null;
}

function playPreview(pitch) {
  const track = activeTrack.value;
  if (track?.midiOutputId) {
    sendNoteOn(track.midiOutputId, track.midiChannel, pitch, PREVIEW_VELOCITY);
  }
  previewingPitch.value = pitch;
  drawKeys();
}

function stopPreview() {
  const track = activeTrack.value;
  if (previewingPitch.value !== null && track?.midiOutputId) {
    sendNoteOff(track.midiOutputId, track.midiChannel, previewingPitch.value);
  }
  previewingPitch.value = null;
  drawKeys();
}

function onKeyMouseDown(e) {
  const rect = keysCanvas.value.getBoundingClientRect();
  const pitch = yToPitch(e.clientY - rect.top);
  if (pitch < LOW_PITCH || pitch > HIGH_PITCH) return;
  playPreview(pitch);
}

function onKeyMouseMove(e) {
  if (previewingPitch.value === null) return;
  const rect = keysCanvas.value.getBoundingClientRect();
  const pitch = yToPitch(e.clientY - rect.top);
  if (pitch < LOW_PITCH || pitch > HIGH_PITCH || pitch === previewingPitch.value) return;
  // Slide across keys like a real piano roll: release the old note, trigger the new one.
  stopPreview();
  playPreview(pitch);
}

function onScroll() {
  if (keysRef.value && scrollRef.value) {
    keysRef.value.scrollTop = scrollRef.value.scrollTop;
  }
}

// Cmd/Ctrl + wheel zooms the horizontal (time) axis, keeping the beat under the
// cursor fixed in place — matches FL Studio's piano roll zoom behavior.
function onWheel(e) {
  if (!e.metaKey && !e.ctrlKey) return;
  e.preventDefault();

  const container = scrollRef.value;
  if (!container) return;

  const rect = container.getBoundingClientRect();
  const cursorX = e.clientX - rect.left;
  const beatUnderCursor = (container.scrollLeft + cursorX) / beatWidth.value;

  const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
  const newWidth = Math.min(MAX_BEAT_WIDTH, Math.max(MIN_BEAT_WIDTH, beatWidth.value * factor));
  if (newWidth === beatWidth.value) return;

  beatWidth.value = newWidth;

  nextTick(() => {
    container.scrollLeft = beatUnderCursor * newWidth - cursorX;
  });
}

function resetZoom() {
  beatWidth.value = DEFAULT_BEAT_WIDTH;
}

function drawKeys() {
  const canvas = keysCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 48, canvasHeight);

  for (let p = HIGH_PITCH; p >= LOW_PITCH; p--) {
    const y = pitchToY(p);
    const isPressed = p === previewingPitch.value;
    const isBlack = [1, 3, 6, 8, 10].includes(p % 12);
    ctx.fillStyle = isPressed ? '#ff6b35' : isBlack ? '#1a1a22' : '#2a2a35';
    ctx.fillRect(0, y, 48, ROW_HEIGHT);
    ctx.strokeStyle = '#333';
    ctx.strokeRect(0, y, 48, ROW_HEIGHT);

    if (p % 12 === 0) {
      ctx.fillStyle = isPressed ? '#fff' : '#888';
      ctx.font = '9px JetBrains Mono';
      ctx.fillText(noteName(p), 2, y + ROW_HEIGHT - 3);
    }
  }
}

function drawGrid() {
  const canvas = gridCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = gridWidth.value;
  ctx.clearRect(0, 0, w, canvasHeight);

  // Background rows
  for (let p = HIGH_PITCH; p >= LOW_PITCH; p--) {
    const y = pitchToY(p);
    const isBlack = [1, 3, 6, 8, 10].includes(p % 12);
    ctx.fillStyle = isBlack ? '#12121a' : '#18181f';
    ctx.fillRect(0, y, w, ROW_HEIGHT);
  }

  // Grid lines
  const snapW = snap.value * beatWidth.value;
  for (let x = 0; x <= w; x += snapW) {
    const isBeat = Math.abs(x / beatWidth.value - Math.round(x / beatWidth.value)) < 0.001;
    ctx.strokeStyle = isBeat ? '#3a3a48' : '#222230';
    ctx.lineWidth = isBeat ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvasHeight);
    ctx.stroke();
  }

  // Notes
  const notes = getNotes();
  const color = activeTrack.value?.color ?? '#6699ff';
  for (const note of notes) {
    const x = beatToX(note.startBeat);
    const y = pitchToY(note.pitch);
    const nw = note.duration * beatWidth.value;
    const isSelected = selectedNoteIds.value.has(note.id);

    ctx.fillStyle = color;
    ctx.globalAlpha = (note.velocity / 127) * 0.6 + 0.4;
    ctx.fillRect(x + 1, y + 1, nw - 2, ROW_HEIGHT - 2);
    ctx.globalAlpha = 1;

    if (isSelected) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, nw - 2, ROW_HEIGHT - 2);
    }
  }
}

function drawPlayhead() {
  const canvas = playheadCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, gridWidth.value, canvasHeight);
  if (!props.playing) return;

  const px = beatToX(liveBeat.value);
  ctx.strokeStyle = '#ff6b35';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, canvasHeight);
  ctx.stroke();
}

function render() {
  drawKeys();
  drawGrid();
}

// Structural redraws only — note/track/snap/zoom/selection edits, not the fast-moving playhead.
watch(
  () => [props.tracks, props.activeTrackId, props.loopEndBeat, snap.value, beatWidth.value, selectedNoteIds.value],
  () => nextTick(() => {
    render();
    drawPlayhead();
  }),
  { deep: true }
);

// The playhead redraws every animation frame on its own lightweight overlay
// canvas, so it never triggers the expensive grid/notes redraw above.
watch(liveBeat, drawPlayhead);
watch(() => props.playing, drawPlayhead);

// Release the previewed key on mouseup/blur anywhere, not just inside the
// keys canvas, so a stray note never gets stuck on if the pointer drifts off.
window.addEventListener('mouseup', stopPreview);
window.addEventListener('blur', stopPreview);

onMounted(() => {
  render();
  drawPlayhead();
  if (scrollRef.value) {
    scrollRef.value.scrollTop = pitchToY(60) - 100;
  }
});

onUnmounted(() => {
  stopPreview();
  window.removeEventListener('mouseup', stopPreview);
  window.removeEventListener('blur', stopPreview);
});
</script>

<style scoped>
.piano-roll {
  min-height: 300px;
}
</style>
