<template>
  <div class="flex-1 overflow-hidden" ref="scrollWrapRef">
    <canvas
      ref="canvas"
      :width="gridWidth"
      :height="height"
      class="block cursor-ns-resize touch-none"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
      @touchstart="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onMouseUp"
      @touchcancel="onMouseUp"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { shade } from '../utils/color.js';
import { THEME } from '../theme.js';

// Vertical padding at top/bottom of the lane so a velocity-127 handle isn't
// clipped by the canvas edge and a velocity-1 bar is still visible off the floor.
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
});

const emit = defineEmits(['update-notes']);

const canvas = ref(null);
const scrollWrapRef = ref(null);
const drag = ref(null);

function beatToX(beat) {
  return beat * props.beatWidth + 3;
}

function usableHeight() {
  return Math.max(1, props.height - LANE_PADDING * 2);
}

function velocityToY(velocity) {
  return props.height - LANE_PADDING - (velocity / 127) * usableHeight();
}

function yToVelocity(y) {
  const v = ((props.height - LANE_PADDING - y) / usableHeight()) * 127;
  return Math.max(1, Math.min(127, Math.round(v)));
}

function findNoteNear(x) {
  let best = null;
  let bestDist = Infinity;
  for (const note of props.notes) {
    const dist = Math.abs(x - beatToX(note.startBeat));
    if (dist <= HIT_RADIUS_PX && dist < bestDist) {
      best = note;
      bestDist = dist;
    }
  }
  return best;
}

function applyVelocityAtY(y) {
  if (!drag.value) return;
  const newAnchorVelocity = yToVelocity(y);
  const delta = newAnchorVelocity - drag.value.anchorOrigVelocity;

  emit(
    'update-notes',
    props.notes.map((n) => {
      const orig = drag.value.origVelocities.get(n.id);
      if (orig === undefined) return n;
      return { ...n, velocity: Math.max(1, Math.min(127, orig + delta)) };
    })
  );
}

// The velocity at `noteX` along the straight line from (x0, y0) to (x1, y1) —
// lets a single mousemove segment paint a smooth ramp across every note it
// crosses, not just the note nearest the cursor.
function velocityOnSegment(x0, y0, x1, y1, noteX) {
  const t = x1 === x0 ? 1 : (noteX - x0) / (x1 - x0);
  return yToVelocity(y0 + (y1 - y0) * t);
}

// Paints every note whose handle falls within the segment just swept by the
// cursor (plus a little hit-radius slack), setting its velocity directly to
// the pen's height at that point — like drawing a shape across the lane.
// Notes outside the segment are left untouched so earlier parts of the same
// stroke aren't re-painted by a later, unrelated segment.
function paintSegment(x0, y0, x1, y1) {
  const xMin = Math.min(x0, x1) - HIT_RADIUS_PX;
  const xMax = Math.max(x0, x1) + HIT_RADIUS_PX;

  emit(
    'update-notes',
    props.notes.map((n) => {
      const nx = beatToX(n.startBeat);
      if (nx < xMin || nx > xMax) return n;
      return { ...n, velocity: velocityOnSegment(x0, y0, x1, y1, nx) };
    })
  );
}

function onMouseDown(e) {
  const rect = canvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const note = findNoteNear(x);

  // Grabbing a note that's already part of a multi-selection nudges the
  // whole group together (preserving each note's relative velocity), same
  // convention as moving/resizing notes in the grid above.
  if (note && props.selectedNoteIds.has(note.id) && props.selectedNoteIds.size > 1) {
    const group = props.notes.filter((n) => props.selectedNoteIds.has(n.id));
    drag.value = {
      type: 'group',
      anchorOrigVelocity: note.velocity,
      origVelocities: new Map(group.map((n) => [n.id, n.velocity])),
    };
    applyVelocityAtY(y);
    return;
  }

  // Otherwise, click-and-drag anywhere in the lane paints velocities directly
  // — like drawing with a pencil — so a single stroke can sweep across and
  // reshape many notes at once, not just the one under the cursor.
  drag.value = { type: 'paint', lastX: x, lastY: y };
  paintSegment(x, y, x, y);
}

function onMouseMove(e) {
  if (!drag.value) return;
  const rect = canvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (drag.value.type === 'group') {
    applyVelocityAtY(y);
    return;
  }

  paintSegment(drag.value.lastX, drag.value.lastY, x, y);
  drag.value.lastX = x;
  drag.value.lastY = y;
}

function onMouseUp() {
  drag.value = null;
}

// Touch support: a paint/nudge drag here always consumes the gesture (this
// lane doesn't scroll on its own — its horizontal position is driven by the
// `scrollLeft` prop from the piano roll above), so unlike the main grid,
// touchmove can unconditionally preventDefault without any panning trade-off.
function touchPoint(e) {
  const t = e.touches[0] ?? e.changedTouches[0];
  return t ? { clientX: t.clientX, clientY: t.clientY } : null;
}

function onTouchStart(e) {
  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  onMouseDown({ clientX: point.clientX, clientY: point.clientY });
}

function onTouchMove(e) {
  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  onMouseMove({ clientX: point.clientX, clientY: point.clientY });
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

  // Light guide lines at 0/25/50/75/100% velocity.
  ctx.strokeStyle = THEME.velocity.guide;
  ctx.lineWidth = 1;
  for (const frac of [0, 0.25, 0.5, 0.75, 1]) {
    const y = LANE_PADDING + frac * usableHeight();
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  for (const note of props.notes) {
    const x = beatToX(note.startBeat);
    const topY = velocityToY(note.velocity);
    const bottomY = h - LANE_PADDING;
    const isSelected = props.selectedNoteIds.has(note.id);
    const baseColor = props.colorForNote?.(note) ?? props.color;
    // Derived from the note's own color, same as the step block in the grid above.
    const lineColor = isSelected ? '#ffffff' : shade(baseColor, -0.35);
    const dotColor = isSelected ? '#ffffff' : shade(baseColor, 0.6);

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, bottomY);
    ctx.lineTo(x, topY);
    ctx.stroke();

    ctx.fillStyle = dotColor;
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, topY, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

watch(
  () => [props.notes, props.selectedNoteIds, props.height, props.gridWidth, props.beatWidth, props.colorKey],
  () => nextTick(render),
  { deep: true }
);

watch(
  () => props.scrollLeft,
  (left) => {
    if (scrollWrapRef.value) scrollWrapRef.value.scrollLeft = left;
  }
);

onMounted(render);

// A drag started here can outlive the mouse/touch leaving the canvas —
// release it on a stray mouseup/touchend anywhere, matching the pattern used
// elsewhere in the piano roll so a drag can never get stuck active.
window.addEventListener('mouseup', onMouseUp);
window.addEventListener('touchend', onMouseUp);
onUnmounted(() => {
  window.removeEventListener('mouseup', onMouseUp);
  window.removeEventListener('touchend', onMouseUp);
});
</script>
