<template>
  <div class="sample-waveform-editor select-none">
    <canvas
      ref="canvasRef"
      class="waveform-canvas w-full rounded border border-line-light cursor-crosshair touch-none"
      :height="height"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerUp"
    ></canvas>
    <div class="flex items-center justify-between mt-1.5 text-[10px] text-muted-dim">
      <span>Length {{ Math.round(sampleLength * 100) }}%</span>
      <span>Fade {{ Math.round(fadeOut * 100) }}%</span>
      <span>{{ playTimeLabel }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, computed } from 'vue';

const props = defineProps({
  peaks: { type: Array, default: () => [] },
  duration: { type: Number, default: 0 },
  sampleLength: { type: Number, default: 1 },
  fadeOut: { type: Number, default: 0 },
  pitch: { type: Number, default: 0 },
  color: { type: String, default: '#6699ff' },
  height: { type: Number, default: 88 },
});

const emit = defineEmits(['update:sampleLength', 'update:fadeOut']);

const canvasRef = ref(null);
const drag = ref(null);
let resizeObserver = null;

const playTimeLabel = computed(() => {
  if (!props.duration) return '—';
  const rate = Math.pow(2, (props.pitch ?? 0) / 12);
  const sec = (props.duration * props.sampleLength) / rate;
  return sec >= 1 ? `${sec.toFixed(2)}s` : `${Math.round(sec * 1000)}ms`;
});

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function canvasWidth() {
  return canvasRef.value?.clientWidth ?? 0;
}

function xToLength(x) {
  const w = canvasWidth();
  if (w <= 0) return props.sampleLength;
  return clamp01(x / w);
}

function draw() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  const w = canvas.clientWidth;
  if (w <= 0) return;
  const h = props.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#1a2228';
  ctx.fillRect(0, 0, w, h);

  const mid = h / 2;
  const lengthX = props.sampleLength * w;
  const fadeStartX = lengthX * (1 - props.fadeOut);
  const peaks = props.peaks;
  const peakCount = peaks.length;

  if (peakCount > 0) {
    const barW = w / peakCount;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < peakCount; i++) {
      const x = i * barW;
      if (x > lengthX) break;
      const amp = peaks[i] * (h * 0.42);
      ctx.fillRect(x, mid - amp, Math.max(1, barW - 0.5), amp * 2);
    }

    ctx.fillStyle = props.color + '99';
    for (let i = 0; i < peakCount; i++) {
      const x = i * barW;
      if (x > lengthX) break;
      const amp = peaks[i] * (h * 0.42);
      ctx.fillRect(x, mid - amp, Math.max(1, barW - 0.5), amp * 2);
    }
  }

  if (props.fadeOut > 0.001) {
    const grad = ctx.createLinearGradient(fadeStartX, 0, lengthX, 0);
    grad.addColorStop(0, 'rgba(102, 153, 255, 0.08)');
    grad.addColorStop(1, 'rgba(102, 153, 255, 0.35)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(fadeStartX, h);
    ctx.lineTo(lengthX, 0);
    ctx.lineTo(lengthX, h);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, mid);
  ctx.lineTo(w, mid);
  ctx.stroke();

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lengthX, 0);
  ctx.lineTo(lengthX, h);
  ctx.stroke();

  if (props.fadeOut > 0.001) {
    ctx.strokeStyle = '#7ec8e3';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fadeStartX, h - 6);
    ctx.lineTo(lengthX, 6);
    ctx.stroke();

    ctx.fillStyle = '#7ec8e3';
    ctx.beginPath();
    ctx.arc(fadeStartX, h - 6, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(lengthX, mid, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1a2228';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function hitTarget(x, y) {
  const w = canvasWidth();
  const h = props.height;
  const lengthX = props.sampleLength * w;
  const fadeStartX = lengthX * (1 - props.fadeOut);

  if (Math.hypot(x - lengthX, y - h / 2) <= 10) return 'length';
  if (props.fadeOut > 0.001 && Math.hypot(x - fadeStartX, y - (h - 6)) <= 10) return 'fade';
  if (x >= fadeStartX - 8 && x <= lengthX + 8) return 'fade';
  return 'length';
}

function onPointerDown(e) {
  const rect = canvasRef.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  drag.value = { mode: hitTarget(x, y), pointerId: e.pointerId };
  canvasRef.value.setPointerCapture(e.pointerId);
  updateFromPointer(x, drag.value.mode);
  e.preventDefault();
}

function onPointerMove(e) {
  if (!drag.value || drag.value.pointerId !== e.pointerId) return;
  const rect = canvasRef.value.getBoundingClientRect();
  updateFromPointer(e.clientX - rect.left, drag.value.mode);
}

function onPointerUp(e) {
  if (!drag.value || drag.value.pointerId !== e.pointerId) return;
  drag.value = null;
  try {
    canvasRef.value?.releasePointerCapture(e.pointerId);
  } catch {
    // ignore
  }
}

function updateFromPointer(x, mode) {
  const w = canvasWidth();
  if (w <= 0) return;

  if (mode === 'length') {
    const next = clamp01(x / w);
    emit('update:sampleLength', Math.max(0.01, next));
    return;
  }

  const lengthX = props.sampleLength * w;
  const nextFade = lengthX > 1 ? clamp01(1 - x / lengthX) : 0;
  emit('update:fadeOut', nextFade);
}

watch(
  () => [props.peaks, props.duration, props.sampleLength, props.fadeOut, props.color, props.pitch],
  () => draw(),
  { deep: true }
);

onMounted(() => {
  draw();
  resizeObserver = new ResizeObserver(() => draw());
  if (canvasRef.value) resizeObserver.observe(canvasRef.value);
});

onUnmounted(() => {
  resizeObserver?.disconnect();
});
</script>

<style scoped>
.waveform-canvas {
  display: block;
  background: #1a2228;
}
</style>
