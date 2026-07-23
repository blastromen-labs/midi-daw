<template>
  <!--
    min-h-0 on the flex child is required so overflow can engage: without it,
    the scroll area grows to fit every song and the outer h-full box clips
    content with no scrollbar (classic flex min-height:auto pitfall).
  -->
  <div class="live-view flex flex-col h-full min-h-0 bg-panel overflow-hidden">
    <div
      class="live-view__scroll flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain p-2 flex flex-col gap-3"
    >
      <SongLiveBlock
        v-for="(entry, index) in liveSongs"
        :key="entry.id"
        class="shrink-0"
        :song="entry"
        :tracks="entry.tracks"
        :scenes="entry.scenes"
        :active-scene-id="activeSceneBySong[entry.id] ?? null"
        :playing="playing"
        :show-hidden="showHidden"
        :edit-mode="editMode"
        :midi-outputs="midiOutputs"
        :can-move-up="index > 0"
        :can-move-down="index < liveSongs.length - 1"
        @trigger-pattern="(songId, trackId, patternId) => emit('trigger-pattern', songId, trackId, patternId)"
        @hold-pattern-down="(songId, trackId, patternId) => emit('hold-pattern-down', songId, trackId, patternId)"
        @hold-pattern-up="(songId, trackId) => emit('hold-pattern-up', songId, trackId)"
        @reorder-patterns="(songId, trackId, from, to) => emit('reorder-patterns', songId, trackId, from, to)"
        @launch-scene="(songId, sceneId) => emit('launch-scene', songId, sceneId)"
        @add-scene="(songId) => emit('add-scene', songId)"
        @edit-scene="(songId, sceneId) => emit('edit-scene', songId, sceneId)"
        @edit-track="(songId, trackId) => emit('edit-track', songId, trackId)"
        @edit-pattern="(songId, trackId, patternId) => emit('edit-pattern', songId, trackId, patternId)"
        @open-pattern-roll="(songId, trackId, patternId) => emit('open-pattern-roll', songId, trackId, patternId)"
        @move-song="(songId, direction) => emit('move-song', songId, direction)"
      />

      <div v-if="!liveSongs.length" class="text-sm text-muted-dim px-2 py-4 shrink-0">
        No songs yet — create one from the Song menu in Roll view
      </div>
    </div>
  </div>
</template>

<script setup>
import SongLiveBlock from './SongLiveBlock.vue';

defineProps({
  /** Ordered Live-set entries: { id, name, color, bpm, tracks, scenes }. */
  liveSongs: { type: Array, required: true },
  /** songId → last-launched scene id for that song's UI. */
  activeSceneBySong: { type: Object, default: () => ({}) },
  playing: Boolean,
  /** When true, tracks/patterns marked Hide from Live stay visible in the grid. */
  showHidden: { type: Boolean, default: false },
  /** When true, show pen buttons that open track/pattern/scene edit modals. */
  editMode: { type: Boolean, default: false },
  midiOutputs: { type: Array, default: () => [] },
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
  'edit-pattern',
  'open-pattern-roll',
  'move-song',
]);
</script>
