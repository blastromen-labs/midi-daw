<template>
  <ToolbarField label="View" :title="title">
    <button
      type="button"
      class="px-2 py-1 rounded text-[10px] font-semibold leading-none bg-surface-hover hover:bg-surface-active transition-colors flex-shrink-0"
      @click="$emit('click')"
    >
      {{ label }}
    </button>
  </ToolbarField>
</template>

<script setup>
import ToolbarField from './ToolbarField.vue';

// A single toggle button, same idea as the Play/Stop transport button: it
// always shows the *action* a click performs ("Live" while in Piano Roll,
// "Roll" while in Live mode), not the current state — so there's one control
// instead of two always-visible mode pills. Kept pinned to the toolbar's
// right edge by both PianoRoll and LiveView (see their `flex-1` spacer
// before this component) so it never changes position when you switch.
defineProps({
  label: { type: String, required: true },
  title: { type: String, default: '' },
});
defineEmits(['click']);
</script>
