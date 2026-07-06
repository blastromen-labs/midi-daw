/**
 * iOS/iPadOS scrolls the document when a text field focuses so the caret sits
 * above the virtual keyboard. That pushes our fixed full-screen shell (and the
 * toolbar) off-screen; the offset often persists after the keyboard closes.
 *
 * Keep the layout viewport pinned at (0, 0) while editable fields are used.
 */

const EDITABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="file"]):not([type="checkbox"]):not([type="radio"]), textarea, select, [contenteditable="true"]';

function isEditableTarget(target) {
  return target instanceof HTMLElement && target.matches(EDITABLE_SELECTOR);
}

function resetDocumentScroll() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}

/** @returns {() => void} cleanup */
export function installIosScrollLock() {
  if (typeof window === 'undefined') return () => {};

  let rafId = 0;
  const scheduleReset = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      resetDocumentScroll();
    });
  };

  const onFocusIn = (e) => {
    if (isEditableTarget(e.target)) scheduleReset();
  };

  const onFocusOut = (e) => {
    if (isEditableTarget(e.target)) scheduleReset();
  };

  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  window.addEventListener('scroll', scheduleReset, { passive: true });

  const viewport = window.visualViewport;
  if (viewport) {
    viewport.addEventListener('resize', scheduleReset);
    viewport.addEventListener('scroll', scheduleReset);
  }

  resetDocumentScroll();

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    window.removeEventListener('scroll', scheduleReset);
    if (viewport) {
      viewport.removeEventListener('resize', scheduleReset);
      viewport.removeEventListener('scroll', scheduleReset);
    }
  };
}
