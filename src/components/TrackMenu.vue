<template>
  <div class="track-menu flex-shrink-0 flex flex-col items-center gap-px" ref="rootRef">
    <div class="flex items-center gap-0.5">
      <button
        ref="triggerRef"
        class="daw-toolbar-menu-btn"
        :class="compactNavbar ? 'daw-toolbar-menu-btn--compact' : ''"
        :title="activeTrack?.name ?? 'No tracks'"
        @click="toggleOpen"
      >
        <span
          class="rounded-sm flex-shrink-0 ring-1 ring-line/50"
          :class="compactNavbar ? 'w-3 h-3' : 'w-2 h-2'"
          :style="{ background: activeTrack?.color }"
        ></span>
        <span v-if="!compactNavbar" class="truncate flex-1 min-w-0 text-left">{{ activeTrack?.name ?? 'No tracks' }}</span>
        <span v-if="!compactNavbar" class="text-[9px] text-muted-dim flex-shrink-0">▾</span>
      </button>

      <button
        type="button"
        class="daw-toolbar-icon-btn text-base leading-none text-muted hover:text-white hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none"
        title="Edit track"
        :disabled="!activeTrack"
        @click="startEditActive"
      >
        ✎
      </button>
    </div>
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
            class="hover:bg-surface-hover cursor-pointer"
            :class="t.id === activeTrackId ? 'bg-surface-hover' : ''"
            @click="selectTrack(t)"
          >
            <div class="flex items-center gap-1.5 px-2 py-1">
              <span
                class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-line"
                :style="{ background: t.color }"
              />

              <span class="flex-1 min-w-0 truncate text-xs">{{ t.name }}</span>

              <span class="text-[9px] text-muted-dim uppercase flex-shrink-0">{{ t.category }}</span>
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
      @delete="confirmDelete"
      @cancel="closeEditor"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { randomTrackColor, defaultTrackCategory } from '../models/project.js';
import TrackEditorModal from './TrackEditorModal.vue';

const props = defineProps({
  tracks: { type: Array, required: true },
  activeTrackId: String,
  midiOutputs: { type: Array, default: () => [] },
  compactNavbar: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'add-track', 'update-track', 'delete-track']);

const open = ref(false);
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

function startEditActive() {
  if (!activeTrack.value) return;
  startEdit(activeTrack.value);
}

function commitEditor(values) {
  if (editorMode.value === 'create') {
    emit('add-track', editorKind.value, values);
  } else if (editorTrackId.value) {
    emit('update-track', editorTrackId.value, values);
  }
  closeEditor();
}

function confirmDelete() {
  if (editorTrackId.value) {
    emit('delete-track', editorTrackId.value);
  }
  closeEditor();
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
  }
}

function onWindowChange() {
  if (open.value) updatePosition();
}

function onKeyDown(e) {
  if (editorOpen.value) return;
  if (open.value && e.key === 'Escape') {
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
