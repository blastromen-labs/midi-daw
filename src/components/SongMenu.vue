<template>
  <div class="song-menu flex-shrink-0 flex flex-col items-center gap-px" ref="rootRef">
    <button
      ref="triggerRef"
      class="daw-toolbar-menu-btn"
      @click="toggleOpen"
    >
      <span class="truncate flex-1 min-w-0 text-left">{{ activeSong?.name ?? 'No song' }}</span>
      <span class="text-[9px] text-muted-dim flex-shrink-0">▾</span>
    </button>
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
              <input
                v-if="renamingId === song.id"
                :ref="(el) => setRenameInputRef(el)"
                :value="song.name"
                class="flex-1 min-w-0 bg-transparent border-b border-accent text-xs px-0.5 outline-none"
                @click.stop
                @keydown.enter="commitRename($event, song.id)"
                @keydown.esc="renamingId = null"
                @blur="commitRename($event, song.id)"
              />
              <span v-else class="flex-1 min-w-0 truncate text-xs">{{ song.name }}</span>

              <button
                v-if="renamingId !== song.id"
                class="opacity-0 group-hover:opacity-100 text-[10px] text-muted-dim hover:text-white flex-shrink-0"
                title="Rename song"
                @click.stop="startRename(song)"
              >
                ✎
              </button>
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
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';

const props = defineProps({
  songs: { type: Array, required: true },
  activeSongId: String,
});

const emit = defineEmits(['select', 'rename', 'create', 'save-file', 'load-file', 'load-file-error']);

const open = ref(false);
const renamingId = ref(null);
const creating = ref(false);
const newSongName = ref('');
const rootRef = ref(null);
const triggerRef = ref(null);
const panelRef = ref(null);
const createInputRef = ref(null);
const fileInputRef = ref(null);
const panelStyle = ref({});

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
    renamingId.value = null;
    creating.value = false;
    newSongName.value = '';
  }
}

function setRenameInputRef(el) {
  if (el) nextTick(() => el.focus());
}

function selectSong(song) {
  if (renamingId.value) return;
  emit('select', song.id);
  open.value = false;
}

function startRename(song) {
  creating.value = false;
  renamingId.value = song.id;
}

function commitRename(e, songId) {
  if (renamingId.value !== songId) return;
  const name = e.target.value.trim();
  renamingId.value = null;
  if (name) emit('rename', songId, name);
}

function startCreate() {
  renamingId.value = null;
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
  if (!open.value) return;
  const insideTrigger = rootRef.value?.contains(e.target);
  const insidePanel = panelRef.value?.contains(e.target);
  if (!insideTrigger && !insidePanel) {
    open.value = false;
    renamingId.value = null;
    creating.value = false;
    newSongName.value = '';
  }
}

function onWindowChange() {
  if (open.value) updatePosition();
}

function onKeyDown(e) {
  if (open.value && e.key === 'Escape') {
    if (creating.value) {
      cancelCreate();
      return;
    }
    open.value = false;
    renamingId.value = null;
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
