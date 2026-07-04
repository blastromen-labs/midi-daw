<template>
  <div
    class="edit-tool-fab absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2"
    style="padding-bottom: env(safe-area-inset-bottom, 0); padding-right: env(safe-area-inset-right, 0)"
    @touchstart.stop
    @mousedown.stop
  >
    <TransitionGroup
      name="fab-satellite"
      tag="div"
      class="flex flex-col items-end gap-2"
    >
      <button
        v-if="expanded"
        key="hide"
        type="button"
        class="fab-satellite w-11 h-11 rounded-full flex items-center justify-center border border-line bg-surface-hover text-muted shadow-lg"
        title="Hide tool menu"
        @click="onHide"
      >
        <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
          <path d="M1 1l22 22" />
        </svg>
      </button>

      <button
        v-if="expanded && hasSelection"
        key="delete"
        type="button"
        class="fab-satellite w-11 h-11 rounded-full flex items-center justify-center border border-line bg-surface-hover text-red-400 shadow-lg"
        title="Delete selection"
        @click="onDelete"
      >
        <svg viewBox="0 0 24 24" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>

      <button
        v-for="tool in visibleTools"
        v-show="expanded"
        :key="tool.id"
        type="button"
        class="fab-satellite w-11 h-11 rounded-full flex items-center justify-center border shadow-lg transition-colors"
        :class="modelValue === tool.id
          ? 'border-accent bg-accent text-white'
          : 'border-line bg-surface-hover text-muted hover:bg-surface-active hover:text-white'"
        :title="tool.label"
        @click="selectTool(tool.id)"
      >
        <component :is="tool.icon" class="w-5 h-5" />
      </button>
    </TransitionGroup>

    <button
      type="button"
      class="fab-main w-12 h-12 rounded-full flex items-center justify-center border-2 border-accent bg-surface shadow-lg text-white"
      :title="activeTool?.label ?? 'Tools'"
      :aria-expanded="expanded"
      @click="toggleExpanded"
    >
      <component :is="activeTool?.icon" class="w-6 h-6" />
    </button>
  </div>
</template>

<script setup>
import { ref, computed, h } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: 'pen' },
  hasSelection: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'delete-selection', 'hide']);

const expanded = ref(false);

const IconPen = {
  render() {
    return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M12 20h9' }),
      h('path', { d: 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z' }),
    ]);
  },
};

const IconErase = {
  render() {
    return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'm7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21' }),
      h('path', { d: 'M22 21H7' }),
      h('path', { d: 'm18 5 3 3' }),
    ]);
  },
};

const IconSelect = {
  render() {
    return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z' }),
      h('path', { d: 'M13 13l6 6' }),
    ]);
  },
};

const IconLength = {
  render() {
    return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M8 12h8' }),
      h('path', { d: 'M16 8l4 4-4 4' }),
      h('path', { d: 'M8 8L4 12l4 4' }),
    ]);
  },
};

const tools = [
  { id: 'pen', label: 'Pen — draw notes', icon: IconPen },
  { id: 'erase', label: 'Erase — remove notes', icon: IconErase },
  { id: 'select', label: 'Select — move and marquee', icon: IconSelect },
  { id: 'length', label: 'Length — resize notes', icon: IconLength },
];

const visibleTools = computed(() => [...tools].reverse());

const activeTool = computed(() => tools.find((t) => t.id === props.modelValue) ?? tools[0]);

function toggleExpanded() {
  expanded.value = !expanded.value;
}

function selectTool(id) {
  emit('update:modelValue', id);
  expanded.value = false;
}

function onDelete() {
  emit('delete-selection');
  expanded.value = false;
}

function onHide() {
  expanded.value = false;
  emit('hide');
}
</script>

<style scoped>
.edit-tool-fab button {
  touch-action: manipulation;
}

.fab-satellite-enter-active,
.fab-satellite-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fab-satellite-enter-from,
.fab-satellite-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.9);
}
</style>
