<template>
  <div class="live-view flex flex-col h-full bg-panel overflow-hidden">
    <div class="flex items-center justify-end gap-2 px-2 pt-2 pb-1 border-b border-line/60 flex-shrink-0">
      <button
        type="button"
        class="h-9 px-2.5 rounded-md text-[10px] font-semibold uppercase tracking-wider flex-shrink-0 ring-1 transition-colors"
        :class="showHidden
          ? 'ring-white/50 bg-surface text-white'
          : 'ring-line-light bg-surface/60 text-muted-dim hover:ring-white/40 hover:text-white'"
        :title="showHidden
          ? 'Showing tracks/patterns marked Hide from Live — click to hide them again'
          : 'Show tracks and patterns marked Hide from Live (still play via scenes)'"
        @click="showHidden = !showHidden"
      >
        Show hidden
      </button>
    </div>

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
import { ref } from 'vue';
import SongLiveBlock from './SongLiveBlock.vue';

defineProps({
  /** Ordered Live-set entries: { id, name, color, bpm, tracks, scenes }. */
  liveSongs: { type: Array, required: true },
  /** songId → last-launched scene id for that song's UI. */
  activeSceneBySong: { type: Object, default: () => ({}) },
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
  'move-song',
]);

const showHidden = ref(false);
</script>
