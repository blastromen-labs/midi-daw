<template>
  <div class="drum-pad-mute-strip flex flex-col w-full flex-shrink-0">
    <div
      v-for="pad in pads"
      :key="pad.id"
      class="flex items-center justify-center flex-shrink-0 border-b border-line/40"
      :style="{ height: rowHeight + 'px' }"
    >
      <button
        type="button"
        class="flex items-center justify-center w-7 h-7 rounded hover:bg-surface-hover transition-colors"
        :title="pad.muted ? `Unmute ${pad.name}` : `Mute ${pad.name}`"
        @mousedown.stop
        @touchstart.stop
        @click.stop="toggleMute(pad)"
      >
        <span
          class="w-2 h-2 rounded-full ring-1 transition-all pointer-events-none"
          :class="
            pad.muted
              ? 'bg-[#1a2420] ring-line/50'
              : 'bg-[#4ade80] ring-[#4ade80]/50 shadow-[0_0_5px_rgba(74,222,128,0.55)]'
          "
          aria-hidden="true"
        ></span>
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  pads: { type: Array, required: true },
  rowHeight: { type: Number, required: true },
});

const emit = defineEmits(['update-pad']);

function toggleMute(pad) {
  emit('update-pad', pad.id, { muted: !pad.muted });
}
</script>
