<template>
  <ToolbarField label="Ghost">
    <div v-if="compactNavbar" class="flex items-center gap-0.5" ref="rootRef">
      <button
        ref="trackTriggerRef"
        type="button"
        class="daw-toolbar-menu-btn daw-toolbar-menu-btn--compact"
        :title="ghostSourceTrack?.name ?? 'Ghost notes off'"
        @click="toggleTrackOpen"
      >
        <span
          class="rounded-sm flex-shrink-0 ring-1 ring-line/50 flex items-center justify-center leading-none w-3 h-3 text-[7px] font-bold"
          :class="ghostSourceTrack ? '' : 'bg-surface-hover text-muted-dim'"
          :style="ghostSourceTrack
            ? {
              background: ghostSourceTrack.color,
              color: contrastTextColor(ghostSourceTrack.color),
            }
            : undefined"
        >{{ ghostSourceTrack ? initialLetter(ghostSourceTrack.name) : '—' }}</span>
      </button>

      <button
        v-if="track?.ghostTrackId"
        ref="patternTriggerRef"
        type="button"
        class="daw-toolbar-menu-btn daw-toolbar-menu-btn--compact"
        :title="ghostSelectedPattern?.name ?? 'Choose ghost pattern'"
        @click="togglePatternOpen"
      >
        <span
          class="rounded-sm flex-shrink-0 ring-1 ring-line/50 flex items-center justify-center leading-none w-3 h-3 text-[7px] font-bold"
          :class="ghostSelectedPattern ? '' : 'bg-surface-hover text-muted-dim'"
          :style="ghostSelectedPattern
            ? {
              background: ghostSelectedPattern.color,
              color: contrastTextColor(ghostSelectedPattern.color),
            }
            : undefined"
        >{{ ghostSelectedPattern ? initialLetter(ghostSelectedPattern.name) : '—' }}</span>
      </button>

      <Teleport to="body">
        <div
          v-if="trackOpen"
          ref="trackPanelRef"
          class="fixed z-50 w-56 bg-panel border border-line rounded-md shadow-lg overflow-hidden py-1"
          :style="trackPanelStyle"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-hover"
            :class="!track?.ghostTrackId ? 'bg-surface-hover' : ''"
            @click="selectGhostTrack(null)"
          >
            <span class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-line bg-surface-hover" />
            <span class="text-xs">Off</span>
          </button>
          <button
            v-for="t in tracks"
            :key="t.id"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-hover"
            :class="t.id === track?.ghostTrackId ? 'bg-surface-hover' : ''"
            @click="selectGhostTrack(t.id)"
          >
            <span
              class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-line"
              :style="{ background: t.color }"
            />
            <span class="text-xs truncate">{{ t.name }}</span>
          </button>
        </div>
      </Teleport>

      <Teleport to="body">
        <div
          v-if="patternOpen"
          ref="patternPanelRef"
          class="fixed z-50 w-56 bg-panel border border-line rounded-md shadow-lg overflow-hidden py-1"
          :style="patternPanelStyle"
        >
          <button
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-hover"
            :class="!track?.ghostPatternId ? 'bg-surface-hover' : ''"
            @click="selectGhostPattern(null)"
          >
            <span class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-line bg-surface-hover" />
            <span class="text-xs">—</span>
          </button>
          <button
            v-for="pattern in ghostPatternOptions"
            :key="pattern.id"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-hover"
            :class="pattern.id === track?.ghostPatternId ? 'bg-surface-hover' : ''"
            @click="selectGhostPattern(pattern.id)"
          >
            <span
              class="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-line"
              :style="{ background: pattern.color }"
            />
            <span class="text-xs truncate">{{ pattern.name }}</span>
          </button>
        </div>
      </Teleport>
    </div>

    <div v-else class="flex items-center gap-0.5">
      <select
        :value="track?.ghostTrackId ?? ''"
        class="text-[11px] max-w-24 py-0.5 bg-surface border border-line-light rounded"
        title="Track to show ghost notes from"
        @change="onGhostTrackChange"
      >
        <option value="">Off</option>
        <option v-for="t in tracks" :key="t.id" :value="t.id">{{ t.name }}</option>
      </select>
      <select
        v-if="track?.ghostTrackId"
        :value="track?.ghostPatternId ?? ''"
        class="text-[11px] max-w-24 py-0.5 bg-surface border border-line-light rounded"
        title="Pattern to show as a faded reference overlay"
        @change="onGhostPatternChange"
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
  </ToolbarField>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';
import ToolbarField from './ToolbarField.vue';
import { contrastTextColor } from '../utils/color.js';
import { initialLetter } from '../utils/text.js';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  track: { type: Object, default: null },
  compactNavbar: { type: Boolean, default: false },
});

const emit = defineEmits(['change']);

const rootRef = ref(null);
const trackTriggerRef = ref(null);
const patternTriggerRef = ref(null);
const trackPanelRef = ref(null);
const patternPanelRef = ref(null);
const trackOpen = ref(false);
const patternOpen = ref(false);
const trackPanelStyle = ref({});
const patternPanelStyle = ref({});

const ghostSourceTrack = computed(() =>
  props.tracks.find((t) => t.id === props.track?.ghostTrackId) ?? null
);

const ghostSelectedPattern = computed(() => {
  const source = ghostSourceTrack.value;
  const patternId = props.track?.ghostPatternId;
  if (!source?.patterns?.length || !patternId) return null;
  return source.patterns.find((p) => p.id === patternId) ?? null;
});

const ghostPatternOptions = computed(() => {
  const source = ghostSourceTrack.value;
  if (!source?.patterns?.length) return [];
  let options;
  if (source.id === props.track?.id) {
    options = source.patterns.filter((p) => p.id !== props.track.activePatternId);
  } else {
    options = source.patterns;
  }
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

function updateTrackPanelPosition() {
  const el = trackTriggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  trackPanelStyle.value = { top: rect.bottom + 4 + 'px', left: rect.left + 'px' };
}

function updatePatternPanelPosition() {
  const el = patternTriggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  patternPanelStyle.value = { top: rect.bottom + 4 + 'px', left: rect.left + 'px' };
}

function toggleTrackOpen() {
  trackOpen.value = !trackOpen.value;
  if (trackOpen.value) {
    patternOpen.value = false;
    nextTick(updateTrackPanelPosition);
  }
}

function togglePatternOpen() {
  patternOpen.value = !patternOpen.value;
  if (patternOpen.value) {
    trackOpen.value = false;
    nextTick(updatePatternPanelPosition);
  }
}

function selectGhostTrack(trackId) {
  if (!trackId) {
    emit('change', { ghostTrackId: null, ghostPatternId: null });
  } else {
    const sourceTrack = props.tracks.find((t) => t.id === trackId);
    emit('change', {
      ghostTrackId: trackId,
      ghostPatternId: firstGhostPatternId(sourceTrack),
    });
  }
  trackOpen.value = false;
}

function selectGhostPattern(patternId) {
  if (!props.track?.ghostTrackId) return;
  emit('change', {
    ghostTrackId: props.track.ghostTrackId,
    ghostPatternId: patternId,
  });
  patternOpen.value = false;
}

function onGhostTrackChange(e) {
  const trackId = e.target.value || null;
  if (!trackId) {
    emit('change', { ghostTrackId: null, ghostPatternId: null });
    return;
  }

  const sourceTrack = props.tracks.find((t) => t.id === trackId);
  emit('change', {
    ghostTrackId: trackId,
    ghostPatternId: firstGhostPatternId(sourceTrack),
  });
}

function onGhostPatternChange(e) {
  const patternId = e.target.value || null;
  if (!props.track?.ghostTrackId) return;
  emit('change', {
    ghostTrackId: props.track.ghostTrackId,
    ghostPatternId: patternId,
  });
}

function onDocumentPointerDown(e) {
  if (!trackOpen.value && !patternOpen.value) return;
  const insideRoot = rootRef.value?.contains(e.target);
  const insideTrackPanel = trackPanelRef.value?.contains(e.target);
  const insidePatternPanel = patternPanelRef.value?.contains(e.target);
  if (!insideRoot && !insideTrackPanel && !insidePatternPanel) {
    trackOpen.value = false;
    patternOpen.value = false;
  }
}

function onWindowChange() {
  if (trackOpen.value) updateTrackPanelPosition();
  if (patternOpen.value) updatePatternPanelPosition();
}

function onKeyDown(e) {
  if ((trackOpen.value || patternOpen.value) && e.key === 'Escape') {
    trackOpen.value = false;
    patternOpen.value = false;
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
