<template>
  <div
    class="toolbar-field inline-flex flex-col items-center gap-px flex-shrink-0"
    :title="title"
  >
    <div class="toolbar-field__control flex items-center justify-center min-h-[28px]">
      <slot />
    </div>
    <span
      v-if="label"
      class="text-[7px] leading-none text-muted-dim uppercase tracking-wider select-none"
    >{{ label }}</span>
    <span v-else class="text-[7px] leading-none invisible select-none" aria-hidden="true">.</span>
  </div>
</template>

<script setup>
defineProps({
  label: { type: String, default: '' },
  title: { type: String, default: '' },
});
</script>
