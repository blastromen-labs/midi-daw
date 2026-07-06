<template>
  <ToolbarField label="Tool">
    <div class="flex items-center gap-0.5 flex-shrink-0" ref="rootRef">
      <button
        ref="triggerRef"
        type="button"
        class="flex items-center gap-1 pl-1 pr-1 py-0.5 rounded text-xs font-semibold bg-surface-hover hover:bg-surface-active flex-shrink-0 w-[4.75rem]"
        :title="activeTool.label"
        @click="toggleOpen"
      >
        <component :is="activeTool.icon" class="w-3.5 h-3.5 flex-shrink-0" />
        <span class="truncate flex-1 min-w-0 text-left">{{ activeTool.shortName }}</span>
        <span class="text-[9px] text-muted-dim flex-shrink-0">▾</span>
      </button>

      <Teleport to="body">
        <div
          v-if="open"
          ref="panelRef"
          class="fixed z-50 w-56 bg-panel border border-line rounded-md shadow-lg overflow-hidden py-1"
          :style="panelStyle"
        >
          <button
            v-for="tool in tools"
            :key="tool.id"
            type="button"
            class="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-surface-hover"
            :class="modelValue === tool.id ? 'bg-surface-hover' : ''"
            :title="tool.label"
            @click="selectTool(tool.id)"
          >
            <component :is="tool.icon" class="w-3.5 h-3.5 flex-shrink-0 text-muted" />
            <span class="text-xs">{{ tool.shortName }}</span>
          </button>
        </div>
      </Teleport>

      <div class="h-4 w-px bg-line-light flex-shrink-0 mx-0.5"></div>

      <button
        type="button"
        class="daw-toolbar-icon-btn bg-surface-hover hover:bg-surface-active text-muted transition-colors"
        title="Select all notes (⌘A)"
        @click="$emit('select-all')"
      >
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      </button>
      <button
        type="button"
        class="daw-toolbar-icon-btn transition-colors"
        :class="hasSelection
          ? 'bg-surface-hover hover:bg-surface-active text-muted'
          : 'bg-surface-hover/40 text-muted/30 cursor-not-allowed'"
        title="Copy selection (⌘C)"
        :disabled="!hasSelection"
        @click="$emit('copy')"
      >
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <button
        type="button"
        class="daw-toolbar-icon-btn transition-colors"
        :class="hasClipboard
          ? 'bg-surface-hover hover:bg-surface-active text-muted'
          : 'bg-surface-hover/40 text-muted/30 cursor-not-allowed'"
        title="Paste at marker (⌘V)"
        :disabled="!hasClipboard"
        @click="$emit('paste')"
      >
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <rect x="8" y="2" width="8" height="4" rx="1" />
        </svg>
      </button>

      <button
        v-if="hasSelection"
        type="button"
        class="daw-toolbar-icon-btn bg-surface-hover hover:bg-surface-active text-red-400 transition-colors"
        title="Delete selection"
        @click="$emit('delete-selection')"
      >
        <svg viewBox="0 0 24 24" class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14Z" />
          <path d="M10 11v6M14 11v6" />
        </svg>
      </button>
    </div>
  </ToolbarField>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted, h } from 'vue';
import ToolbarField from './ToolbarField.vue';

const props = defineProps({
  modelValue: { type: String, default: 'multi' },
  hasSelection: { type: Boolean, default: false },
  hasClipboard: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue', 'delete-selection', 'select-all', 'copy', 'paste']);

const open = ref(false);
const rootRef = ref(null);
const triggerRef = ref(null);
const panelRef = ref(null);
const panelStyle = ref({});

const IconMulti = {
  render() {
    return h('svg', { viewBox: '0 0 24 24', fill: 'currentColor', stroke: 'none' }, [
      h('path', { d: 'M5.5 3.21l11 8.58-4.43 1.57 2.87 5.66-2.28 1.15-2.87-5.66-4.84 1.58z' }),
    ]);
  },
};

const IconMobileMulti = {
  render() {
    return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('rect', { x: '7', y: '4', width: '10', height: '16', rx: '2' }),
      h('path', { d: 'M11 17h2' }),
      h('path', { d: 'M9 8h6M9 11h4', 'stroke-linecap': 'round' }),
    ]);
  },
};

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

const IconZoom = {
  render() {
    return h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('circle', { cx: '11', cy: '11', r: '8' }),
      h('path', { d: 'm21 21-4.3-4.3' }),
      h('path', { d: 'M11 8v6M8 11h6' }),
    ]);
  },
};

const tools = [
  { id: 'multi', shortName: 'Multi', label: 'Multi — draw, move, Cmd-drag select, right-drag erase', icon: IconMulti },
  {
    id: 'mobile-multi',
    shortName: 'Touch',
    label: 'Touch — tap draw/erase, long-press length, double-tap drag select, pinch zoom',
    icon: IconMobileMulti,
  },
  { id: 'pen', shortName: 'Pen', label: 'Pen — draw notes', icon: IconPen },
  { id: 'erase', shortName: 'Erase', label: 'Erase — remove notes', icon: IconErase },
  { id: 'select', shortName: 'Select', label: 'Select — move and marquee', icon: IconSelect },
  { id: 'length', shortName: 'Length', label: 'Length — resize notes', icon: IconLength },
  { id: 'zoom', shortName: 'Zoom', label: 'Zoom — pinch or scroll wheel', icon: IconZoom },
];

const activeTool = computed(() => tools.find((t) => t.id === props.modelValue) ?? tools[0]);

function updatePosition() {
  const el = triggerRef.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  panelStyle.value = { top: rect.bottom + 4 + 'px', left: rect.left + 'px' };
}

function toggleOpen() {
  open.value = !open.value;
  if (open.value) nextTick(updatePosition);
}

function selectTool(toolId) {
  emit('update:modelValue', toolId);
  open.value = false;
}

function onDocumentPointerDown(e) {
  if (!open.value) return;
  const insideTrigger = rootRef.value?.contains(e.target);
  const insidePanel = panelRef.value?.contains(e.target);
  if (!insideTrigger && !insidePanel) {
    open.value = false;
  }
}

function onWindowChange() {
  if (open.value) updatePosition();
}

function onKeyDown(e) {
  if (open.value && e.key === 'Escape') {
    open.value = false;
  }
}

window.addEventListener('mousedown', onDocumentPointerDown);
window.addEventListener('touchstart', onDocumentPointerDown);
window.addEventListener('scroll', onWindowChange, true);
window.addEventListener('resize', onWindowChange);
window.addEventListener('keydown', onKeyDown);

onUnmounted(() => {
  window.removeEventListener('mousedown', onDocumentPointerDown);
  window.removeEventListener('touchstart', onDocumentPointerDown);
  window.removeEventListener('scroll', onWindowChange, true);
  window.removeEventListener('resize', onWindowChange);
  window.removeEventListener('keydown', onKeyDown);
});
</script>
