<template>
  <div class="live-view flex flex-col h-full bg-panel rounded-lg border border-line overflow-hidden">
    <!-- Minimal transport bar — mirrors the piano roll's toolbar just enough
         to jam without switching views (see ToolbarField usage there). -->
    <div class="daw-toolbar">
      <div class="daw-toolbar-primary">
      <TransportToolbar
        :playing="playing"
        :bpm="bpm"
        :sync-mode="syncMode"
        :clock-input-id="clockInputId"
        @toggle-play="$emit('toggle-play')"
        @bpm-change="(v) => $emit('bpm-change', v)"
      />
      </div>

      <div class="daw-toolbar-secondary">
      <ViewToggleButton
        label="Roll"
        title="Switch to the Piano Roll (Tab)"
        @click="$emit('view-mode-change', 'roll')"
      />

      <SongMenu
        :songs="songs"
        :active-song-id="activeSongId"
        :compact-navbar="compactNavbar"
        @select="(id) => $emit('select-song', id)"
        @update="(id, changes) => $emit('update-song', id, changes)"
        @create="(name) => $emit('create-song', name)"
        @save-file="$emit('save-song-file')"
        @load-file="(text) => $emit('load-song-file', text)"
        @load-file-error="(msg) => $emit('load-song-file-error', msg)"
      />

      <SettingsToolbarButton
        :sync-mode="syncMode"
        :clock-input-id="clockInputId"
        :send-midi-clock="sendMidiClock"
        :clock-output-id="clockOutputId"
        :compact-navbar="compactNavbar"
        :midi-inputs="midiInputs"
        :midi-outputs="midiOutputs"
        @sync-mode-change="(v) => $emit('sync-mode-change', v)"
        @clock-input-change="(v) => $emit('clock-input-change', v)"
        @toggle-clock="$emit('toggle-clock')"
        @clock-output-change="(v) => $emit('clock-output-change', v)"
        @compact-navbar-change="(v) => $emit('compact-navbar-change', v)"
      />
      </div>
    </div>

    <!-- Launch grid — one row per track, one clip button per pattern. -->
    <div class="flex-1 overflow-auto p-2">
      <div
        v-for="track in tracks"
        :key="track.id"
        class="flex items-stretch gap-2 mb-2 last:mb-0"
      >
        <div
          class="flex flex-col justify-center gap-0.5 w-36 flex-shrink-0 px-2 py-1.5 rounded-md bg-surface/60"
        >
          <div class="flex items-center gap-1.5 min-w-0">
            <span class="w-2 h-2 rounded-sm flex-shrink-0" :style="{ background: track.color }"></span>
            <span class="truncate text-xs font-semibold">{{ track.name }}</span>
          </div>
          <span class="text-[9px] text-muted-dim uppercase tracking-wide">{{ track.category }}</span>
        </div>

        <div class="flex flex-wrap gap-1.5 flex-1 content-start relative" :data-clip-track="track.id">
          <template v-for="(pattern, index) in track.patterns" :key="pattern.id">
            <div
              v-if="isDropBefore(track.id, index)"
              class="w-0.5 h-14 flex-shrink-0 rounded-full bg-white/80 self-center pointer-events-none"
              aria-hidden="true"
            ></div>
            <button
              type="button"
              class="clip relative w-24 h-14 flex-shrink-0 rounded-md overflow-hidden text-left px-2 py-1 transition-transform active:scale-[0.97]"
              :class="[
                clipStateClass(track, pattern),
                clipDragClass(track.id, index),
              ]"
              :style="clipStyle(track, pattern)"
              :title="clipTitle(track, pattern)"
              :data-track-id="track.id"
              :data-clip-index="index"
              @pointerdown="onClipPointerDown($event, track, index, pattern.id)"
              @pointerup="onClipPointerUp($event, track)"
              @pointercancel="onClipPointerUp($event, track)"
              @click="onClipClick(track.id, pattern.id, track.liveLaunchMode)"
              @dblclick="$emit('edit-pattern', track.id, pattern.id)"
            >
              <span class="block text-[11px] font-medium truncate">{{ pattern.name }}</span>
              <span class="block text-[9px] opacity-70">{{ patternStepsLabel(pattern.patternSteps) }}</span>

              <span
                v-if="clipStatus(track, pattern) === 'playing' || clipStatus(track, pattern) === 'stopping' || clipStatus(track, pattern) === 'arming'"
                class="absolute left-0 bottom-0 h-0.5 bg-white/80"
                :style="{ width: clipProgress(pattern) * 100 + '%' }"
              ></span>
              <span
                v-if="clipStatus(track, pattern) === 'playing'"
                class="absolute top-1 right-1 text-[10px] leading-none"
              >▶</span>
              <span
                v-else-if="clipStatus(track, pattern) === 'stopping'"
                class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-300 animate-pulse"
              ></span>
              <span
                v-else-if="clipStatus(track, pattern) === 'queued'"
                class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white animate-pulse"
              ></span>
              <span
                v-else-if="clipStatus(track, pattern) === 'arming'"
                class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse"
              ></span>
              <span
                v-else-if="clipStatus(track, pattern) === 'armed'"
                class="absolute top-1 right-1 text-[10px] leading-none opacity-60"
              >▶</span>
            </button>
          </template>
          <div
            v-if="isDropBefore(track.id, track.patterns.length)"
            class="w-0.5 h-14 flex-shrink-0 rounded-full bg-white/80 self-center pointer-events-none"
            aria-hidden="true"
          ></div>

          <div v-if="!track.patterns.length" class="text-xs text-muted-dim px-2 py-4">No patterns</div>
        </div>
      </div>

      <div v-if="!tracks.length" class="text-sm text-muted-dim px-2 py-4">No tracks yet</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onUnmounted } from 'vue';
import {
  LIVE_LAUNCH_MODES,
  isPatternPlaying,
  isPatternQueued,
  isTrackStopQueued,
  patternLoopEndBeat,
  patternStepsLabel,
} from '../models/project.js';
import { isTrackHoldAudible, isTrackHoldMuted } from '../engine/liveLauncher.js';
import { shade } from '../utils/color.js';
import { useAbsolutePlayheadBeat } from '../composables/usePlayheadBeat.js';
import SongMenu from './SongMenu.vue';
import SettingsToolbarButton from './SettingsToolbarButton.vue';
import ViewToggleButton from './ViewToggleButton.vue';
import TransportToolbar from './TransportToolbar.vue';

const props = defineProps({
  songs: { type: Array, default: () => [] },
  activeSongId: String,
  tracks: { type: Array, required: true },
  playing: Boolean,
  bpm: Number,
  syncMode: { type: String, default: 'internal' },
  clockInputId: { type: String, default: '' },
  sendMidiClock: Boolean,
  clockOutputId: { type: String, default: '' },
  midiInputs: { type: Array, default: () => [] },
  midiOutputs: { type: Array, default: () => [] },
  compactNavbar: { type: Boolean, default: false },
});

const emit = defineEmits([
  'toggle-play',
  'bpm-change',
  'sync-mode-change',
  'clock-input-change',
  'toggle-clock',
  'clock-output-change',
  'compact-navbar-change',
  'view-mode-change',
  'trigger-pattern',
  'hold-pattern-down',
  'hold-pattern-up',
  'edit-pattern',
  'reorder-patterns',
  'select-song',
  'update-song',
  'create-song',
  'save-song-file',
  'load-song-file',
  'load-song-file-error',
]);

const absBeat = useAbsolutePlayheadBeat();

const CLICK_DRAG_THRESHOLD_PX = 5;
const drag = ref(null);
let suppressNextClick = false;
let holdPointerId = null;

function isHoldTrack(track) {
  return track?.liveLaunchMode === LIVE_LAUNCH_MODES.HOLD;
}

function onClipPointerDown(e, track, fromIndex, patternId) {
  if (e.button !== 0) return;

  if (isHoldTrack(track)) {
    holdPointerId = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    suppressNextClick = true;
    emit('hold-pattern-down', track.id, patternId);
    return;
  }

  e.currentTarget.setPointerCapture(e.pointerId);
  drag.value = {
    trackId: track.id,
    fromIndex,
    dropIndex: fromIndex,
    startX: e.clientX,
    startY: e.clientY,
    moved: false,
    pointerId: e.pointerId,
  };
  window.addEventListener('pointermove', onDragMove);
  window.addEventListener('pointerup', onDragEnd);
  window.addEventListener('pointercancel', onDragEnd);
}

function onClipPointerUp(e, track) {
  if (!isHoldTrack(track)) return;
  if (e?.pointerId != null && holdPointerId != null && e.pointerId !== holdPointerId) return;
  holdPointerId = null;
  emit('hold-pattern-up', track.id);
}

function dropIndexFromPoint(clientX, clientY, trackId) {
  const el = document.elementFromPoint(clientX, clientY);
  const clipEl = el?.closest('[data-clip-index]');
  if (clipEl?.dataset.trackId === trackId) {
    const index = Number(clipEl.dataset.clipIndex);
    if (!Number.isNaN(index)) {
      const rect = clipEl.getBoundingClientRect();
      return clientX < rect.left + rect.width / 2 ? index : index + 1;
    }
  }

  const trackRow = el?.closest(`[data-clip-track="${trackId}"]`);
  if (!trackRow) return null;

  const clips = [...trackRow.querySelectorAll('[data-clip-index]')];
  if (!clips.length) return 0;

  const firstRect = clips[0].getBoundingClientRect();
  if (clientX < firstRect.left) return 0;

  const lastRect = clips[clips.length - 1].getBoundingClientRect();
  if (clientX > lastRect.right) return clips.length;

  return null;
}

function onDragMove(e) {
  if (!drag.value || e.pointerId !== drag.value.pointerId) return;

  const dx = e.clientX - drag.value.startX;
  const dy = e.clientY - drag.value.startY;
  if (!drag.value.moved && Math.hypot(dx, dy) < CLICK_DRAG_THRESHOLD_PX) return;

  drag.value.moved = true;
  const nextDrop = dropIndexFromPoint(e.clientX, e.clientY, drag.value.trackId);
  if (nextDrop != null) drag.value.dropIndex = nextDrop;
}

function onDragEnd(e) {
  if (!drag.value || (e?.pointerId != null && e.pointerId !== drag.value.pointerId)) return;

  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);

  const { trackId, fromIndex, dropIndex, moved } = drag.value;
  drag.value = null;

  if (!moved) return;

  suppressNextClick = true;
  let toIndex = dropIndex;
  if (toIndex > fromIndex) toIndex -= 1;
  if (fromIndex !== toIndex) emit('reorder-patterns', trackId, fromIndex, toIndex);
}

function onClipClick(trackId, patternId, launchMode) {
  if (launchMode === LIVE_LAUNCH_MODES.HOLD) {
    suppressNextClick = false;
    return;
  }
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  emit('trigger-pattern', trackId, patternId);
}

function isDropBefore(trackId, index) {
  return drag.value?.moved && drag.value.trackId === trackId && drag.value.dropIndex === index;
}

function clipDragClass(trackId, index) {
  if (!drag.value || drag.value.trackId !== trackId) return '';
  if (drag.value.fromIndex === index && drag.value.moved) return 'opacity-40 scale-95 cursor-grabbing pointer-events-none';
  if (drag.value.moved) return 'cursor-grabbing';
  return 'cursor-grab';
}

onUnmounted(() => {
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  window.removeEventListener('pointercancel', onDragEnd);
});

function clipProgress(pattern) {
  const len = patternLoopEndBeat(pattern);
  if (len <= 0) return 0;
  const wrapped = ((absBeat.value % len) + len) % len;
  return wrapped / len;
}

// 'playing': actually sounding right now. 'stopping': playing, but a click
// has armed the track to go silent once this loop ends (toggle-off).
// 'armed': would start the instant Play is pressed (transport stopped, but
// this is the track's playingPatternId/activePatternId). 'queued': set to
// replace the playing pattern once both loops line up. Kept as one function
// (rather than scattering these same checks across class/style/title) so a
// clip's visual state can never drift out of sync with itself.
function clipStatus(track, pattern) {
  if (isHoldTrack(track)) {
    if (isTrackHoldAudible(track, pattern.id)) return 'playing';
    if (isTrackHoldMuted(track) && track.playingPatternId === pattern.id && track.holdActive) return 'arming';
    return 'idle';
  }

  const isCurrent = isPatternPlaying(track, pattern.id);
  if (isCurrent && props.playing) return isTrackStopQueued(track) ? 'stopping' : 'playing';
  if (isPatternQueued(track, pattern.id)) return 'queued';
  if (isCurrent) return 'armed';
  return 'idle';
}

function clipStateClass(track, pattern) {
  const status = clipStatus(track, pattern);
  if (status === 'playing') return 'ring-2 ring-white/90 shadow-lg';
  if (status === 'arming') return 'ring-2 ring-white/50 animate-pulse';
  if (status === 'stopping') return 'ring-2 ring-red-300/80 animate-pulse';
  if (status === 'queued') return 'ring-2 ring-white/60 animate-pulse';
  if (status === 'armed') return 'ring-2 ring-white/40';
  return 'ring-1 ring-black/20 hover:ring-white/40';
}

function clipStyle(track, pattern) {
  const status = clipStatus(track, pattern);
  const isLit = status === 'playing' || status === 'stopping' || status === 'armed' || status === 'arming';
  const base = pattern.color;
  return {
    background: isLit
      ? `linear-gradient(180deg, ${shade(base, 0.15)}, ${shade(base, -0.15)})`
      : `linear-gradient(180deg, ${shade(base, -0.35)}, ${shade(base, -0.5)})`,
    color: isLit ? shade(base, -0.65) : shade(base, 0.55),
  };
}

function clipTitle(track, pattern) {
  const status = clipStatus(track, pattern);
  if (isHoldTrack(track)) {
    const grid = track.liveSyncGrid ?? '1/16';
    if (status === 'playing') return `${pattern.name} — playing (release to stop)`;
    if (status === 'arming') return `${pattern.name} — syncing to ${grid} grid…`;
    return `${pattern.name} — hold to play in sync (${grid} grid), double-click to edit`;
  }
  if (status === 'playing') return `${pattern.name} — playing (click to stop when it loops)`;
  if (status === 'stopping') return `${pattern.name} — stopping when this loop ends (click again to keep playing)`;
  if (status === 'queued') return `${pattern.name} — queued, launches when the current pattern loops (click again to cancel)`;
  if (status === 'armed') return `${pattern.name} — will play when you press Play (click to un-arm)`;
  return `${pattern.name} — click to launch, drag to reorder, double-click to edit`;
}
</script>

<style scoped>
.clip {
  touch-action: none;
  user-select: none;
}
</style>
