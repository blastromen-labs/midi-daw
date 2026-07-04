<template>
  <div ref="rootRef" class="piano-roll flex flex-col bg-panel rounded-lg border border-line overflow-hidden h-full">
    <!-- Toolbar -->
    <div
      class="flex items-center gap-3 px-3 py-2 bg-surface border-b border-line flex-shrink-0"
      @mousedown="onToolbarMouseDown"
    >
      <select :value="activeTrackId" @change="onTrackSelect" class="text-sm font-semibold">
        <option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>

      <input
        :value="activeTrack?.name"
        @change="onRename"
        class="bg-transparent border-b border-line-light text-sm px-1 w-24 focus:border-accent outline-none"
      />

      <div class="h-4 w-px bg-line-light"></div>

      <MidiRouteSelect
        v-if="activeTrack && activeTrack.kind !== 'drum'"
        :output-id="activeTrack.midiOutputId"
        :channel="activeTrack.midiChannel"
        :outputs="midiOutputs"
        @output-change="(id) => updateRoute({ midiOutputId: id })"
        @channel-change="(ch) => updateRoute({ midiChannel: ch })"
      />
      <span v-else-if="activeTrack" class="text-xs text-muted-dim">Sample-based &middot; no MIDI routing</span>

      <div class="h-4 w-px bg-line-light"></div>

      <label class="text-xs text-muted">Snap</label>
      <select v-model="snap" class="text-xs">
        <option v-for="s in snapValues" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>

      <label class="text-xs text-muted ml-1" title="Length of newly drawn notes — independent of Snap">Length</label>
      <select v-model="noteLength" class="text-xs">
        <option v-for="s in snapValues" :key="s.value" :value="s.value">{{ s.label }}</option>
      </select>

      <div class="h-4 w-px bg-line-light"></div>

      <button
        class="text-xs text-muted hover:text-white tabular-nums"
        title="Cmd/Ctrl + scroll to zoom horizontally, + Shift to zoom row height — click to reset both"
        @click="resetZoom"
      >
        Zoom {{ zoomPercent }}% / {{ rowZoomPercent }}%
      </button>

      <label class="text-xs text-muted ml-2">Draw</label>
      <button
        class="px-2 py-0.5 rounded text-xs"
        :class="tool === 'draw' ? 'bg-accent text-white' : 'bg-surface-hover hover:bg-surface-active'"
        @click="tool = 'draw'"
      >
        ✏
      </button>
      <button
        class="px-2 py-0.5 rounded text-xs"
        :class="tool === 'select' ? 'bg-accent text-white' : 'bg-surface-hover hover:bg-surface-active'"
        @click="tool = 'select'"
      >
        ↖
      </button>
      <button
        class="px-2 py-0.5 rounded text-xs"
        :class="tool === 'erase' ? 'bg-accent text-white' : 'bg-surface-hover hover:bg-surface-active'"
        @click="tool = 'erase'"
      >
        ✕
      </button>

      <div class="ml-auto flex gap-1">
        <button
          class="px-2 py-0.5 rounded text-xs bg-surface-hover hover:bg-surface-active"
          title="Add a MIDI channel"
          @click="$emit('add-track', 'midi')"
        >
          + MIDI
        </button>
        <button
          class="px-2 py-0.5 rounded text-xs bg-surface-hover hover:bg-surface-active"
          title="Add a sample-based drum channel"
          @click="$emit('add-track', 'drum')"
        >
          + Drum
        </button>
      </div>
    </div>

    <!-- Canvas area -->
    <div class="flex flex-1 min-h-0 overflow-hidden" ref="containerRef">
      <!-- Piano keys (MIDI tracks) / pad list (drum tracks) -->
      <div
        class="flex-shrink-0 overflow-hidden bg-panel border-r border-line"
        :style="{ width: keysWidth + 'px' }"
        ref="keysRef"
      >
        <canvas
          v-if="activeTrack && activeTrack.kind !== 'drum'"
          ref="keysCanvas"
          :width="KEY_WIDTH"
          :height="canvasHeight"
          class="block cursor-pointer"
          @mousedown="onKeyMouseDown"
          @mousemove="onKeyMouseMove"
        ></canvas>
        <DrumPadList
          v-else-if="activeTrack"
          :pads="activeTrack.pads"
          :row-height="rowHeight"
          @load-sample="onLoadSample"
          @clear-sample="onClearSample"
          @add-pad="onAddPad"
          @remove-pad="onRemovePad"
          @rename-pad="onRenamePad"
        />
      </div>

      <!-- Grid -->
      <div class="flex-1 overflow-auto" ref="scrollRef" @scroll="onScroll" @wheel="onWheel" @mousedown="onScrollAreaMouseDown">
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

    <!-- Drag up/down to resize the velocity panel; a plain click (no drag)
         toggles it collapsed, freeing up room for the note grid above. -->
    <div
      class="flex-shrink-0 h-2 bg-line hover:bg-line-light cursor-row-resize flex items-center justify-center transition-colors"
      title="Drag to resize — click to collapse/expand"
      @mousedown="onVelocityResizeStart"
    >
      <div class="flex gap-0.5 pointer-events-none">
        <span v-for="i in 5" :key="i" class="w-0.5 h-0.5 rounded-full bg-muted-dim"></span>
      </div>
    </div>

    <!-- Velocity panel -->
    <div v-show="!velocityCollapsed" class="flex-shrink-0 flex bg-panel" :style="{ height: velocityHeight + 'px' }">
      <div
        class="flex-shrink-0 bg-panel border-r border-t border-line flex items-center justify-center select-none"
        :style="{ width: keysWidth + 'px' }"
        @mousedown="clearSelection"
      >
        <span class="text-[10px] font-semibold text-accent tracking-widest vertical-label">VEL</span>
      </div>
      <VelocityLane
        v-if="activeTrack"
        :notes="activeTrack.notes"
        :selected-note-ids="selectedNoteIds"
        :beat-width="beatWidth"
        :grid-width="gridWidth"
        :height="velocityHeight"
        :color="activeTrack.color"
        :scroll-left="mainScrollLeft"
        @update-notes="emitNotes"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { noteName, SNAP_VALUES, snapBeat, createNote, uid } from '../models/project.js';
import { usePlayheadBeat } from '../composables/usePlayheadBeat.js';
import { getActiveClock } from '../engine/activeClock.js';
import { sendNoteOn, sendNoteOff } from '../engine/midi.js';
import { loadSampleFile, clearSample, playSample, resumeSamplerAudio } from '../engine/sampler.js';
import { shade } from '../utils/color.js';
import { THEME } from '../theme.js';
import MidiRouteSelect from './MidiRouteSelect.vue';
import VelocityLane from './VelocityLane.vue';
import DrumPadList from './DrumPadList.vue';

const PREVIEW_VELOCITY = 100;
const RESIZE_HANDLE_PX = 6;
const MIN_PREVIEW_MS = 60;
const DEFAULT_VELOCITY_HEIGHT = 110;
const MIN_VELOCITY_HEIGHT = 40;
const MAX_VELOCITY_HEIGHT = 280;
const VELOCITY_COLLAPSE_THRESHOLD = 20;
const DEFAULT_NOTE_COLOR = '#a7d7af';
const NOTE_CORNER_RADIUS = THEME.note.cornerRadius;

const props = defineProps({
  tracks: { type: Array, required: true },
  activeTrackId: String,
  loopEndBeat: { type: Number, default: 4 },
  playing: Boolean,
  midiOutputs: { type: Array, default: () => [] },
});

const liveBeat = usePlayheadBeat();

const emit = defineEmits([
  'update-notes',
  'select-track',
  'route-change',
  'add-track',
  'rename-track',
  'update-pad',
  'add-pad',
  'remove-pad',
  'rename-pad',
]);

const ROW_HEIGHT = 14;
// Drum pad rows carry a name + sample controls, so they need more vertical
// room than a plain chromatic piano-roll row.
const DRUM_ROW_HEIGHT = 28;
const KEY_WIDTH = 48;
const DRUM_KEYS_WIDTH = 140;
const DEFAULT_BEAT_WIDTH = 80;
const MIN_BEAT_WIDTH = 20;
const MAX_BEAT_WIDTH = 320;
const ZOOM_STEP = 1.12;
// Vertical zoom is a multiplier on top of the base row height (14px MIDI /
// 28px drum) rather than its own pixel range, so it scales sensibly for
// either track kind without a second set of min/max pixel constants.
const MIN_ROW_ZOOM = 0.6;
const MAX_ROW_ZOOM = 3;
const LOW_PITCH = 36;
const HIGH_PITCH = 84;

const snapValues = SNAP_VALUES;
const snap = ref(0.25);
// Independent from `snap` (grid/placement resolution) so you can e.g. place
// 1/32-length notes while snapping their position to a 1/16 grid.
const noteLength = ref(0.25);
const tool = ref('draw');
const beatWidth = ref(DEFAULT_BEAT_WIDTH);
const rowZoom = ref(1);
const zoomPercent = computed(() => Math.round((beatWidth.value / DEFAULT_BEAT_WIDTH) * 100));
const rowZoomPercent = computed(() => Math.round(rowZoom.value * 100));

const rootRef = ref(null);
const containerRef = ref(null);
const scrollRef = ref(null);
const keysRef = ref(null);
const gridCanvas = ref(null);
const keysCanvas = ref(null);
const playheadCanvas = ref(null);

const mainScrollLeft = ref(0);
const velocityHeight = ref(DEFAULT_VELOCITY_HEIGHT);
const velocityCollapsed = ref(false);

const gridWidth = computed(() => props.loopEndBeat * beatWidth.value);

const activeTrack = computed(() => props.tracks.find((t) => t.id === props.activeTrackId));
const isDrumTrack = computed(() => activeTrack.value?.kind === 'drum');
const rowHeight = computed(() => (isDrumTrack.value ? DRUM_ROW_HEIGHT : ROW_HEIGHT) * rowZoom.value);
const keysWidth = computed(() => (isDrumTrack.value ? DRUM_KEYS_WIDTH : KEY_WIDTH));

// Generic "rows" abstraction: each row has an opaque `key` that Note.pitch
// stores — a MIDI pitch number for MIDI tracks, a pad id for drum tracks
// (see the comment on createDrumPad in models/project.js). Everything below
// that positions/moves notes vertically works purely in terms of row index,
// so it doesn't need to know or care which kind of key it's dealing with.
const rows = computed(() => {
  if (isDrumTrack.value) {
    return (activeTrack.value?.pads ?? []).map((pad) => ({ key: pad.id }));
  }
  const list = [];
  for (let p = HIGH_PITCH; p >= LOW_PITCH; p--) list.push({ key: p });
  return list;
});

const keyToIndex = computed(() => {
  const map = new Map();
  rows.value.forEach((row, i) => map.set(row.key, i));
  return map;
});

const canvasHeight = computed(() => rows.value.length * rowHeight.value);

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

// `CanvasRenderingContext2D.roundRect` is widely supported in the Chrome/Edge
// versions this app targets for Web MIDI, but we fall back to a manual arc
// path just in case. Traces the path only — caller does fill()/stroke().
function traceRoundedRect(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Both operate on row *keys* (see the `rows` comment above), not literal
// pitches — the names are kept because for MIDI tracks a key IS a pitch, and
// most call sites only ever deal with MIDI tracks.
function pitchToY(key) {
  return (keyToIndex.value.get(key) ?? 0) * rowHeight.value;
}

function yToPitch(y) {
  const idx = Math.max(0, Math.min(rows.value.length - 1, Math.floor(y / rowHeight.value)));
  return rows.value[idx]?.key;
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
  // Compared by row index rather than the pitch/key value directly — a drum
  // pad id isn't numerically orderable the way a MIDI pitch is.
  const indexMin = Math.floor(yMin / rowHeight.value);
  const indexMax = Math.floor(yMax / rowHeight.value);

  const selected = getNotes().filter((n) => {
    const overlapsX = n.startBeat + n.duration > beatMin && n.startBeat < beatMax;
    const rowIndex = keyToIndex.value.get(n.pitch) ?? -1;
    const overlapsY = rowIndex >= indexMin && rowIndex <= indexMax;
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
    clearSelection();
    return;
  }

  if (tool.value === 'draw') {
    const note = createNote(pitch, cellBeat, noteLength.value, 100);
    emitNotes([...getNotes(), note]);
    // Newly drawn notes start unselected — a fresh click shouldn't leave the
    // selection outline sitting on the note you just placed.
    clearSelection();
    previewNotePulse(note.pitch, note.velocity, note.duration);
    // Hold and drag to paint more notes into new cells in one stroke.
    drag.value = { type: 'paintAdd', lastCell: `${cellBeat}:${pitch}` };
  }
}

// Briefly sounds a note when it's drawn, so you can hear it without having to
// press play. For drum tracks that's a one-shot sample trigger (`pitch` is a
// pad id there); for MIDI tracks it's the existing Note On/Off pulse, with
// output/channel captured up front so a later routing change can't cause the
// note-off to go to the wrong place.
function previewNotePulse(pitch, velocity, durationBeats) {
  const track = activeTrack.value;
  if (!track) return;

  if (track.kind === 'drum') {
    resumeSamplerAudio();
    playSample(pitch, velocity);
    return;
  }

  if (!track.midiOutputId) return;
  const { midiOutputId, midiChannel } = track;

  sendNoteOn(midiOutputId, midiChannel, pitch, velocity);
  const ms = Math.max(MIN_PREVIEW_MS, getActiveClock().beatToSec(durationBeats) * 1000);
  setTimeout(() => sendNoteOff(midiOutputId, midiChannel, pitch), ms);
}

// Pad-management: PianoRoll owns the sampler engine calls (decode/cache),
// same as it already owns MIDI preview calls directly, and just bubbles the
// resulting project-state change up — App.vue stays the only place that
// mutates project.tracks, matching route-change/rename-track above.
async function onLoadSample(padId, file) {
  try {
    await loadSampleFile(padId, file);
    emit('update-pad', props.activeTrackId, padId, { fileName: file.name });
  } catch (err) {
    console.error('Failed to load sample:', err);
  }
}

function onClearSample(padId) {
  clearSample(padId);
  emit('update-pad', props.activeTrackId, padId, { fileName: '' });
}

function onAddPad() {
  emit('add-pad', props.activeTrackId);
}

function onRemovePad(padId) {
  clearSample(padId);
  emit('remove-pad', props.activeTrackId, padId);
}

function onRenamePad(padId, name) {
  emit('rename-pad', props.activeTrackId, padId, name);
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
    const deltaBeat = newAnchorBeat - drag.value.anchorOrigBeat;

    // Moved by row *index* delta rather than adding to the row key directly —
    // a drum pad id isn't a number you can add an offset to, and this also
    // reads more clearly for the MIDI case (drag N rows, not "+N pitch").
    const anchorOrigIndex = keyToIndex.value.get(drag.value.anchorOrigPitch) ?? 0;
    const newAnchorIndex = Math.max(
      0,
      Math.min(rows.value.length - 1, Math.floor((pitchToY(drag.value.anchorOrigPitch) + dy) / rowHeight.value))
    );
    const deltaIndex = newAnchorIndex - anchorOrigIndex;

    emitNotes(
      getNotes().map((n) => {
        const orig = drag.value.origPositions.get(n.id);
        if (!orig) return n;
        const origIndex = keyToIndex.value.get(orig.pitch) ?? 0;
        const newIndex = Math.max(0, Math.min(rows.value.length - 1, origIndex + deltaIndex));
        return {
          ...n,
          startBeat: Math.max(0, orig.beat + deltaBeat),
          pitch: rows.value[newIndex]?.key ?? orig.pitch,
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
  mainScrollLeft.value = scrollRef.value?.scrollLeft ?? 0;
}

function toggleVelocityCollapse() {
  velocityCollapsed.value = !velocityCollapsed.value;
}

// Drag the handle above the velocity panel up/down to resize it; dragging
// down past a small threshold collapses it out of the way entirely, freeing
// up room for the note grid above. A plain click (no meaningful drag) is
// treated as a shorthand for toggling collapse, now that there's no
// dedicated header label to click instead.
const CLICK_DRAG_THRESHOLD_PX = 3;

function onVelocityResizeStart(e) {
  e.preventDefault();
  const startY = e.clientY;
  const startHeight = velocityCollapsed.value ? 0 : velocityHeight.value;
  const prevUserSelect = document.body.style.userSelect;
  document.body.style.userSelect = 'none';
  let dragged = false;

  function onMove(ev) {
    if (Math.abs(ev.clientY - startY) > CLICK_DRAG_THRESHOLD_PX) dragged = true;
    const proposedHeight = startHeight + (startY - ev.clientY);
    if (proposedHeight <= VELOCITY_COLLAPSE_THRESHOLD) {
      velocityCollapsed.value = true;
    } else {
      velocityCollapsed.value = false;
      velocityHeight.value = Math.max(MIN_VELOCITY_HEIGHT, Math.min(MAX_VELOCITY_HEIGHT, proposedHeight));
    }
  }

  function onUp() {
    document.body.style.userSelect = prevUserSelect;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    if (!dragged) toggleVelocityCollapse();
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function clearSelection() {
  selectedNoteIds.value = new Set();
}

// The grid canvas is only as wide/tall as the loop length, but its scrollable
// container can be larger — leaving empty background beyond the canvas that
// the canvas's own mousedown handler never sees. Clicking there should still
// deselect, same as clicking anywhere else outside the actual note grid.
function onScrollAreaMouseDown(e) {
  if (e.target === scrollRef.value) clearSelection();
}

// Clicking a bar's own background (the gaps around its controls, not the
// controls themselves) also deselects — clicking a select/input/button still
// does whatever it normally does, since the target there is that control,
// not the bar div. Shared by the toolbar and the velocity panel's header.
function onToolbarMouseDown(e) {
  if (e.target === e.currentTarget) clearSelection();
}

// Cmd/Ctrl + wheel zooms the horizontal (time) axis, keeping the beat under
// the cursor fixed in place — matches FL Studio's piano roll zoom behavior.
// Adding Shift zooms vertically instead (taller/shorter rows), keeping
// whichever row is under the cursor fixed in place the same way.
function onWheel(e) {
  if (!e.metaKey && !e.ctrlKey) return;
  e.preventDefault();

  const container = scrollRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

  if (e.shiftKey) {
    const cursorY = e.clientY - rect.top;
    const rowUnderCursor = (container.scrollTop + cursorY) / rowHeight.value;

    // Inverted relative to `factor` above: scrolling up should make rows
    // taller and scrolling down shorter.
    const verticalFactor = 1 / factor;
    const newZoom = Math.min(MAX_ROW_ZOOM, Math.max(MIN_ROW_ZOOM, rowZoom.value * verticalFactor));
    if (newZoom === rowZoom.value) return;
    rowZoom.value = newZoom;

    nextTick(() => {
      container.scrollTop = rowUnderCursor * rowHeight.value - cursorY;
    });
    return;
  }

  const cursorX = e.clientX - rect.left;
  const beatUnderCursor = (container.scrollLeft + cursorX) / beatWidth.value;

  const newWidth = Math.min(MAX_BEAT_WIDTH, Math.max(MIN_BEAT_WIDTH, beatWidth.value * factor));
  if (newWidth === beatWidth.value) return;

  beatWidth.value = newWidth;

  nextTick(() => {
    container.scrollLeft = beatUnderCursor * newWidth - cursorX;
  });
}

function resetZoom() {
  beatWidth.value = DEFAULT_BEAT_WIDTH;
  rowZoom.value = 1;
}

// True piano coloring: white keys light, black keys dark, like a real
// keyboard, each with a subtle glossy gradient for a nicer keyboard look.
// Only used for MIDI tracks — drum tracks render <DrumPadList> instead.
function drawKeys() {
  const canvas = keysCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { keys } = THEME;
  const rh = rowHeight.value;
  ctx.clearRect(0, 0, KEY_WIDTH, canvasHeight.value);

  for (let p = HIGH_PITCH; p >= LOW_PITCH; p--) {
    const y = pitchToY(p);
    const isPressed = p === previewingPitch.value;
    const isBlack = [1, 3, 6, 8, 10].includes(p % 12);
    const isOctave = p % 12 === 0;

    if (isPressed) {
      ctx.fillStyle = keys.pressed;
    } else if (isBlack) {
      // Horizontal bevel highlight, like a glossy black key catching light.
      const grad = ctx.createLinearGradient(0, 0, KEY_WIDTH, 0);
      grad.addColorStop(0, keys.blackStart);
      grad.addColorStop(1, keys.blackEnd);
      ctx.fillStyle = grad;
    } else {
      // Vertical gradient gives white keys a rounded, glossy edge; the C-row
      // gets a slightly darker tint so octave boundaries read at a glance.
      const grad = ctx.createLinearGradient(0, y, 0, y + rh);
      const top = isOctave ? shade(keys.whiteOctave, 0.08) : keys.whiteTop;
      const bottom = isOctave ? keys.whiteOctave : keys.whiteBottom;
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
    }
    ctx.fillRect(0, y, KEY_WIDTH, rh);
    ctx.strokeStyle = isBlack ? keys.borderBlack : keys.borderWhite;
    ctx.strokeRect(0, y, KEY_WIDTH, rh);

    if (isOctave) {
      ctx.fillStyle = isPressed ? keys.labelOnPressed : isBlack ? keys.labelOnBlack : keys.labelOnWhite;
      ctx.font = '9px JetBrains Mono';
      ctx.fillText(noteName(p), 2, y + rh - 3);
    }
  }
}

// Returns the label drawn inside a note: a MIDI note name for MIDI tracks,
// the assigned pad's name for drum tracks (falling back to blank if the pad
// was since removed).
function noteLabel(note) {
  if (!isDrumTrack.value) return noteName(note.pitch);
  return activeTrack.value?.pads?.find((p) => p.id === note.pitch)?.name ?? '';
}

function drawGrid() {
  const canvas = gridCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = gridWidth.value;
  const h = canvasHeight.value;
  const rh = rowHeight.value;
  const { grid } = THEME;
  ctx.clearRect(0, 0, w, h);

  // Background rows
  rows.value.forEach((row, i) => {
    const y = i * rh;
    const isBlack = !isDrumTrack.value && [1, 3, 6, 8, 10].includes(row.key % 12);
    ctx.fillStyle = isBlack ? grid.rowDark : grid.rowLight;
    ctx.fillRect(0, y, w, rh);
  });

  // Grid lines
  const snapW = snap.value * beatWidth.value;
  for (let x = 0; x <= w; x += snapW) {
    const isBeat = Math.abs(x / beatWidth.value - Math.round(x / beatWidth.value)) < 0.001;
    ctx.strokeStyle = isBeat ? grid.lineBeat : grid.lineSub;
    ctx.lineWidth = isBeat ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Notes — rounded, with a soft top-lit gradient and a darker border, both
  // derived from the track's own color so multi-track color-coding survives
  // alongside the greenish, glossy note look.
  const notes = getNotes();
  const color = activeTrack.value?.color ?? DEFAULT_NOTE_COLOR;
  const topColor = shade(color, 0.3);
  const bottomColor = shade(color, -0.08);
  const borderColor = shade(color, -0.32);
  for (const note of notes) {
    const x = beatToX(note.startBeat);
    const y = pitchToY(note.pitch);
    const nw = note.duration * beatWidth.value;
    const isSelected = selectedNoteIds.value.has(note.id);
    const noteRect = [x + 1, y + 1, nw - 2, rh - 2];

    const grad = ctx.createLinearGradient(0, noteRect[1], 0, noteRect[1] + noteRect[3]);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.globalAlpha = (note.velocity / 127) * 0.6 + 0.4;
    traceRoundedRect(ctx, ...noteRect, NOTE_CORNER_RADIUS);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = isSelected ? THEME.note.selectedOutline : borderColor;
    ctx.lineWidth = isSelected ? 1.5 : 1;
    traceRoundedRect(ctx, ...noteRect, NOTE_CORNER_RADIUS);
    ctx.stroke();

    if (nw > 18) {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
      ctx.font = '9px JetBrains Mono';
      ctx.textBaseline = 'middle';
      ctx.fillText(noteLabel(note), x + 3, y + rh / 2 + 1, nw - 6);
    }
  }
}

function drawPlayhead() {
  const canvas = playheadCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, gridWidth.value, canvasHeight.value);
  if (!props.playing) return;

  const px = beatToX(liveBeat.value);
  // Kept a distinct warm color (not part of the greenish note palette) so the
  // playhead never blends visually into the notes it's scrubbing across.
  ctx.strokeStyle = '#ffb454';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, canvasHeight.value);
  ctx.stroke();
}

function render() {
  if (!isDrumTrack.value) drawKeys();
  drawGrid();
}

// Structural redraws only — note/track/snap/zoom/selection edits, not the fast-moving playhead.
watch(
  () => [
    props.tracks,
    props.activeTrackId,
    props.loopEndBeat,
    snap.value,
    beatWidth.value,
    rowZoom.value,
    selectedNoteIds.value,
  ],
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

// Cmd/Ctrl+A selects every note in the active track instead of the browser's
// page-wide "select all text". Only genuinely text-editable fields (not
// <select> dropdowns or buttons, which have no text-selection semantics of
// their own but can still hold keyboard focus) are excluded, so normal text
// selection still works in e.g. the track rename input.
function onKeyDown(e) {
  const target = e.target;
  const isTextField =
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable ||
    (target?.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range'].includes(target.type));
  if (isTextField) return;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selectedNoteIds.value = new Set(getNotes().map((n) => n.id));
  }
}
window.addEventListener('keydown', onKeyDown);

// Clicking anywhere outside the piano roll (another panel, the transport bar,
// blank page background) clears the current note selection. Clicks inside —
// including the toolbar, so changing Snap/Length doesn't deselect — are left
// to the piano roll's own handlers.
function onDocumentMouseDown(e) {
  if (selectedNoteIds.value.size === 0) return;
  if (rootRef.value && !rootRef.value.contains(e.target)) {
    clearSelection();
  }
}
window.addEventListener('mousedown', onDocumentMouseDown);

onMounted(() => {
  render();
  drawPlayhead();
  // Drum tracks have few, short rows — no need to center-scroll those; MIDI
  // tracks default to scrolling roughly around middle C.
  if (scrollRef.value && !isDrumTrack.value) {
    scrollRef.value.scrollTop = pitchToY(60) - 100;
  }
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('mousedown', onDocumentMouseDown);
  stopPreview();
  window.removeEventListener('mouseup', stopPreview);
  window.removeEventListener('blur', stopPreview);
});
</script>

<style scoped>
.piano-roll {
  min-height: 300px;
}

.vertical-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}
</style>
