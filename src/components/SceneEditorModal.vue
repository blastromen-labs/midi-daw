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

        <div class="px-4 py-3 space-y-4 max-h-[70vh] overflow-y-auto">
          <section>
            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Name</label>
            <input
              v-model="draft.name"
              type="text"
              class="w-full text-xs py-1.5 px-2 bg-surface border border-line-light rounded outline-none focus:border-accent"
              @keydown.enter.prevent
            />
          </section>

          <section>
            <div class="flex items-center justify-between gap-2 mb-1.5">
              <label class="text-[10px] uppercase tracking-wider text-muted-dim">Patterns</label>
              <span class="text-[10px] text-muted-dim tabular-nums">{{ draft.patternIds.length }}</span>
            </div>

            <div
              v-if="memberEntries.length"
              class="rounded border border-line-light bg-surface/40 divide-y divide-line/60 mb-2"
            >
              <div
                v-for="entry in memberEntries"
                :key="entry.patternId"
                class="flex items-center gap-2 px-2 py-1.5"
              >
                <span
                  class="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-line/50"
                  :style="{ background: entry.patternColor }"
                ></span>
                <div class="flex-1 min-w-0">
                  <div class="text-xs truncate">{{ entry.patternName }}</div>
                  <div class="text-[10px] text-muted-dim truncate">{{ entry.trackName }}</div>
                </div>
                <span
                  class="text-[9px] text-muted-dim uppercase flex-shrink-0"
                  :title="entry.launchModeLabel"
                >{{ entry.launchModeShort }}</span>
                <button
                  type="button"
                  class="w-6 h-6 flex-shrink-0 rounded text-muted hover:text-red-300 hover:bg-surface-hover text-sm leading-none"
                  title="Remove from scene"
                  @click="removePattern(entry.patternId)"
                >
                  ×
                </button>
              </div>
            </div>
            <p v-else class="text-[10px] text-muted-dim mb-2 leading-snug">
              No patterns in this scene yet. Add patterns below — launching the scene will play them together.
            </p>

            <label class="text-[10px] uppercase tracking-wider text-muted-dim block mb-1.5">Add pattern</label>
            <div class="flex items-center gap-1.5">
              <select
                v-model="addPatternId"
                class="flex-1 min-w-0 text-xs py-1.5 px-2 bg-surface border border-line-light rounded outline-none focus:border-accent"
                :disabled="!availableEntries.length"
              >
                <option value="">
                  {{ availableEntries.length ? 'Select pattern…' : 'No patterns left to add' }}
                </option>
                <optgroup
                  v-for="group in availableByTrack"
                  :key="group.trackId"
                  :label="group.trackName"
                >
                  <option
                    v-for="entry in group.patterns"
                    :key="entry.patternId"
                    :value="entry.patternId"
                  >
                    {{ entry.patternName }}{{ entry.otherSceneName ? ` (in ${entry.otherSceneName})` : '' }}
                  </option>
                </optgroup>
              </select>
              <button
                type="button"
                class="px-2.5 py-1.5 rounded text-xs font-semibold bg-surface-hover text-white hover:bg-surface-active disabled:opacity-30 disabled:pointer-events-none flex-shrink-0"
                :disabled="!addPatternId"
                @click="addSelectedPattern"
              >
                Add
              </button>
            </div>
            <p class="text-[10px] text-muted mt-1.5 leading-snug">
              A pattern can only be in one scene. Adding one that already belongs elsewhere moves it here.
            </p>
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
                Delete scene
              </button>
            </template>
            <template v-else>
              <span class="text-xs text-muted truncate">Delete "{{ draft.name.trim() || 'this scene' }}"?</span>
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
              {{ mode === 'create' ? 'Create scene' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, reactive, watch, onMounted, onUnmounted } from 'vue';
import { LIVE_LAUNCH_MODES, patternLaunchMode } from '../models/project.js';

const props = defineProps({
  mode: { type: String, required: true }, // 'create' | 'edit'
  initial: {
    type: Object,
    required: true,
  },
  canDelete: { type: Boolean, default: true },
  tracks: { type: Array, default: () => [] },
  scenes: { type: Array, default: () => [] },
});

const emit = defineEmits(['save', 'cancel', 'delete']);

const confirmDelete = ref(false);
const addPatternId = ref('');
const titleId = `scene-editor-${Math.random().toString(36).slice(2, 9)}`;

const draft = reactive({
  name: '',
  patternIds: [],
});

const heading = computed(() => (props.mode === 'create' ? 'New scene' : 'Edit scene'));

const patternIndex = computed(() => {
  const map = new Map();
  for (const track of props.tracks ?? []) {
    for (const pattern of track.patterns ?? []) {
      map.set(pattern.id, { track, pattern });
    }
  }
  return map;
});

function launchModeShort(pattern) {
  const mode = patternLaunchMode(pattern);
  if (mode === LIVE_LAUNCH_MODES.HOLD) return 'Hold';
  if (mode === LIVE_LAUNCH_MODES.ONE_SHOT) return '1-Shot';
  return 'Loop';
}

function launchModeLabel(pattern) {
  const mode = patternLaunchMode(pattern);
  if (mode === LIVE_LAUNCH_MODES.HOLD) return 'Hold';
  if (mode === LIVE_LAUNCH_MODES.ONE_SHOT) return 'One Shot';
  return 'Loop';
}

function entryFor(patternId) {
  const hit = patternIndex.value.get(patternId);
  if (!hit) return null;
  const { track, pattern } = hit;
  return {
    patternId: pattern.id,
    patternName: pattern.name,
    patternColor: pattern.color,
    trackId: track.id,
    trackName: track.name,
    launchModeShort: launchModeShort(pattern),
    launchModeLabel: launchModeLabel(pattern),
    otherSceneName: null,
  };
}

const memberEntries = computed(() =>
  draft.patternIds.map((id) => entryFor(id)).filter(Boolean)
);

const availableEntries = computed(() => {
  const inScene = new Set(draft.patternIds);
  const sceneNameById = new Map((props.scenes ?? []).map((s) => [s.id, s.name]));
  const editingSceneId = props.initial?.sceneId ?? null;
  const entries = [];
  for (const track of props.tracks ?? []) {
    for (const pattern of track.patterns ?? []) {
      if (inScene.has(pattern.id)) continue;
      const otherSceneId =
        pattern.sceneId && pattern.sceneId !== editingSceneId ? pattern.sceneId : null;
      entries.push({
        patternId: pattern.id,
        patternName: pattern.name,
        trackId: track.id,
        trackName: track.name,
        otherSceneName: otherSceneId ? sceneNameById.get(otherSceneId) ?? 'another scene' : null,
      });
    }
  }
  return entries;
});

const availableByTrack = computed(() => {
  const groups = [];
  const byTrack = new Map();
  for (const entry of availableEntries.value) {
    let group = byTrack.get(entry.trackId);
    if (!group) {
      group = { trackId: entry.trackId, trackName: entry.trackName, patterns: [] };
      byTrack.set(entry.trackId, group);
      groups.push(group);
    }
    group.patterns.push(entry);
  }
  return groups;
});

function syncFromInitial() {
  confirmDelete.value = false;
  addPatternId.value = '';
  draft.name = props.initial.name ?? '';
  draft.patternIds = [...(props.initial.patternIds ?? [])];
}

watch(() => props.initial, syncFromInitial, { immediate: true, deep: true });

// Drop stale ids if tracks/patterns change while the modal is open.
watch(
  patternIndex,
  () => {
    draft.patternIds = draft.patternIds.filter((id) => patternIndex.value.has(id));
    if (addPatternId.value && !availableEntries.value.some((e) => e.patternId === addPatternId.value)) {
      addPatternId.value = '';
    }
  },
  { deep: true }
);

function addSelectedPattern() {
  const id = addPatternId.value;
  if (!id || draft.patternIds.includes(id)) return;
  draft.patternIds.push(id);
  addPatternId.value = '';
}

function removePattern(patternId) {
  draft.patternIds = draft.patternIds.filter((id) => id !== patternId);
}

function submit() {
  const name = draft.name.trim();
  if (!name) return;
  emit('save', {
    name,
    patternIds: [...draft.patternIds],
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
