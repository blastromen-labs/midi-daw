<template>
  <input
    type="range"
    min="0"
    max="100"
    step="1"
    :value="display"
    class="volume-slider h-1 accent-accent cursor-pointer"
    :class="wide ? 'w-full min-w-0' : 'w-10 flex-shrink-0'"
    :title="title ?? `Volume ${display}%`"
    @input="onInput"
    @mousedown.stop
    @touchstart.stop
  />
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  modelValue: { type: Number, default: 1 },
  title: String,
  wide: Boolean,
});

const emit = defineEmits(['update:modelValue']);

const display = computed(() => Math.round((props.modelValue ?? 1) * 100));

function onInput(e) {
  emit('update:modelValue', Number(e.target.value) / 100);
}
</script>
