<template>
  <div
    v-if="track"
    class="flex items-center gap-1.5 px-2 py-1 bg-surface/60 border-b border-line flex-shrink-0 overflow-x-auto"
    @mousedown="onBackgroundMouseDown"
  >
    <span class="text-[7px] leading-none text-muted-dim uppercase tracking-wider select-none flex-shrink-0">
      Patterns
    </span>

    <div class="flex items-center gap-1 flex-1 min-w-0">
      <div
        v-for="pattern in track.patterns"
        :key="pattern.id"
        class="group flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded text-xs flex-shrink-0 cursor-pointer transition-colors"
        :data-pattern-id="pattern.id"
        :class="
          pattern.id === track.activePatternId
            ? 'bg-accent/20 ring-1 ring-accent/60'
            : 'bg-surface-hover hover:bg-surface-active'
        "
        @click="selectPattern(pattern.id)"
      >
        <button
          type="button"
          class="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-line/60 hover:ring-line-light transition-shadow"
          :style="{ background: pattern.color }"
          title="Change pattern color"
          @click.stop="toggleColorPicker(pattern.id)"
        />

        <input
          v-if="renamingId === pattern.id"
          :ref="(el) => setRenameInputRef(el)"
          :value="pattern.name"
          class="w-20 min-w-0 bg-transparent border-b border-accent text-[11px] px-0 outline-none"
          @click.stop
          @keydown.enter="commitRename($event, pattern.id)"
          @keydown.esc="renamingId = null"
          @blur="commitRename($event, pattern.id)"
        />
        <span
          v-else
          class="truncate max-w-24 text-[11px] font-medium"
          :title="`${pattern.name} — ${barsLabel(pattern.patternSteps)}`"
          @dblclick.stop="startRename(pattern.id)"
        >
          {{ pattern.name }}
        </span>

        <span class="text-[9px] text-muted-dim tabular-nums flex-shrink-0">
          {{ barsLabel(pattern.patternSteps) }}
        </span>

        <button
          v-if="renamingId !== pattern.id && confirmDeleteId !== pattern.id && track.patterns.length > 1"
          type="button"
          class="opacity-0 group-hover:opacity-100 text-[10px] text-muted-dim hover:text-red-400 flex-shrink-0 leading-none"
          title="Delete pattern"
          @click.stop="requestDelete(pattern.id)"
        >
          ×
        </button>
      </div>

      <button
        type="button"
        class="flex-shrink-0 w-6 h-6 rounded bg-surface-hover hover:bg-surface-active text-muted hover:text-white text-sm leading-none"
        title="Add pattern"
        @click="addPattern"
      >
        +
      </button>
    </div>

    <div class="flex items-center gap-1 flex-shrink-0 border-l border-line/60 pl-1.5 ml-0.5">
      <span class="text-[7px] leading-none text-muted-dim uppercase tracking-wider select-none">Ghost</span>
      <select
        :value="track.ghostTrackId ?? ''"
        class="text-[11px] max-w-24 py-0.5 bg-surface border border-line-light rounded"
        title="Track to show ghost notes from"
        @change="onGhostTrackChange"
        @mousedown.stop
        @click.stop
      >
        <option value="">Off</option>
        <option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <select
        v-if="track.ghostTrackId"
        :value="track.ghostPatternId ?? ''"
        class="text-[11px] max-w-24 py-0.5 bg-surface border border-line-light rounded"
        title="Pattern to show as a faded reference overlay"
        @change="onGhostPatternChange"
        @mousedown.stop
        @click.stop
      >
        <option value="">—</option>
        <option
          v-for="pattern in ghostPatternOptions"
          :key="pattern.id"
          :value="pattern.id"
        >
          {{ pattern.name }}
        </option>
      </select>
    </div>

    <div v-if="midiIoEnabled" class="flex items-center gap-0.5 flex-shrink-0 border-l border-line/60 pl-1.5 ml-0.5">
      <input
        ref="midiFileInputRef"
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        class="hidden"
        @change="onMidiFileSelected"
      />
      <button
        type="button"
        class="px-1.5 py-0.5 rounded text-[10px] leading-none bg-surface-hover hover:bg-surface-active text-muted hover:text-white"
        title="Load MIDI file into the active pattern"
        @click="triggerMidiImport"
      >
        Load
      </button>
      <button
        type="button"
        class="px-1.5 py-0.5 rounded text-[10px] leading-none bg-surface-hover hover:bg-surface-active text-muted hover:text-white"
        title="Save the active pattern as a MIDI file"
        @click="emit('export-midi')"
      >
        Save
      </button>
    </div>

    <Teleport to="body">
      <div
        v-if="colorPickerId && colorPickerAnchor"
        ref="colorPanelRef"
        class="fixed z-50 p-2 bg-panel border border-line rounded-md shadow-lg flex flex-wrap gap-1 w-36"
        :style="colorPanelStyle"
        @mousedown.stop
      >
        <button
          v-for="c in accentColors"
          :key="c"
          type="button"
          class="w-4 h-4 rounded-sm ring-1 transition-shadow"
          :class="activePickerColor === c ? 'ring-white' : 'ring-transparent hover:ring-line-light'"
          :style="{ background: c }"
          :title="c"
          @click="pickColor(c)"
        />
      </div>
    </Teleport>

    <div
      v-if="confirmDeleteId"
      class="fixed inset-0 z-40"
      @mousedown="confirmDeleteId = null"
    ></div>
    <div
      v-if="confirmDeleteId"
      class="fixed z-50 px-3 py-2 bg-panel border border-line rounded-md shadow-lg text-xs flex items-center gap-2"
      :style="deleteConfirmStyle"
      @mousedown.stop
    >
      <span class="text-muted">Delete pattern?</span>
      <button type="button" class="text-muted hover:text-white" @click="confirmDeleteId = null">Cancel</button>
      <button type="button" class="text-red-400 hover:text-red-300 font-semibold" @click="confirmDelete">
        Delete
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted, watch } from 'vue';
import { TRACK_ACCENT_COLORS, BAR_LENGTH_OPTIONS } from '../models/project.js';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  track: { type: Object, default: null },
  /** Show Load/Save MIDI controls (MIDI synth tracks only). */
  midiIoEnabled: { type: Boolean, default: false },
});

const emit = defineEmits([
  'select-pattern',
  'add-pattern',
  'rename-pattern',
  'update-pattern',
  'delete-pattern',
  'import-midi',
  'export-midi',
  'ghost-source-change',
]);

const midiFileInputRef = ref(null);

const accentColors = TRACK_ACCENT_COLORS;
const renamingId = ref(null);
const colorPickerId = ref(null);
const colorPickerAnchor = ref(null);
const colorPanelRef = ref(null);
const colorPanelStyle = ref({});
const confirmDeleteId = ref(null);
const deleteConfirmStyle = ref({});

const activePickerColor = computed(() => {
  if (!colorPickerId.value || !props.track) return null;
  return props.track.patterns.find((p) => p.id === colorPickerId.value)?.color ?? null;
});

const ghostSourceTrack = computed(() =>
  props.tracks.find((t) => t.id === props.track?.ghostTrackId) ?? null
);

const ghostPatternOptions = computed(() => {
  const source = ghostSourceTrack.value;
  if (!source?.patterns?.length) return [];
  let options;
  if (source.id === props.track?.id) {
    options = source.patterns.filter((p) => p.id !== props.track.activePatternId);
  } else {
    options = source.patterns;
  }
  // Keep the stored ghost pattern in the list even when it matches the active
  // pattern (overlay is suppressed in getGhostSource) so the dropdown doesn't
  // look cleared after switching patterns on the same track.
  const ghostId = props.track?.ghostPatternId;
  if (ghostId && !options.some((p) => p.id === ghostId)) {
    const selected = source.patterns.find((p) => p.id === ghostId);
    if (selected) options = [selected, ...options];
  }
  return options;
});

function firstGhostPatternId(sourceTrack) {
  return ghostPatternOptionsForTrack(sourceTrack, props.track)?.[0]?.id ?? null;
}

function ghostPatternOptionsForTrack(sourceTrack, viewingTrack) {
  if (!sourceTrack?.patterns?.length) return [];
  let options;
  if (sourceTrack.id === viewingTrack?.id) {
    options = sourceTrack.patterns.filter((p) => p.id !== viewingTrack.activePatternId);
  } else {
    options = sourceTrack.patterns;
  }
  const ghostId = viewingTrack?.ghostPatternId;
  if (ghostId && !options.some((p) => p.id === ghostId)) {
    const selected = sourceTrack.patterns.find((p) => p.id === ghostId);
    if (selected) options = [selected, ...options];
  }
  return options;
}

function onGhostTrackChange(e) {
  const trackId = e.target.value || null;
  if (!trackId) {
    emit('ghost-source-change', { ghostTrackId: null, ghostPatternId: null });
    return;
  }

  const sourceTrack = props.tracks.find((t) => t.id === trackId);
  emit('ghost-source-change', {
    ghostTrackId: trackId,
    ghostPatternId: firstGhostPatternId(sourceTrack),
  });
}

function onGhostPatternChange(e) {
  const patternId = e.target.value || null;
  if (!props.track?.ghostTrackId) return;
  emit('ghost-source-change', {
    ghostTrackId: props.track.ghostTrackId,
    ghostPatternId: patternId,
  });
}

function barsLabel(steps) {
  const opt = BAR_LENGTH_OPTIONS.find((o) => o.steps === steps);
  return opt ? `${opt.bars}b` : `${steps / 4}b`;
}

function setRenameInputRef(el) {
  if (el) nextTick(() => el.focus());
}

function selectPattern(patternId) {
  emit('select-pattern', patternId);
}

function addPattern() {
  emit('add-pattern');
}

function triggerMidiImport() {
  midiFileInputRef.value?.click();
}

function onMidiFileSelected(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (file) emit('import-midi', file);
}

function startRename(patternId) {
  renamingId.value = patternId;
}

function commitRename(e, patternId) {
  if (renamingId.value !== patternId) return;
  const name = e.target.value.trim();
  renamingId.value = null;
  if (name) emit('rename-pattern', patternId, name);
}

function toggleColorPicker(patternId) {
  if (colorPickerId.value === patternId) {
    colorPickerId.value = null;
    colorPickerAnchor.value = null;
    return;
  }
  colorPickerId.value = patternId;
  colorPickerAnchor.value = patternId;
  nextTick(updateColorPanelPosition);
}

function updateColorPanelPosition() {
  if (!colorPickerId.value) return;
  const el = document.querySelector(`[data-pattern-id="${colorPickerId.value}"]`);
  // Fallback: position near the pattern bar
  const bar = colorPanelRef.value?.parentElement;
  const rect = el?.getBoundingClientRect() ?? bar?.getBoundingClientRect();
  if (!rect) return;
  colorPanelStyle.value = { top: rect.bottom + 4 + 'px', left: rect.left + 'px' };
}

function pickColor(color) {
  if (!colorPickerId.value) return;
  emit('update-pattern', colorPickerId.value, { color });
  colorPickerId.value = null;
  colorPickerAnchor.value = null;
}

function requestDelete(patternId) {
  colorPickerId.value = null;
  renamingId.value = null;
  confirmDeleteId.value = patternId;
  nextTick(() => {
    deleteConfirmStyle.value = { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
  });
}

function confirmDelete() {
  if (!confirmDeleteId.value) return;
  emit('delete-pattern', confirmDeleteId.value);
  confirmDeleteId.value = null;
}

function onBackgroundMouseDown(e) {
  if (e.target === e.currentTarget) {
    renamingId.value = null;
    colorPickerId.value = null;
  }
}

function onDocumentPointerDown(e) {
  if (colorPickerId.value) {
    const insidePanel = colorPanelRef.value?.contains(e.target);
    if (!insidePanel) {
      colorPickerId.value = null;
      colorPickerAnchor.value = null;
    }
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape') {
    if (confirmDeleteId.value) {
      confirmDeleteId.value = null;
      return;
    }
    if (colorPickerId.value) {
      colorPickerId.value = null;
      colorPickerAnchor.value = null;
      return;
    }
    renamingId.value = null;
  }
}

watch(
  () => props.track?.activePatternId,
  () => {
    renamingId.value = null;
    confirmDeleteId.value = null;
  }
);

window.addEventListener('mousedown', onDocumentPointerDown);
window.addEventListener('touchstart', onDocumentPointerDown);
window.addEventListener('keydown', onKeyDown);

onUnmounted(() => {
  window.removeEventListener('mousedown', onDocumentPointerDown);
  window.removeEventListener('touchstart', onDocumentPointerDown);
  window.removeEventListener('keydown', onKeyDown);
});
</script>
