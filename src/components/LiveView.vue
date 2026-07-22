<template>
  <div class="live-view flex flex-col h-full bg-panel overflow-hidden">
    <div class="flex-1 overflow-auto p-2 flex flex-col gap-3">
      <SongLiveBlock
        v-for="(entry, index) in liveSongs"
        :key="entry.id"
        :song="entry"
        :tracks="entry.tracks"
        :scenes="entry.scenes"
        :active-scene-id="activeSceneBySong[entry.id] ?? null"
        :playing="playing"
        :show-hidden="showHidden"
        :can-move-up="index > 0"
        :can-move-down="index < liveSongs.length - 1"
        @trigger-pattern="(songId, trackId, patternId) => emit('trigger-pattern', songId, trackId, patternId)"
        @hold-pattern-down="(songId, trackId, patternId) => emit('hold-pattern-down', songId, trackId, patternId)"
        @hold-pattern-up="(songId, trackId) => emit('hold-pattern-up', songId, trackId)"
        @reorder-patterns="(songId, trackId, from, to) => emit('reorder-patterns', songId, trackId, from, to)"
        @launch-scene="(songId, sceneId) => emit('launch-scene', songId, sceneId)"
        @add-scene="(songId) => emit('add-scene', songId)"
        @edit-scene="(songId, sceneId) => emit('edit-scene', songId, sceneId)"
        @move-song="(songId, direction) => emit('move-song', songId, direction)"
      />

      <div v-if="!liveSongs.length" class="text-sm text-muted-dim px-2 py-4">
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
});

const emit = defineEmits([
  'trigger-pattern',
  'hold-pattern-down',
  'hold-pattern-up',
  'reorder-patterns',
  'launch-scene',
  'add-scene',
  'edit-scene',
  'move-song',
]);
</script>
