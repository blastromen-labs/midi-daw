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
        <span class="text-[10px] text-muted-dim tabular-nums flex-shrink-0">{{ song.bpm }} BPM</span>
      </div>
      <div class="flex items-center gap-0.5 flex-shrink-0">
        <button
          type="button"
          class="w-7 h-7 rounded text-xs text-muted hover:text-white hover:bg-surface-active disabled:opacity-25 disabled:pointer-events-none"
          :disabled="!canMoveUp"
          @click="emit('move-song', song.id, 'up')"
        >↑</button>
        <button
          type="button"
          class="w-7 h-7 rounded text-xs text-muted hover:text-white hover:bg-surface-active disabled:opacity-25 disabled:pointer-events-none"
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
          class="w-full h-14 px-2 rounded-md text-left text-xs font-medium ring-1 ring-line-light bg-surface/60 hover:ring-white/40 flex items-center gap-1.5"
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
                  @click="onEditScene(scene.id)"
                >
                  {{ scene.name }}
                </button>
                <button
                  type="button"
                  class="w-7 h-7 flex-shrink-0 rounded text-sm text-muted hover:text-white hover:bg-surface-active"
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
          class="relative w-24 h-14 flex-shrink-0"
          @mouseenter="hoveredSceneId = scene.id"
          @mouseleave="hoveredSceneId = null"
        >
          <button
            type="button"
            class="scene-btn absolute inset-0 rounded-md overflow-hidden text-left px-2 py-1 pr-5 text-[11px] font-medium transition-transform active:scale-[0.97]"
            :class="sceneStateClass(scene)"
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
          class="relative flex items-stretch w-36 flex-shrink-0 rounded-md bg-surface/60 overflow-hidden min-h-[2.75rem]"
        >
          <!-- Title centered across the whole track box (sits above HP + mute halves). -->
          <span
            class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none px-5"
            aria-hidden="true"
          >
            <span
              class="truncate text-xs font-semibold text-center max-w-full drop-shadow-[0_1px_1px_rgba(0,0,0,0.65)]"
              :class="cutLowHzByTrack[track.id] != null ? 'text-white' : ''"
            >
              {{ track.name }}
            </span>
          </span>

          <!-- Full-height left HP strip: hold + drag up for cutoff, release = off. -->
          <button
            v-if="track.kind === 'drum' || track.kind === 'multisampler'"
            type="button"
            class="relative z-0 w-1/2 flex-shrink-0 self-stretch flex flex-col items-start justify-start gap-0.5 p-1 text-[9px] font-bold tracking-tight transition-colors select-none touch-none"
            :class="
              cutLowHzByTrack[track.id] != null
                ? 'text-white/90 bg-accent'
                : 'text-muted-dim hover:text-muted hover:bg-surface-active'
            "
            :title="'Tap: latch 500 Hz · hold & drag up: 500–2000 Hz · release after drag clears'"
            :aria-label="`${track.name} high-pass`"
            :aria-pressed="cutLowHzByTrack[track.id] != null"
            @pointerdown.stop="onCutLowPointerDown($event, track.id)"
            @pointermove.stop="onCutLowPointerMove($event, track.id)"
            @pointerup.stop="onCutLowPointerUp($event, track.id)"
            @pointercancel.stop="onCutLowPointerUp($event, track.id)"
            @lostpointercapture="onCutLowLostCapture(track.id)"
          >
            <span>HP</span>
            <span
              v-if="cutLowHzByTrack[track.id] != null"
              class="text-[8px] font-semibold tabular-nums leading-none opacity-90"
            >
              {{ formatCutLowHz(cutLowHzByTrack[track.id]) }}
            </span>
          </button>
          <div
            class="relative z-0 flex flex-col justify-between gap-0.5 flex-1 min-w-0 px-1.5 py-1"
            :class="track.kind === 'drum' || track.kind === 'multisampler' ? '' : 'w-full'"
          >
            <div class="flex items-start justify-end gap-0.5 min-w-0">
              <button
                type="button"
                class="relative z-20 flex items-center justify-center w-5 h-5 flex-shrink-0 rounded hover:bg-surface-active transition-colors"
                :aria-label="`${track.name} mute`"
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
                class="relative z-20 w-5 h-5 flex-shrink-0 rounded text-[11px] leading-none text-muted hover:text-white hover:bg-surface-active"
                @click.stop="emit('edit-track', song.id, track.id)"
              >
                ✎
              </button>
            </div>
            <template v-if="!hideTrackDetails">
              <div class="flex flex-col items-end gap-0 min-w-0">
                <span class="text-[9px] text-muted-dim uppercase tracking-wide truncate max-w-full">
                  {{ track.category }}{{ isHiddenFromLive(track) ? ' · hidden' : '' }}
                </span>
                <span
                  v-if="track.kind === 'midi'"
                  class="text-[9px] tracking-wide truncate max-w-full"
                  :class="trackMidiOutLabel(track) ? 'text-muted' : 'text-muted-dim'"
                >
                  {{ trackMidiOutLabel(track) || 'No MIDI out' }}
                </span>
                <span
                  v-else-if="track.kind === 'multisampler'"
                  class="text-[9px] tracking-wide truncate max-w-full text-muted-dim"
                >
                  Sampler
                </span>
              </div>
            </template>
          </div>
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
import { ref, reactive, computed, nextTick, onUnmounted } from 'vue';
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
import {
  setTrackCutLowHz,
  cutLowHzFromDragPx,
  TRACK_LOW_CUT_TAP_HZ,
} from '../engine/trackLowCut.js';
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

/** Live HP UI: trackId → cutoff Hz while latched or actively dragging. */
const cutLowHzByTrack = reactive({});
/** trackId → { pointerId, startY, dragged, wasLatched } for tap vs drag. */
const cutLowDrag = new Map();
/** Movement past this (px) counts as a drag (release clears); under it = tap latch. */
const CUT_LOW_TAP_SLOP_PX = 10;

function formatCutLowHz(hz) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)}k`;
  return `${Math.round(hz)}`;
}

function engageCutLow(trackId, hz) {
  cutLowHzByTrack[trackId] = hz;
  setTrackCutLowHz(trackId, hz);
}

function releaseCutLow(trackId) {
  delete cutLowHzByTrack[trackId];
  cutLowDrag.delete(trackId);
  setTrackCutLowHz(trackId, null);
}

function endCutLowGesture(trackId) {
  const drag = cutLowDrag.get(trackId);
  if (!drag) return;
  cutLowDrag.delete(trackId);
  if (drag.dragged) {
    // Drag was momentary — clear on release.
    releaseCutLow(trackId);
    return;
  }
  // Tap: toggle latch at 500 Hz (second tap turns it off).
  if (drag.wasLatched) {
    releaseCutLow(trackId);
  } else {
    engageCutLow(trackId, TRACK_LOW_CUT_TAP_HZ);
  }
}

function onCutLowPointerDown(e, trackId) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  cutLowDrag.set(trackId, {
    pointerId: e.pointerId,
    startY: e.clientY,
    dragged: false,
    wasLatched: cutLowHzByTrack[trackId] != null,
  });
  engageCutLow(trackId, TRACK_LOW_CUT_TAP_HZ);
}

function onCutLowPointerMove(e, trackId) {
  const drag = cutLowDrag.get(trackId);
  if (!drag || drag.pointerId !== e.pointerId) return;
  e.preventDefault();
  const dragUpPx = drag.startY - e.clientY;
  if (!drag.dragged && Math.abs(dragUpPx) < CUT_LOW_TAP_SLOP_PX) return;
  drag.dragged = true;
  engageCutLow(trackId, cutLowHzFromDragPx(dragUpPx));
}

function onCutLowPointerUp(e, trackId) {
  const drag = cutLowDrag.get(trackId);
  if (!drag || drag.pointerId !== e.pointerId) return;
  endCutLowGesture(trackId);
}

function onCutLowLostCapture(trackId) {
  if (cutLowDrag.has(trackId)) endCutLowGesture(trackId);
}

/** Green = audible, yellow = soloed, dark = muted. */
function trackMuteSoloLedClass(track) {
  if (track.muted) return 'bg-[#1a2420] ring-line/50';
  if (track.soloed) {
    return 'bg-[#facc15] ring-[#facc15]/50 shadow-[0_0_5px_rgba(250,204,21,0.55)]';
  }
  return 'bg-[#4ade80] ring-[#4ade80]/50 shadow-[0_0_5px_rgba(74,222,128,0.55)]';
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
  for (const trackId of [...cutLowDrag.keys(), ...Object.keys(cutLowHzByTrack)]) {
    releaseCutLow(trackId);
  }
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
