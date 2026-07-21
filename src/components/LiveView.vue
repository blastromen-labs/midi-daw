<template>
  <div class="live-view flex flex-col h-full bg-panel overflow-hidden">
    <!-- Scenes — batch-launch shortcuts for patterns assigned via Edit pattern. -->
    <div class="flex items-stretch gap-2 px-2 pt-2 pb-1 border-b border-line/60 flex-shrink-0">
      <div class="relative flex items-center w-36 flex-shrink-0" ref="sceneMenuRootRef">
        <button
          ref="sceneMenuTriggerRef"
          type="button"
          class="w-full h-9 px-2 rounded-md text-left text-xs font-medium ring-1 ring-line-light bg-surface/60 hover:ring-white/40 flex items-center gap-1.5"
          title="Edit or create scenes"
          @click="toggleSceneMenu"
        >
          <span class="truncate flex-1 min-w-0 uppercase tracking-wider text-muted-dim text-[10px] font-semibold">Scenes</span>
          <span class="text-[9px] text-muted-dim flex-shrink-0">▾</span>
        </button>

        <Teleport to="body">
          <div
            v-if="sceneMenuOpen"
            ref="sceneMenuPanelRef"
            class="fixed z-50 w-56 bg-panel border border-line rounded-md shadow-lg overflow-hidden"
            :style="sceneMenuStyle"
          >
            <div class="max-h-64 overflow-y-auto py-1">
              <div
                v-for="scene in scenes"
                :key="scene.id"
                class="flex items-center gap-1 px-1 hover:bg-surface-hover"
              >
                <button
                  type="button"
                  class="flex-1 min-w-0 text-left text-xs px-1.5 py-1.5 truncate"
                  :title="`Edit ${scene.name}`"
                  @click="onEditScene(scene.id)"
                >
                  {{ scene.name }}
                </button>
                <button
                  type="button"
                  class="w-7 h-7 flex-shrink-0 rounded text-sm text-muted hover:text-white hover:bg-surface-active"
                  title="Edit scene"
                  @click="onEditScene(scene.id)"
                >
                  ✎
                </button>
              </div>
              <div v-if="!scenes.length" class="px-2 py-2 text-xs text-muted-dim">
                No scenes yet
              </div>
            </div>
            <div class="border-t border-line">
              <button
                type="button"
                class="w-full text-left text-xs px-2 py-1.5 hover:bg-surface-hover text-muted hover:text-white"
                title="Add scene"
                @click="onAddScene"
              >
                + New Scene
              </button>
            </div>
          </div>
        </Teleport>
      </div>

      <div class="flex flex-wrap gap-1.5 flex-1 content-start min-w-0">
        <button
          v-for="scene in scenes"
          :key="scene.id"
          type="button"
          class="scene-btn relative h-9 min-w-[5.5rem] px-3 pr-5 rounded-md text-left text-xs font-medium transition-transform active:scale-[0.97]"
          :class="sceneStateClass(scene)"
          :title="sceneTitle(scene)"
          @click="emit('launch-scene', scene.id)"
        >
          <span class="block truncate">{{ scene.name }}</span>
          <span
            v-if="sceneStatus(scene) === 'playing'"
            class="absolute top-1 right-1 text-[10px] leading-none"
          >▶</span>
          <span
            v-else-if="sceneStatus(scene) === 'queued'"
            class="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white animate-pulse"
          ></span>
          <span
            v-else-if="sceneStatus(scene) === 'armed'"
            class="absolute top-1 right-1 text-[10px] leading-none opacity-60"
          >▶</span>
        </button>
        <p
          v-if="!scenes.length"
          class="text-[10px] text-muted-dim self-center px-1"
        >
          Open Scenes ▾ to create one, then assign patterns in Edit pattern
        </p>
      </div>
    </div>

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
import { ref, nextTick, onUnmounted } from 'vue';
import {
  LIVE_LAUNCH_MODES,
  getLiveLaunch,
  getScenePatternRefs,
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
  scenes: { type: Array, default: () => [] },
  playing: Boolean,
});

const emit = defineEmits([
  'trigger-pattern',
  'hold-pattern-down',
  'hold-pattern-up',
  'reorder-patterns',
  'launch-scene',
  'add-scene',
  'edit-scene',
]);

const absBeat = useAbsolutePlayheadBeat();

const sceneMenuOpen = ref(false);
const sceneMenuRootRef = ref(null);
const sceneMenuTriggerRef = ref(null);
const sceneMenuPanelRef = ref(null);
const sceneMenuStyle = ref({});

const CLICK_DRAG_THRESHOLD_PX = 5;
const drag = ref(null);
let suppressNextClick = false;
let holdPointerId = null;

function updateSceneMenuPosition() {
  const el = sceneMenuTriggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  sceneMenuStyle.value = { top: rect.bottom + 4 + 'px', left: rect.left + 'px' };
}

function toggleSceneMenu() {
  sceneMenuOpen.value = !sceneMenuOpen.value;
  if (sceneMenuOpen.value) nextTick(updateSceneMenuPosition);
}

function onAddScene() {
  sceneMenuOpen.value = false;
  emit('add-scene');
}

function onEditScene(sceneId) {
  sceneMenuOpen.value = false;
  emit('edit-scene', sceneId);
}

function onSceneMenuPointerDown(e) {
  if (!sceneMenuOpen.value) return;
  const insideTrigger = sceneMenuRootRef.value?.contains(e.target);
  const insidePanel = sceneMenuPanelRef.value?.contains(e.target);
  if (!insideTrigger && !insidePanel) sceneMenuOpen.value = false;
}

function onSceneMenuWindowChange() {
  if (sceneMenuOpen.value) updateSceneMenuPosition();
}

function onSceneMenuKeyDown(e) {
  if (sceneMenuOpen.value && e.key === 'Escape') sceneMenuOpen.value = false;
}

window.addEventListener('mousedown', onSceneMenuPointerDown);
window.addEventListener('touchstart', onSceneMenuPointerDown);
window.addEventListener('scroll', onSceneMenuWindowChange, true);
window.addEventListener('resize', onSceneMenuWindowChange);
window.addEventListener('keydown', onSceneMenuKeyDown);

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

function sceneLaunchableRefs(scene) {
  return getScenePatternRefs(props.tracks, scene.id).filter(
    ({ pattern }) => patternLaunchMode(pattern) !== LIVE_LAUNCH_MODES.HOLD
  );
}

function sceneStatus(scene) {
  const refs = sceneLaunchableRefs(scene);
  if (!refs.length) return 'empty';

  let playingCount = 0;
  let queuedCount = 0;
  let armedCount = 0;
  for (const { track, pattern } of refs) {
    if (isPatternQueued(track, pattern.id)) {
      queuedCount += 1;
      continue;
    }
    if (isPatternPlaying(track, pattern.id)) {
      if (props.playing) playingCount += 1;
      else armedCount += 1;
    }
  }

  if (queuedCount > 0) return 'queued';
  if (playingCount > 0 && playingCount === refs.length) return 'playing';
  if (armedCount > 0 && armedCount === refs.length) return 'armed';
  if (playingCount > 0 || armedCount > 0) return 'partial';
  return 'idle';
}

function sceneStateClass(scene) {
  const status = sceneStatus(scene);
  if (status === 'playing') return 'ring-2 ring-white/90 bg-accent/80 text-white';
  if (status === 'queued') return 'ring-2 ring-white/60 animate-pulse bg-accent/50 text-white';
  if (status === 'armed') return 'ring-2 ring-white/40 bg-accent/40 text-white';
  if (status === 'partial') return 'ring-1 ring-white/40 bg-surface text-white';
  if (status === 'empty') return 'ring-1 ring-line-light bg-surface/40 text-muted';
  return 'ring-1 ring-line-light bg-surface hover:ring-white/40 text-white';
}

function sceneTitle(scene) {
  const refs = sceneLaunchableRefs(scene);
  const status = sceneStatus(scene);
  if (!refs.length) {
    return `${scene.name} — no Loop / One Shot patterns assigned (edit a pattern → Scene)`;
  }
  const names = refs.map(({ pattern }) => pattern.name).join(', ');
  if (status === 'playing') return `${scene.name} — playing (${names})`;
  if (status === 'queued') return `${scene.name} — queued (${names})`;
  if (status === 'armed') return `${scene.name} — armed, will play on Play (${names})`;
  return `${scene.name} — launch ${refs.length} pattern${refs.length === 1 ? '' : 's'}: ${names}`;
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
  window.removeEventListener('mousedown', onSceneMenuPointerDown);
  window.removeEventListener('touchstart', onSceneMenuPointerDown);
  window.removeEventListener('scroll', onSceneMenuWindowChange, true);
  window.removeEventListener('resize', onSceneMenuWindowChange);
  window.removeEventListener('keydown', onSceneMenuKeyDown);
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
.clip,
.scene-btn {
  touch-action: none;
  user-select: none;
}
</style>
