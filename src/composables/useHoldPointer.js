/**
 * Press-and-hold gesture helper for Live Hold clips.
 *
 * Desktop mouse / trackpad: press = start, release after audible = stop.
 *
 * Tablet-as-extended-display (Sidecar, Duet, etc.): the OS often maps touch to a
 * synthetic click — pointerup or pointercancel arrives before the hold can unmute
 * on the sync grid, so a pure momentary gesture never becomes audible. In that
 * case we latch the hold until the next press on the same target (tap to start,
 * tap again to stop). Native browser-on-tablet usually sustains the pointer and
 * keeps classic press-and-hold behavior.
 *
 * After a latch we also ignore a short burst of follow-up pointerdowns: Sidecar
 * commonly cancels the touch pointer then injects a compatibility mouse click on
 * the same spot, which would otherwise immediately unlatch.
 */

/** Ignore synthetic follow-up downs after latch/cancel (ms). */
const GHOST_POINTER_GUARD_MS = 450;

export function useHoldPointer({ isStillMuted, onDown, onUp }) {
  let pointerId = null;
  let latchedKey = null;
  let activeKey = null;
  let activePayload = null;
  let windowBound = false;
  let ignoreDownUntil = 0;

  function bindWindow() {
    if (windowBound) return;
    windowBound = true;
    window.addEventListener('pointerup', onWindowRelease);
    window.addEventListener('pointercancel', onWindowRelease);
    window.addEventListener('blur', onWindowBlur);
  }

  function unbindWindow() {
    if (!windowBound) return;
    windowBound = false;
    window.removeEventListener('pointerup', onWindowRelease);
    window.removeEventListener('pointercancel', onWindowRelease);
    window.removeEventListener('blur', onWindowBlur);
  }

  function releaseActive() {
    if (activePayload == null) {
      pointerId = null;
      latchedKey = null;
      activeKey = null;
      unbindWindow();
      return;
    }
    const payload = activePayload;
    pointerId = null;
    latchedKey = null;
    activeKey = null;
    activePayload = null;
    unbindWindow();
    onUp(payload);
  }

  function latch() {
    latchedKey = activeKey;
    pointerId = null;
    ignoreDownUntil = performance.now() + GHOST_POINTER_GUARD_MS;
    unbindWindow();
  }

  function considerRelease(e, { isCancel = false } = {}) {
    if (pointerId == null) return;
    if (e?.pointerId != null && e.pointerId !== pointerId) return;

    // Still arming, or the OS cancelled the gesture (common on Sidecar) — keep
    // sounding until the next tap instead of dropping a hold that never unmuted.
    if (isCancel || isStillMuted(activePayload)) {
      latch();
      return;
    }

    releaseActive();
  }

  function onWindowRelease(e) {
    considerRelease(e, { isCancel: e.type === 'pointercancel' });
  }

  function onWindowBlur() {
    if (pointerId != null || latchedKey != null) releaseActive();
  }

  /**
   * @returns {boolean} true when this event was handled as a Hold gesture
   */
  function onPointerDown(e, { key, payload, captureTarget }) {
    // Touch / pen report button 0 on down; ignore other mouse buttons.
    if (e.button !== 0) return false;

    // Stop Sidecar / macOS from turning a sustained press into a context-menu
    // gesture (which fires pointercancel and kills Hold).
    e.preventDefault();

    // Swallow the compatibility mouse click that often follows a touch cancel.
    if (latchedKey === key && performance.now() < ignoreDownUntil) {
      return true;
    }

    if (latchedKey != null && latchedKey === key) {
      ignoreDownUntil = performance.now() + GHOST_POINTER_GUARD_MS;
      releaseActive();
      return true;
    }

    if (latchedKey != null || activePayload != null) {
      releaseActive();
    }

    pointerId = e.pointerId;
    activeKey = key;
    activePayload = payload;
    latchedKey = null;

    try {
      captureTarget?.setPointerCapture?.(e.pointerId);
    } catch {
      // Some extended-display drivers reject capture; window listeners cover up.
    }

    bindWindow();
    onDown(payload);
    return true;
  }

  function onElementPointerUp(e) {
    considerRelease(e, { isCancel: false });
  }

  function onElementPointerCancel(e) {
    considerRelease(e, { isCancel: true });
  }

  function dispose() {
    if (activePayload != null) releaseActive();
    else unbindWindow();
  }

  return {
    onPointerDown,
    onElementPointerUp,
    onElementPointerCancel,
    dispose,
  };
}
