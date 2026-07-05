<template>
  <div class="song-menu flex-shrink-0 flex flex-col items-center gap-px" ref="rootRef">
    <button
      ref="triggerRef"
      class="flex items-center gap-1.5 pl-1.5 pr-1.5 py-0.5 rounded text-sm font-semibold bg-surface-hover hover:bg-surface-active flex-shrink-0 w-[7.5rem]"
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

const emit = defineEmits(['select', 'rename', 'create']);

const open = ref(false);
const renamingId = ref(null);
const creating = ref(false);
const newSongName = ref('');
const rootRef = ref(null);
const triggerRef = ref(null);
const panelRef = ref(null);
const createInputRef = ref(null);
const panelStyle = ref({});

const activeSong = computed(() => props.songs.find((s) => s.id === props.activeSongId));

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
