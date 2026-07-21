<template>
  <div class="flex-1 overflow-hidden" ref="scrollWrapRef">
    <canvas
      ref="canvas"
      :width="gridWidth"
      :height="height"
      class="block cursor-ns-resize touch-none"
      @mousedown="onMouseDown"
      @touchstart="onTouchStart"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue';
import { clampNotePitchOffset, NOTE_PITCH_OFFSET_MAX } from '../models/project.js';
import { shade } from '../utils/color.js';
import { beatToX as gridBeatToX } from '../utils/grid.js';
import { THEME } from '../theme.js';

// Vertical padding at top/bottom of the lane so handles aren't clipped.
const LANE_PADDING = 5;
const HANDLE_RADIUS = 4;
const HIT_RADIUS_PX = 7;

const props = defineProps({
  notes: { type: Array, required: true },
  selectedNoteIds: { type: Set, required: true },
  beatWidth: { type: Number, required: true },
  gridWidth: { type: Number, required: true },
  height: { type: Number, required: true },
  color: { type: String, default: '#a7d7af' },
  colorForNote: { type: Function, default: null },
  colorKey: { type: String, default: '' },
  scrollLeft: { type: Number, default: 0 },
  /** Parent scroll container owns horizontal position (e.g. drum velocity under the grid). */
  embedded: { type: Boolean, default: false },
  /** `velocity` (default) or `pitch` — pitch uses lane center as 0 semitones offset. */
  mode: { type: String, default: 'velocity' },
});

const emit = defineEmits(['update-notes']);

const canvas = ref(null);
const scrollWrapRef = ref(null);
const drag = ref(null);

const LANE_X_OFFSET = 3;
const isPitchMode = computed(() => props.mode === 'pitch');

function noteBeatToX(beat) {
  return gridBeatToX(beat, props.beatWidth, LANE_X_OFFSET);
}

function usableHeight() {
  return Math.max(1, props.height - LANE_PADDING * 2);
}

function laneCenterY() {
  return LANE_PADDING + usableHeight() / 2;
}

function noteValue(note) {
  return isPitchMode.value ? (note.pitchOffset ?? 0) : note.velocity;
}

function valueToY(value) {
  if (isPitchMode.value) {
    const halfUsable = usableHeight() / 2;
    return laneCenterY() - (value / NOTE_PITCH_OFFSET_MAX) * halfUsable;
  }
  return props.height - LANE_PADDING - (value / 127) * usableHeight();
}

function yToValue(y) {
  if (isPitchMode.value) {
    const halfUsable = usableHeight() / 2;
    const raw = -((y - laneCenterY()) / halfUsable) * NOTE_PITCH_OFFSET_MAX;
    return clampNotePitchOffset(raw);
  }
  const v = ((props.height - LANE_PADDING - y) / usableHeight()) * 127;
  return Math.max(1, Math.min(127, Math.round(v)));
}

function setNoteValue(note, value) {
  if (isPitchMode.value) {
    return { ...note, pitchOffset: clampNotePitchOffset(value) };
  }
  return { ...note, velocity: Math.max(1, Math.min(127, Math.round(value))) };
}

function findNoteNear(x) {
  let best = null;
  let bestDist = Infinity;
  for (const note of props.notes) {
    const dist = Math.abs(x - noteBeatToX(note.startBeat));
    if (dist <= HIT_RADIUS_PX && dist < bestDist) {
      best = note;
      bestDist = dist;
    }
  }
  return best;
}

function pointerToLocal(clientX, clientY) {
  const rect = canvas.value.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    // Clamp Y so dragging past the lane edges still maps to min/max velocity.
    y: Math.max(0, Math.min(props.height, clientY - rect.top)),
  };
}

function applyValueAtY(y) {
  if (!drag.value || drag.value.type !== 'group') return;
  const newAnchorValue = yToValue(y);
  const delta = newAnchorValue - drag.value.anchorOrigValue;

  emit(
    'update-notes',
    props.notes.map((n) => {
      const orig = drag.value.origValues.get(n.id);
      if (orig === undefined) return n;
      return setNoteValue(n, isPitchMode.value ? clampNotePitchOffset(orig + delta) : orig + delta);
    })
  );
}

function valueOnSegment(x0, y0, x1, y1, noteX) {
  const t = x1 === x0 ? 1 : (noteX - x0) / (x1 - x0);
  return yToValue(y0 + (y1 - y0) * t);
}

function paintSegment(x0, y0, x1, y1) {
  const xMin = Math.min(x0, x1) - HIT_RADIUS_PX;
  const xMax = Math.max(x0, x1) + HIT_RADIUS_PX;

  emit(
    'update-notes',
    props.notes.map((n) => {
      const nx = noteBeatToX(n.startBeat);
      if (nx < xMin || nx > xMax) return n;
      return setNoteValue(n, valueOnSegment(x0, y0, x1, y1, nx));
    })
  );
}

function startDragAt(clientX, clientY) {
  const { x, y } = pointerToLocal(clientX, clientY);
  const note = findNoteNear(x);

  // Hitting a handle locks to Y-only edits for that note (or the multi-selection).
  // Paint mode is only for freehand strokes that start in empty space — otherwise a
  // mostly-vertical drag with slight X jitter hitching nearby notes feels "stuck".
  if (note) {
    const group =
      props.selectedNoteIds.has(note.id) && props.selectedNoteIds.size > 1
        ? props.notes.filter((n) => props.selectedNoteIds.has(n.id))
        : [note];
    drag.value = {
      type: 'group',
      anchorOrigValue: noteValue(note),
      origValues: new Map(group.map((n) => [n.id, noteValue(n)])),
    };
    applyValueAtY(y);
    return;
  }

  drag.value = { type: 'paint', lastX: x, lastY: y };
  paintSegment(x, y, x, y);
}

function moveDragTo(clientX, clientY) {
  if (!drag.value) return;
  const { x, y } = pointerToLocal(clientX, clientY);

  if (drag.value.type === 'group') {
    applyValueAtY(y);
    return;
  }

  paintSegment(drag.value.lastX, drag.value.lastY, x, y);
  drag.value.lastX = x;
  drag.value.lastY = y;
}

function onMouseDown(e) {
  if (e.button !== 0) return;
  startDragAt(e.clientX, e.clientY);
}

function onWindowMouseMove(e) {
  if (!drag.value) return;
  moveDragTo(e.clientX, e.clientY);
}

function onMouseUp() {
  drag.value = null;
}

function touchPoint(e) {
  const t = e.touches[0] ?? e.changedTouches[0];
  return t ? { clientX: t.clientX, clientY: t.clientY } : null;
}

function onTouchStart(e) {
  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  startDragAt(point.clientX, point.clientY);
}

function onWindowTouchMove(e) {
  if (!drag.value) return;
  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  moveDragTo(point.clientX, point.clientY);
}

function render() {
  const c = canvas.value;
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = props.gridWidth;
  const h = props.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = THEME.velocity.background;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = THEME.velocity.guide;
  ctx.lineWidth = 1;

  if (isPitchMode.value) {
    const centerY = laneCenterY();
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      const y = LANE_PADDING + frac * usableHeight();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = THEME.velocity.guide;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();
  } else {
    for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
      const y = LANE_PADDING + frac * usableHeight();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
  }

  for (const note of props.notes) {
    const x = noteBeatToX(note.startBeat);
    const value = noteValue(note);
    const handleY = valueToY(value);
    const isSelected = props.selectedNoteIds.has(note.id);
    const baseColor = props.colorForNote?.(note) ?? props.color;
    const lineColor = isSelected ? '#ffffff' : shade(baseColor, -0.35);
    const dotColor = isSelected ? '#ffffff' : shade(baseColor, 0.6);

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (isPitchMode.value) {
      ctx.moveTo(x, laneCenterY());
      ctx.lineTo(x, handleY);
    } else {
      ctx.moveTo(x, h - LANE_PADDING);
      ctx.lineTo(x, handleY);
    }
    ctx.stroke();

    ctx.fillStyle = dotColor;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, handleY, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

watch(
  () => [
    props.notes,
    props.selectedNoteIds,
    props.height,
    props.gridWidth,
    props.beatWidth,
    props.colorKey,
    props.mode,
  ],
  () => nextTick(render),
  { deep: true }
);

watch(
  () => props.scrollLeft,
  (left) => {
    if (props.embedded || !scrollWrapRef.value) return;
    scrollWrapRef.value.scrollLeft = left;
  }
);

onMounted(render);

// Track moves on window so vertical drags past the short lane edges keep updating
// (canvas-only mousemove + mouseleave previously froze / ended the gesture).
window.addEventListener('mousemove', onWindowMouseMove);
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
window.addEventListener('touchend', onMouseUp);
window.addEventListener('touchcancel', onMouseUp);
onUnmounted(() => {
  window.removeEventListener('mousemove', onWindowMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('touchmove', onWindowTouchMove);
  window.removeEventListener('touchend', onMouseUp);
  window.removeEventListener('touchcancel', onMouseUp);
});
</script>
