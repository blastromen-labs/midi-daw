<template>
  <div ref="rootRef" class="piano-roll flex flex-col bg-panel rounded-lg border border-line overflow-hidden h-full">
    <!-- Toolbar — transport, song/track/pattern controls, snap/tools, and view toggle. -->
    <div
      class="daw-toolbar"
      @mousedown="onToolbarMouseDown"
      @touchstart="onToolbarMouseDown"
    >
      <div class="daw-toolbar-primary">
      <!-- Transport -->
      <ToolbarField v-if="syncMode !== 'external'">
        <button
          class="daw-toolbar-icon-btn rounded-full text-xs font-bold transition-all"
          :class="playing ? 'bg-red-600 hover:bg-red-500 text-white' : 'bg-accent hover:bg-accent-dim text-white'"
          :title="playing ? 'Stop' : 'Play'"
          @click="onTogglePlay"
        >
          {{ playing ? '■' : '▶' }}
        </button>
      </ToolbarField>
      <ToolbarField v-if="syncMode !== 'external'" label="BPM">
        <input
          type="number"
          :value="bpm"
          min="40"
          max="300"
          class="toolbar-compact w-[2.5rem] bg-surface border border-line-light rounded text-xs text-center flex-shrink-0"
          title="BPM"
          @change="(e) => $emit('bpm-change', Number(e.target.value))"
        />
      </ToolbarField>
      <ToolbarField v-else label="Sync">
        <span
          class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          :class="playing ? 'bg-green-500 animate-pulse' : 'bg-surface-hover'"
          :title="!clockInputId ? 'External sync — choose input in Settings' : playing ? 'Synced — playing' : 'Waiting for clock…'"
        ></span>
      </ToolbarField>

      <div class="daw-toolbar-divider"></div>

      <!-- Track: selection dropdown, dedicated edit button, and add-new actions (TrackMenu.vue). -->
      <TrackMenu
        :tracks="tracks"
        :active-track-id="activeTrackId"
        :midi-outputs="midiOutputs"
        @select="(id) => $emit('select-track', id)"
        @add-track="(kind, config) => $emit('add-track', kind, config)"
        @update-track="(id, changes) => $emit('update-track', id, changes)"
        @delete-track="(id) => $emit('delete-track', id)"
      />

      <template v-if="activeTrack">
        <div class="daw-toolbar-divider"></div>

        <PatternMenu
          :track="activeTrack"
          :playing="playing"
          :solo-preview="soloPreview"
          :midi-io-enabled="activeTrack.kind === 'midi'"
          @select-pattern="(id) => emit('select-pattern', activeTrackId, id)"
          @add-pattern="(config) => emit('add-pattern', activeTrackId, config)"
          @update-pattern="(id, changes) => emit('update-pattern', activeTrackId, id, changes)"
          @update-track="(changes) => emit('update-track', activeTrackId, changes)"
          @delete-pattern="(id) => emit('delete-pattern', activeTrackId, id)"
          @hold-pattern-down="(id) => emit('hold-pattern-down', activeTrackId, id)"
          @hold-pattern-up="() => emit('hold-pattern-up', activeTrackId)"
          @preview-pattern="(id) => emit('preview-pattern', activeTrackId, id)"
          @import-midi="onImportMidi"
          @export-midi="onExportMidi"
        />

        <GhostSourceControls
          :tracks="tracks"
          :track="activeTrack"
          @change="(changes) => emit('update-track', activeTrackId, changes)"
        />
      </template>

      <div class="daw-toolbar-divider"></div>

      <!-- Note placement -->
      <ToolbarField label="Snap">
        <select v-model="snap" class="text-xs flex-shrink-0 py-0.5" title="Snap">
          <option v-for="s in snapValues" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </ToolbarField>
      <ToolbarField label="Len">
        <select v-model="noteLength" class="text-xs flex-shrink-0 py-0.5" title="Note length — independent of Snap">
          <option v-for="s in snapValues" :key="s.value" :value="s.value">{{ s.label }}</option>
        </select>
      </ToolbarField>

      <div class="daw-toolbar-divider"></div>

      <EditToolBar
        v-model="editTool"
        :has-selection="hasSelection"
        :has-clipboard="hasClipboard"
        @delete-selection="deleteSelectedNotes"
        @select-all="selectAllNotes"
        @copy="copySelection"
        @paste="pasteClipboard"
      />
      </div>

      <div class="daw-toolbar-secondary">
      <ViewToggleButton
        label="Live"
        title="Switch to the Live launch grid (Tab)"
        @click="$emit('view-mode-change', 'live')"
      />

      <SongMenu
        :songs="songs"
        :active-song-id="activeSongId"
        @select="(id) => $emit('select-song', id)"
        @rename="(id, name) => $emit('rename-song', id, name)"
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
        :midi-inputs="midiInputs"
        :midi-outputs="midiOutputs"
        @sync-mode-change="(v) => $emit('sync-mode-change', v)"
        @clock-input-change="(v) => $emit('clock-input-change', v)"
        @toggle-clock="$emit('toggle-clock')"
        @clock-output-change="(v) => $emit('clock-output-change', v)"
      />
      </div>
    </div>

    <!-- Paste position — slim timeline under the toolbar; scrolls with the grid. -->
    <div class="flex flex-shrink-0 border-b border-line bg-surface/90">
      <div
        class="flex-shrink-0 border-r border-line/60 flex items-center"
        :class="isDrumTrack && drumControlsVisible ? 'justify-end px-1' : 'justify-center'"
        :style="{ width: leftGutterWidth + 'px' }"
      >
        <button
          v-if="isDrumTrack"
          type="button"
          class="w-6 h-6 rounded flex items-center justify-center text-muted hover:text-white hover:bg-surface-hover transition-colors flex-shrink-0"
          :title="drumControlsVisible ? 'Hide drum controls' : 'Show drum controls'"
          @click="drumControlsVisible = !drumControlsVisible"
        >
          <svg
            v-if="drumControlsVisible"
            class="w-3.5 h-3.5"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <path d="M10 4L6 8l4 4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <svg
            v-else
            class="w-3.5 h-3.5"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            aria-hidden="true"
          >
            <path d="M6 4l4 4-4 4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
      <div class="flex-1 min-w-0 relative pb-3.5">
        <div
          ref="markerScrollRef"
          class="overflow-x-auto overflow-y-hidden marker-scroll-native-hidden"
          @scroll="onMarkerScroll"
        >
          <div
            ref="markerBarRef"
            class="relative min-h-7 cursor-crosshair select-none touch-none flex items-center"
            :style="{ width: gridWidth + 'px' }"
            title="Click: marker (play/paste) · Double-click drag: set loop · Double-click: clear loop"
            @mousedown="onPasteBarMouseDown"
            @touchstart="onPasteBarTouchStart"
            @touchmove="onPasteBarTouchMove"
            @touchend="onPasteBarTouchEnd"
            @touchcancel="onPasteBarTouchEnd"
            @contextmenu.prevent
          >
            <div
              v-if="activeLoopRegion"
              class="absolute top-0 bottom-0 pointer-events-none bg-accent/20 border-x border-accent/50"
              :style="loopRegionStyle"
            ></div>
            <div class="absolute inset-x-0 top-1/2 h-px bg-line-light pointer-events-none"></div>
            <div
              v-if="showPasteMarker"
              class="absolute top-0 bottom-0 pointer-events-none"
              :style="{ left: beatToX(pasteMarkerBeat) + 'px' }"
            >
              <div class="absolute top-0 bottom-0 left-0 w-px bg-violet-400"></div>
              <div
                class="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[4px] border-r-[4px] border-t-[5px] border-l-transparent border-r-transparent border-t-violet-400"
              ></div>
            </div>
          </div>
        </div>
        <!-- Horizontal scroll under the marker timeline — drives the grid
             directly (scrollRef) so it stays in sync; top placement keeps it
             visible on tablet without reaching the bottom of the roll. -->
        <TouchScrollbar
          v-if="scrollRef"
          :container="scrollRef"
          :content="gridContentRef"
          orientation="horizontal"
        />
      </div>
    </div>

    <!-- Canvas area -->
    <div class="flex flex-1 min-h-0 overflow-hidden relative" ref="containerRef">
      <!-- Piano keys (MIDI tracks) / pad list (drum tracks) -->
      <div
        v-show="!isDrumTrack || drumControlsVisible"
        class="flex-shrink-0 bg-panel border-r border-line"
        :class="isDrumTrack ? 'overflow-x-hidden overflow-y-hidden' : 'overflow-hidden'"
        :style="{ width: keysWidth + 'px' }"
        ref="keysRef"
      >
        <canvas
          v-if="activeTrack && activeTrack.kind !== 'drum'"
          ref="keysCanvas"
          :width="KEY_WIDTH"
          :height="canvasHeight"
          class="block cursor-pointer touch-none"
          @mousedown="onKeyMouseDown"
          @mousemove="onKeyMouseMove"
          @mouseup="stopPreview"
          @mouseleave="stopPreview"
          @touchstart="onKeyTouchStart"
          @touchmove="onKeyTouchMove"
          @touchend="onPreviewTouchEnd"
          @touchcancel="onPreviewTouchEnd"
        ></canvas>
        <div v-else-if="activeTrack" :style="{ height: scrollContentHeight + 'px' }">
          <DrumPadList
            :pads="activeTrack.pads"
            :row-height="rowHeight"
            :track-volume="activeTrack.volume ?? 1"
            @load-sample="onLoadSample"
            @clear-sample="onClearSample"
            @add-pad="onAddPad"
            @remove-pad="onRemovePad"
            @rename-pad="onRenamePad"
            @update-pad="onUpdatePad"
          />
          <div
            class="border-t border-line bg-panel flex items-center justify-center select-none px-2"
            :style="{ height: drumVelocityBlockHeight + 'px' }"
            @mousedown="onVelocityHeaderMouseDown"
            @touchstart="onVelocityHeaderMouseDown"
          >
            <DrumVelocityPadSelect
              v-if="velocityPadId"
              v-model="velocityPadId"
              :pads="activeTrack.pads"
            />
          </div>
        </div>
      </div>

      <!-- Grid — drum velocity is part of scroll content, directly under the last pad row. -->
      <div class="flex flex-1 min-h-0 min-w-0 relative">
        <div
          class="flex-1 min-h-0 overflow-auto overflow-y-hidden-native relative"
          :class="scrollTouchActionClass"
          ref="scrollRef"
          @scroll="onScroll"
          @wheel="onWheel"
          @mousedown="onScrollAreaPointerDown"
          @touchstart="onScrollAreaPointerDown"
        >
          <div
            ref="gridContentRef"
            class="relative"
            :style="{ width: gridWidth + 'px', height: scrollContentHeight + 'px' }"
            @dragenter.capture="onSampleDragEnter"
            @dragover.capture="onSampleDragOver"
            @dragleave.capture="onSampleDragLeave"
            @drop.capture="onSampleDrop"
          >
            <div class="relative" :style="{ width: gridWidth + 'px', height: canvasHeight + 'px' }">
              <canvas
                ref="gridCanvas"
                :width="gridWidth"
                :height="canvasHeight"
                class="absolute top-0 left-0"
                :class="[gridCursorClass, gridTouchActionClass]"
                @mousedown="onMouseDown"
                @mousemove="onCanvasMouseMove"
                @mouseup="onMouseUp"
                @contextmenu="onGridContextMenu"
                @touchstart="onGridTouchStart"
                @touchend="onGridTouchEnd"
                @touchcancel="onGridTouchEnd"
              ></canvas>
              <!-- Cheap overlay redrawn every animation frame; keeps the expensive
                   grid/notes canvas untouched so it never competes with the audio scheduler. -->
              <canvas
                ref="playheadCanvas"
                :width="gridWidth"
                :height="canvasHeight"
                class="absolute top-0 left-0 pointer-events-none"
              ></canvas>
              <div
                v-if="marqueeRect"
                class="absolute border border-accent bg-accent/20 pointer-events-none"
                :style="marqueeStyle"
              ></div>
              <div
                v-if="sampleDropPadId && isDrumTrack"
                class="absolute left-0 right-0 pointer-events-none bg-accent/15 border-y border-accent/40"
                :style="{ top: pitchToY(sampleDropPadId) + 'px', height: rowHeight + 'px' }"
              ></div>
            </div>

            <div
              v-if="isDrumTrack"
              class="border-t border-line bg-panel"
              :style="{ height: drumVelocityBlockHeight + 'px' }"
            >
              <div class="flex h-full w-full">
                <div
                  v-if="!drumControlsVisible"
                  class="flex-shrink-0 border-r border-line bg-panel flex items-center justify-center select-none px-0.5"
                  :style="{ width: DRUM_TOGGLE_STRIP_WIDTH + 'px' }"
                  @mousedown="onVelocityHeaderMouseDown"
                  @touchstart="onVelocityHeaderMouseDown"
                >
                  <DrumVelocityPadSelect
                    v-if="velocityPadId && activeTrack"
                    v-model="velocityPadId"
                    :pads="activeTrack.pads"
                    compact
                  />
                </div>
                <div class="flex flex-col flex-1 min-w-0 h-full">
                  <div
                    class="flex-shrink-0 h-2 bg-line hover:bg-line-light cursor-row-resize flex items-center justify-center transition-colors"
                    title="Drag to resize — click to collapse/expand"
                    @mousedown="onVelocityResizeStart"
                    @touchstart="onVelocityResizeStart"
                  >
                    <div class="flex gap-0.5 pointer-events-none">
                      <span v-for="i in 5" :key="i" class="w-0.5 h-0.5 rounded-full bg-muted-dim"></span>
                    </div>
                  </div>
                  <div
                    v-show="!velocityCollapsed"
                    class="flex-shrink-0 bg-panel flex-1 min-h-0"
                    :style="{ minHeight: drumEmbeddedVelocityLaneHeight + 'px' }"
                  >
                    <VelocityLane
                      v-if="activeTrack"
                      :notes="velocityLaneNotes"
                      :selected-note-ids="selectedNoteIds"
                      :beat-width="beatWidth"
                      :grid-width="gridWidth"
                      :height="drumEmbeddedVelocityLaneHeight"
                      :color="velocityLaneColor"
                      :color-key="velocityLaneColorKey"
                      embedded
                      @update-notes="onVelocityLaneUpdate"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Custom vertical scrollbar, replacing the native one for this
             container — a touch-drag on the grid canvas above draws/edits
             notes rather than panning, and re-styled (::-webkit-scrollbar)
             native scrollbars generally can't be dragged with touch at all,
             only with a mouse. See TouchScrollbar.vue. -->
        <TouchScrollbar :container="scrollRef" :content="gridContentRef" orientation="vertical" />
      </div>
    </div>

    <!-- MIDI velocity — full width below the piano roll -->
    <template v-if="!isDrumTrack">
      <div
        class="flex-shrink-0 h-2 bg-line hover:bg-line-light cursor-row-resize flex items-center justify-center transition-colors"
        title="Drag to resize — click to collapse/expand"
        @mousedown="onVelocityResizeStart"
        @touchstart="onVelocityResizeStart"
      >
        <div class="flex gap-0.5 pointer-events-none">
          <span v-for="i in 5" :key="i" class="w-0.5 h-0.5 rounded-full bg-muted-dim"></span>
        </div>
      </div>

      <div v-show="!velocityCollapsed" class="flex-shrink-0 flex bg-panel" :style="{ height: velocityHeight + 'px' }">
        <div
          class="flex-shrink-0 bg-panel border-r border-t border-line flex items-center justify-center select-none"
          :style="{ width: leftGutterWidth + 'px' }"
          @mousedown="onVelocityHeaderMouseDown"
          @touchstart="onVelocityHeaderMouseDown"
        >
          <span class="text-[10px] font-semibold text-accent tracking-widest vertical-label">VEL</span>
        </div>
        <VelocityLane
          v-if="activeTrack"
          :notes="velocityLaneNotes"
          :selected-note-ids="selectedNoteIds"
          :beat-width="beatWidth"
          :grid-width="gridWidth"
          :height="velocityHeight"
          :color="velocityLaneColor"
          :color-for-note="colorForNote"
          :color-key="velocityLaneColorKey"
          :scroll-left="mainScrollLeft"
          @update-notes="onVelocityLaneUpdate"
        />
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { noteName, SNAP_VALUES, snapBeat, createNote, uid, MIDI_NOTE_COLOR, BEATS_PER_BAR, getActivePattern, getGhostSource, patternLoopEndBeat } from '../models/project.js';
import { usePlayheadBeat } from '../composables/usePlayheadBeat.js';
import { sendNoteOn, sendNoteOff } from '../engine/midi.js';
import {
  downloadMidiFile,
  exportPatternToMidi,
  importPatternFromMidi,
  readMidiFile,
} from '../engine/midiFile.js';
import { loadSampleFile, clearSample, playSample, resumeSamplerAudio } from '../engine/sampler.js';
import { padPlaybackOpts } from '../engine/padPlayback.js';
import { audioFileFromDataTransfer, acceptFileDrag } from '../utils/audioFile.js';
import { shade } from '../utils/color.js';
import { THEME } from '../theme.js';
import VelocityLane from './VelocityLane.vue';
import DrumPadList from './DrumPadList.vue';
import DrumVelocityPadSelect from './DrumVelocityPadSelect.vue';
import TrackMenu from './TrackMenu.vue';
import SongMenu from './SongMenu.vue';
import SettingsToolbarButton from './SettingsToolbarButton.vue';
import ToolbarField from './ToolbarField.vue';
import EditToolBar from './EditToolBar.vue';
import PatternMenu from './PatternMenu.vue';
import GhostSourceControls from './GhostSourceControls.vue';
import ViewToggleButton from './ViewToggleButton.vue';
import TouchScrollbar from './TouchScrollbar.vue';

const PREVIEW_VELOCITY = 100;
const RESIZE_HANDLE_PX = 6;
const TOUCH_RESIZE_HANDLE_PX = 28;
const SELECT_DRAG_THRESHOLD_PX = 8;
const DEFAULT_VELOCITY_HEIGHT = 110;
const MIN_VELOCITY_HEIGHT = 40;
const MAX_VELOCITY_HEIGHT = 280;
const VELOCITY_COLLAPSE_THRESHOLD = 20;
const DEFAULT_NOTE_COLOR = MIDI_NOTE_COLOR;
const NOTE_CORNER_RADIUS = THEME.note.cornerRadius;
const PASTE_MARKER_COLOR = '#b794f6';

const props = defineProps({
  songs: { type: Array, default: () => [] },
  activeSongId: String,
  tracks: { type: Array, required: true },
  activeTrackId: String,
  playing: Boolean,
  midiOutputs: { type: Array, default: () => [] },
  // Transport — merged in here so this toolbar is the app's only nav bar.
  bpm: Number,
  sendMidiClock: Boolean,
  clockOutputId: String,
  syncMode: { type: String, default: 'internal' },
  clockInputId: { type: String, default: '' },
  midiInputs: { type: Array, default: () => [] },
  markerBeat: { type: Number, default: null },
  loopRegion: { type: Object, default: null },
  soloPreview: { type: Object, default: null },
});

const liveBeat = usePlayheadBeat();
const editTool = ref(
  typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
    ? 'multi'
    : 'mobile-multi'
);
const emit = defineEmits([
  'update-notes',
  'select-track',
  'select-pattern',
  'add-pattern',
  'rename-pattern',
  'update-pattern',
  'delete-pattern',
  'add-track',
  'update-pad',
  'add-pad',
  'remove-pad',
  'rename-pad',
  'update-track',
  'delete-track',
  'toggle-play',
  'marker-change',
  'loop-region-change',
  'bpm-change',
  'toggle-clock',
  'clock-output-change',
  'sync-mode-change',
  'clock-input-change',
  'view-mode-change',
  'hold-pattern-down',
  'hold-pattern-up',
  'preview-pattern',
  'select-song',
  'rename-song',
  'create-song',
  'save-song-file',
  'load-song-file',
  'load-song-file-error',
]);

const ROW_HEIGHT = 20;
// Drum pad rows carry a name + sample controls, so they need more vertical
// room than a plain chromatic piano-roll row.
const DRUM_ROW_HEIGHT = 36;
const KEY_WIDTH = 48;
const DRUM_KEYS_WIDTH = 288;
// Narrow strip kept visible when pad controls are collapsed — holds the show/hide toggle.
const DRUM_TOGGLE_STRIP_WIDTH = 32;
const DEFAULT_BEAT_WIDTH = 140;
const MIN_BEAT_WIDTH = 20;
const MAX_BEAT_WIDTH = 400;
const ZOOM_STEP = 1.12;
// Pinch maps finger spread to zoom; 1.0 would be 1:1 (too fast on tablet).
// ~0.4 feels closer to a few wheel ticks per comfortable pinch gesture.
const PINCH_ZOOM_SENSITIVITY = 0.4;
// Touch multi tool pinches a bit slower so zoom stays controllable on phones.
const MOBILE_MULTI_PINCH_SENSITIVITY = 0.28;
const LONG_PRESS_MS = 450;
const DOUBLE_TAP_MS = 280;
// Vertical zoom is a multiplier on top of the base row height (20px MIDI /
// 36px drum) rather than its own pixel range, so it scales sensibly for
// either track kind without a second set of min/max pixel constants.
const MIN_ROW_ZOOM = 0.25;
const MAX_ROW_ZOOM = 3;
const LOW_PITCH = 0;
const HIGH_PITCH = 127;

const snapValues = SNAP_VALUES;
const snap = ref(0.25);
// Independent from `snap` (grid/placement resolution) so you can e.g. place
// 1/32-length notes while snapping their position to a 1/16 grid.
const noteLength = ref(0.25);
// Click-to-stamp duration for new notes only — does not change the Len control.
const stampDuration = ref(null);
const beatWidth = ref(DEFAULT_BEAT_WIDTH);
const rowZoom = ref(1);

const rootRef = ref(null);
const containerRef = ref(null);
const scrollRef = ref(null);
const markerScrollRef = ref(null);
const markerBarRef = ref(null);
const keysRef = ref(null);
const gridContentRef = ref(null);
const gridCanvas = ref(null);
const keysCanvas = ref(null);
const playheadCanvas = ref(null);

const mainScrollLeft = ref(0);
const velocityHeight = ref(DEFAULT_VELOCITY_HEIGHT);
// Collapsed by default so the note grid gets the most room on first load —
// still just a click (or drag) away on the resize handle above it.
const velocityCollapsed = ref(true);
const drumControlsVisible = ref(true);

const gridWidth = computed(() => activeLoopEndBeat.value * beatWidth.value);

const activeTrack = computed(() => props.tracks.find((t) => t.id === props.activeTrackId));
const activePattern = computed(() => getActivePattern(activeTrack.value));
const ghostSource = computed(() => getGhostSource(activeTrack.value, props.tracks));
const ghostPattern = computed(() => ghostSource.value?.pattern ?? null);
const isDrumTrack = computed(() => activeTrack.value?.kind === 'drum');
const activeLoopEndBeat = computed(() => patternLoopEndBeat(activePattern.value));
// Playhead wraps to the active track's pattern length in the piano roll view.
const displayPlayheadBeat = computed(() => {
  const len = activeLoopEndBeat.value;
  if (len <= 0) return liveBeat.value;
  return ((liveBeat.value % len) + len) % len;
});
// MIDI notes use the green palette; drum steps use each pad's own color.
function colorForNote(note) {
  if (isDrumTrack.value) {
    return activeTrack.value?.pads?.find((p) => p.id === note.pitch)?.color ?? DEFAULT_NOTE_COLOR;
  }
  return MIDI_NOTE_COLOR;
}

const drumPadColorsKey = computed(() =>
  isDrumTrack.value ? (activeTrack.value?.pads ?? []).map((p) => p.color).join('|') : ''
);

const velocityPadId = ref(null);

watch(
  () => [activeTrack.value?.id, (activeTrack.value?.pads ?? []).map((p) => p.id).join(',')],
  () => {
    if (!isDrumTrack.value) {
      velocityPadId.value = null;
      return;
    }
    const pads = activeTrack.value?.pads ?? [];
    if (!pads.length) {
      velocityPadId.value = null;
      return;
    }
    if (!pads.some((p) => p.id === velocityPadId.value)) {
      velocityPadId.value = pads[0].id;
    }
  },
  { immediate: true }
);

const velocityLaneNotes = computed(() => {
  const notes = activePattern.value?.notes ?? [];
  if (!isDrumTrack.value || !velocityPadId.value) return notes;
  return notes.filter((n) => n.pitch === velocityPadId.value);
});

const velocityLaneColor = computed(() => {
  if (isDrumTrack.value && velocityPadId.value) {
    return activeTrack.value?.pads?.find((p) => p.id === velocityPadId.value)?.color ?? DEFAULT_NOTE_COLOR;
  }
  return MIDI_NOTE_COLOR;
});

const velocityLaneColorKey = computed(() =>
  isDrumTrack.value ? velocityLaneColor.value : drumPadColorsKey.value
);
const rowHeight = computed(() => (isDrumTrack.value ? DRUM_ROW_HEIGHT : ROW_HEIGHT) * rowZoom.value);
const keysWidth = computed(() => {
  if (isDrumTrack.value) return drumControlsVisible.value ? DRUM_KEYS_WIDTH : 0;
  return KEY_WIDTH;
});
const leftGutterWidth = computed(() => {
  if (isDrumTrack.value) {
    return drumControlsVisible.value ? DRUM_KEYS_WIDTH : DRUM_TOGGLE_STRIP_WIDTH;
  }
  return KEY_WIDTH;
});
const VELOCITY_RESIZE_HANDLE_HEIGHT = 8;
const DRUM_VELOCITY_PAD_SELECTOR_HEIGHT = 28;
// Resize handle + lane (when expanded). Drum velocity scrolls with the grid so
// it sits directly under the last pad row — not pinned to the viewport bottom.
const drumVelocityLaneStripHeight = computed(() =>
  VELOCITY_RESIZE_HANDLE_HEIGHT + (velocityCollapsed.value ? 0 : velocityHeight.value)
);
const drumVelocityBlockHeight = computed(() => {
  if (!isDrumTrack.value) return 0;
  return Math.max(DRUM_VELOCITY_PAD_SELECTOR_HEIGHT, drumVelocityLaneStripHeight.value);
});
const drumEmbeddedVelocityLaneHeight = computed(() =>
  Math.max(MIN_VELOCITY_HEIGHT, drumVelocityBlockHeight.value - VELOCITY_RESIZE_HANDLE_HEIGHT)
);
const scrollContentHeight = computed(() =>
  isDrumTrack.value ? canvasHeight.value + drumVelocityBlockHeight.value : canvasHeight.value
);

// Generic "rows" abstraction: each row has an opaque `key` that Note.pitch
// stores — a MIDI pitch number for MIDI tracks, a pad id for drum tracks
// (see the comment on createDrumPad in models/project.js). Everything below
// that positions/moves notes vertically works purely in terms of row index,
// so it doesn't need to know or care which kind of key it's dealing with.
const rows = computed(() => {
  if (isDrumTrack.value) {
    return (activeTrack.value?.pads ?? []).map((pad) => ({ key: pad.id }));
  }
  const list = [];
  for (let p = HIGH_PITCH; p >= LOW_PITCH; p--) list.push({ key: p });
  return list;
});

const keyToIndex = computed(() => {
  const map = new Map();
  rows.value.forEach((row, i) => map.set(row.key, i));
  return map;
});

const canvasHeight = computed(() => rows.value.length * rowHeight.value);

const drag = ref(null);
const pinchState = ref(null);
const selectedNoteIds = ref(new Set());
const marqueeRect = ref(null);
const sampleDropPadId = ref(null);
const previewingPitch = ref(null);
const PREVIEW_MIN_MS = 80;
let previewStartedAt = 0;
let previewStopTimer = null;
let previewTouchId = null;
const hoverResize = ref(false);
const hoverMove = ref(false);
// Clipboard stores note offsets so paste works within a track or across tracks.
const noteClipboard = ref(null);
// Horizontal paste/play anchor — click the ruler above the grid, or Alt+click the grid.
const pasteMarkerBeat = ref(props.markerBeat ?? 0);
const pasteMarkerRowIndex = ref(0);
const hasMarker = computed(() => props.markerBeat != null);
const showPasteMarker = hasMarker;
const loopDragPreview = ref(null);
// Touch has no click.detail — track the last marker-bar tap for double-tap loop gestures.
let markerLastTap = null;
let activePasteBarTouchId = null;
const activeLoopRegion = computed(() => loopDragPreview.value ?? props.loopRegion);
const loopRegionStyle = computed(() => {
  const region = activeLoopRegion.value;
  if (!region) return {};
  const left = beatToX(region.startBeat);
  return { left: `${left}px`, width: `${beatToX(region.endBeat) - left}px` };
});

watch(
  () => props.markerBeat,
  (beat) => {
    pasteMarkerBeat.value = beat ?? 0;
  }
);

function setMarkerBeat(beat) {
  pasteMarkerBeat.value = beat;
  emit('marker-change', beat);
}

function onTogglePlay() {
  const fromBeat = hasMarker.value ? pasteMarkerBeat.value : undefined;
  emit('toggle-play', fromBeat);
}

const hasSelection = computed(() => selectedNoteIds.value.size > 0);
const hasClipboard = computed(() => (noteClipboard.value?.items?.length ?? 0) > 0);

const gridCursorClass = computed(() => {
  if (drag.value?.type === 'move') return 'cursor-grabbing';
  if (hoverResize.value) return 'cursor-ew-resize';
  if (usesClassicGestures()) {
    if (hoverMove.value) return 'cursor-grab';
    return 'cursor-crosshair';
  }
  if (editTool.value === 'zoom') return 'cursor-zoom-in';
  if (editTool.value === 'length') return 'cursor-ew-resize';
  if (editTool.value === 'select') return 'cursor-grab';
  return 'cursor-crosshair';
});

const gridTouchActionClass = computed(() =>
  editTool.value === 'zoom' ? 'touch-pan' : ''
);

// Block native panning on the scroll container while editing — the grid canvas
// already uses touch-action: none, but some browsers still scroll the parent
// unless the container opts out too (Select/Move on tablet was scrolling away).
const scrollTouchActionClass = computed(() =>
  editTool.value === 'zoom' ? '' : 'touch-none overscroll-none'
);

let activeGridTouchId = null;
// Snapshot scrollTop/scrollLeft when a grid edit touch starts — some mobile
// browsers still pan overflow containers despite touch-action/preventDefault;
// onScroll reverts any drift while the finger is down.
let gridScrollLock = null;

function blocksGridNativeScroll() {
  return editTool.value !== 'zoom';
}

// Only the note grid canvas needs scroll suppression during edit touches — the
// drum velocity strip (pad selector, lane, resize handle) lives in the same
// scroll content but must keep native tap/click behavior on tablet.
function isGridCanvasTouchTarget(target) {
  return !!target && !!gridCanvas.value?.contains(target);
}

function isGridEditDrag() {
  const type = drag.value?.type;
  return (
    type === 'pendingSelect' ||
    type === 'pendingMarquee' ||
    type === 'marquee' ||
    type === 'move' ||
    type === 'resize' ||
    type === 'erasePaint' ||
    type === 'paintAdd'
  );
}

function onScrollRefTouchStartCapture(e) {
  if (!blocksGridNativeScroll()) return;
  if (e.touches.length !== 1) return;
  if (!isGridCanvasTouchTarget(e.target)) return;

  activeGridTouchId = e.touches[0].identifier;
  const container = scrollRef.value;
  if (container) {
    gridScrollLock = { left: container.scrollLeft, top: container.scrollTop };
  }
  e.preventDefault();
}

function onScrollRefTouchMoveCapture(e) {
  if (!blocksGridNativeScroll()) return;
  if (!isActiveGridTouch(e) && !isGridEditDrag()) return;
  e.preventDefault();
}

function onScrollRefTouchEndCapture(e) {
  for (const touch of e.changedTouches) {
    if (touch.identifier === activeGridTouchId) {
      activeGridTouchId = null;
      gridScrollLock = null;
    }
  }
}

let scrollRefTouchGuardsBound = false;

function bindScrollRefTouchGuards() {
  const el = scrollRef.value;
  if (!el || scrollRefTouchGuardsBound) return;
  scrollRefTouchGuardsBound = true;
  el.addEventListener('touchstart', onScrollRefTouchStartCapture, { capture: true, passive: false });
  el.addEventListener('touchmove', onScrollRefTouchMoveCapture, { capture: true, passive: false });
  el.addEventListener('touchend', onScrollRefTouchEndCapture, { capture: true });
  el.addEventListener('touchcancel', onScrollRefTouchEndCapture, { capture: true });
}

function unbindScrollRefTouchGuards() {
  const el = scrollRef.value;
  if (!el || !scrollRefTouchGuardsBound) return;
  scrollRefTouchGuardsBound = false;
  el.removeEventListener('touchstart', onScrollRefTouchStartCapture, { capture: true });
  el.removeEventListener('touchmove', onScrollRefTouchMoveCapture, { capture: true });
  el.removeEventListener('touchend', onScrollRefTouchEndCapture, { capture: true });
  el.removeEventListener('touchcancel', onScrollRefTouchEndCapture, { capture: true });
}

const marqueeStyle = computed(() => {
  const r = marqueeRect.value;
  if (!r) return {};
  return {
    left: Math.min(r.x1, r.x2) + 'px',
    top: Math.min(r.y1, r.y2) + 'px',
    width: Math.abs(r.x2 - r.x1) + 'px',
    height: Math.abs(r.y2 - r.y1) + 'px',
  };
});

// `CanvasRenderingContext2D.roundRect` is widely supported in the Chrome/Edge
// versions this app targets for Web MIDI, but we fall back to a manual arc
// path just in case. Traces the path only — caller does fill()/stroke().
function traceRoundedRect(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Both operate on row *keys* (see the `rows` comment above), not literal
// pitches — the names are kept because for MIDI tracks a key IS a pitch, and
// most call sites only ever deal with MIDI tracks.
function pitchToY(key) {
  return (keyToIndex.value.get(key) ?? 0) * rowHeight.value;
}

function yToPitch(y) {
  const idx = Math.max(0, Math.min(rows.value.length - 1, Math.floor(y / rowHeight.value)));
  return rows.value[idx]?.key;
}

function beatToX(beat) {
  return beat * beatWidth.value;
}

// Rounds to the nearest grid line — used for continuous drag feedback
// (moving an already-selected note), where snapping to whichever line is
// closest to the cursor feels natural.
function xToBeat(x) {
  return snapBeat(x / beatWidth.value, snap.value);
}

function xToBeatWithSnap(x, snapValue) {
  return snapBeat(x / beatWidth.value, snapValue || 0.125);
}

// Floors to the start of the grid cell the cursor is currently inside — used
// when placing a new note, so it lands in the cell you're hovering rather
// than snapping to whichever grid line happens to be nearest your cursor.
function xToBeatCell(x) {
  const s = snap.value || 0.125;
  return Math.floor(x / beatWidth.value / s) * s;
}

// The exact, unsnapped beat under the cursor — used to hit-test existing
// notes so hovering anywhere within a note always finds that note, regardless
// of the current grid/snap setting.
function xToRawBeat(x) {
  return x / beatWidth.value;
}

function getNotes() {
  return activePattern.value?.notes ?? [];
}

function emitNotes(notes) {
  if (!activePattern.value) return;
  emit('update-notes', props.activeTrackId, activePattern.value.id, notes);
}

function onVelocityLaneUpdate(updatedNotes) {
  if (!isDrumTrack.value || !velocityPadId.value) {
    emitNotes(updatedNotes);
    return;
  }
  const padId = velocityPadId.value;
  const others = getNotes().filter((n) => n.pitch !== padId);
  emitNotes([...others, ...updatedNotes]);
}

function onVelocityHeaderMouseDown(e) {
  if (e.target?.closest('button, select, option')) return;
  clearSelection();
}

async function onImportMidi(file) {
  if (!activePattern.value || activeTrack.value?.kind !== 'midi') return;

  const existing = getNotes();
  if (existing.length && !window.confirm('Replace notes in the active pattern with the imported MIDI file?')) {
    return;
  }

  try {
    const buffer = await readMidiFile(file);
    const { notes, patternSteps, bpm } = importPatternFromMidi(buffer);

    emit('update-pattern', props.activeTrackId, activePattern.value.id, { patternSteps });
    emitNotes(notes);
    selectedNoteIds.value = new Set();

    if (bpm != null && Number.isFinite(bpm)) {
      emit('bpm-change', Math.round(bpm));
    }
  } catch (err) {
    console.error('MIDI import failed:', err);
    window.alert('Could not read that MIDI file.');
  }
}

function onExportMidi() {
  if (!activePattern.value || !activeTrack.value || activeTrack.value.kind !== 'midi') return;

  const data = exportPatternToMidi(activePattern.value, {
    bpm: props.bpm ?? 120,
    trackName: activeTrack.value.name,
  });
  const filename = `${activeTrack.value.name}-${activePattern.value.name}`;
  downloadMidiFile(data, filename);
}

function rowIndexOf(key) {
  return keyToIndex.value.get(key) ?? 0;
}

function selectAllNotes() {
  selectedNoteIds.value = new Set(getNotes().map((n) => n.id));
}

function copySelection() {
  const selected = getNotes().filter((n) => selectedNoteIds.value.has(n.id));
  if (!selected.length) return;

  const minBeat = Math.min(...selected.map((n) => n.startBeat));
  const minRow = Math.min(...selected.map((n) => rowIndexOf(n.pitch)));

  noteClipboard.value = {
    sourceKind: activeTrack.value?.kind ?? 'midi',
    items: selected.map((n) => ({
      beatOffset: n.startBeat - minBeat,
      rowOffset: rowIndexOf(n.pitch) - minRow,
      duration: n.duration,
      velocity: n.velocity,
      pitch: n.pitch,
    })),
  };
}

function resolvePastePitch(item, sourceKind) {
  const targetKind = activeTrack.value?.kind;
  const targetRows = rows.value;

  // MIDI → MIDI keeps absolute pitch numbers across synth tracks.
  if (sourceKind === 'midi' && targetKind === 'midi') {
    return item.pitch;
  }

  const baseRow = pasteMarkerRowIndex.value ?? 0;
  const rowIndex = Math.max(0, Math.min(targetRows.length - 1, baseRow + item.rowOffset));
  return targetRows[rowIndex]?.key;
}

function pasteClipboard() {
  if (!noteClipboard.value || !activeTrack.value) return;

  const clip = noteClipboard.value;
  const pasteBeat = snapBeat(pasteMarkerBeat.value ?? 0, snap.value);
  const newNotes = [];

  for (const item of clip.items) {
    const pitch = resolvePastePitch(item, clip.sourceKind);
    if (pitch === undefined) continue;
    newNotes.push(
      createNote(pitch, Math.max(0, pasteBeat + item.beatOffset), item.duration, item.velocity)
    );
  }

  if (!newNotes.length) return;

  emitNotes([...getNotes(), ...newNotes]);
  selectedNoteIds.value = new Set(newNotes.map((n) => n.id));
}

function startLoopRegionDrag(beat, clientX) {
  drag.value = { type: 'loopRegion', startBeat: beat, endBeat: beat, startX: clientX, moved: false };
}

function isMarkerDoubleTap(beat) {
  const prev = markerLastTap;
  if (!prev) return false;
  if (performance.now() - prev.time > DOUBLE_TAP_MS) return false;
  const toleranceBeats = Math.max(snap.value || 0.125, 4 / beatWidth.value);
  return Math.abs(prev.beat - beat) <= toleranceBeats;
}

function onPasteBarMouseDown(e) {
  e.preventDefault();
  e.stopPropagation();
  const beat = markerEventToBeat(e);

  if (e.button === 2) {
    emit('loop-region-change', null);
    loopDragPreview.value = null;
    return;
  }

  // Second click of a double-click starts a loop-region drag from this beat.
  if (e.detail === 2) {
    startLoopRegionDrag(beat, e.clientX);
    return;
  }

  setMarkerBeat(beat);
}

function markerEventToBeat(e) {
  const el = markerBarRef.value;
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  const x = e.clientX - rect.left;
  return snapBeat(Math.max(0, x / beatWidth.value), snap.value);
}

function finalizeLoopRegion() {
  const { startBeat, endBeat, moved } = drag.value;

  // Double-click without dragging clears an existing loop; otherwise cancel.
  if (!moved) {
    if (props.loopRegion) emit('loop-region-change', null);
    loopDragPreview.value = null;
    return;
  }

  const start = Math.min(startBeat, endBeat ?? startBeat);
  let end = Math.max(startBeat, endBeat ?? startBeat);
  const minLen = snap.value || 0.125;
  if (end - start < minLen) end = start + minLen;
  emit('loop-region-change', { startBeat: start, endBeat: end });
  loopDragPreview.value = null;
}

function findNoteAt(beat, pitch) {
  return getNotes().find(
    (n) => n.pitch === pitch && beat >= n.startBeat && beat < n.startBeat + n.duration
  );
}

// Finds a note whose right edge (in pixels) is close enough to x, on the same
// pitch row as y, so the user can grab and drag it to change the note's length.
// With generous=true (Length tool on tablet), any touch within the note body works.
function findResizeHandle(x, y, { generous = false } = {}) {
  const pitch = yToPitch(y);
  const handlePx = generous ? TOUCH_RESIZE_HANDLE_PX : RESIZE_HANDLE_PX;
  return getNotes().find((n) => {
    if (n.pitch !== pitch) return false;
    const startX = beatToX(n.startBeat);
    const endX = beatToX(n.startBeat + n.duration);
    if (generous) return x >= startX && x <= endX + handlePx;
    return Math.abs(x - endX) <= handlePx;
  });
}

function eventToGridPos(e) {
  // getBoundingClientRect() is already relative to the scrolled viewport, so it
  // accounts for scroll position on its own — do not add scrollLeft/scrollTop again.
  const rect = gridCanvas.value.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  return {
    x,
    y,
    rawBeat: xToRawBeat(x),
    cellBeat: xToBeatCell(x),
    pitch: yToPitch(y),
  };
}

// Rectangle-selects every note whose box intersects the current marquee drag,
// in beat/pitch space so it stays correct at any zoom level.
function updateMarqueeSelection() {
  const r = marqueeRect.value;
  if (!r) return;

  const xMin = Math.min(r.x1, r.x2);
  const xMax = Math.max(r.x1, r.x2);
  const yMin = Math.min(r.y1, r.y2);
  const yMax = Math.max(r.y1, r.y2);

  const beatMin = xMin / beatWidth.value;
  const beatMax = xMax / beatWidth.value;
  // Compared by row index rather than the pitch/key value directly — a drum
  // pad id isn't numerically orderable the way a MIDI pitch is.
  const indexMin = Math.floor(yMin / rowHeight.value);
  const indexMax = Math.floor(yMax / rowHeight.value);

  const selected = getNotes().filter((n) => {
    const overlapsX = n.startBeat + n.duration > beatMin && n.startBeat < beatMax;
    const rowIndex = keyToIndex.value.get(n.pitch) ?? -1;
    const overlapsY = rowIndex >= indexMin && rowIndex <= indexMax;
    return overlapsX && overlapsY;
  });

  // Shift + Cmd/Ctrl drag adds to whatever was already selected before this
  // marquee started, so you can build up a scattered selection with several
  // separate drags. Plain Cmd/Ctrl drag replaces the selection each time.
  if (drag.value?.additive) {
    selectedNoteIds.value = new Set([...drag.value.baseSelection, ...selected.map((n) => n.id)]);
  } else {
    selectedNoteIds.value = new Set(selected.map((n) => n.id));
  }
}

// Shared by right-button paint-delete and the erase tool: removes whichever
// note is under (beat, pitch), if any, and drops it from the selection too.
function eraseNoteAt(beat, pitch) {
  const existing = findNoteAt(beat, pitch);
  if (!existing) return;
  if (selectedNoteIds.value.has(existing.id)) {
    const next = new Set(selectedNoteIds.value);
    next.delete(existing.id);
    selectedNoteIds.value = next;
  }
  emitNotes(getNotes().filter((n) => n.id !== existing.id));
}

function clearSelection() {
  selectedNoteIds.value = new Set();
}

function deleteSelectedNotes() {
  if (!selectedNoteIds.value.size) return;
  const ids = selectedNoteIds.value;
  emitNotes(getNotes().filter((n) => !ids.has(n.id)));
  clearSelection();
}

function startResizeDrag(resizeTarget) {
  const group =
    selectedNoteIds.value.has(resizeTarget.id) && selectedNoteIds.value.size > 1
      ? getNotes().filter((n) => selectedNoteIds.value.has(n.id))
      : [resizeTarget];
  selectedNoteIds.value = new Set(group.map((n) => n.id));
  drag.value = {
    type: 'resize',
    anchorNoteId: resizeTarget.id,
    anchorOrigStartBeat: resizeTarget.startBeat,
    anchorOrigDuration: resizeTarget.duration,
    origDurations: new Map(group.map((n) => [n.id, n.duration])),
  };
}

function startMoveDrag(existing, clientX, clientY) {
  const keepSelection = selectedNoteIds.value.has(existing.id) && selectedNoteIds.value.size > 1;
  if (!keepSelection) selectedNoteIds.value = new Set([existing.id]);

  const group = getNotes().filter((n) => selectedNoteIds.value.has(n.id));
  drag.value = {
    type: 'move',
    startClientX: clientX,
    startClientY: clientY,
    anchorOrigBeat: existing.startBeat,
    anchorOrigPitch: existing.pitch,
    origPositions: new Map(group.map((n) => [n.id, { beat: n.startBeat, pitch: n.pitch }])),
  };
}

function promotePendingSelectToMove() {
  const pending = drag.value;
  if (pending?.type !== 'pendingSelect') return;

  const existing = getNotes().find((n) => n.id === pending.noteId);
  if (!existing) {
    drag.value = null;
    return;
  }
  startMoveDrag(existing, pending.startClientX, pending.startClientY);
}

function promotePendingMarqueeToSelect(x, y) {
  const pending = drag.value;
  if (pending?.type !== 'pendingMarquee') return;

  drag.value = {
    type: 'marquee',
    additive: false,
    baseSelection: new Set(selectedNoteIds.value),
  };
  marqueeRect.value = { x1: pending.x1, y1: pending.y1, x2: x, y2: y };
}

function placementDuration() {
  return stampDuration.value ?? noteLength.value;
}

function stampNoteDuration(note) {
  if (!note?.duration) return;
  stampDuration.value = note.duration;
}

function finalizeResizeStamp() {
  const anchorId = drag.value?.anchorNoteId;
  if (!anchorId) return;
  const anchor = getNotes().find((n) => n.id === anchorId);
  if (anchor) stampNoteDuration(anchor);
}

// Tablet tool modes — maps toolbar selections to the same drag types desktop uses.
// Multi on touch devices falls back to pen behavior; mobile-multi uses touch gestures.
function onMobileMultiMouseDown(e) {
  const { x, y, rawBeat, cellBeat, pitch } = eventToGridPos(e);
  const existing = findNoteAt(rawBeat, pitch);

  if (existing && selectedNoteIds.value.has(existing.id)) {
    stampNoteDuration(existing);
    drag.value = {
      type: 'pendingSelect',
      noteId: existing.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };
    return;
  }

  if (existing) {
    eraseNoteAt(rawBeat, pitch);
    drag.value = { type: 'erasePaint' };
    return;
  }

  if (e.detail === 2) {
    drag.value = {
      type: 'pendingMarquee',
      startClientX: e.clientX,
      startClientY: e.clientY,
      x1: x,
      y1: y,
    };
    return;
  }

  const note = createNote(pitch, cellBeat, placementDuration(), 100);
  emitNotes([...getNotes(), note]);
  clearSelection();
  startDrawPreview(note.pitch, note.velocity);
  drag.value = { type: 'paintAdd', lastCell: `${cellBeat}:${pitch}` };
}

function onToolModeDown(e) {
  if (editTool.value === 'mobile-multi') {
    onMobileMultiMouseDown(e);
    return;
  }
  const tool = editTool.value === 'multi' ? 'pen' : editTool.value;
  if (tool === 'zoom') return;

  const { x, y, rawBeat, cellBeat, pitch } = eventToGridPos(e);

  if (tool === 'erase') {
    if (!findNoteAt(rawBeat, pitch)) clearSelection();
    eraseNoteAt(rawBeat, pitch);
    drag.value = { type: 'erasePaint' };
    return;
  }

  if (tool === 'length') {
    const resizeTarget = findResizeHandle(x, y, { generous: true });
    if (resizeTarget) startResizeDrag(resizeTarget);
    return;
  }

  if (tool === 'select') {
    const existing = findNoteAt(rawBeat, pitch);
    if (existing) {
      stampNoteDuration(existing);
      drag.value = {
        type: 'pendingSelect',
        noteId: existing.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
      };
      return;
    }
    drag.value = {
      type: 'pendingMarquee',
      startClientX: e.clientX,
      startClientY: e.clientY,
      x1: x,
      y1: y,
    };
    return;
  }

  // Pen — stamp length from an existing note, or draw on empty cells.
  const existing = findNoteAt(rawBeat, pitch);
  if (existing) {
    stampNoteDuration(existing);
    return;
  }

  const note = createNote(pitch, cellBeat, placementDuration(), 100);
  emitNotes([...getNotes(), note]);
  clearSelection();
  startDrawPreview(note.pitch, note.velocity);
  drag.value = { type: 'paintAdd', lastCell: `${cellBeat}:${pitch}` };
}

function hasFinePointer() {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function isMobileMultiActive() {
  return editTool.value === 'mobile-multi';
}

function usesClassicGestures() {
  return editTool.value === 'multi' && hasFinePointer();
}

function usesPinchZoom() {
  return editTool.value === 'zoom' || isMobileMultiActive();
}

function activePinchSensitivity() {
  return isMobileMultiActive() ? MOBILE_MULTI_PINCH_SENSITIVITY : PINCH_ZOOM_SENSITIVITY;
}

// Deferred empty-cell tap so a fast second tap can start marquee without placing two notes.
let mobileLastEmptyTap = null;
let mobileTouchSession = null;

function clearMobileLastEmptyTap() {
  mobileLastEmptyTap = null;
}

function clearMobileTouchSession() {
  if (mobileTouchSession?.longPressTimer) {
    clearTimeout(mobileTouchSession.longPressTimer);
  }
  mobileTouchSession = null;
}

function mobileTouchMoved(session, clientX, clientY) {
  if (!session) return false;
  const dx = clientX - session.startClientX;
  const dy = clientY - session.startClientY;
  return Math.hypot(dx, dy) >= SELECT_DRAG_THRESHOLD_PX;
}

function isMobileDoubleTapNote(existing) {
  const prev = mobileLastEmptyTap;
  if (!prev || !existing) return false;
  if (existing.id !== prev.noteId) return false;
  return performance.now() - prev.time <= DOUBLE_TAP_MS;
}

function startMobileLengthDraw(note) {
  stampNoteDuration(note);
  drag.value = {
    type: 'resize',
    anchorNoteId: note.id,
    anchorOrigStartBeat: note.startBeat,
    anchorOrigDuration: note.duration,
    origDurations: new Map([[note.id, note.duration]]),
  };
  if (mobileTouchSession) mobileTouchSession.kind = 'lengthDraw';
}

function onMobileMultiTouchStart(e) {
  if (e.touches.length >= 2) {
    e.preventDefault();
    clearMobileLastEmptyTap();
    clearMobileTouchSession();
    drag.value = null;
    startPinch(e.touches);
    return;
  }

  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  e.stopPropagation();
  activeGridTouchId = e.touches[0]?.identifier ?? null;
  bindPreviewTouch(e);

  const { x, y, rawBeat, cellBeat, pitch } = eventToGridPos(toSyntheticMouseEvent(e, point));
  const existing = findNoteAt(rawBeat, pitch);

  if (existing && isMobileDoubleTapNote(existing)) {
    clearMobileLastEmptyTap();
    emitNotes(getNotes().filter((n) => n.id !== existing.id));
    mobileTouchSession = {
      kind: 'marquee',
      startClientX: point.clientX,
      startClientY: point.clientY,
    };
    drag.value = {
      type: 'pendingMarquee',
      startClientX: point.clientX,
      startClientY: point.clientY,
      x1: x,
      y1: y,
    };
    return;
  }

  if (existing && selectedNoteIds.value.has(existing.id)) {
    clearMobileLastEmptyTap();
    stampNoteDuration(existing);
    mobileTouchSession = {
      kind: 'moveSelected',
      startClientX: point.clientX,
      startClientY: point.clientY,
      noteId: existing.id,
    };
    drag.value = {
      type: 'pendingSelect',
      noteId: existing.id,
      startClientX: point.clientX,
      startClientY: point.clientY,
    };
    return;
  }

  if (existing) {
    clearMobileLastEmptyTap();
    eraseNoteAt(rawBeat, pitch);
    mobileTouchSession = {
      kind: 'noteErase',
      startClientX: point.clientX,
      startClientY: point.clientY,
    };
    drag.value = { type: 'erasePaint' };
    return;
  }

  // Empty cell — place immediately and paint-drag like the pen tool; hold still
  // to switch into length draw after LONG_PRESS_MS.
  clearMobileLastEmptyTap();
  const note = createNote(pitch, cellBeat, placementDuration(), 100);
  emitNotes([...getNotes(), note]);
  clearSelection();
  startDrawPreview(note.pitch, note.velocity);
  drag.value = { type: 'paintAdd', lastCell: `${cellBeat}:${pitch}` };

  mobileLastEmptyTap = {
    cellBeat,
    pitch,
    noteId: note.id,
    time: performance.now(),
  };

  const anchorCell = `${cellBeat}:${pitch}`;
  mobileTouchSession = {
    kind: 'emptyDraw',
    startClientX: point.clientX,
    startClientY: point.clientY,
    anchorNoteId: note.id,
    anchorCell,
  };
  mobileTouchSession.longPressTimer = setTimeout(() => {
    if (!mobileTouchSession || mobileTouchSession.kind !== 'emptyDraw') return;
    if (drag.value?.type !== 'paintAdd' || drag.value.lastCell !== anchorCell) return;
    const anchor = getNotes().find((n) => n.id === mobileTouchSession.anchorNoteId);
    if (!anchor) return;
    startMobileLengthDraw(anchor);
  }, LONG_PRESS_MS);
}

function onMobileMultiTouchMove(e) {
  const point = touchPoint(e);
  if (!point) return;

  if (mobileTouchSession?.longPressTimer && mobileTouchMoved(mobileTouchSession, point.clientX, point.clientY)) {
    clearTimeout(mobileTouchSession.longPressTimer);
    mobileTouchSession.longPressTimer = null;
  }

  if (!drag.value) return;
  onMouseMove(toSyntheticMouseEvent(e, point));
}

function onMobileMultiTouchEnd(e) {
  if (pinchState.value && e.touches.length < 2) {
    pinchState.value = null;
  }

  if (drag.value && drag.value.type !== 'pendingSelect' && drag.value.type !== 'pendingMarquee') {
    onWindowDragEnd();
    clearMobileTouchSession();
    onPreviewTouchEnd(e);
    return;
  }

  if (drag.value?.type === 'pendingSelect') {
    onMouseUp();
  } else if (drag.value?.type === 'pendingMarquee') {
    onMouseUp();
  }

  clearMobileTouchSession();
  onPreviewTouchEnd(e);
}

function onMouseDown(e) {
  const { x, y, rawBeat, cellBeat, pitch } = eventToGridPos(e);

  if (e.button === 0 && !e.metaKey && !e.ctrlKey) {
    // Desktop mice: right-edge grab always resizes, like FL Studio, regardless
    // of which toolbar tool is selected (Length tool still uses the wider
    // touch target on coarse-pointer devices).
    if (hasFinePointer()) {
      const resizeTarget = findResizeHandle(x, y);
      if (resizeTarget) {
        startResizeDrag(resizeTarget);
        return;
      }
    }
    if (!usesClassicGestures()) {
      return onToolModeDown(e);
    }
    // Multi tool on desktop: fall through to classic modifier-free gestures below.
  }

  // Alt+click sets both the paste beat and the base row (for cross-track row mapping).
  if (e.altKey) {
    setMarkerBeat(cellBeat);
    pasteMarkerRowIndex.value = rowIndexOf(pitch);
    return;
  }

  // Right mouse button paint-deletes — hold and drag to erase multiple notes
  // in one stroke. Clicking empty space also clears the selection, same as
  // a left-click there.
  if (e.button === 2) {
    if (!findNoteAt(rawBeat, pitch)) {
      clearSelection();
    }
    eraseNoteAt(rawBeat, pitch);
    drag.value = { type: 'erasePaint' };
    return;
  }

  // Cmd/Ctrl + drag always starts a rubber-band multi-select. Adding Shift
  // makes it additive, keeping whatever was already selected so you can
  // build up a scattered selection with several separate drags.
  if (e.metaKey || e.ctrlKey) {
    drag.value = { type: 'marquee', additive: e.shiftKey, baseSelection: new Set(selectedNoteIds.value) };
    marqueeRect.value = { x1: x, y1: y, x2: x, y2: y };
    return;
  }

  // Grabbing a note's right edge resizes it — matches FL Studio's "drag the
  // tail to change length" convention. If the
  // grabbed note is part of a multi-selection, the whole selection resizes
  // together by the same amount.
  const resizeTarget = findResizeHandle(x, y);
  if (resizeTarget) {
    startResizeDrag(resizeTarget);
    return;
  }

  const existing = findNoteAt(rawBeat, pitch);

  // Shift + drag on a note duplicates it (and the rest of the selection, if
  // it's part of one), leaves the originals in place, and immediately starts
  // dragging the copies — matches FL Studio's "hold Shift to clone" convention.
  if (existing && e.shiftKey) {
    const sourceGroup =
      selectedNoteIds.value.has(existing.id) && selectedNoteIds.value.size > 1
        ? getNotes().filter((n) => selectedNoteIds.value.has(n.id))
        : [existing];

    const clones = sourceGroup.map((n) => ({ ...n, id: uid() }));
    const anchorClone = clones[sourceGroup.findIndex((n) => n.id === existing.id)];

    emitNotes([...getNotes(), ...clones]);
    selectedNoteIds.value = new Set(clones.map((n) => n.id));

    drag.value = {
      type: 'move',
      startClientX: e.clientX,
      startClientY: e.clientY,
      anchorOrigBeat: anchorClone.startBeat,
      anchorOrigPitch: anchorClone.pitch,
      origPositions: new Map(clones.map((n) => [n.id, { beat: n.startBeat, pitch: n.pitch }])),
    };
    return;
  }

  // Grabbing any note's body moves it (and the rest of the selection, if
  // it's part of one).
  if (existing) {
    stampNoteDuration(existing);
    startMoveDrag(existing, e.clientX, e.clientY);
    return;
  }

  // Clicking empty space places a note — right-click-drag (above) erases,
  // Cmd/Ctrl-drag (above) marquee-selects, so a single click tool is enough
  // without a separate Draw/Select/Erase mode switcher.
  const note = createNote(pitch, cellBeat, placementDuration(), 100);
  emitNotes([...getNotes(), note]);
  // Newly drawn notes start unselected — a fresh click shouldn't leave the
  // selection outline sitting on the note you just placed.
  clearSelection();
  startDrawPreview(note.pitch, note.velocity);
  // Hold and drag to paint more notes into new cells in one stroke.
  drag.value = { type: 'paintAdd', lastCell: `${cellBeat}:${pitch}` };
}

// Audition while drawing — same hold/release behavior as clicking the piano
// keys: the key stays lit and the note sounds until pointer up. Drums fire a
// one-shot sample per placed pad instead (no keyboard column to highlight).
function startDrawPreview(pitch, velocity = PREVIEW_VELOCITY) {
  if (props.playing) return;

  const track = activeTrack.value;
  if (!track) return;

  if (track.kind === 'drum') {
    const pad = track.pads.find((p) => p.id === pitch);
    if (!pad || pad.muted) return;
    resumeSamplerAudio();
    const gainMul = (pad.volume ?? 1) * (track.volume ?? 1);
    playSample(pitch, velocity, 0, gainMul, padPlaybackOpts(pad, track));
    return;
  }

  playPreview(pitch);
}

// Pad-management: PianoRoll owns the sampler engine calls (decode/cache),
// same as it already owns MIDI preview calls directly, and just bubbles the
// resulting project-state change up — App.vue stays the only place that
// mutates project.tracks, matching route-change/rename-track above.
async function onLoadSample(padId, file) {
  try {
    await loadSampleFile(padId, file);
    emit('update-pad', props.activeTrackId, padId, { fileName: file.name });
  } catch (err) {
    console.error('Failed to load sample:', err);
  }
}

function acceptSampleDrag(e) {
  if (!isDrumTrack.value) return false;
  return acceptFileDrag(e);
}

function onSampleDragEnter(e) {
  if (!acceptSampleDrag(e)) return;
  sampleDropPadId.value = eventToGridPos(e).pitch ?? null;
}

function onSampleDragOver(e) {
  if (!acceptSampleDrag(e)) return;
  sampleDropPadId.value = eventToGridPos(e).pitch ?? null;
}

function onSampleDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) sampleDropPadId.value = null;
}

async function onSampleDrop(e) {
  if (!isDrumTrack.value) return;
  e.preventDefault();
  e.stopPropagation();
  const padId = eventToGridPos(e).pitch ?? sampleDropPadId.value;
  sampleDropPadId.value = null;
  const file = audioFileFromDataTransfer(e.dataTransfer);
  if (!file || !padId) return;
  await onLoadSample(padId, file);
}

function onClearSample(padId) {
  clearSample(padId);
  emit('update-pad', props.activeTrackId, padId, { fileName: '' });
}

function onAddPad() {
  emit('add-pad', props.activeTrackId);
}

function onRemovePad(padId) {
  clearSample(padId);
  emit('remove-pad', props.activeTrackId, padId);
}

function onRenamePad(padId, name) {
  emit('rename-pad', props.activeTrackId, padId, name);
}

function onUpdatePad(padId, changes) {
  emit('update-pad', props.activeTrackId, padId, changes);
}

// Actual deletion happens on mousedown/mousemove (see eraseNoteAt) so right-drag
// can paint-delete across multiple notes; this just suppresses the native menu.
function onGridContextMenu(e) {
  e.preventDefault();
}

function onCanvasMouseMove(e) {
  // Active drags are tracked on window so marquee/move/resize keep working
  // when the pointer moves over the keyboard column or scroll padding.
  if (drag.value) return;
  onMouseMove(e);
}

function onWindowDragMove(e) {
  if (!drag.value) return;
  if (drag.value.type === 'loopRegion') {
    if (!drag.value.moved && Math.abs(e.clientX - drag.value.startX) <= CLICK_DRAG_THRESHOLD_PX) return;
    drag.value.moved = true;
    const beat = markerEventToBeat(e);
    drag.value.endBeat = beat;
    const start = Math.min(drag.value.startBeat, beat);
    let end = Math.max(drag.value.startBeat, beat);
    const minLen = snap.value || 0.125;
    if (end - start < minLen) end = start + minLen;
    loopDragPreview.value = { startBeat: start, endBeat: end };
    return;
  }
  onMouseMove(e);
}

function onWindowDragEnd() {
  if (!drag.value) return;
  onMouseUp();
}

function isActivePasteBarTouch(e) {
  if (activePasteBarTouchId === null) return false;
  for (const touch of e.touches) {
    if (touch.identifier === activePasteBarTouchId) return true;
  }
  for (const touch of e.changedTouches ?? []) {
    if (touch.identifier === activePasteBarTouchId) return true;
  }
  return false;
}

function onWindowDragTouchMove(e) {
  if (pinchState.value && e.touches.length >= 2) {
    e.preventDefault();
    const rawScale = pinchDistance(e.touches) / pinchState.value.startDist;
    applyPinchScale(dampedPinchScale(rawScale, activePinchSensitivity()));
    return;
  }

  if (isZoomToolActive()) return;

  if (drag.value?.type === 'loopRegion' && isActivePasteBarTouch(e)) {
    e.preventDefault();
    const point = touchPoint(e);
    if (point) onWindowDragMove(toSyntheticMouseEvent(e, point));
    return;
  }

  const gridTouch =
    isActiveGridTouch(e) ||
    isGridEditDrag() ||
    (isMobileMultiActive() && !!mobileTouchSession);
  if (!gridTouch) return;

  e.preventDefault();

  const point = touchPoint(e);
  if (!point) return;

  if (isMobileMultiActive()) {
    onMobileMultiTouchMove(e);
    return;
  }

  if (!drag.value) return;
  onMouseMove(toSyntheticMouseEvent(e, point));
}

function isActiveGridTouch(e) {
  if (activeGridTouchId === null) return false;
  for (const touch of e.touches) {
    if (touch.identifier === activeGridTouchId) return true;
  }
  return false;
}

function onWindowDragTouchEnd(e) {
  if (activePasteBarTouchId !== null) {
    for (const touch of e.changedTouches ?? []) {
      if (touch.identifier === activePasteBarTouchId) {
        activePasteBarTouchId = null;
        break;
      }
    }
  }
  if (!drag.value) return;
  onMouseUp();
}

function onMouseMove(e) {
  const { x, y, rawBeat, cellBeat, pitch } = eventToGridPos(e);

  if (drag.value?.type === 'pendingSelect') {
    const dx = e.clientX - drag.value.startClientX;
    const dy = e.clientY - drag.value.startClientY;
    if (Math.hypot(dx, dy) >= SELECT_DRAG_THRESHOLD_PX) promotePendingSelectToMove();
    else return;
  }

  if (drag.value?.type === 'pendingMarquee') {
    const dx = e.clientX - drag.value.startClientX;
    const dy = e.clientY - drag.value.startClientY;
    if (Math.hypot(dx, dy) >= SELECT_DRAG_THRESHOLD_PX) promotePendingMarqueeToSelect(x, y);
    else return;
  }

  if (!drag.value) {
    if (hasFinePointer()) {
      const resizeNote = findResizeHandle(x, y);
      hoverResize.value = !!resizeNote;
      hoverMove.value =
        usesClassicGestures() && !resizeNote && !!findNoteAt(xToRawBeat(x), yToPitch(y));
    }
    return;
  }

  if (drag.value.type === 'erasePaint') {
    eraseNoteAt(rawBeat, pitch);
    return;
  }

  if (drag.value.type === 'paintAdd') {
    if (!props.playing && !isDrumTrack.value && pitch !== previewingPitch.value) {
      slidePreview(pitch);
    }

    const cellKey = `${cellBeat}:${pitch}`;
    if (cellKey === drag.value.lastCell) return;
    drag.value.lastCell = cellKey;

    if (!findNoteAt(rawBeat, pitch)) {
      const note = createNote(pitch, cellBeat, placementDuration(), 100);
      emitNotes([...getNotes(), note]);
      if (!props.playing && isDrumTrack.value) {
        startDrawPreview(note.pitch, note.velocity);
      }
    }
    return;
  }

  if (drag.value.type === 'marquee') {
    marqueeRect.value = { ...marqueeRect.value, x2: x, y2: y };
    updateMarqueeSelection();
    return;
  }

  if (drag.value.type === 'move') {
    const dx = e.clientX - drag.value.startClientX;
    const dy = e.clientY - drag.value.startClientY;
    const newAnchorBeat = snapBeat(drag.value.anchorOrigBeat + dx / beatWidth.value, snap.value);
    const deltaBeat = newAnchorBeat - drag.value.anchorOrigBeat;

    // Moved by row *index* delta rather than adding to the row key directly —
    // a drum pad id isn't a number you can add an offset to, and this also
    // reads more clearly for the MIDI case (drag N rows, not "+N pitch").
    const anchorOrigIndex = keyToIndex.value.get(drag.value.anchorOrigPitch) ?? 0;
    const newAnchorIndex = Math.max(
      0,
      Math.min(rows.value.length - 1, Math.floor((pitchToY(drag.value.anchorOrigPitch) + dy) / rowHeight.value))
    );
    const deltaIndex = newAnchorIndex - anchorOrigIndex;

    emitNotes(
      getNotes().map((n) => {
        const orig = drag.value.origPositions.get(n.id);
        if (!orig) return n;
        const origIndex = keyToIndex.value.get(orig.pitch) ?? 0;
        const newIndex = Math.max(0, Math.min(rows.value.length - 1, origIndex + deltaIndex));
        return {
          ...n,
          startBeat: Math.max(0, orig.beat + deltaBeat),
          pitch: rows.value[newIndex]?.key ?? orig.pitch,
        };
      })
    );
  } else if (drag.value.type === 'resize') {
    // Len controls resize granularity independently of Snap (grid/placement).
    const resizeSnap = noteLength.value || 0.125;
    const minDuration = resizeSnap;
    const endBeat = xToBeatWithSnap(x, resizeSnap);
    const newAnchorDuration = Math.max(minDuration, endBeat - drag.value.anchorOrigStartBeat);
    const deltaDuration = newAnchorDuration - drag.value.anchorOrigDuration;

    emitNotes(
      getNotes().map((n) => {
        const origDuration = drag.value.origDurations.get(n.id);
        if (origDuration === undefined) return n;
        return { ...n, duration: Math.max(minDuration, origDuration + deltaDuration) };
      })
    );
  }
}

function onMouseUp() {
  if (drag.value?.type === 'loopRegion') finalizeLoopRegion();
  if (drag.value?.type === 'pendingSelect') {
    selectedNoteIds.value = new Set([drag.value.noteId]);
    drag.value = null;
    return;
  }
  if (drag.value?.type === 'pendingMarquee') {
    clearSelection();
    drag.value = null;
    return;
  }
  if (drag.value?.type === 'resize') finalizeResizeStamp();
  if (drag.value?.type === 'marquee') marqueeRect.value = null;
  drag.value = null;
}

function onPasteBarTouchStart(e) {
  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  e.stopPropagation();

  const beat = markerEventToBeat(point);
  activePasteBarTouchId = e.touches[0]?.identifier ?? null;

  if (isMarkerDoubleTap(beat)) {
    markerLastTap = null;
    startLoopRegionDrag(beat, point.clientX);
    return;
  }

  markerLastTap = { beat, time: performance.now() };
  setMarkerBeat(beat);
}

function onPasteBarTouchMove(e) {
  if (!isActivePasteBarTouch(e)) return;
  if (drag.value?.type !== 'loopRegion') return;
  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  onWindowDragMove(toSyntheticMouseEvent(e, point));
}

function onPasteBarTouchEnd(e) {
  if (activePasteBarTouchId !== null) {
    for (const touch of e.changedTouches ?? []) {
      if (touch.identifier === activePasteBarTouchId) {
        activePasteBarTouchId = null;
        break;
      }
    }
  }
  onWindowDragEnd();
}

function pinchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.hypot(dx, dy);
}

function pinchMidpoint(touches) {
  return {
    clientX: (touches[0].clientX + touches[1].clientX) / 2,
    clientY: (touches[0].clientY + touches[1].clientY) / 2,
  };
}

function isZoomToolActive() {
  return editTool.value === 'zoom';
}

function startPinch(touches) {
  const container = scrollRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const mid = pinchMidpoint(touches);
  const cursorX = mid.clientX - rect.left;
  const cursorY = mid.clientY - rect.top;

  pinchState.value = {
    startDist: pinchDistance(touches),
    startBeatWidth: beatWidth.value,
    startRowZoom: rowZoom.value,
    beatUnder: (container.scrollLeft + cursorX) / beatWidth.value,
    rowUnder: (container.scrollTop + cursorY) / rowHeight.value,
    cursorX,
    cursorY,
  };
}

function dampedPinchScale(rawScale, sensitivity = PINCH_ZOOM_SENSITIVITY) {
  return 1 + (rawScale - 1) * sensitivity;
}

function applyPinchScale(scale) {
  const state = pinchState.value;
  const container = scrollRef.value;
  if (!state || !container) return;

  const newWidth = Math.min(
    MAX_BEAT_WIDTH,
    Math.max(MIN_BEAT_WIDTH, state.startBeatWidth * scale)
  );
  const newRowZoom = Math.min(
    MAX_ROW_ZOOM,
    Math.max(MIN_ROW_ZOOM, state.startRowZoom * scale)
  );
  if (newWidth === beatWidth.value && newRowZoom === rowZoom.value) return;

  beatWidth.value = newWidth;
  rowZoom.value = newRowZoom;

  nextTick(() => {
    container.scrollLeft = state.beatUnder * beatWidth.value - state.cursorX;
    container.scrollTop = state.rowUnder * rowHeight.value - state.cursorY;
  });
}

function zoomBeatWidthAt(clientX, factor) {
  const container = scrollRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const cursorX = clientX - rect.left;
  const beatUnder = (container.scrollLeft + cursorX) / beatWidth.value;
  const newWidth = Math.min(MAX_BEAT_WIDTH, Math.max(MIN_BEAT_WIDTH, beatWidth.value * factor));
  if (newWidth === beatWidth.value) return;

  beatWidth.value = newWidth;
  nextTick(() => {
    container.scrollLeft = beatUnder * newWidth - cursorX;
  });
}

function zoomRowHeightAt(clientY, factor) {
  const container = scrollRef.value;
  if (!container) return;
  const rect = container.getBoundingClientRect();
  const cursorY = clientY - rect.top;
  const rowUnder = (container.scrollTop + cursorY) / rowHeight.value;
  const newZoom = Math.min(MAX_ROW_ZOOM, Math.max(MIN_ROW_ZOOM, rowZoom.value * factor));
  if (newZoom === rowZoom.value) return;

  rowZoom.value = newZoom;
  nextTick(() => {
    container.scrollTop = rowUnder * rowHeight.value - cursorY;
  });
}

// Touch support: forwards to the same mouse handlers above with a
// synthetic event carrying just the fields they read (clientX/clientY,
// button, modifier keys). Left-click routes through the toolbar tool
// modes (pen/erase/select/length/zoom) before desktop modifier gestures.
function touchPoint(e) {
  const t = e.touches[0] ?? e.changedTouches[0];
  return t ? { clientX: t.clientX, clientY: t.clientY } : null;
}

function toSyntheticMouseEvent(e, point) {
  return {
    clientX: point.clientX,
    clientY: point.clientY,
    button: 0,
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    target: e.target,
    currentTarget: e.currentTarget,
    preventDefault: () => e.preventDefault(),
  };
}

function onGridTouchStart(e) {
  if (usesPinchZoom() && e.touches.length >= 2) {
    e.preventDefault();
    clearMobileLastEmptyTap();
    clearMobileTouchSession();
    startPinch(e.touches);
    return;
  }

  if (isMobileMultiActive()) {
    onMobileMultiTouchStart(e);
    return;
  }

  if (isZoomToolActive()) return;

  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  e.stopPropagation();
  activeGridTouchId = e.touches[0]?.identifier ?? null;
  bindPreviewTouch(e);
  onMouseDown(toSyntheticMouseEvent(e, point));
}

function onGridTouchEnd(e) {
  if (pinchState.value && (!e || e.touches.length < 2)) {
    pinchState.value = null;
  }
  if (isMobileMultiActive()) {
    onMobileMultiTouchEnd(e);
    return;
  }
  if (!isZoomToolActive()) {
    onWindowDragEnd();
    onPreviewTouchEnd(e);
  }
}

function bindPreviewTouch(e) {
  const id = e.touches?.[0]?.identifier;
  if (id !== undefined) previewTouchId = id;
}

function onPreviewTouchEnd(e) {
  if (previewTouchId === null) return;
  for (const touch of e.changedTouches) {
    if (touch.identifier === previewTouchId) {
      previewTouchId = null;
      stopPreview();
      return;
    }
  }
}

function slidePreview(pitch) {
  if (pitch < LOW_PITCH || pitch > HIGH_PITCH || pitch === previewingPitch.value) return;
  stopPreviewNow();
  playPreview(pitch);
}

function playPreview(pitch) {
  if (previewStopTimer) {
    clearTimeout(previewStopTimer);
    previewStopTimer = null;
  }

  const track = activeTrack.value;
  if (track?.midiOutputId) {
    sendNoteOn(track.midiOutputId, track.midiChannel, pitch, PREVIEW_VELOCITY);
  }
  previewingPitch.value = pitch;
  previewStartedAt = performance.now();
  drawKeys();
}

function stopPreviewNow() {
  if (previewStopTimer) {
    clearTimeout(previewStopTimer);
    previewStopTimer = null;
  }

  const track = activeTrack.value;
  const pitch = previewingPitch.value;
  if (pitch !== null && track?.midiOutputId) {
    sendNoteOff(track.midiOutputId, track.midiChannel, pitch);
  }
  previewingPitch.value = null;
  drawKeys();
}

function stopPreview() {
  if (previewingPitch.value === null) return;

  const elapsed = performance.now() - previewStartedAt;
  const delay = Math.max(0, PREVIEW_MIN_MS - elapsed);
  if (previewStopTimer) clearTimeout(previewStopTimer);
  if (delay > 0) {
    previewStopTimer = setTimeout(stopPreviewNow, delay);
    return;
  }
  stopPreviewNow();
}

function keyEventToPitch(e) {
  const keysEl = keysRef.value;
  if (!keysEl) return null;
  const y = e.clientY - keysEl.getBoundingClientRect().top + keysEl.scrollTop;
  return yToPitch(y);
}

function onKeyMouseDown(e) {
  const pitch = keyEventToPitch(e);
  if (pitch == null || pitch < LOW_PITCH || pitch > HIGH_PITCH) return;
  playPreview(pitch);
}

function onKeyMouseMove(e) {
  if (previewingPitch.value === null) return;
  const pitch = keyEventToPitch(e);
  if (pitch == null) return;
  slidePreview(pitch);
}

function onKeyTouchStart(e) {
  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  bindPreviewTouch(e);
  onKeyMouseDown(toSyntheticMouseEvent(e, point));
}

function onKeyTouchMove(e) {
  const point = touchPoint(e);
  if (!point) return;
  e.preventDefault();
  onKeyMouseMove(toSyntheticMouseEvent(e, point));
}

let syncingHorizontalScroll = false;

function onScroll() {
  if (
    gridScrollLock &&
    activeGridTouchId !== null &&
    blocksGridNativeScroll() &&
    scrollRef.value
  ) {
    scrollRef.value.scrollTop = gridScrollLock.top;
    scrollRef.value.scrollLeft = gridScrollLock.left;
    return;
  }

  if (keysRef.value && scrollRef.value) {
    keysRef.value.scrollTop = scrollRef.value.scrollTop;
  }
  mainScrollLeft.value = scrollRef.value?.scrollLeft ?? 0;

  if (!syncingHorizontalScroll && markerScrollRef.value && scrollRef.value) {
    syncingHorizontalScroll = true;
    markerScrollRef.value.scrollLeft = scrollRef.value.scrollLeft;
    syncingHorizontalScroll = false;
  }
}

function onMarkerScroll() {
  if (syncingHorizontalScroll || !markerScrollRef.value || !scrollRef.value) return;
  syncingHorizontalScroll = true;
  scrollRef.value.scrollLeft = markerScrollRef.value.scrollLeft;
  mainScrollLeft.value = markerScrollRef.value.scrollLeft;
  syncingHorizontalScroll = false;
}

function toggleVelocityCollapse() {
  velocityCollapsed.value = !velocityCollapsed.value;
}

// Drag the handle above the velocity panel up/down to resize it; dragging
// down past a small threshold collapses it out of the way entirely, freeing
// up room for the note grid above. A plain click (no meaningful drag) is
// treated as a shorthand for toggling collapse, now that there's no
// dedicated header label to click instead.
const CLICK_DRAG_THRESHOLD_PX = 3;

// Reads clientY off either a MouseEvent or a TouchEvent so the drag logic
// below doesn't need two copies — touchend has no `.touches` left, hence
// the `changedTouches` fallback.
function clientYOf(e) {
  const touch = e.touches?.[0] ?? e.changedTouches?.[0];
  return touch ? touch.clientY : e.clientY;
}

function onVelocityResizeStart(e) {
  e.preventDefault();
  const startY = clientYOf(e);
  const startHeight = velocityCollapsed.value ? 0 : velocityHeight.value;
  const prevUserSelect = document.body.style.userSelect;
  document.body.style.userSelect = 'none';
  let dragged = false;

  function onMove(ev) {
    const y = clientYOf(ev);
    if (Math.abs(y - startY) > CLICK_DRAG_THRESHOLD_PX) dragged = true;
    const proposedHeight = startHeight + (startY - y);
    if (proposedHeight <= VELOCITY_COLLAPSE_THRESHOLD) {
      velocityCollapsed.value = true;
    } else {
      velocityCollapsed.value = false;
      velocityHeight.value = Math.max(MIN_VELOCITY_HEIGHT, Math.min(MAX_VELOCITY_HEIGHT, proposedHeight));
    }
  }

  function onUp() {
    document.body.style.userSelect = prevUserSelect;
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    if (!dragged) toggleVelocityCollapse();
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchmove', onMove);
  window.addEventListener('touchend', onUp);
}

// The grid canvas is only as wide/tall as the loop length, but its scrollable
// container can be larger — leaving empty background beyond the canvas that
// the canvas's own mousedown handler never sees. Clicking there should still
// deselect, same as clicking anywhere else outside the actual note grid.
function onScrollAreaPointerDown(e) {
  if (e.target === scrollRef.value) clearSelection();
}

// Clicking a bar's own background (the gaps around its controls, not the
// controls themselves) also deselects — clicking a select/input/button still
// does whatever it normally does, since the target there is that control,
// not the bar div. Shared by the toolbar and the velocity panel's header.
function onToolbarMouseDown(e) {
  if (e.target === e.currentTarget) clearSelection();
}

// Cmd/Ctrl + wheel zooms the horizontal (time) axis, keeping the beat under
// the cursor fixed in place — matches FL Studio's piano roll zoom behavior.
// Adding Shift zooms vertically instead (taller/shorter rows), keeping
// whichever row is under the cursor fixed in place the same way.
// With the Zoom tool selected, wheel works without modifiers; pinch handles
// both axes on touch.
function onWheel(e) {
  const zoomTool = isZoomToolActive();
  if (!zoomTool && !e.metaKey && !e.ctrlKey) return;
  e.preventDefault();

  const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;

  if (e.shiftKey) {
    const rawDelta = e.deltaY !== 0 ? e.deltaY : e.deltaX;
    const verticalFactor = rawDelta < 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
    zoomRowHeightAt(e.clientY, verticalFactor);
    return;
  }

  zoomBeatWidthAt(e.clientX, factor);
}

// True piano coloring: white keys light, black keys dark, like a real
// keyboard, each with a subtle glossy gradient for a nicer keyboard look.
// Only used for MIDI tracks — drum tracks render <DrumPadList> instead.
function drawKeys() {
  const canvas = keysCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const { keys } = THEME;
  const rh = rowHeight.value;
  ctx.clearRect(0, 0, KEY_WIDTH, canvasHeight.value);

  for (let p = HIGH_PITCH; p >= LOW_PITCH; p--) {
    const y = pitchToY(p);
    const isPressed = p === previewingPitch.value;
    const isBlack = [1, 3, 6, 8, 10].includes(p % 12);
    const isOctave = p % 12 === 0;

    if (isPressed) {
      ctx.fillStyle = keys.pressed;
    } else if (isBlack) {
      // Horizontal bevel highlight, like a glossy black key catching light.
      const grad = ctx.createLinearGradient(0, 0, KEY_WIDTH, 0);
      grad.addColorStop(0, keys.blackStart);
      grad.addColorStop(1, keys.blackEnd);
      ctx.fillStyle = grad;
    } else {
      // Vertical gradient gives white keys a rounded, glossy edge; the C-row
      // gets a slightly darker tint so octave boundaries read at a glance.
      const grad = ctx.createLinearGradient(0, y, 0, y + rh);
      const top = isOctave ? shade(keys.whiteOctave, 0.08) : keys.whiteTop;
      const bottom = isOctave ? keys.whiteOctave : keys.whiteBottom;
      grad.addColorStop(0, top);
      grad.addColorStop(1, bottom);
      ctx.fillStyle = grad;
    }
    ctx.fillRect(0, y, KEY_WIDTH, rh);
    ctx.strokeStyle = isBlack ? keys.borderBlack : keys.borderWhite;
    ctx.strokeRect(0, y, KEY_WIDTH, rh);

    if (isOctave) {
      ctx.fillStyle = isPressed ? keys.labelOnPressed : isBlack ? keys.labelOnBlack : keys.labelOnWhite;
      ctx.font = '9px JetBrains Mono';
      ctx.fillText(noteName(p), 2, y + rh - 3);
    }
  }
}

// Short pad label for note blocks — full names are shown in the pad list.
function drumPadNoteLabel(name) {
  return (name ?? '').slice(0, 2);
}

// Returns the label drawn inside a note: a MIDI note name for MIDI tracks,
// the assigned pad's first two letters for drum tracks (falling back to blank
// if the pad was since removed).
function noteLabel(note) {
  if (!isDrumTrack.value) return noteName(note.pitch);
  const name = activeTrack.value?.pads?.find((p) => p.id === note.pitch)?.name ?? '';
  return drumPadNoteLabel(name);
}

function ghostNoteLabel(note) {
  const sourceTrack = ghostSource.value?.track;
  if (!sourceTrack) return '';
  if (sourceTrack.kind === 'drum') {
    const name = sourceTrack.pads?.find((p) => p.id === note.pitch)?.name ?? '';
    return drumPadNoteLabel(name);
  }
  return noteName(note.pitch);
}

// Faded reference overlay — drawn beneath editable notes, not hit-tested.
function drawGhostNotes(ctx, rh) {
  const pattern = ghostPattern.value;
  const notes = pattern?.notes;
  if (!notes?.length) return;

  const ghostFillTop = 'rgba(210, 214, 222, 0.42)';
  const ghostFillBottom = 'rgba(170, 176, 188, 0.28)';
  const ghostBorder = 'rgba(195, 200, 210, 0.55)';

  for (const note of notes) {
    if (!keyToIndex.value.has(note.pitch)) continue;

    const x = beatToX(note.startBeat);
    const y = pitchToY(note.pitch);
    const nw = note.duration * beatWidth.value;
    if (x + nw < 0 || x > gridWidth.value) continue;

    const noteRect = [x + 1, y + 1, nw - 1, rh - 1];
    const grad = ctx.createLinearGradient(0, noteRect[1], 0, noteRect[1] + noteRect[3]);
    grad.addColorStop(0, ghostFillTop);
    grad.addColorStop(1, ghostFillBottom);
    ctx.fillStyle = grad;
    ctx.globalAlpha = (note.velocity / 127) * 0.35 + 0.25;
    traceRoundedRect(ctx, ...noteRect, NOTE_CORNER_RADIUS);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = ghostBorder;
    ctx.lineWidth = 1;
    traceRoundedRect(ctx, ...noteRect, NOTE_CORNER_RADIUS);
    ctx.stroke();

    if (nw > 18) {
      ctx.fillStyle = 'rgba(235, 238, 244, 0.55)';
      ctx.font = '9px JetBrains Mono';
      ctx.textBaseline = 'middle';
      ctx.fillText(ghostNoteLabel(note), x + 3, y + rh / 2 + 1, nw - 6);
    }
  }
}

function drawGrid() {
  const canvas = gridCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = gridWidth.value;
  const h = canvasHeight.value;
  const rh = rowHeight.value;
  const { grid } = THEME;
  ctx.clearRect(0, 0, w, h);

  // Background rows
  rows.value.forEach((row, i) => {
    const y = i * rh;
    const isBlack = !isDrumTrack.value && [1, 3, 6, 8, 10].includes(row.key % 12);
    ctx.fillStyle = isBlack ? grid.rowDark : grid.rowLight;
    ctx.fillRect(0, y, w, rh);
  });

  // Grid lines — snap subdivisions, with slightly stronger lines on beats.
  const snapW = snap.value * beatWidth.value;
  for (let x = 0; x <= w; x += snapW) {
    const isBeat = Math.abs(x / beatWidth.value - Math.round(x / beatWidth.value)) < 0.001;
    ctx.strokeStyle = isBeat ? grid.lineBeat : grid.lineSub;
    ctx.lineWidth = isBeat ? 1 : 0.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  // Bar guides — drawn on top so each 4-beat bar has a clearly visible boundary.
  const barW = BEATS_PER_BAR * beatWidth.value;
  ctx.strokeStyle = grid.lineBar;
  ctx.lineWidth = 1.5;
  for (let x = 0; x <= w; x += barW) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }

  const loop = activeLoopRegion.value;
  if (loop && loop.endBeat > loop.startBeat) {
    const x0 = beatToX(loop.startBeat);
    const x1 = beatToX(loop.endBeat);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    if (x0 > 0) ctx.fillRect(0, 0, x0, h);
    if (x1 < w) ctx.fillRect(x1, 0, w - x1, h);
    ctx.fillStyle = 'rgba(102, 153, 255, 0.08)';
    ctx.fillRect(x0, 0, x1 - x0, h);
  }

  drawGhostNotes(ctx, rh);

  // Notes — rounded, with a soft top-lit gradient and a darker border.
  const notes = getNotes();
  for (const note of notes) {
    const color = colorForNote(note);
    const topColor = shade(color, 0.3);
    const bottomColor = shade(color, -0.08);
    const borderColor = shade(color, -0.32);
    const x = beatToX(note.startBeat);
    const y = pitchToY(note.pitch);
    const nw = note.duration * beatWidth.value;
    const isSelected = selectedNoteIds.value.has(note.id);
    const noteRect = [x + 1, y + 1, nw - 1, rh - 1];

    const grad = ctx.createLinearGradient(0, noteRect[1], 0, noteRect[1] + noteRect[3]);
    grad.addColorStop(0, topColor);
    grad.addColorStop(1, bottomColor);
    ctx.fillStyle = grad;
    ctx.globalAlpha = (note.velocity / 127) * 0.6 + 0.4;
    traceRoundedRect(ctx, ...noteRect, NOTE_CORNER_RADIUS);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = isSelected ? THEME.note.selectedOutline : borderColor;
    ctx.lineWidth = isSelected ? 1.5 : 1;
    traceRoundedRect(ctx, ...noteRect, NOTE_CORNER_RADIUS);
    ctx.stroke();

    if (nw > 18) {
      ctx.fillStyle = 'rgba(10, 10, 15, 0.75)';
      ctx.font = '9px JetBrains Mono';
      ctx.textBaseline = 'middle';
      ctx.fillText(noteLabel(note), x + 3, y + rh / 2 + 1, nw - 6);
    }
  }
}

function drawOverlays() {
  const canvas = playheadCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = gridWidth.value;
  const h = canvasHeight.value;
  ctx.clearRect(0, 0, w, h);

  if (showPasteMarker.value) {
    const markerX = beatToX(pasteMarkerBeat.value);
    ctx.strokeStyle = PASTE_MARKER_COLOR;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(markerX, 0);
    ctx.lineTo(markerX, h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (!props.playing) return;

  const px = beatToX(displayPlayheadBeat.value);
  // Kept a distinct warm color (not part of the greenish note palette) so the
  // playhead never blends visually into the notes it's scrubbing across.
  ctx.strokeStyle = '#ffb454';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, 0);
  ctx.lineTo(px, h);
  ctx.stroke();
}

function render() {
  if (!isDrumTrack.value) drawKeys();
  drawGrid();
}

// Structural redraws only — note/track/snap/zoom/selection edits, not the fast-moving playhead.
watch(
  () => [
    props.tracks,
    props.activeTrackId,
    activeLoopEndBeat.value,
    ghostPattern.value?.id,
    ghostPattern.value?.notes,
    snap.value,
    beatWidth.value,
    rowZoom.value,
    selectedNoteIds.value,
    pasteMarkerBeat.value,
    props.loopRegion,
    loopDragPreview.value,
  ],
  () => nextTick(() => {
    render();
    drawOverlays();
  }),
  { deep: true }
);

// The playhead redraws every animation frame on its own lightweight overlay
// canvas, so it never triggers the expensive grid/notes redraw above.
watch(liveBeat, drawOverlays);
watch(displayPlayheadBeat, drawOverlays);
watch(() => props.playing, drawOverlays);

watch(
  () => editTool.value,
  (tool) => {
    if (tool !== 'mobile-multi') {
      clearMobileLastEmptyTap();
      clearMobileTouchSession();
    }
  }
);

watch(
  () => props.activeTrackId,
  () => {
    clearSelection();
  }
);

watch(
  () => activePattern.value?.id,
  () => {
    clearSelection();
  }
);

// Release the previewed key on mouseup/touchend/blur anywhere, not just
// inside the keys canvas, so a stray note never gets stuck on if the
// pointer/finger drifts off.
window.addEventListener('mouseup', stopPreview);
window.addEventListener('touchend', onPreviewTouchEnd);
window.addEventListener('touchcancel', onPreviewTouchEnd);
window.addEventListener('blur', stopPreview);
window.addEventListener('mousemove', onWindowDragMove);
window.addEventListener('mouseup', onWindowDragEnd);
window.addEventListener('touchmove', onWindowDragTouchMove, { passive: false, capture: true });
window.addEventListener('touchend', onWindowDragTouchEnd);
window.addEventListener('touchcancel', onWindowDragTouchEnd);

// Cmd/Ctrl+A selects every note in the active track instead of the browser's
// page-wide "select all text". Only genuinely text-editable fields (not
// <select> dropdowns or buttons, which have no text-selection semantics of
// their own but can still hold keyboard focus) are excluded, so normal text
// selection still works in e.g. the track rename input.
function onKeyDown(e) {
  const target = e.target;
  const isTextField =
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable ||
    (target?.tagName === 'INPUT' && !['button', 'checkbox', 'radio', 'range'].includes(target.type));
  if (isTextField) return;

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
    e.preventDefault();
    selectAllNotes();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c') {
    e.preventDefault();
    copySelection();
    return;
  }

  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
    e.preventDefault();
    pasteClipboard();
    return;
  }

  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNoteIds.value.size > 0) {
    e.preventDefault();
    deleteSelectedNotes();
  }
}
window.addEventListener('keydown', onKeyDown);

// Clicking anywhere outside the piano roll (another panel, the transport bar,
// blank page background) clears the current note selection. Clicks inside —
// including the toolbar, so changing Snap/Length doesn't deselect — are left
// to the piano roll's own handlers.
function onDocumentMouseDown(e) {
  if (selectedNoteIds.value.size === 0) return;
  if (rootRef.value && !rootRef.value.contains(e.target)) {
    clearSelection();
  }
}
window.addEventListener('mousedown', onDocumentMouseDown);
window.addEventListener('touchstart', onDocumentMouseDown);

onMounted(() => {
  render();
  drawOverlays();
  bindScrollRefTouchGuards();
  // Drum tracks have few, short rows — no need to center-scroll those; MIDI
  // tracks default to scrolling roughly around middle C.
  if (scrollRef.value && !isDrumTrack.value) {
    scrollRef.value.scrollTop = pitchToY(60) - 100;
  }
});

onUnmounted(() => {
  unbindScrollRefTouchGuards();
  window.removeEventListener('keydown', onKeyDown);
  window.removeEventListener('mousedown', onDocumentMouseDown);
  window.removeEventListener('touchstart', onDocumentMouseDown);
  stopPreviewNow();
  window.removeEventListener('mouseup', stopPreview);
  window.removeEventListener('touchend', onPreviewTouchEnd);
  window.removeEventListener('touchcancel', onPreviewTouchEnd);
  window.removeEventListener('blur', stopPreview);
  window.removeEventListener('mousemove', onWindowDragMove);
  window.removeEventListener('mouseup', onWindowDragEnd);
  window.removeEventListener('touchmove', onWindowDragTouchMove, { capture: true });
  window.removeEventListener('touchend', onWindowDragTouchEnd);
  window.removeEventListener('touchcancel', onWindowDragTouchEnd);
});
</script>

<style scoped>
.piano-roll {
  min-height: 300px;
}

.vertical-label {
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}

/* Block browser pan/scroll on the grid while editing — `manipulation` still
   allows single-finger panning on the scroll parent, which steals note moves
   on tablet. Only the Zoom tool opts back into native pan (see .touch-pan). */
.piano-roll canvas {
  touch-action: none;
}

.piano-roll canvas.touch-pan {
  touch-action: pan-x pan-y;
}

.overflow-y-hidden-native.touch-none {
  overscroll-behavior: none;
}

/* Grid vertical + timeline horizontal use <TouchScrollbar>; hide native thumbs
   on the grid so they don't double up. Per-axis hiding is WebKit-only. */
.overflow-y-hidden-native::-webkit-scrollbar:vertical {
  width: 0;
  display: none;
}

.overflow-y-hidden-native::-webkit-scrollbar:horizontal {
  height: 0;
  display: none;
}

.marker-scroll-native-hidden::-webkit-scrollbar:horizontal {
  height: 0;
  display: none;
}
</style>
