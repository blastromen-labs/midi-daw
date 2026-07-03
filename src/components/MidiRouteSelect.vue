<template>
  <div class="flex items-center gap-2">
    <select :value="outputId" @change="onOutputChange" class="text-xs flex-1 min-w-0">
      <option value="">No output</option>
      <option v-for="d in outputs" :key="d.id" :value="d.id">{{ d.name }}</option>
    </select>
    <select :value="channel" @change="onChannelChange" class="text-xs w-14">
      <option v-for="ch in 16" :key="ch - 1" :value="ch - 1">Ch {{ ch }}</option>
    </select>
  </div>
</template>

<script setup>
defineProps({
  outputId: { type: String, default: '' },
  channel: { type: Number, default: 0 },
  outputs: { type: Array, default: () => [] },
});

const emit = defineEmits(['output-change', 'channel-change']);

function onOutputChange(e) {
  emit('output-change', e.target.value);
}

function onChannelChange(e) {
  emit('channel-change', Number(e.target.value));
}
</script>
