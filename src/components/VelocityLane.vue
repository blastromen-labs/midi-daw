<template>
  <div class="flex-1 overflow-hidden" ref="scrollWrapRef">
    <canvas
      ref="canvas"
      :width="gridWidth"
      :height="height"
      class="block cursor-ns-resize"
      @mousedown="onMouseDown"
      @mousemove="onMouseMove"
      @mouseup="onMouseUp"
      @mouseleave="onMouseUp"
    ></canvas>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue';

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
  color: { type: String, default: '#8fd694' },
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

function onMouseDown(e) {
  const rect = canvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const note = findNoteNear(x);
  if (!note) return;

  // Dragging a note that's part of a multi-selection adjusts the whole group
  // together, same convention as moving/resizing notes in the grid above.
  const group =
    props.selectedNoteIds.has(note.id) && props.selectedNoteIds.size > 1
      ? props.notes.filter((n) => props.selectedNoteIds.has(n.id))
      : [note];

  drag.value = {
    anchorOrigVelocity: note.velocity,
    origVelocities: new Map(group.map((n) => [n.id, n.velocity])),
  };
  applyVelocityAtY(y);
}

function onMouseMove(e) {
  if (!drag.value) return;
  const rect = canvas.value.getBoundingClientRect();
  applyVelocityAtY(e.clientY - rect.top);
}

function onMouseUp() {
  drag.value = null;
}

function render() {
  const c = canvas.value;
  if (!c) return;
  const ctx = c.getContext('2d');
  const w = props.gridWidth;
  const h = props.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#12161c';
  ctx.fillRect(0, 0, w, h);

  // Light guide lines at 0/25/50/75/100% velocity.
  ctx.strokeStyle = '#232a33';
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
    const strokeColor = isSelected ? '#ffffff' : props.color;

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, bottomY);
    ctx.lineTo(x, topY);
    ctx.stroke();

    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.arc(x, topY, HANDLE_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

watch(
  () => [props.notes, props.selectedNoteIds, props.height, props.gridWidth, props.beatWidth],
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

// A drag started here can outlive the mouse leaving the canvas — release it
// on a stray mouseup anywhere, matching the pattern used elsewhere in the
// piano roll so a drag can never get stuck active.
window.addEventListener('mouseup', onMouseUp);
onUnmounted(() => {
  window.removeEventListener('mouseup', onMouseUp);
});
</script>
