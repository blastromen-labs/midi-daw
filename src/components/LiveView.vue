<template>
  <div class="live-view flex flex-col h-full bg-panel overflow-hidden">
    <!-- Launch grid — one row per track, one clip button per pattern.
         Shared transport/view/song/help/settings live in AppToolbar. -->
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
              @click="onClipClick(track.id, pattern.id, pattern.liveLaunchMode)"
            >
              <span class="block text-[11px] font-medium truncate pr-3">{{ pattern.name }}</span>
              <span class="flex items-center gap-1 min-w-0 mt-0.5 pr-3">
                <span
                  class="text-[8px] font-semibold uppercase tracking-wider opacity-80 flex-shrink-0"
                  :title="launchModeLabel(pattern)"
                >{{ launchModeShort(pattern) }}</span>
                <span class="text-[9px] opacity-60 truncate">{{ patternStepsLabel(pattern.patternSteps) }}</span>
              </span>

              <span
                v-if="clipStatus(track, pattern) === 'playing' || clipStatus(track, pattern) === 'stopping' || clipStatus(track, pattern) === 'arming' || clipStatus(track, pattern) === 'queued'"
                class="absolute left-0 bottom-0 h-0.5 bg-white/80"
                :style="{ width: clipProgress(track, pattern) * 100 + '%' }"
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
  getLiveLaunch,
  isPatternPlaying,
  isPatternQueued,
  isPatternStopQueued,
  patternLaunchMode,
  patternLoopEndBeat,
  patternStepsLabel,
} from '../models/project.js';
import { isTrackHoldAudible, isTrackHoldMuted } from '../engine/liveLauncher.js';
import { shade } from '../utils/color.js';
import { useAbsolutePlayheadBeat } from '../composables/usePlayheadBeat.js';
const props = defineProps({
  tracks: { type: Array, required: true },
  playing: Boolean,
});

const emit = defineEmits([
  'trigger-pattern',
  'hold-pattern-down',
  'hold-pattern-up',
  'reorder-patterns',
]);

const absBeat = useAbsolutePlayheadBeat();

const CLICK_DRAG_THRESHOLD_PX = 5;
const drag = ref(null);
let suppressNextClick = false;
let holdPointerId = null;

function isHoldPattern(pattern) {
  return patternLaunchMode(pattern) === LIVE_LAUNCH_MODES.HOLD;
}

function launchModeShort(pattern) {
  const mode = patternLaunchMode(pattern);
  if (mode === LIVE_LAUNCH_MODES.HOLD) return 'Hold';
  if (mode === LIVE_LAUNCH_MODES.ONE_SHOT) return '1-Shot';
  return 'Loop';
}

function launchModeLabel(pattern) {
  const mode = patternLaunchMode(pattern);
  if (mode === LIVE_LAUNCH_MODES.HOLD) return 'Hold — press and hold to play';
  if (mode === LIVE_LAUNCH_MODES.ONE_SHOT) return 'One Shot — plays once';
  return 'Loop — toggles on/off';
}

function onClipPointerDown(e, track, fromIndex, patternId) {
  if (e.button !== 0) return;

  const pattern = track.patterns?.find((p) => p.id === patternId);
  if (isHoldPattern(pattern)) {
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
  // Release whatever Hold gesture we started — launch mode is per pattern, so
  // don't key off the track (a sibling clip may be Loop / One Shot).
  if (holdPointerId == null) return;
  if (e?.pointerId != null && e.pointerId !== holdPointerId) return;
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

function clipProgress(track, pattern) {
  const len = patternLoopEndBeat(pattern);
  if (len <= 0) return 0;
  // One Shot progress is relative to its launch origin (always starts at 0).
  if (patternLaunchMode(pattern) === LIVE_LAUNCH_MODES.ONE_SHOT) {
    const launch = getLiveLaunch(track, pattern.id);
    const pending = track.pendingLaunches?.find((p) => p.patternId === pattern.id);
    const origin = launch?.startBeat ?? pending?.launchBeat;
    if (origin == null) return 0;
    return Math.min(1, Math.max(0, (absBeat.value - origin) / len));
  }
  const wrapped = ((absBeat.value % len) + len) % len;
  return wrapped / len;
}

// 'playing': actually sounding right now. 'stopping': playing, but a click
// has armed this clip to stop once its loop ends (toggle-off).
// 'armed': would start the instant Play is pressed (transport stopped).
// 'queued': waiting to launch at the next quantize boundary. Kept as one
// function so a clip's visual state can never drift out of sync with itself.
function clipStatus(track, pattern) {
  if (isHoldPattern(pattern)) {
    if (isTrackHoldAudible(track, pattern.id)) return 'playing';
    if (isTrackHoldMuted(track, pattern.id)) return 'arming';
    return 'idle';
  }

  // Queued first so a One Shot retrigger shows as queued while the current
  // playthrough is still audible.
  if (isPatternQueued(track, pattern.id)) return 'queued';

  const isCurrent = isPatternPlaying(track, pattern.id);
  if (isCurrent && props.playing) {
    // One Shot always has an auto-stop at the end of the shot — that's normal
    // play, not a user toggle-off, so keep the "playing" look.
    if (
      isPatternStopQueued(track, pattern.id) &&
      patternLaunchMode(pattern) !== LIVE_LAUNCH_MODES.ONE_SHOT
    ) {
      return 'stopping';
    }
    return 'playing';
  }
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
  const mode = patternLaunchMode(pattern);
  if (mode === LIVE_LAUNCH_MODES.HOLD) {
    const grid = pattern.liveSyncGrid ?? '1/16';
    if (status === 'playing') return `${pattern.name} — playing (release to stop)`;
    if (status === 'arming') return `${pattern.name} — syncing to ${grid} grid…`;
    return `${pattern.name} — hold to play in sync (${grid} grid)`;
  }
  if (mode === LIVE_LAUNCH_MODES.ONE_SHOT) {
    const grid = pattern.liveSyncGrid ?? '1/16';
    if (status === 'playing') return `${pattern.name} — playing once (click to retrigger from the start)`;
    if (status === 'queued') return `${pattern.name} — queued one shot on ${grid} grid (starts from beginning; click again to cancel)`;
    if (status === 'armed') return `${pattern.name} — will play once when you press Play (click to un-arm)`;
    return `${pattern.name} — click to play once from the start (${grid} grid), drag to reorder`;
  }
  if (status === 'playing') return `${pattern.name} — playing (click to stop when it loops)`;
  if (status === 'stopping') return `${pattern.name} — stopping when this loop ends (click again to keep playing)`;
  if (status === 'queued') return `${pattern.name} — queued, launches when the current pattern loops (click again to cancel)`;
  if (status === 'armed') return `${pattern.name} — will play when you press Play (click to un-arm)`;
  return `${pattern.name} — click to launch, drag to reorder`;
}
</script>

<style scoped>
.clip {
  touch-action: none;
  user-select: none;
}
</style>
