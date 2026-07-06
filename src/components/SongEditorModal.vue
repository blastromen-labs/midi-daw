<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      @mousedown.self="emit('cancel')"
    >
      <div
        class="w-full max-w-sm bg-panel border border-line rounded-lg shadow-xl overflow-hidden"
        role="dialog"
        :aria-labelledby="titleId"
        @mousedown.stop
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-line">
          <h2 :id="titleId" class="text-sm font-semibold">Edit song</h2>
          <button
            type="button"
            class="w-7 h-7 rounded flex items-center justify-center text-muted hover:text-white hover:bg-surface-hover"
            title="Close"
            @click="emit('cancel')"
          >
            ×
          </button>
        </div>

        <div class="px-4 py-3 space-y-4">
          <section>
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Name</label>
            <input
              v-model="draft.name"
              type="text"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded outline-none focus:border-accent"
              @keydown.enter="submit"
            />
          </section>

          <section>
            <span class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Color</span>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="c in accentColors"
                :key="c"
                type="button"
                class="w-4 h-4 rounded-sm ring-1 transition-shadow"
                :class="draft.color === c ? 'ring-white' : 'ring-transparent hover:ring-line-light'"
                :style="{ background: c }"
                :title="c"
                @click="draft.color = c"
              />
            </div>
          </section>
        </div>

        <div class="flex items-center justify-end gap-2 px-4 py-3 border-t border-line">
          <button
            type="button"
            class="px-3 py-1.5 rounded text-xs text-muted hover:text-white hover:bg-surface-hover"
            @click="emit('cancel')"
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-3 py-1.5 rounded text-xs bg-accent hover:bg-accent-dim text-white font-semibold"
            @click="submit"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { reactive, watch } from 'vue';
import { TRACK_ACCENT_COLORS } from '../models/project.js';

const props = defineProps({
  initial: { type: Object, default: () => ({}) },
});

const emit = defineEmits(['save', 'cancel']);

const titleId = 'song-editor-title';
const accentColors = TRACK_ACCENT_COLORS;

const draft = reactive({
  name: props.initial.name ?? '',
  color: props.initial.color ?? TRACK_ACCENT_COLORS[0],
});

watch(
  () => props.initial,
  (initial) => {
    draft.name = initial.name ?? '';
    draft.color = initial.color ?? TRACK_ACCENT_COLORS[0];
  },
  { deep: true }
);

function submit() {
  const name = draft.name.trim();
  if (!name) return;
  emit('save', { name, color: draft.color });
}
</script>
