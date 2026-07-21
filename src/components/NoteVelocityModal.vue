<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      @mousedown.self="emit('cancel')"
    >
      <div
        class="w-full max-w-xs bg-panel border border-line rounded-lg shadow-xl overflow-hidden"
        role="dialog"
        aria-labelledby="note-velocity-title"
        @mousedown.stop
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 id="note-velocity-title" class="text-sm font-semibold">Set velocity</h2>
          <button
            type="button"
            class="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-white hover:bg-surface-hover"
            title="Close"
            @click="emit('cancel')"
          >
            ×
          </button>
        </div>

        <form class="px-4 py-3 space-y-3" @submit.prevent="submit">
          <p v-if="noteCount > 1" class="text-[11px] text-muted leading-snug">
            Applying to {{ noteCount }} selected notes
          </p>

          <label class="text-[10px] uppercase tracking-wider text-muted-dim block">
            Velocity (0–127)
          </label>
          <input
            ref="inputRef"
            v-model="draftText"
            type="number"
            min="0"
            max="127"
            step="1"
            class="w-full text-sm py-1.5 px-2 bg-surface border border-line-light rounded outline-none focus:border-accent tabular-nums"
            @keydown.enter.prevent="submit"
          />
          <input
            :value="sliderValue"
            type="range"
            min="0"
            max="127"
            step="1"
            class="w-full"
            style="accent-color: var(--color-accent)"
            @input="onSliderInput"
          />

          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-3 py-1.5 rounded text-xs text-muted hover:text-white hover:bg-surface-hover"
              @click="emit('cancel')"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent-dim"
            >
              Apply
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';

const props = defineProps({
  initialVelocity: { type: Number, required: true },
  noteCount: { type: Number, default: 1 },
});

const emit = defineEmits(['apply', 'cancel']);

const inputRef = ref(null);
const draftText = ref(String(clampVelocity(props.initialVelocity)));

const sliderValue = computed(() => {
  const n = Number(draftText.value);
  return Number.isFinite(n) ? clampVelocity(n) : clampVelocity(props.initialVelocity);
});

watch(
  () => props.initialVelocity,
  (v) => {
    draftText.value = String(clampVelocity(v));
  }
);

function clampVelocity(v) {
  if (!Number.isFinite(v)) return 100;
  return Math.max(0, Math.min(127, Math.round(v)));
}

function onSliderInput(e) {
  draftText.value = String(clampVelocity(Number(e.target.value)));
}

function submit() {
  emit('apply', clampVelocity(Number(draftText.value)));
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('cancel');
  }
}

onMounted(async () => {
  window.addEventListener('keydown', onKeyDown);
  await nextTick();
  inputRef.value?.focus();
  inputRef.value?.select();
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown);
});
</script>
