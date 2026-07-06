/**
 * Sanitize a user-provided name for use as a download filename.
 * @param {string} name
 * @param {string} [fallback='Untitled']
 * @param {number} [maxLength=120]
 */
export function sanitizeFilename(name, fallback = 'Untitled', maxLength = 120) {
  const base = (name || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .slice(0, maxLength);
  return base || fallback;
}
