<template>
  <div
    class="volume-slider-wrap"
    :class="wide ? 'volume-slider-wrap--wide' : drum ? 'volume-slider-wrap--drum' : 'volume-slider-wrap--compact'"
  >
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      :value="display"
      class="volume-slider"
      :title="title ?? `Volume ${display}%`"
      @input="onInput"
      @pointerdown="onPointerDown"
      @mousedown.stop
      @touchstart.stop
    />
  </div>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Number, default: 1 },
  title: String,
  wide: Boolean,
  drum: Boolean,
});

const emit = defineEmits(['update:modelValue']);

const display = computed(() => Math.round((props.modelValue ?? 1) * 100));

function onInput(e) {
  emit('update:modelValue', Number(e.target.value) / 100);
}

function valueFromClientX(clientX, input) {
  const rect = input.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(ratio * 100);
}

function applyClientX(clientX, input) {
  const value = valueFromClientX(clientX, input);
  if (Number(input.value) === value) return;
  input.value = value;
  emit('update:modelValue', value / 100);
}

// Track drags on the window so a finger can move vertically off the thin
// track without losing the gesture — native range alone is too finicky on tablet.
function onPointerDown(e) {
  e.stopPropagation();
  if (e.button > 0) return;

  const input = e.currentTarget;
  applyClientX(e.clientX, input);

  function onMove(ev) {
    if (ev.pointerId !== e.pointerId) return;
    ev.preventDefault();
    applyClientX(ev.clientX, input);
  }
  function onUp(ev) {
    if (ev.pointerId !== e.pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
}
</script>

<style scoped>
.volume-slider-wrap {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  touch-action: none;
}

.volume-slider-wrap--compact {
  width: 3.5rem;
  min-height: 28px;
  padding: 0 3px;
}

.volume-slider-wrap--drum {
  width: 5.75rem;
  min-height: 28px;
  padding: 0 4px;
}

.volume-slider-wrap--wide {
  width: 100%;
  min-width: 0;
  min-height: 28px;
  padding: 0 4px;
}

.volume-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  margin: 0;
  background: #2a3a44;
  border-radius: 3px;
  outline: none;
  cursor: pointer;
  touch-action: none;
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  background: #6fae78;
  border-radius: 50%;
  cursor: pointer;
}

.volume-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  background: #6fae78;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

@media (pointer: coarse) {
  .volume-slider-wrap {
    min-height: 34px;
  }

  .volume-slider-wrap--compact {
    width: 4rem;
  }

  .volume-slider-wrap--drum {
    width: 6.5rem;
  }

  .volume-slider {
    height: 8px;
  }

  .volume-slider::-webkit-slider-thumb {
    width: 22px;
    height: 22px;
  }

  .volume-slider::-moz-range-thumb {
    width: 22px;
    height: 22px;
  }
}
</style>
