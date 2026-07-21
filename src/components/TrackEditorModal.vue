<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      @mousedown.self="cancelEdit"
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
            @click="cancelEdit"
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
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Category</label>
            <select
              v-model="draft.category"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded"
            >
              <option v-for="cat in trackCategories" :key="cat" :value="cat">{{ cat }}</option>
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

          <section v-if="kind === 'midi'" class="border-t border-line pt-4">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-dim mb-2">MIDI routing</h3>
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Output</label>
            <select
              v-model="draft.midiOutputId"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded mb-3"
            >
              <option value="">— Not connected —</option>
              <option v-for="d in midiOutputs" :key="d.id" :value="d.id">{{ d.name }}</option>
            </select>
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Channel</label>
            <select
              v-model.number="draft.midiChannel"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded"
            >
              <option v-for="ch in 16" :key="ch - 1" :value="ch - 1">Channel {{ ch }}</option>
            </select>
          </section>

          <section v-else class="border-t border-line pt-4">
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">
              Volume — {{ Math.round(draft.volume * 100) }}%
            </label>
            <VolumeSlider wide class="w-full" v-model="draft.volume" title="Drum track volume" />
          </section>

          <section class="border-t border-line pt-4">
            <h3 class="text-[10px] uppercase tracking-wider text-muted-dim mb-2">Live</h3>
            <label class="flex items-start gap-2 cursor-pointer select-none">
              <input
                v-model="draft.hiddenFromLive"
                type="checkbox"
                class="mt-0.5"
              />
              <span>
                <span class="block text-[10px] uppercase tracking-wider text-muted-dim">Hide from Live view</span>
                <span class="block text-[10px] text-muted mt-0.5 leading-snug">
                  Hides this entire track row in Live. Patterns still play via scenes — useful for background / lights tracks.
                </span>
              </span>
            </label>
          </section>
        </div>

        <div class="flex items-center gap-2 px-4 py-3 border-t border-line bg-surface/40">
          <div v-if="mode === 'edit'" class="flex items-center gap-2 min-w-0 flex-1">
            <template v-if="!confirmDelete">
              <button
                type="button"
                class="px-3 py-1.5 rounded text-xs text-red-400 hover:text-red-300 hover:bg-surface-hover flex-shrink-0"
                @click="confirmDelete = true"
              >
                Delete track
              </button>
            </template>
            <template v-else>
              <span class="text-xs text-muted truncate">Delete "{{ draft.name.trim() || 'this track' }}"?</span>
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
              @click="cancelEdit"
            >
              Cancel
            </button>
            <button
              type="button"
              class="px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent-dim"
              :disabled="!draft.name.trim()"
              @click="submit"
            >
              {{ mode === 'create' ? 'Create track' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive, watch, nextTick, onMounted, onUnmounted } from 'vue';
import { TRACK_ACCENT_COLORS, TRACK_CATEGORIES } from '../models/project.js';
import VolumeSlider from './VolumeSlider.vue';

const props = defineProps({
  mode: { type: String, required: true }, // 'create' | 'edit'
  kind: { type: String, required: true }, // 'midi' | 'drum'
  initial: {
    type: Object,
    required: true,
  },
  midiOutputs: { type: Array, default: () => [] },
});

const emit = defineEmits(['save', 'cancel', 'delete', 'live-update', 'revert']);

const accentColors = TRACK_ACCENT_COLORS;
const trackCategories = TRACK_CATEGORIES;
const confirmDelete = ref(false);
const editorReady = ref(false);
const initialSnapshot = ref(null);
const titleId = `track-editor-${Math.random().toString(36).slice(2, 9)}`;

const draft = reactive({
  name: '',
  color: accentColors[0],
  category: trackCategories[0],
  midiOutputId: '',
  midiChannel: 0,
  volume: 1,
  hiddenFromLive: false,
});

const heading = computed(() => {
  if (props.mode === 'create') {
    return props.kind === 'drum' ? 'New drum track' : 'New MIDI track';
  }
  return props.kind === 'drum' ? 'Edit drum track' : 'Edit MIDI track';
});

function syncFromInitial() {
  editorReady.value = false;
  draft.name = props.initial.name ?? '';
  draft.color = props.initial.color ?? accentColors[0];
  draft.category = props.initial.category ?? trackCategories[0];
  draft.midiOutputId = props.initial.midiOutputId ?? '';
  draft.midiChannel = props.initial.midiChannel ?? 0;
  draft.volume = props.initial.volume ?? 1;
  draft.hiddenFromLive = !!props.initial.hiddenFromLive;
  initialSnapshot.value = { volume: draft.volume };
  nextTick(() => {
    editorReady.value = true;
  });
}

watch(() => props.initial, syncFromInitial, { immediate: true, deep: true });

// Push drum track volume to the project immediately so pattern playback hears it.
watch(
  () => draft.volume,
  (volume) => {
    if (!editorReady.value || props.kind !== 'drum') return;
    emit('live-update', { volume });
  },
);

function submit() {
  const name = draft.name.trim();
  if (!name) return;
  emit('save', {
    name,
    color: draft.color,
    category: draft.category,
    midiOutputId: draft.midiOutputId,
    midiChannel: draft.midiChannel,
    volume: draft.volume,
    hiddenFromLive: !!draft.hiddenFromLive,
  });
}

function cancelEdit() {
  if (props.kind === 'drum' && initialSnapshot.value) {
    emit('revert', { ...initialSnapshot.value });
  }
  emit('cancel');
}

function onKeyDown(e) {
  if (e.key !== 'Escape') return;
  if (confirmDelete.value) {
    confirmDelete.value = false;
    return;
  }
  cancelEdit();
}

onMounted(() => window.addEventListener('keydown', onKeyDown));

onUnmounted(() => window.removeEventListener('keydown', onKeyDown));
</script>
