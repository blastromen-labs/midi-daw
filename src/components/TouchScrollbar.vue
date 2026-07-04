<template>
  <div
    v-if="visible"
    class="touch-scrollbar select-none"
    :class="[orientation, { dragging }]"
    :style="trackStyle"
    @mousedown.prevent="onTrackPointerDown"
    @touchstart.prevent="onTrackPointerDown"
  >
    <div class="touch-scrollbar-thumb" :class="{ dragging }" :style="thumbStyle"></div>
  </div>
</template>

<script setup>
// A self-drawn, always-draggable scrollbar for scroll containers whose
// content can't just be swiped to scroll (e.g. the piano roll grid, where a
// touch-drag on the canvas draws/edits notes instead of panning). Native
// scrollbars — especially ones re-styled via ::-webkit-scrollbar, as this
// app does globally — generally can't be grabbed with touch at all on
// mobile/tablet browsers, only with a mouse. This renders its own
// track+thumb and drives `container.scrollTop`/`scrollLeft` directly, so it
// works identically for mouse and touch.
//
// Sizing/position is derived entirely from the DOM (via ResizeObserver +
// the container's native 'scroll' event) rather than plumbed through as
// numeric props, so any parent can drop this in against an existing
// scrollable element without keeping extra reactive state in sync.
import { ref, computed, onBeforeUnmount, watch } from 'vue';

const props = defineProps({
  // The scrollable element itself (reads/writes scrollTop or scrollLeft).
  container: { type: Object, default: null },
  // The element whose size determines scrollHeight/scrollWidth. Defaults to
  // `container` itself if omitted.
  content: { type: Object, default: null },
  orientation: { type: String, default: 'vertical' }, // 'vertical' | 'horizontal'
  thickness: { type: Number, default: 14 },
});

const MIN_THUMB_PX = 24;

const viewportSize = ref(0);
const contentSize = ref(0);
const scrollPos = ref(0);
const dragging = ref(false);

const isVertical = computed(() => props.orientation !== 'horizontal');

let containerResizeObserver = null;
let contentResizeObserver = null;
let observedContainer = null;

function readViewportSize() {
  if (!props.container) return;
  viewportSize.value = isVertical.value ? props.container.clientHeight : props.container.clientWidth;
}

function readContentSize() {
  const el = props.content ?? props.container;
  if (!el) return;
  contentSize.value = isVertical.value ? el.scrollHeight : el.scrollWidth;
}

function readScrollPos() {
  if (!props.container) return;
  scrollPos.value = isVertical.value ? props.container.scrollTop : props.container.scrollLeft;
}

function onNativeScroll() {
  // While dragging we drive scrollTop/scrollPos directly — reading back from
  // the scroll event (often rounded differently) fights the drag and makes the
  // thumb jump.
  if (dragging.value) return;
  readScrollPos();
}

function detachObservers() {
  containerResizeObserver?.disconnect();
  contentResizeObserver?.disconnect();
  containerResizeObserver = null;
  contentResizeObserver = null;
  observedContainer?.removeEventListener('scroll', onNativeScroll);
  observedContainer = null;
}

function attachObservers() {
  detachObservers();
  const container = props.container;
  if (!container) return;

  observedContainer = container;
  container.addEventListener('scroll', onNativeScroll, { passive: true });

  containerResizeObserver = new ResizeObserver(() => {
    readViewportSize();
    if (!props.content) readContentSize();
  });
  containerResizeObserver.observe(container);

  if (props.content) {
    contentResizeObserver = new ResizeObserver(readContentSize);
    contentResizeObserver.observe(props.content);
  }

  readViewportSize();
  readContentSize();
  readScrollPos();
}

watch(() => [props.container, props.content, props.orientation], attachObservers, { immediate: true });
onBeforeUnmount(detachObservers);

const maxScroll = computed(() => Math.max(0, contentSize.value - viewportSize.value));
// Hidden entirely once there's nothing to scroll — matches native scrollbar
// behavior and avoids a permanently-visible dead control.
const visible = computed(() => maxScroll.value > 1);

const thumbSize = computed(() => {
  if (!viewportSize.value || !contentSize.value) return MIN_THUMB_PX;
  const proportional = (viewportSize.value / contentSize.value) * viewportSize.value;
  return Math.min(viewportSize.value, Math.max(MIN_THUMB_PX, proportional));
});

const thumbTravel = computed(() => Math.max(0, viewportSize.value - thumbSize.value));

const thumbOffset = computed(() => {
  if (maxScroll.value <= 0) return 0;
  return (scrollPos.value / maxScroll.value) * thumbTravel.value;
});

// Track size matches the scroll container's client area (not its border box),
// so drag math and thumb rendering share the same coordinate space. The track
// sits taller than clientHeight when a horizontal native scrollbar is present
// — that mismatch was the source of jerky desktop drags.
const trackStyle = computed(() =>
  isVertical.value
    ? { width: `${props.thickness}px`, height: `${viewportSize.value}px` }
    : { height: `${props.thickness}px`, width: `${viewportSize.value}px` }
);

const thumbStyle = computed(() =>
  isVertical.value
    ? { height: `${thumbSize.value}px`, transform: `translateY(${thumbOffset.value}px)` }
    : { width: `${thumbSize.value}px`, transform: `translateX(${thumbOffset.value}px)` }
);

function clientCoordOf(e) {
  const point = e.touches?.[0] ?? e.changedTouches?.[0] ?? e;
  return isVertical.value ? point.clientY : point.clientX;
}

function viewportTrackStart() {
  const rect = props.container.getBoundingClientRect();
  return isVertical.value ? rect.top : rect.left;
}

function scrollToClientCoord(clientCoord, grabOffset) {
  if (!props.container) return;
  const travel = thumbTravel.value;
  const ratio = travel > 0 ? (clientCoord - viewportTrackStart() - grabOffset) / travel : 0;
  const target = Math.min(1, Math.max(0, ratio)) * maxScroll.value;

  if (isVertical.value) {
    props.container.scrollTop = target;
  } else {
    props.container.scrollLeft = target;
  }
  scrollPos.value = target;
}

function onTrackPointerDown(e) {
  if (!props.container || e.button > 0) return;

  const coord = clientCoordOf(e);
  const trackStart = viewportTrackStart();
  const offsetInTrack = coord - trackStart;
  const currentOffset = thumbOffset.value;
  const size = thumbSize.value;

  // Preserve grab point when dragging the thumb; center under the cursor when
  // clicking empty track (touch-friendly jump-to-position).
  const onThumb = offsetInTrack >= currentOffset && offsetInTrack <= currentOffset + size;
  const grabOffset = onThumb ? offsetInTrack - currentOffset : size / 2;

  dragging.value = true;
  scrollToClientCoord(coord, grabOffset);

  function onMove(ev) {
    ev.preventDefault();
    scrollToClientCoord(clientCoordOf(ev), grabOffset);
  }
  function onUp() {
    dragging.value = false;
    readScrollPos();
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchmove', onMove);
    window.removeEventListener('touchend', onUp);
    window.removeEventListener('touchcancel', onUp);
  }

  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);
  window.addEventListener('touchcancel', onUp);
}
</script>

<style scoped>
.touch-scrollbar {
  position: absolute;
  z-index: 20;
  display: flex;
  touch-action: none;
}

.touch-scrollbar.vertical {
  top: 0;
  right: 0;
  justify-content: center;
}

.touch-scrollbar.horizontal {
  left: 0;
  bottom: 0;
  align-items: center;
}

.touch-scrollbar-thumb {
  background: #4c565c;
  border-radius: 999px;
  width: 60%;
}

.touch-scrollbar.horizontal .touch-scrollbar-thumb {
  width: auto;
  height: 60%;
}

.touch-scrollbar:hover .touch-scrollbar-thumb,
.touch-scrollbar-thumb.dragging {
  background: #5a6570;
}
</style>
