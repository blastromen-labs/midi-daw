<template>
  <div class="flex items-end gap-2">
    <ToolbarField label="OUT">
      <select :value="outputId" @change="onOutputChange" class="text-xs max-w-28 min-w-0 py-0.5">
        <option value="">—</option>
        <option v-for="d in outputs" :key="d.id" :value="d.id">{{ d.name }}</option>
      </select>
    </ToolbarField>
    <ToolbarField label="CH">
      <select :value="channel" @change="onChannelChange" class="toolbar-compact text-xs w-10 min-w-[2.5rem] text-center">
        <option v-for="ch in 16" :key="ch - 1" :value="ch - 1">{{ ch }}</option>
      </select>
    </ToolbarField>
  </div>
</template>

<script setup>
import ToolbarField from './ToolbarField.vue';

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
