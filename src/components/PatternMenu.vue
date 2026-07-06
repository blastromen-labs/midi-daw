<template>
  <div class="pattern-menu flex-shrink-0 flex flex-col items-center gap-px" ref="rootRef">
    <div class="flex items-center gap-0.5">
      <button
        type="button"
        class="daw-toolbar-icon-btn text-[9px] leading-none transition-colors disabled:opacity-30 disabled:pointer-events-none"
        :class="activePattern ? launchButtonClass(activePattern) : 'bg-surface-hover text-muted'"
        :title="activePattern ? launchButtonTitle(activePattern) : 'No pattern'"
        :disabled="!activePattern"
        @pointerdown="onLaunchPointerDown($event)"
        @pointerup="onLaunchPointerUp($event)"
        @pointercancel="onLaunchPointerUp($event)"
        @click.stop="onPreviewClick"
      >
        ▶
      </button>

      <button
        ref="triggerRef"
        class="daw-toolbar-menu-btn"
        @click="toggleOpen"
      >
        <span class="w-2 h-2 rounded-sm flex-shrink-0" :style="{ background: activePattern?.color }"></span>
        <span class="truncate flex-1 min-w-0 text-left">{{ activePattern?.name ?? 'No patterns' }}</span>
        <span class="text-[9px] text-muted-dim flex-shrink-0">▾</span>
      </button>

      <button
        type="button"
        class="daw-toolbar-icon-btn text-base leading-none text-muted hover:text-white hover:bg-surface-hover disabled:opacity-30 disabled:pointer-events-none"
        title="Edit pattern"
        :disabled="!activePattern"
        @click="startEditActive"
      >
        ✎
      </button>
    </div>
    <span class="text-[7px] leading-none text-muted-dim uppercase tracking-wider select-none">Pattern</span>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelRef"
        class="fixed z-50 w-56 bg-panel border border-line rounded-md shadow-lg overflow-hidden"
        :style="panelStyle"
      >
        <div class="max-h-64 overflow-y-auto py-1">
          <div
            v-for="pattern in track?.patterns ?? []"
            :key="pattern.id"
            class="hover:bg-surface-hover cursor-pointer"
            :class="pattern.id === track?.activePatternId ? 'bg-surface-hover' : ''"
            @click="selectPattern(pattern.id)"
          >
            <div class="flex items-center gap-1.5 px-2 py-1">
              <span
                class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-line"
                :style="{ background: pattern.color }"
              />

              <span class="flex-1 min-w-0 truncate text-xs">{{ pattern.name }}</span>

              <span class="text-[9px] text-muted-dim tabular-nums flex-shrink-0">
                {{ barsLabel(pattern.patternSteps) }}
              </span>
            </div>
          </div>

          <div v-if="!track?.patterns?.length" class="px-2 py-2 text-xs text-muted-dim">No patterns yet</div>
        </div>

        <div v-if="midiIoEnabled" class="border-t border-line">
          <button
            class="w-full text-left text-xs px-2 py-1.5 hover:bg-surface-hover text-muted hover:text-white"
            title="Save the active pattern as a MIDI file"
            @click="onExportMidi"
          >
            Save to File…
          </button>
          <button
            class="w-full text-left text-xs px-2 py-1.5 hover:bg-surface-hover text-muted hover:text-white"
            title="Load MIDI file into the active pattern"
            @click="onImportMidiClick"
          >
            Load from File…
          </button>
          <input
            ref="midiFileInputRef"
            type="file"
            accept=".mid,.midi,audio/midi,audio/x-midi"
            class="hidden"
            @change="onMidiFileSelected"
          />
        </div>

        <div class="border-t border-line">
          <button
            class="w-full text-xs py-1.5 hover:bg-surface-hover text-muted hover:text-white"
            title="Add pattern"
            @click="startCreate"
          >
            + Pattern
          </button>
        </div>
      </div>
    </Teleport>

    <PatternEditorModal
      v-if="editorOpen"
      :mode="editorMode"
      :initial="editorInitial"
      :can-delete="(track?.patterns?.length ?? 0) > 1"
      @save="commitEditor"
      @delete="confirmDelete"
      @cancel="closeEditor"
    />
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';
import { BAR_LENGTH_OPTIONS, LIVE_LAUNCH_MODES, randomPatternColor } from '../models/project.js';
import { isTrackHoldAudible, isTrackHoldMuted } from '../engine/liveLauncher.js';
import PatternEditorModal from './PatternEditorModal.vue';

const props = defineProps({
  track: { type: Object, default: null },
  playing: { type: Boolean, default: false },
  soloPreview: { type: Object, default: null },
  /** Show Load/Save MIDI controls (MIDI synth tracks only). */
  midiIoEnabled: { type: Boolean, default: false },
});

const emit = defineEmits([
  'select-pattern',
  'add-pattern',
  'update-pattern',
  'update-track',
  'delete-pattern',
  'hold-pattern-down',
  'hold-pattern-up',
  'preview-pattern',
  'import-midi',
  'export-midi',
]);

const open = ref(false);
const rootRef = ref(null);
const triggerRef = ref(null);
const panelRef = ref(null);
const panelStyle = ref({});
const midiFileInputRef = ref(null);

const editorOpen = ref(false);
const editorMode = ref('create');
const editorPatternId = ref(null);
const editorInitial = ref({});

let holdPointerId = null;

const isHoldMode = computed(() => props.track?.liveLaunchMode === LIVE_LAUNCH_MODES.HOLD);

const activePattern = computed(() =>
  props.track?.patterns?.find((p) => p.id === props.track.activePatternId) ?? null
);

function defaultPatternName() {
  const count = props.track?.patterns?.length ?? 0;
  return `Pattern ${count + 1}`;
}

function trackLiveDraft() {
  return {
    liveLaunchMode: props.track?.liveLaunchMode ?? 'toggle',
    liveSyncGrid: props.track?.liveSyncGrid ?? '1/16',
  };
}

function patternToDraft(pattern) {
  return {
    name: pattern.name,
    color: pattern.color,
    patternSteps: pattern.patternSteps ?? 16,
    ...trackLiveDraft(),
  };
}

function barsLabel(steps) {
  const opt = BAR_LENGTH_OPTIONS.find((o) => o.steps === steps);
  return opt ? `${opt.bars}b` : `${steps / 4}b`;
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
  editorPatternId.value = null;
}

function startCreate() {
  const active = activePattern.value;
  editorMode.value = 'create';
  editorPatternId.value = null;
  editorInitial.value = {
    name: defaultPatternName(),
    color: randomPatternColor(props.track?.patterns?.map((p) => p.color) ?? []),
    patternSteps: active?.patternSteps ?? 16,
    ...trackLiveDraft(),
  };
  open.value = false;
  editorOpen.value = true;
}

function startEdit(pattern) {
  editorMode.value = 'edit';
  editorPatternId.value = pattern.id;
  editorInitial.value = patternToDraft(pattern);
  open.value = false;
  editorOpen.value = true;
}

function startEditActive() {
  if (!activePattern.value) return;
  startEdit(activePattern.value);
}

function commitEditor(values) {
  const { liveLaunchMode, liveSyncGrid, ...patternValues } = values;

  if (editorMode.value === 'create') {
    emit('add-pattern', patternValues);
  } else if (editorPatternId.value) {
    emit('update-pattern', editorPatternId.value, patternValues);
  }

  emit('update-track', { liveLaunchMode, liveSyncGrid });
  closeEditor();
}

function confirmDelete() {
  if (editorPatternId.value) {
    emit('delete-pattern', editorPatternId.value);
  }
  closeEditor();
}

function selectPattern(patternId) {
  emit('select-pattern', patternId);
  open.value = false;
}

function onExportMidi() {
  emit('export-midi');
  open.value = false;
}

function onImportMidiClick() {
  midiFileInputRef.value?.click();
}

function onMidiFileSelected(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  open.value = false;
  emit('import-midi', file);
}

function patternLaunchStatus(pattern) {
  const track = props.track;
  if (!track) return 'idle';
  if (isHoldMode.value) {
    if (isTrackHoldAudible(track, pattern.id)) return 'playing';
    if (isTrackHoldMuted(track) && track.playingPatternId === pattern.id && track.holdActive) return 'arming';
    return 'idle';
  }
  if (props.soloPreview?.trackId === track.id && props.soloPreview?.patternId === pattern.id) {
    return props.playing ? 'playing' : 'armed';
  }
  return 'idle';
}

function launchButtonClass(pattern) {
  const status = patternLaunchStatus(pattern);
  if (status === 'playing') return 'bg-white/90 text-black';
  if (status === 'arming' || status === 'queued') return 'bg-white/50 text-black animate-pulse';
  if (status === 'stopping') return 'bg-red-400/80 text-white animate-pulse';
  if (status === 'armed') return 'bg-white/30 text-white';
  return 'bg-surface-hover hover:bg-surface-active text-muted hover:text-white';
}

function launchButtonTitle(pattern) {
  if (isHoldMode.value) {
    return `${pattern.name} — hold to play in sync (${props.track?.liveSyncGrid ?? '1/16'} grid)`;
  }
  return `${pattern.name} — play this pattern only`;
}

function onPreviewClick() {
  if (!activePattern.value || isHoldMode.value) return;
  emit('preview-pattern', activePattern.value.id);
}

function onLaunchPointerDown(e) {
  if (!activePattern.value || !isHoldMode.value || e.button !== 0) return;
  holdPointerId = e.pointerId;
  e.currentTarget.setPointerCapture(e.pointerId);
  emit('hold-pattern-down', activePattern.value.id);
}

function onLaunchPointerUp(e) {
  if (!isHoldMode.value) return;
  if (e?.pointerId != null && holdPointerId != null && e.pointerId !== holdPointerId) return;
  holdPointerId = null;
  emit('hold-pattern-up');
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
