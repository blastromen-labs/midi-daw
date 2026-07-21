<template>
  <div class="song-menu flex-shrink-0 flex flex-col items-center gap-px" ref="rootRef">
    <div class="flex items-center gap-0.5">
      <button
        ref="triggerRef"
        class="daw-toolbar-menu-btn"
        :class="compactNavbar ? 'daw-toolbar-menu-btn--compact' : ''"
        :title="activeSong?.name ?? 'No song'"
        @click="toggleOpen"
      >
        <span
          class="rounded-sm flex-shrink-0 ring-1 ring-line/50 flex items-center justify-center leading-none"
          :class="compactNavbar ? 'w-3 h-3 text-[7px] font-bold' : 'w-2 h-2'"
          :style="{
            background: activeSong?.color ?? '#6699ff',
            color: compactNavbar ? contrastTextColor(activeSong?.color ?? '#6699ff') : undefined,
          }"
        >{{ compactNavbar ? initialLetter(activeSong?.name) : '' }}</span>
        <span v-if="!compactNavbar" class="truncate flex-1 min-w-0 text-left">{{ activeSong?.name ?? 'No song' }}</span>
        <span v-if="!compactNavbar" class="text-[9px] text-muted-dim flex-shrink-0">▾</span>
      </button>

      <button
        type="button"
        class="daw-toolbar-icon-btn text-base leading-none text-muted hover:text-white hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none"
        title="Edit song"
        :disabled="!activeSong"
        @click="startEditActive"
      >
        ✎
      </button>
    </div>
    <span class="text-[7px] leading-none text-muted-dim uppercase tracking-wider select-none">Song</span>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelRef"
        class="fixed z-50 w-56 bg-panel border border-line rounded-md shadow-lg overflow-hidden"
        :style="panelStyle"
      >
        <div class="max-h-64 overflow-y-auto py-1">
          <div
            v-for="song in songs"
            :key="song.id"
            class="group hover:bg-surface-hover cursor-pointer"
            :class="song.id === activeSongId ? 'bg-surface-hover' : ''"
            @click="selectSong(song)"
          >
            <div class="flex items-center gap-1.5 px-2 py-1">
              <span
                class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-line"
                :style="{ background: song.color ?? '#6699ff' }"
              />

              <span class="flex-1 min-w-0 truncate text-xs">{{ song.name }}</span>
              <span class="text-[9px] text-muted-dim flex-shrink-0 tabular-nums">{{ songBpm(song) }}</span>
            </div>
          </div>

          <div v-if="songs.length === 0" class="px-2 py-2 text-xs text-muted-dim">No songs yet</div>
        </div>

        <div class="border-t border-line">
          <button
            class="w-full text-left text-xs px-2 py-1.5 hover:bg-surface-hover text-muted hover:text-white"
            @click="onSaveFile"
          >
            Save to File…
          </button>
          <button
            class="w-full text-left text-xs px-2 py-1.5 hover:bg-surface-hover text-muted hover:text-white"
            @click="onLoadFileClick"
          >
            Load from File…
          </button>
          <input
            ref="fileInputRef"
            type="file"
            accept=".json,application/json"
            class="hidden"
            @change="onFileSelected"
          />
        </div>

        <div class="border-t border-line">
          <div v-if="creating" class="flex items-center gap-1 px-2 py-1.5" @click.stop>
            <input
              ref="createInputRef"
              v-model="newSongName"
              placeholder="Song name"
              class="flex-1 min-w-0 bg-surface border border-line-light rounded text-xs px-1.5 py-0.5 outline-none focus:border-accent"
              @keydown.enter="commitCreate"
              @keydown.esc="cancelCreate"
            />
            <button
              type="button"
              class="text-[10px] text-accent hover:text-white flex-shrink-0 font-semibold"
              @click="commitCreate"
            >
              Create
            </button>
          </div>
          <button
            v-else
            class="w-full text-xs py-1.5 hover:bg-surface-hover text-muted hover:text-white"
            @click="startCreate"
          >
            + New Song
          </button>
        </div>
      </div>
    </Teleport>

    <SongEditorModal
      v-if="editorOpen"
      :initial="editorInitial"
      :can-delete="songs.length > 1"
      @save="commitEditor"
      @cancel="closeEditor"
      @delete="deleteActive"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { contrastTextColor } from '../utils/color.js';
import { initialLetter } from '../utils/text.js';
import SongEditorModal from './SongEditorModal.vue';

const props = defineProps({
  songs: { type: Array, required: true },
  activeSongId: String,
  /** Live BPM for the active song (may be ahead of the persisted snapshot). */
  bpm: { type: Number, default: 120 },
  compactNavbar: { type: Boolean, default: false },
});

const emit = defineEmits(['select', 'update', 'create', 'delete', 'save-file', 'load-file', 'load-file-error']);

const open = ref(false);
const creating = ref(false);
const newSongName = ref('');
const rootRef = ref(null);
const triggerRef = ref(null);
const panelRef = ref(null);
const createInputRef = ref(null);
const fileInputRef = ref(null);
const panelStyle = ref({});

const editorOpen = ref(false);
const editorInitial = ref({});

const activeSong = computed(() => props.songs.find((s) => s.id === props.activeSongId));

function updatePosition() {
  const el = triggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const panelWidth = panelRef.value?.offsetWidth ?? 224;
  const margin = 8;
  // Anchor to the trigger's right edge so the menu stays on-screen in the toolbar.
  let left = rect.right - panelWidth;
  left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin));
  panelStyle.value = { top: rect.bottom + 4 + 'px', left: left + 'px' };
}

function toggleOpen() {
  open.value = !open.value;
  if (open.value) nextTick(updatePosition);
  else {
    creating.value = false;
    newSongName.value = '';
  }
}

function closeEditor() {
  editorOpen.value = false;
}

function songBpm(song) {
  if (song.id === props.activeSongId) return props.bpm;
  return song.project?.bpm ?? 120;
}

function startEditActive() {
  if (!activeSong.value) return;
  editorInitial.value = {
    name: activeSong.value.name,
    color: activeSong.value.color,
    bpm: props.bpm,
  };
  open.value = false;
  editorOpen.value = true;
}

function commitEditor(values) {
  if (!activeSong.value) return;
  emit('update', activeSong.value.id, values);
  closeEditor();
}

function deleteActive() {
  if (!activeSong.value || props.songs.length <= 1) return;
  emit('delete', activeSong.value.id);
  closeEditor();
}

function selectSong(song) {
  emit('select', song.id);
  open.value = false;
}

function startCreate() {
  creating.value = true;
  newSongName.value = '';
  nextTick(() => createInputRef.value?.focus());
}

function cancelCreate() {
  creating.value = false;
  newSongName.value = '';
}

function commitCreate() {
  const name = newSongName.value.trim();
  if (!name) return;
  emit('create', name);
  creating.value = false;
  newSongName.value = '';
  open.value = false;
}

function onSaveFile() {
  emit('save-file');
  open.value = false;
}

function onLoadFileClick() {
  fileInputRef.value?.click();
}

function onFileSelected(e) {
  const input = e.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  open.value = false;

  const reader = new FileReader();
  reader.onload = () => {
    emit('load-file', reader.result);
  };
  reader.onerror = () => {
    emit('load-file-error', 'Could not read the selected file.');
  };
  reader.readAsText(file);
}

function onDocumentPointerDown(e) {
  if (editorOpen.value) return;
  if (!open.value) return;
  const insideTrigger = rootRef.value?.contains(e.target);
  const insidePanel = panelRef.value?.contains(e.target);
  if (!insideTrigger && !insidePanel) {
    open.value = false;
    creating.value = false;
    newSongName.value = '';
  }
}

function onWindowChange() {
  if (open.value) updatePosition();
}

function onKeyDown(e) {
  if (editorOpen.value) return;
  if (open.value && e.key === 'Escape') {
    if (creating.value) {
      cancelCreate();
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
