<template>
  <div class="track-menu flex-shrink-0" ref="rootRef">
    <button
      ref="triggerRef"
      class="flex items-center gap-1.5 pl-1.5 pr-1.5 py-1 rounded text-sm font-semibold bg-surface-hover hover:bg-surface-active flex-shrink-0"
      @click="toggleOpen"
    >
      <span class="w-2 h-2 rounded-sm flex-shrink-0" :style="{ background: activeTrack?.color }"></span>
      <span class="truncate max-w-28">{{ activeTrack?.name ?? 'No tracks' }}</span>
      <span class="text-[9px] text-muted-dim">▾</span>
    </button>

    <!-- Teleported so the toolbar's own overflow-x-auto (needed for narrow
         screens) can't clip this panel — an absolutely-positioned child
         would otherwise get cut off since setting overflow-x forces
         overflow-y to compute as non-visible too. -->
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
            class="flex items-center gap-1.5 px-2 py-1 group hover:bg-surface-hover cursor-pointer"
            :class="t.id === activeTrackId ? 'bg-surface-hover' : ''"
            @click="selectTrack(t)"
          >
            <span class="w-2 h-2 rounded-sm flex-shrink-0" :style="{ background: t.color }"></span>

            <input
              v-if="renamingId === t.id"
              :ref="(el) => setRenameInputRef(el)"
              :value="t.name"
              class="flex-1 min-w-0 bg-transparent border-b border-accent text-xs px-0.5 outline-none"
              @click.stop
              @keydown.enter="commitRename($event, t.id)"
              @keydown.esc="renamingId = null"
              @blur="commitRename($event, t.id)"
            />
            <span v-else class="flex-1 min-w-0 truncate text-xs">{{ t.name }}</span>

            <span class="text-[9px] text-muted-dim uppercase flex-shrink-0">{{ t.kind }}</span>

            <button
              v-if="renamingId !== t.id"
              class="opacity-0 group-hover:opacity-100 text-[10px] text-muted-dim hover:text-white flex-shrink-0"
              title="Rename track"
              @click.stop="startRename(t)"
            >
              ✎
            </button>
          </div>

          <div v-if="tracks.length === 0" class="px-2 py-2 text-xs text-muted-dim">No tracks yet</div>
        </div>

        <div class="border-t border-line flex">
          <button
            class="flex-1 text-xs py-1.5 hover:bg-surface-hover text-muted hover:text-white"
            title="Add a MIDI channel"
            @click="addTrack('midi')"
          >
            + MIDI
          </button>
          <button
            class="flex-1 text-xs py-1.5 hover:bg-surface-hover text-muted hover:text-white border-l border-line"
            title="Add a sample-based drum channel"
            @click="addTrack('drum')"
          >
            + Drum
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';

const props = defineProps({
  tracks: { type: Array, required: true },
  activeTrackId: String,
});

const emit = defineEmits(['select', 'rename', 'add-track']);

const open = ref(false);
const renamingId = ref(null);
const rootRef = ref(null);
const triggerRef = ref(null);
const panelRef = ref(null);
const panelStyle = ref({});

const activeTrack = computed(() => props.tracks.find((t) => t.id === props.activeTrackId));

function updatePosition() {
  const el = triggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  panelStyle.value = { top: rect.bottom + 4 + 'px', left: rect.left + 'px' };
}

function toggleOpen() {
  open.value = !open.value;
  if (open.value) nextTick(updatePosition);
  else renamingId.value = null;
}

function setRenameInputRef(el) {
  if (el) nextTick(() => el.focus());
}

function selectTrack(t) {
  emit('select', t.id);
  open.value = false;
}

function startRename(t) {
  renamingId.value = t.id;
}

// Guarded by the renamingId check so a commit already handled by one event
// (e.g. Enter) doesn't fire a second time when the resulting blur follows.
function commitRename(e, trackId) {
  if (renamingId.value !== trackId) return;
  const name = e.target.value.trim();
  renamingId.value = null;
  if (name) emit('rename', trackId, name);
}

function addTrack(kind) {
  emit('add-track', kind);
  open.value = false;
}

function onDocumentPointerDown(e) {
  if (!open.value) return;
  const insideTrigger = rootRef.value?.contains(e.target);
  const insidePanel = panelRef.value?.contains(e.target);
  if (!insideTrigger && !insidePanel) {
    open.value = false;
    renamingId.value = null;
  }
}

function onWindowChange() {
  if (open.value) updatePosition();
}

function onKeyDown(e) {
  if (open.value && e.key === 'Escape') {
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
