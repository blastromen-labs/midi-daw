<template>
  <!-- shrink-0: never compress a tall song — LiveView scrolls instead. -->
  <section class="song-live-block flex flex-col shrink-0 border border-line/50 rounded-md overflow-hidden bg-surface/20">
    <!-- Song header — name, tempo hint, reorder within the Live set. -->
    <div class="flex items-center gap-2 px-2 py-1.5 border-b border-line/50 bg-surface/40">
      <span
        class="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-line/60"
        :style="{ background: song.color || '#6699ff' }"
      ></span>
      <div class="flex-1 min-w-0 flex items-baseline gap-2">
        <span class="truncate text-sm font-semibold">{{ song.name }}</span>
        <span
          class="text-[10px] text-muted-dim tabular-nums flex-shrink-0"
          :title="`Written at ${song.bpm} BPM — Live mix follows the transport tempo`"
        >{{ song.bpm }} BPM</span>
      </div>
      <div class="flex items-center gap-0.5 flex-shrink-0">
        <button
          type="button"
          class="w-7 h-7 rounded text-xs text-muted hover:text-white hover:bg-surface-active disabled:opacity-25 disabled:pointer-events-none"
          title="Move song up in Live view"
          :disabled="!canMoveUp"
          @click="emit('move-song', song.id, 'up')"
        >↑</button>
        <button
          type="button"
          class="w-7 h-7 rounded text-xs text-muted hover:text-white hover:bg-surface-active disabled:opacity-25 disabled:pointer-events-none"
          title="Move song down in Live view"
          :disabled="!canMoveDown"
          @click="emit('move-song', song.id, 'down')"
        >↓</button>
      </div>
    </div>

    <!-- Scenes — batch-launch shortcuts for this song only. -->
    <div class="flex items-stretch gap-2 px-2 pt-2 pb-1 border-b border-line/40 flex-shrink-0">
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
        <!-- Wrapper keeps edit pen a sibling of the scene button (no nested <button>). -->
        <div
          v-for="scene in scenes"
          :key="scene.id"
          class="relative h-9 min-w-[5.5rem] flex-shrink-0"
          @mouseenter="hoveredSceneId = scene.id"
          @mouseleave="hoveredSceneId = null"
        >
          <button
            type="button"
            class="scene-btn absolute inset-0 px-3 pr-5 rounded-md text-left text-xs font-medium transition-transform active:scale-[0.97]"
            :class="sceneStateClass(scene)"
            :title="sceneTitle(scene)"
            @click="emit('launch-scene', song.id, scene.id)"
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
          <button
            v-if="editMode"
            type="button"
            class="absolute bottom-0.5 right-0.5 z-[2] w-5 h-5 rounded text-[11px] leading-none bg-black/35 text-white/90 hover:bg-black/55 hover:text-white"
            title="Edit scene"
            @click.stop="emit('edit-scene', song.id, scene.id)"
          >
            ✎
          </button>
        </div>
        <p
          v-if="!scenes.length"
          class="text-[10px] text-muted-dim self-center px-1"
        >
          Open Scenes ▾ to create one, then assign patterns (a pattern can be in many scenes)
        </p>
      </div>
    </div>

    <!-- Launch grid — one row per track, one clip button per pattern. -->
    <div class="p-2">
      <div
        v-for="track in visibleTracks"
        :key="track.id"
        class="flex items-stretch gap-2 mb-2 last:mb-0"
        :class="isHiddenFromLive(track) ? 'opacity-55' : ''"
      >
        <div
          class="flex flex-col justify-center gap-0.5 w-36 flex-shrink-0 px-2 py-1.5 rounded-md bg-surface/60"
        >
          <div class="flex items-center gap-1 min-w-0">
            <span class="w-2 h-2 rounded-sm flex-shrink-0" :style="{ background: track.color }"></span>
            <span class="truncate text-xs font-semibold flex-1 min-w-0">{{ track.name }}</span>
            <button
              type="button"
              class="flex items-center justify-center w-5 h-5 flex-shrink-0 rounded hover:bg-surface-active transition-colors"
              :title="trackMuteSoloTitle(track)"
              @click.stop="emit('toggle-track-mute', song.id, track.id)"
              @contextmenu.prevent.stop="emit('toggle-track-solo', song.id, track.id)"
            >
              <span
                class="w-2 h-2 rounded-full ring-1 transition-all pointer-events-none"
                :class="trackMuteSoloLedClass(track)"
                aria-hidden="true"
              ></span>
            </button>
            <button
              v-if="editMode"
              type="button"
              class="w-5 h-5 flex-shrink-0 rounded text-[11px] leading-none text-muted hover:text-white hover:bg-surface-active"
              title="Edit track"
              @click.stop="emit('edit-track', song.id, track.id)"
            >
              ✎
            </button>
          </div>
          <template v-if="!hideTrackDetails">
            <span class="text-[9px] text-muted-dim uppercase tracking-wide">
              {{ track.category }}{{ isHiddenFromLive(track) ? ' · hidden' : '' }}
            </span>
            <span
              v-if="track.kind === 'midi'"
              class="text-[9px] tracking-wide truncate"
              :class="trackMidiOutLabel(track) ? 'text-muted' : 'text-muted-dim'"
              :title="trackMidiOutTitle(track)"
            >
              {{ trackMidiOutLabel(track) || 'No MIDI out' }}
            </span>
            <span
              v-else-if="track.kind === 'multisampler'"
              class="text-[9px] tracking-wide truncate text-muted-dim"
              title="Multi-sampler — local pitched samples"
            >
              Sampler
            </span>
          </template>
        </div>

        <div class="flex flex-wrap gap-1.5 flex-1 content-start relative" :data-clip-track="track.id">
          <template v-for="{ pattern, index } in visiblePatternEntries(track)" :key="pattern.id">
            <div
              v-if="isDropBefore(track.id, index)"
              class="w-0.5 h-14 flex-shrink-0 rounded-full bg-white/80 self-center pointer-events-none"
              aria-hidden="true"
            ></div>
            <!-- Wrapper keeps edit pen a sibling of the clip button (no nested <button>). -->
            <div class="relative w-24 h-14 flex-shrink-0">
              <button
                type="button"
                class="clip absolute inset-0 rounded-md overflow-hidden text-left px-2 py-1 transition-[transform,opacity,filter] active:scale-[0.97]"
                :class="[
                  clipStateClass(track, pattern),
                  clipDragClass(track.id, index),
                  isHiddenFromLive(pattern) && !isHiddenFromLive(track) ? 'opacity-55' : '',
                  sceneHoverClipClass(pattern),
                ]"
                :style="clipStyle(track, pattern)"
                :title="clipTitle(track, pattern)"
                :data-track-id="track.id"
                :data-clip-index="index"
                @pointerdown="onClipPointerDown($event, track, index, pattern.id)"
                @pointerup="onClipPointerUp($event)"
                @pointercancel="onClipPointerCancel($event)"
                @contextmenu.prevent
                @click="onClipClick(track.id, pattern.id, pattern.liveLaunchMode)"
              >
                <span class="relative z-[1] block text-[11px] font-medium truncate pr-3">{{ pattern.name }}</span>
                <span
                  v-if="!hidePatternLaunchMode || !hidePatternBarLength"
                  class="relative z-[1] flex items-center gap-1 min-w-0 mt-0.5 pr-3"
                >
                  <span
                    v-if="!hidePatternLaunchMode"
                    class="text-[8px] font-semibold uppercase tracking-wider opacity-80 flex-shrink-0"
                    :title="launchModeLabel(pattern)"
                  >{{ launchModeShort(pattern) }}</span>
                  <span
                    v-if="!hidePatternBarLength"
                    class="text-[9px] opacity-60 truncate"
                  >{{ patternStepsLabel(pattern.patternSteps) }}</span>
                </span>

                <span
                  v-if="clipStatus(track, pattern) === 'playing'"
                  class="absolute top-1 right-1 z-[1] text-[10px] leading-none"
                >▶</span>
                <span
                  v-else-if="clipStatus(track, pattern) === 'stopping'"
                  class="absolute top-1 right-1 z-[1] w-1.5 h-1.5 rounded-full bg-red-300 animate-pulse"
                ></span>
                <span
                  v-else-if="clipStatus(track, pattern) === 'queued'"
                  class="absolute top-1 right-1 z-[1] w-1.5 h-1.5 rounded-full bg-white animate-pulse"
                ></span>
                <span
                  v-else-if="clipStatus(track, pattern) === 'arming'"
                  class="absolute top-1 right-1 z-[1] w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse"
                ></span>
                <span
                  v-else-if="clipStatus(track, pattern) === 'armed'"
                  class="absolute top-1 right-1 z-[1] text-[10px] leading-none opacity-60"
                >▶</span>
              </button>

              <div
                v-if="editMode"
                class="absolute bottom-0.5 right-0.5 z-[2] flex items-center gap-0.5"
              >
                <button
                  type="button"
                  class="w-5 h-5 rounded flex items-center justify-center bg-black/35 text-white/90 hover:bg-black/55 hover:text-white"
                  title="Edit notes in piano roll"
                  @pointerdown.stop
                  @pointerup.stop
                  @click.stop="emit('open-pattern-roll', song.id, track.id, pattern.id)"
                >
                  <svg viewBox="0 0 16 12" class="w-3 h-2.5" aria-hidden="true">
                    <rect x="0.5" y="0.5" width="15" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1" />
                    <path
                      fill="currentColor"
                      d="M3 1h2v6H3zm4 0h2v6H7zm4 0h2v6h-2z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  class="w-5 h-5 rounded text-[11px] leading-none bg-black/35 text-white/90 hover:bg-black/55 hover:text-white"
                  title="Edit pattern"
                  @pointerdown.stop
                  @pointerup.stop
                  @click.stop="emit('edit-pattern', song.id, track.id, pattern.id)"
                >
                  ✎
                </button>
              </div>
            </div>
          </template>
          <div
            v-if="isDropBefore(track.id, dropEndIndex(track))"
            class="w-0.5 h-14 flex-shrink-0 rounded-full bg-white/80 self-center pointer-events-none"
            aria-hidden="true"
          ></div>

          <div v-if="!visiblePatternEntries(track).length" class="text-xs text-muted-dim px-2 py-4">
            {{ track.patterns?.length ? 'No visible patterns' : 'No patterns' }}
          </div>
        </div>
      </div>

      <div v-if="!visibleTracks.length" class="text-sm text-muted-dim px-2 py-2">
        {{ tracks.length ? 'No visible tracks — turn on Show hidden' : 'No tracks yet' }}
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';
import {
  LIVE_LAUNCH_MODES,
  getLiveLaunch,
  getScenePatternRefs,
  isHiddenFromLive,
  isPatternPlaying,
  isPatternQueued,
  isPatternStopQueued,
  patternInScene,
  patternLaunchMode,
  patternLoopEndBeat,
  patternStepsLabel,
} from '../models/project.js';
import { isTrackHoldAudible, isTrackHoldMuted } from '../engine/liveLauncher.js';
import { shade } from '../utils/color.js';
import { useAbsolutePlayheadBeat } from '../composables/usePlayheadBeat.js';
import { useHoldPointer } from '../composables/useHoldPointer.js';

const props = defineProps({
  song: { type: Object, required: true },
  tracks: { type: Array, required: true },
  scenes: { type: Array, default: () => [] },
  /** Scene id last launched via a scene button in this song. */
  activeSceneId: { type: String, default: null },
  playing: Boolean,
  showHidden: { type: Boolean, default: false },
  editMode: { type: Boolean, default: false },
  /** When true, omit bar-length text under clip names. */
  hidePatternBarLength: { type: Boolean, default: false },
  /** When true, omit Loop / Hold / One Shot labels under clip names. */
  hidePatternLaunchMode: { type: Boolean, default: false },
  /** When true, omit category / MIDI / sampler lines on track boxes. */
  hideTrackDetails: { type: Boolean, default: false },
  /** When true, disable drag-reorder of pattern clips (performance lock). */
  lockPatternOrder: { type: Boolean, default: false },
  midiOutputs: { type: Array, default: () => [] },
  canMoveUp: { type: Boolean, default: false },
  canMoveDown: { type: Boolean, default: false },
});

const emit = defineEmits([
  'trigger-pattern',
  'hold-pattern-down',
  'hold-pattern-up',
  'reorder-patterns',
  'launch-scene',
  'add-scene',
  'edit-scene',
  'edit-track',
  'toggle-track-mute',
  'toggle-track-solo',
  'edit-pattern',
  'open-pattern-roll',
  'move-song',
]);

/** Green = audible, yellow = soloed, dark = muted. */
function trackMuteSoloLedClass(track) {
  if (track.muted) return 'bg-[#1a2420] ring-line/50';
  if (track.soloed) {
    return 'bg-[#facc15] ring-[#facc15]/50 shadow-[0_0_5px_rgba(250,204,21,0.55)]';
  }
  return 'bg-[#4ade80] ring-[#4ade80]/50 shadow-[0_0_5px_rgba(74,222,128,0.55)]';
}

function trackMuteSoloTitle(track) {
  const mute = track.muted ? 'Unmute' : 'Mute';
  const solo = track.soloed ? 'Unsolo' : 'Solo';
  return `${mute} ${track.name} (click) · ${solo} (right-click)`;
}

const absBeat = useAbsolutePlayheadBeat();

const visibleTracks = computed(() =>
  props.tracks.filter((track) => props.showHidden || !isHiddenFromLive(track))
);

function midiOutputName(outputId) {
  if (!outputId) return '';
  return props.midiOutputs.find((d) => d.id === outputId)?.name ?? '';
}

/** Compact device line for the track box (channel included when connected). */
function trackMidiOutLabel(track) {
  const name = midiOutputName(track.midiOutputId);
  if (!name) return track.midiOutputId ? 'Missing device' : '';
  const ch = (track.midiChannel ?? 0) + 1;
  return `${name} · ch ${ch}`;
}

function trackMidiOutTitle(track) {
  const name = midiOutputName(track.midiOutputId);
  const ch = (track.midiChannel ?? 0) + 1;
  if (!track.midiOutputId) return 'Not connected to a MIDI output';
  if (!name) return `MIDI output unavailable (ch ${ch})`;
  return `${name} — MIDI channel ${ch}`;
}

function visiblePatternEntries(track) {
  const patterns = track?.patterns ?? [];
  return patterns
    .map((pattern, index) => ({ pattern, index }))
    .filter(({ pattern }) => props.showHidden || !isHiddenFromLive(pattern));
}

function dropEndIndex(track) {
  const entries = visiblePatternEntries(track);
  if (!entries.length) return 0;
  return entries[entries.length - 1].index + 1;
}

const sceneMenuOpen = ref(false);
const sceneMenuRootRef = ref(null);
const sceneMenuTriggerRef = ref(null);
const sceneMenuPanelRef = ref(null);
const sceneMenuStyle = ref({});
/** Scene id under the pointer — used to preview which clips belong to it. */
const hoveredSceneId = ref(null);

const CLICK_DRAG_THRESHOLD_PX = 5;
const drag = ref(null);
let suppressNextClick = false;

const holdPointer = useHoldPointer({
  isStillMuted: (payload) => {
    const track = props.tracks.find((t) => t.id === payload.trackId);
    return isTrackHoldMuted(track, payload.patternId);
  },
  onDown: (payload) => {
    suppressNextClick = true;
    emit('hold-pattern-down', props.song.id, payload.trackId, payload.patternId);
  },
  onUp: (payload) => {
    emit('hold-pattern-up', props.song.id, payload.trackId);
  },
});

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
  emit('add-scene', props.song.id);
}

function onEditScene(sceneId) {
  sceneMenuOpen.value = false;
  emit('edit-scene', props.song.id, sceneId);
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
  if (mode === LIVE_LAUNCH_MODES.HOLD) {
    return 'Hold — press and hold to play (tap toggles on tablet / extended display)';
  }
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
  if (scene.id !== props.activeSceneId) return 'idle';

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

/** Highlight scene members / dim others while a scene button is hovered. */
function sceneHoverClipClass(pattern) {
  if (!hoveredSceneId.value) return '';
  return patternInScene(pattern, hoveredSceneId.value)
    ? 'scene-hover-member'
    : 'scene-hover-dim';
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
    holdPointer.onPointerDown(e, {
      key: `${track.id}:${patternId}`,
      payload: { trackId: track.id, patternId },
      captureTarget: e.currentTarget,
    });
    return;
  }

  // Locked while performing: taps still launch via click; no drag-reorder.
  if (props.lockPatternOrder) return;

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

function onClipPointerUp(e) {
  holdPointer.onElementPointerUp(e);
}

function onClipPointerCancel(e) {
  holdPointer.onElementPointerCancel(e);
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
  if (clientX < firstRect.left) return Number(clips[0].dataset.clipIndex) || 0;

  const lastClip = clips[clips.length - 1];
  const lastRect = lastClip.getBoundingClientRect();
  if (clientX > lastRect.right) {
    const lastIndex = Number(lastClip.dataset.clipIndex);
    return Number.isNaN(lastIndex) ? clips.length : lastIndex + 1;
  }

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
  if (fromIndex !== toIndex) emit('reorder-patterns', props.song.id, trackId, fromIndex, toIndex);
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
  emit('trigger-pattern', props.song.id, trackId, patternId);
}

function isDropBefore(trackId, index) {
  return drag.value?.moved && drag.value.trackId === trackId && drag.value.dropIndex === index;
}

function clipDragClass(trackId, index) {
  if (props.lockPatternOrder) return '';
  if (!drag.value || drag.value.trackId !== trackId) return '';
  if (drag.value.fromIndex === index && drag.value.moved) return 'opacity-40 scale-95 cursor-grabbing pointer-events-none';
  if (drag.value.moved) return 'cursor-grabbing';
  return 'cursor-grab';
}

onUnmounted(() => {
  holdPointer.dispose();
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
  const launch = getLiveLaunch(track, pattern.id);
  const pending = track.pendingLaunches?.find((p) => p.patternId === pattern.id);
  const origin =
    launch?.startBeat ??
    (pending &&
    (patternLaunchMode(pattern) === LIVE_LAUNCH_MODES.ONE_SHOT || pending.restartFromStart)
      ? pending.launchBeat
      : null);
  if (origin != null) {
    const elapsed = absBeat.value - origin;
    if (patternLaunchMode(pattern) === LIVE_LAUNCH_MODES.ONE_SHOT) {
      return Math.min(1, Math.max(0, elapsed / len));
    }
    return (((elapsed % len) + len) % len) / len;
  }
  const wrapped = ((absBeat.value % len) + len) % len;
  return wrapped / len;
}

function clipStatus(track, pattern) {
  if (isHoldPattern(pattern)) {
    if (isTrackHoldAudible(track, pattern.id)) return 'playing';
    if (isTrackHoldMuted(track, pattern.id)) return 'arming';
    return 'idle';
  }

  if (isPatternQueued(track, pattern.id)) return 'queued';

  const isCurrent = isPatternPlaying(track, pattern.id);
  if (isCurrent && props.playing) {
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
  const showProgress =
    status === 'playing' ||
    status === 'stopping' ||
    status === 'arming' ||
    status === 'queued';
  const isLit = status === 'playing' || status === 'stopping' || status === 'armed' || status === 'arming';
  const base = pattern.color;

  if (showProgress) {
    const p = clipProgress(track, pattern) * 100;
    const played = shade(base, 0.14);
    const remaining = shade(base, -0.42);
    return {
      background: `linear-gradient(90deg, ${played} ${p}%, ${remaining} ${p}%)`,
      color: shade(base, 0.78),
    };
  }

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
  const hiddenNote =
    isHiddenFromLive(pattern) || isHiddenFromLive(track)
      ? ' [hidden from Live — still plays via scenes]'
      : '';
  if (mode === LIVE_LAUNCH_MODES.HOLD) {
    const grid = pattern.liveSyncGrid ?? '1/16';
    if (status === 'playing') {
      return `${pattern.name} — playing (release or tap again to stop)${hiddenNote}`;
    }
    if (status === 'arming') return `${pattern.name} — syncing to ${grid} grid…${hiddenNote}`;
    return `${pattern.name} — hold (or tap) to play in sync (${grid} grid)${hiddenNote}`;
  }
  const reorderHint = props.lockPatternOrder ? '' : ', drag to reorder';
  if (mode === LIVE_LAUNCH_MODES.ONE_SHOT) {
    const grid = pattern.liveSyncGrid ?? '1/16';
    if (status === 'playing') return `${pattern.name} — playing once (click to retrigger from the start)${hiddenNote}`;
    if (status === 'queued') return `${pattern.name} — queued one shot on ${grid} grid (starts from beginning; click again to cancel)${hiddenNote}`;
    if (status === 'armed') return `${pattern.name} — will play once when you press Play (click to un-arm)${hiddenNote}`;
    return `${pattern.name} — click to play once from the start (${grid} grid)${reorderHint}${hiddenNote}`;
  }
  if (status === 'playing') return `${pattern.name} — playing (click to stop when it loops)${hiddenNote}`;
  if (status === 'stopping') return `${pattern.name} — stopping when this loop ends (click again to keep playing)${hiddenNote}`;
  if (status === 'queued') return `${pattern.name} — queued, launches when the current pattern loops (click again to cancel)${hiddenNote}`;
  if (status === 'armed') return `${pattern.name} — will play when you press Play (click to un-arm)${hiddenNote}`;
  return `${pattern.name} — click to launch${reorderHint}${hiddenNote}`;
}
</script>

<style scoped>
.clip,
.scene-btn {
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

/* Outline (not ring) so this doesn't fight playing/queued ring utilities.
   Full opacity so hidden-from-Live members still read clearly in the preview. */
.clip.scene-hover-member {
  outline: 2px solid rgba(255, 255, 255, 0.9);
  outline-offset: 1px;
  filter: brightness(1.12);
  opacity: 1;
  z-index: 1;
}

.clip.scene-hover-dim {
  opacity: 0.3;
  filter: saturate(0.55);
}
</style>
