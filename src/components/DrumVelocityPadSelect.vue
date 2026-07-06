<template>
  <div ref="rootRef" class="drum-velocity-pad-select flex items-center justify-center w-full min-w-0">
    <button
      ref="triggerRef"
      type="button"
      class="flex items-center justify-center rounded border border-line-light bg-surface hover:bg-surface-hover hover:border-accent/40 transition-colors outline-none focus:border-accent"
      :class="compact ? 'w-6 h-6' : 'w-full gap-1 px-1 py-0.5 min-h-[1.375rem]'"
      :title="activePad ? `${activePad.name} velocity` : 'Choose pad velocity'"
      @mousedown.stop
      @touchstart.stop
      @click.stop="toggleOpen"
    >
      <span
        class="rounded-sm flex-shrink-0 ring-1 ring-line/60"
        :class="compact ? 'w-2.5 h-2.5' : 'w-2 h-2'"
        :style="{ background: activePad?.color ?? '#666' }"
      ></span>
      <template v-if="!compact">
        <span class="flex-1 min-w-0 truncate text-left text-[10px] font-semibold">
          {{ activePad?.name ?? 'Pad' }}
        </span>
        <span class="text-[8px] text-muted-dim flex-shrink-0" aria-hidden="true">{{ opensUpward ? '▴' : '▾' }}</span>
      </template>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="panelRef"
        class="fixed z-50 min-w-[9rem] max-w-[14rem] bg-panel border border-line rounded-md shadow-lg py-1 overflow-y-auto overscroll-contain touch-pan-y"
        :style="panelStyle"
        @mousedown.stop
        @touchstart.stop
      >
        <button
          v-for="pad in pads"
          :key="pad.id"
          type="button"
          class="w-full flex items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-surface-hover"
          :class="pad.id === modelValue ? 'bg-surface-hover' : ''"
          @click="selectPad(pad.id)"
        >
          <span
            class="w-2.5 h-2.5 rounded-sm flex-shrink-0 ring-1 ring-line/60"
            :style="{ background: pad.color }"
          ></span>
          <span class="truncate">{{ pad.name }}</span>
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, onUnmounted } from 'vue';

const DROPDOWN_GAP = 4;
const VIEWPORT_MARGIN = 8;
const ESTIMATED_ITEM_HEIGHT = 28;
const MIN_PANEL_HEIGHT = 56;
const MAX_PANEL_HEIGHT = 280;

const props = defineProps({
  pads: { type: Array, default: () => [] },
  modelValue: { type: String, default: null },
  compact: { type: Boolean, default: false },
});

const emit = defineEmits(['update:modelValue']);

const open = ref(false);
const opensUpward = ref(false);
const rootRef = ref(null);
const triggerRef = ref(null);
const panelRef = ref(null);
const panelStyle = ref({});

const activePad = computed(() => props.pads.find((p) => p.id === props.modelValue) ?? null);

function estimatePanelHeight() {
  return Math.min(props.pads.length * ESTIMATED_ITEM_HEIGHT + 8, MAX_PANEL_HEIGHT);
}

function updatePosition() {
  const trigger = triggerRef.value;
  if (!trigger) return;

  const rect = trigger.getBoundingClientRect();
  const viewportH = window.innerHeight;
  const viewportW = window.innerWidth;
  const panel = panelRef.value;
  const measuredHeight = panel?.offsetHeight || estimatePanelHeight();
  const preferredHeight = Math.min(measuredHeight, MAX_PANEL_HEIGHT);

  const spaceBelow = Math.max(0, viewportH - rect.bottom - VIEWPORT_MARGIN);
  const spaceAbove = Math.max(0, rect.top - VIEWPORT_MARGIN);

  // Open upward when there isn't room below and there's more space above.
  opensUpward.value =
    spaceBelow < preferredHeight && spaceAbove > spaceBelow;

  const maxHeight = Math.max(
    MIN_PANEL_HEIGHT,
    Math.min(MAX_PANEL_HEIGHT, opensUpward.value ? spaceAbove - DROPDOWN_GAP : spaceBelow - DROPDOWN_GAP)
  );

  const panelWidth = panel?.offsetWidth ?? 144;
  let left = rect.left;
  left = Math.min(left, viewportW - VIEWPORT_MARGIN - panelWidth);
  left = Math.max(VIEWPORT_MARGIN, left);

  if (opensUpward.value) {
    panelStyle.value = {
      left: `${left}px`,
      bottom: `${viewportH - rect.top + DROPDOWN_GAP}px`,
      top: 'auto',
      maxHeight: `${maxHeight}px`,
      WebkitOverflowScrolling: 'touch',
    };
    return;
  }

  panelStyle.value = {
    left: `${left}px`,
    top: `${rect.bottom + DROPDOWN_GAP}px`,
    bottom: 'auto',
    maxHeight: `${maxHeight}px`,
    WebkitOverflowScrolling: 'touch',
  };
}

function toggleOpen() {
  open.value = !open.value;
  if (!open.value) return;
  nextTick(() => {
    updatePosition();
    nextTick(updatePosition);
  });
}

function selectPad(padId) {
  emit('update:modelValue', padId);
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
window.addEventListener('touchstart', onDocumentPointerDown, { passive: true });
window.addEventListener('resize', onWindowChange);
window.addEventListener('scroll', onWindowChange, true);
window.addEventListener('keydown', onKeyDown);

onUnmounted(() => {
  window.removeEventListener('mousedown', onDocumentPointerDown);
  window.removeEventListener('touchstart', onDocumentPointerDown);
  window.removeEventListener('resize', onWindowChange);
  window.removeEventListener('scroll', onWindowChange, true);
  window.removeEventListener('keydown', onKeyDown);
});
</script>
