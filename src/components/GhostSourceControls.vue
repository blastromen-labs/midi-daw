<template>
  <ToolbarField label="Ghost">
    <div class="flex items-center gap-0.5">
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
import { computed } from 'vue';
import ToolbarField from './ToolbarField.vue';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  track: { type: Object, default: null },
});

const emit = defineEmits(['change']);

const ghostSourceTrack = computed(() =>
  props.tracks.find((t) => t.id === props.track?.ghostTrackId) ?? null
);

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
</script>
