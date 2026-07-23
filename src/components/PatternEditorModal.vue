<template>
  <Teleport to="body">
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      @mousedown.self="emit('cancel')"
    >
      <div
        class="w-full max-w-md bg-panel border border-line rounded-lg shadow-xl overflow-hidden"
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
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Scenes</label>
            <div
              v-if="scenes.length"
              class="rounded border border-line-light bg-surface/40 divide-y divide-line/60 mb-3 max-h-36 overflow-y-auto"
              title="Optional — assign this pattern to one or more scenes so Live mode can launch it with others"
            >
              <label
                v-for="scene in scenes"
                :key="scene.id"
                class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none hover:bg-surface-hover/60"
              >
                <input
                  type="checkbox"
                  :checked="draft.sceneIds.includes(scene.id)"
                  @change="toggleScene(scene.id, $event.target.checked)"
                />
                <span class="text-xs truncate">{{ scene.name }}</span>
              </label>
            </div>
            <p v-else class="text-[10px] text-muted-dim mb-3 leading-snug">
              No scenes yet — create one from Live ▸ Scenes.
            </p>
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
            <label class="flex items-start gap-2 cursor-pointer select-none mb-3">
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
            <label class="flex items-start gap-2 cursor-pointer select-none mb-3">
              <input
                v-model="draft.hiddenFromLive"
                type="checkbox"
                class="mt-0.5"
              />
              <span>
                <span class="block text-[10px] uppercase tracking-wider text-muted-dim">Hide from Live view</span>
                <span class="block text-[10px] text-muted mt-0.5 leading-snug">
                  Hides this clip in Live. It still plays via scenes or linked patterns — useful for lights.
                </span>
              </span>
            </label>
            <label class="flex items-start gap-2 cursor-pointer select-none mb-3">
              <input
                type="checkbox"
                class="mt-0.5"
                :checked="showLinkedPatterns"
                @change="setShowLinkedPatterns($event.target.checked)"
              />
              <span>
                <span class="block text-[10px] uppercase tracking-wider text-muted-dim">Linked patterns</span>
                <span class="block text-[10px] text-muted mt-0.5 leading-snug">
                  Enable or stop this pattern in Live also controls the linked patterns (and vice versa).
                </span>
              </span>
            </label>
            <template v-if="showLinkedPatterns">
              <div
                v-if="linkableGroups.length"
                class="rounded border border-line-light bg-surface/40 divide-y divide-line/60 max-h-44 overflow-y-auto"
              >
                <div v-for="group in linkableGroups" :key="group.trackId">
                  <div class="px-2 py-1 text-[10px] text-muted-dim truncate bg-surface/50">
                    {{ group.trackName }}
                  </div>
                  <label
                    v-for="item in group.patterns"
                    :key="item.id"
                    class="flex items-center gap-2 px-2 py-1.5 cursor-pointer select-none hover:bg-surface-hover/60"
                  >
                    <input
                      type="checkbox"
                      :checked="draft.linkedPatternIds.includes(item.id)"
                      @change="toggleLinked(item.id, $event.target.checked)"
                    />
                    <span
                      class="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-line/50"
                      :style="{ background: item.color }"
                    />
                    <span class="text-xs truncate">{{ item.name }}</span>
                  </label>
                </div>
              </div>
              <p v-else class="text-[10px] text-muted-dim leading-snug">
                No other-track patterns to link — add a pattern on another track first.
              </p>
            </template>
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
  /** Project scenes for optional multi-scene assignment. */
  scenes: { type: Array, default: () => [] },
  /** All tracks — used to pick cross-track linked patterns. */
  tracks: { type: Array, default: () => [] },
  /** Owning track id (exclude same-track patterns from the link list). */
  trackId: { type: String, default: null },
  /** Pattern being edited (null when creating) — excluded from the link list. */
  patternId: { type: String, default: null },
});

const emit = defineEmits(['save', 'cancel', 'delete']);

const accentColors = TRACK_ACCENT_COLORS;
const barLengthOptions = BAR_LENGTH_OPTIONS;
const liveSyncGridOptions = LIVE_SYNC_GRID_OPTIONS;
const confirmDelete = ref(false);
/** UI-only: hide the cross-track link checklist until needed (default off). */
const showLinkedPatterns = ref(false);
const titleId = `pattern-editor-${Math.random().toString(36).slice(2, 9)}`;

const draft = reactive({
  name: '',
  color: accentColors[0],
  patternSteps: barLengthOptions[0].steps,
  liveLaunchMode: 'toggle',
  liveSyncGrid: '1/16',
  cutOthers: true,
  hiddenFromLive: false,
  sceneIds: [],
  linkedPatternIds: [],
});

const heading = computed(() => (props.mode === 'create' ? 'New pattern' : 'Edit pattern'));

/** Other-track patterns grouped for the link checklist. */
const linkableGroups = computed(() => {
  const groups = [];
  for (const track of props.tracks ?? []) {
    if (!track || track.id === props.trackId) continue;
    const patterns = (track.patterns ?? [])
      .filter((p) => p?.id && p.id !== props.patternId)
      .map((p) => ({ id: p.id, name: p.name, color: p.color }));
    if (!patterns.length) continue;
    groups.push({
      trackId: track.id,
      trackName: track.name || 'Track',
      patterns,
    });
  }
  return groups;
});

function initialSceneIds(initial) {
  if (Array.isArray(initial?.sceneIds)) return [...initial.sceneIds];
  if (initial?.sceneId) return [initial.sceneId];
  return [];
}

function initialLinkedIds(initial) {
  return Array.isArray(initial?.linkedPatternIds) ? [...initial.linkedPatternIds] : [];
}

function syncFromInitial() {
  draft.name = props.initial.name ?? '';
  draft.color = props.initial.color ?? accentColors[0];
  draft.patternSteps = props.initial.patternSteps ?? barLengthOptions[0].steps;
  draft.liveLaunchMode = props.initial.liveLaunchMode ?? 'toggle';
  draft.liveSyncGrid = props.initial.liveSyncGrid ?? '1/16';
  draft.cutOthers = props.initial.cutOthers !== false;
  draft.hiddenFromLive = !!props.initial.hiddenFromLive;
  draft.sceneIds = initialSceneIds(props.initial);
  draft.linkedPatternIds = initialLinkedIds(props.initial);
  // Open expanded only when this pattern already has links to edit.
  showLinkedPatterns.value = draft.linkedPatternIds.length > 0;
}

watch(() => props.initial, syncFromInitial, { immediate: true, deep: true });

function toggleScene(sceneId, checked) {
  if (!sceneId) return;
  if (checked) {
    if (!draft.sceneIds.includes(sceneId)) draft.sceneIds.push(sceneId);
  } else {
    draft.sceneIds = draft.sceneIds.filter((id) => id !== sceneId);
  }
}

function setShowLinkedPatterns(on) {
  showLinkedPatterns.value = !!on;
  // Collapsing the picker means "not linking" — drop draft selections so Save
  // doesn't keep invisible links after the user turned the feature off.
  if (!showLinkedPatterns.value) draft.linkedPatternIds = [];
}

function toggleLinked(patternId, checked) {
  if (!patternId) return;
  if (checked) {
    if (!draft.linkedPatternIds.includes(patternId)) draft.linkedPatternIds.push(patternId);
  } else {
    draft.linkedPatternIds = draft.linkedPatternIds.filter((id) => id !== patternId);
  }
}

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
    hiddenFromLive: !!draft.hiddenFromLive,
    sceneIds: [...draft.sceneIds],
    linkedPatternIds: [...draft.linkedPatternIds],
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
