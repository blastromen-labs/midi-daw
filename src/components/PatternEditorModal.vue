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
          <h2 :id="titleId" class="text-sm font-semibold">{{ heading }}</h2>
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
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Bar length</label>
            <select
              v-model.number="draft.patternSteps"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded"
            >
              <option v-for="opt in barLengthOptions" :key="opt.steps" :value="opt.steps">
                {{ opt.bars }} bar{{ opt.bars === 1 ? '' : 's' }}
              </option>
            </select>
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

          <section class="border-t border-line pt-4">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-dim mb-2">Live</h3>
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Launch mode</label>
            <select
              v-model="draft.liveLaunchMode"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded mb-3"
            >
              <option value="toggle">Loop</option>
              <option value="hold">Hold</option>
              <option value="oneShot">One Shot</option>
            </select>
            <template v-if="draft.liveLaunchMode === 'hold' || draft.liveLaunchMode === 'oneShot'">
              <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Sync grid</label>
              <select
                v-model="draft.liveSyncGrid"
                class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded mb-3"
                :title="
                  draft.liveLaunchMode === 'hold'
                    ? 'Grid the pattern unmute aligns to when you press'
                    : 'Grid the one-shot launch aligns to when you click'
                "
              >
                <option v-for="opt in liveSyncGridOptions" :key="opt.value" :value="opt.value">
                  {{ opt.label }}
                </option>
              </select>
            </template>
            <label class="flex items-start gap-2 cursor-pointer select-none">
              <input
                v-model="draft.cutOthers"
                type="checkbox"
                class="mt-0.5"
              />
              <span>
                <span class="block text-[10px] uppercase tracking-wider text-muted-dim">Cut other clips</span>
                <span class="block text-[10px] text-muted mt-0.5 leading-snug">
                  When off, this clip layers over other patterns on the same track (handy for One Shots).
                </span>
              </span>
            </label>
          </section>
        </div>

        <div class="flex items-center gap-2 px-4 py-3 border-t border-line bg-surface/40">
          <div v-if="mode === 'edit' && canDelete" class="flex items-center gap-2 min-w-0 flex-1">
            <template v-if="!confirmDelete">
              <button
                type="button"
                class="px-3 py-1.5 rounded text-xs text-red-400 hover:text-red-300 hover:bg-surface-hover flex-shrink-0"
                @click="confirmDelete = true"
              >
                Delete pattern
              </button>
            </template>
            <template v-else>
              <span class="text-xs text-muted truncate">Delete "{{ draft.name.trim() || 'this pattern' }}"?</span>
              <button
                type="button"
                class="px-2 py-1.5 rounded text-xs text-muted hover:text-white hover:bg-surface-hover flex-shrink-0"
                @click="confirmDelete = false"
              >
                Cancel
              </button>
              <button
                type="button"
                class="px-2 py-1.5 rounded text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-surface-hover flex-shrink-0"
                @click="emit('delete')"
              >
                Delete
              </button>
            </template>
          </div>

          <div class="flex items-center justify-end gap-2 ml-auto flex-shrink-0">
            <button
              type="button"
              class="px-3 py-1.5 rounded text-xs text-muted hover:text-white hover:bg-surface-hover"
              @click="emit('cancel')"
            >
              Cancel
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent-dim"
              :disabled="!draft.name.trim()"
              @click="submit"
            >
              {{ mode === 'create' ? 'Create pattern' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue';
import { TRACK_ACCENT_COLORS, BAR_LENGTH_OPTIONS, LIVE_SYNC_GRID_OPTIONS } from '../models/project.js';

const props = defineProps({
  mode: { type: String, required: true }, // 'create' | 'edit'
  initial: {
    type: Object,
    required: true,
  },
  canDelete: { type: Boolean, default: true },
});

const emit = defineEmits(['save', 'cancel', 'delete']);

const accentColors = TRACK_ACCENT_COLORS;
const barLengthOptions = BAR_LENGTH_OPTIONS;
const liveSyncGridOptions = LIVE_SYNC_GRID_OPTIONS;
const confirmDelete = ref(false);
const titleId = `pattern-editor-${Math.random().toString(36).slice(2, 9)}`;

const draft = reactive({
  name: '',
  color: accentColors[0],
  patternSteps: barLengthOptions[0].steps,
  liveLaunchMode: 'toggle',
  liveSyncGrid: '1/16',
  cutOthers: true,
});

const heading = computed(() => (props.mode === 'create' ? 'New pattern' : 'Edit pattern'));

function syncFromInitial() {
  draft.name = props.initial.name ?? '';
  draft.color = props.initial.color ?? accentColors[0];
  draft.patternSteps = props.initial.patternSteps ?? barLengthOptions[0].steps;
  draft.liveLaunchMode = props.initial.liveLaunchMode ?? 'toggle';
  draft.liveSyncGrid = props.initial.liveSyncGrid ?? '1/16';
  draft.cutOthers = props.initial.cutOthers !== false;
}

watch(() => props.initial, syncFromInitial, { immediate: true, deep: true });

function submit() {
  const name = draft.name.trim();
  if (!name) return;
  emit('save', {
    name,
    color: draft.color,
    patternSteps: draft.patternSteps,
    liveLaunchMode: draft.liveLaunchMode,
    liveSyncGrid: draft.liveSyncGrid,
    cutOthers: draft.cutOthers,
  });
}

function onKeyDown(e) {
  if (e.key !== 'Escape') return;
  if (confirmDelete.value) {
    confirmDelete.value = false;
    return;
  }
  emit('cancel');
}

onMounted(() => window.addEventListener('keydown', onKeyDown));

onUnmounted(() => window.removeEventListener('keydown', onKeyDown));
</script>
