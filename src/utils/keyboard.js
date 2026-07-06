/** True when the event target is a field where keyboard shortcuts should not apply. */
export function isEditableTarget(target) {
  return (
    target?.tagName === 'TEXTAREA' ||
    target?.isContentEditable ||
    (target?.tagName === 'INPUT' &&
      !['button', 'checkbox', 'radio', 'range'].includes(target.type))
  );
}
