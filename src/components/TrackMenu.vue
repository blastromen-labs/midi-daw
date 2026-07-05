<template>
  <div class="track-menu flex-shrink-0 flex flex-col items-center gap-px" ref="rootRef">
    <button
      ref="triggerRef"
      class="flex items-center gap-1.5 pl-1.5 pr-1.5 py-0.5 rounded text-sm font-semibold bg-surface-hover hover:bg-surface-active flex-shrink-0 w-[7.5rem]"
      @click="toggleOpen"
    >
      <span class="w-2 h-2 rounded-sm flex-shrink-0" :style="{ background: activeTrack?.color }"></span>
      <span class="truncate flex-1 min-w-0 text-left">{{ activeTrack?.name ?? 'No tracks' }}</span>
      <span class="text-[9px] text-muted-dim flex-shrink-0">▾</span>
    </button>
    <span class="text-[7px] leading-none text-muted-dim uppercase tracking-wider select-none">Track</span>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelRef"
        class="fixed z-50 w-56 bg-panel border border-line rounded-md shadow-lg overflow-hidden"
        :style="panelStyle"
      >
        <div class="max-h-64 overflow-y-auto py-1">
          <div
            v-for="t in tracks"
            :key="t.id"
            class="group hover:bg-surface-hover cursor-pointer"
            :class="t.id === activeTrackId ? 'bg-surface-hover' : ''"
            @click="selectTrack(t)"
          >
            <div class="flex items-center gap-1.5 px-2 py-1">
              <button
                type="button"
                class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-line hover:ring-line-light transition-shadow"
                :style="{ background: t.color }"
                title="Change track color"
                @click.stop="toggleColorPicker(t.id)"
              />

              <span class="flex-1 min-w-0 truncate text-xs">{{ t.name }}</span>

              <span class="text-[9px] text-muted-dim uppercase flex-shrink-0">{{ t.category }}</span>

              <button
                class="opacity-0 group-hover:opacity-100 text-[10px] text-muted-dim hover:text-white flex-shrink-0"
                title="Edit track"
                @click.stop="startEdit(t)"
              >
                ✎
              </button>

              <button
                v-if="confirmDeleteId !== t.id"
                class="opacity-0 group-hover:opacity-100 text-[10px] text-muted-dim hover:text-red-400 flex-shrink-0"
                title="Delete track"
                @click.stop="requestDelete(t)"
              >
                🗑
              </button>
            </div>

            <div
              v-if="confirmDeleteId === t.id"
              class="flex items-center gap-2 px-2 pb-1.5"
              @click.stop
            >
              <span class="text-[10px] text-muted flex-1 truncate">Delete "{{ t.name }}"?</span>
              <button
                type="button"
                class="text-[10px] text-muted hover:text-white flex-shrink-0"
                @click="confirmDeleteId = null"
              >
                Cancel
              </button>
              <button
                type="button"
                class="text-[10px] text-red-400 hover:text-red-300 font-semibold flex-shrink-0"
                @click="confirmDelete(t.id)"
              >
                Delete
              </button>
            </div>

            <div
              v-if="colorPickerId === t.id"
              class="flex flex-wrap gap-1 px-2 pb-1.5"
              @click.stop
            >
              <button
                v-for="c in accentColors"
                :key="c"
                type="button"
                class="w-3 h-3 rounded-sm ring-1 transition-shadow"
                :class="t.color === c ? 'ring-white' : 'ring-transparent hover:ring-line-light'"
                :style="{ background: c }"
                :title="c"
                @click="pickColor(t.id, c)"
              />
            </div>
          </div>

          <div v-if="tracks.length === 0" class="px-2 py-2 text-xs text-muted-dim">No tracks yet</div>
        </div>

        <div class="border-t border-line flex">
          <button
            class="flex-1 text-xs py-1.5 hover:bg-surface-hover text-muted hover:text-white"
            title="Add a MIDI channel"
            @click="startCreate('midi')"
          >
            + MIDI
          </button>
          <button
            class="flex-1 text-xs py-1.5 hover:bg-surface-hover text-muted hover:text-white border-l border-line"
            title="Add a sample-based drum channel"
            @click="startCreate('drum')"
          >
            + Drum
          </button>
        </div>
      </div>
    </Teleport>

    <TrackEditorModal
      v-if="editorOpen"
      :mode="editorMode"
      :kind="editorKind"
      :initial="editorInitial"
      :midi-outputs="midiOutputs"
      @save="commitEditor"
      @cancel="closeEditor"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { TRACK_ACCENT_COLORS, randomTrackColor, defaultTrackCategory } from '../models/project.js';
import TrackEditorModal from './TrackEditorModal.vue';

const props = defineProps({
  tracks: { type: Array, required: true },
  activeTrackId: String,
  midiOutputs: { type: Array, default: () => [] },
});

const emit = defineEmits(['select', 'add-track', 'update-track', 'delete-track']);

const accentColors = TRACK_ACCENT_COLORS;
const open = ref(false);
const colorPickerId = ref(null);
const confirmDeleteId = ref(null);
const rootRef = ref(null);
const triggerRef = ref(null);
const panelRef = ref(null);
const panelStyle = ref({});

const editorOpen = ref(false);
const editorMode = ref('create');
const editorKind = ref('midi');
const editorTrackId = ref(null);
const editorInitial = ref({});

const activeTrack = computed(() => props.tracks.find((t) => t.id === props.activeTrackId));

function defaultTrackName(kind) {
  const n =
    kind === 'drum'
      ? props.tracks.filter((t) => t.kind === 'drum').length + 1
      : props.tracks.filter((t) => t.kind === 'midi').length + 1;
  return kind === 'drum' ? `Drums ${n}` : `MIDI ${n}`;
}

function trackToDraft(track) {
  return {
    name: track.name,
    color: track.color,
    category: track.category,
    midiOutputId: track.midiOutputId ?? '',
    midiChannel: track.midiChannel ?? 0,
    volume: track.volume ?? 1,
  };
}

function updatePosition() {
  const el = triggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  panelStyle.value = { top: rect.bottom + 4 + 'px', left: rect.left + 'px' };
}

function toggleOpen() {
  open.value = !open.value;
  if (open.value) nextTick(updatePosition);
  else {
    colorPickerId.value = null;
    confirmDeleteId.value = null;
  }
}

function closeEditor() {
  editorOpen.value = false;
  editorTrackId.value = null;
}

function startCreate(kind) {
  editorMode.value = 'create';
  editorKind.value = kind;
  editorTrackId.value = null;
  editorInitial.value = {
    name: defaultTrackName(kind),
    color: randomTrackColor(props.tracks.map((t) => t.color)),
    category: defaultTrackCategory(kind),
    midiOutputId: '',
    midiChannel: 0,
    volume: 1,
  };
  open.value = false;
  editorOpen.value = true;
}

function startEdit(track) {
  editorMode.value = 'edit';
  editorKind.value = track.kind;
  editorTrackId.value = track.id;
  editorInitial.value = trackToDraft(track);
  open.value = false;
  editorOpen.value = true;
}

function commitEditor(values) {
  if (editorMode.value === 'create') {
    emit('add-track', editorKind.value, values);
  } else if (editorTrackId.value) {
    emit('update-track', editorTrackId.value, values);
  }
  closeEditor();
}

function requestDelete(t) {
  colorPickerId.value = null;
  confirmDeleteId.value = t.id;
}

function confirmDelete(trackId) {
  emit('delete-track', trackId);
  confirmDeleteId.value = null;
  open.value = false;
}

function toggleColorPicker(trackId) {
  colorPickerId.value = colorPickerId.value === trackId ? null : trackId;
}

function pickColor(trackId, color) {
  emit('update-track', trackId, { color });
  colorPickerId.value = null;
}

function selectTrack(t) {
  emit('select', t.id);
  open.value = false;
}

function onDocumentPointerDown(e) {
  if (editorOpen.value) return;
  if (!open.value) return;
  const insideTrigger = rootRef.value?.contains(e.target);
  const insidePanel = panelRef.value?.contains(e.target);
  if (!insideTrigger && !insidePanel) {
    open.value = false;
    colorPickerId.value = null;
    confirmDeleteId.value = null;
  }
}

function onWindowChange() {
  if (open.value) updatePosition();
}

function onKeyDown(e) {
  if (editorOpen.value) return;
  if (open.value && e.key === 'Escape') {
    if (confirmDeleteId.value) {
      confirmDeleteId.value = null;
      return;
    }
    if (colorPickerId.value) {
      colorPickerId.value = null;
      return;
    }
    open.value = false;
  }
}

window.addEventListener('mousedown', onDocumentPointerDown);
window.addEventListener('touchstart', onDocumentPointerDown);
window.addEventListener('scroll', onWindowChange, true);
window.addEventListener('resize', onWindowChange);
window.addEventListener('keydown', onKeyDown);

onUnmounted(() => {
  window.removeEventListener('mousedown', onDocumentPointerDown);
  window.removeEventListener('touchstart', onDocumentPointerDown);
  window.removeEventListener('scroll', onWindowChange, true);
  window.removeEventListener('resize', onWindowChange);
  window.removeEventListener('keydown', onKeyDown);
});
</script>
