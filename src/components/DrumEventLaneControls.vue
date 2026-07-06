<template>
  <div
    class="drum-event-lane-controls w-full min-w-0"
    :class="compact ? 'flex flex-col items-center gap-0.5' : 'flex items-center gap-1'"
  >
    <DrumVelocityPadSelect
      v-if="padId"
      :model-value="padId"
      :pads="pads"
      :compact="compact"
      class="min-w-0"
      :class="compact ? 'flex-shrink-0' : 'flex-1'"
      @update:model-value="emit('update:padId', $event)"
    />

    <div
      class="flex rounded border border-line-light overflow-hidden flex-shrink-0"
      role="group"
      aria-label="Lane edit mode"
    >
      <button
        type="button"
        class="px-1 font-semibold leading-none transition-colors outline-none focus-visible:ring-1 focus-visible:ring-accent"
        :class="[
          compact ? 'py-0.5 text-[8px] min-w-[1.125rem]' : 'py-0.5 text-[9px] min-w-[1.75rem]',
          mode === 'velocity' ? 'bg-accent/20 text-accent' : 'bg-surface text-muted hover:bg-surface-hover',
        ]"
        title="Edit velocity"
        @mousedown.stop
        @touchstart.stop
        @click.stop="emit('update:mode', 'velocity')"
      >
        VEL
      </button>
      <button
        type="button"
        class="px-1 font-semibold leading-none transition-colors outline-none focus-visible:ring-1 focus-visible:ring-accent border-l border-line-light"
        :class="[
          compact ? 'py-0.5 text-[8px] min-w-[1.125rem]' : 'py-0.5 text-[9px] min-w-[1.75rem]',
          mode === 'pitch' ? 'bg-accent/20 text-accent' : 'bg-surface text-muted hover:bg-surface-hover',
        ]"
        title="Edit pitch (center = default)"
        @mousedown.stop
        @touchstart.stop
        @click.stop="emit('update:mode', 'pitch')"
      >
        PIT
      </button>
    </div>
  </div>
</template>

<script setup>
import DrumVelocityPadSelect from './DrumVelocityPadSelect.vue';

defineProps({
  pads: { type: Array, default: () => [] },
  padId: { type: String, default: null },
  mode: { type: String, default: 'velocity' },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(['update:padId', 'update:mode']);
</script>
