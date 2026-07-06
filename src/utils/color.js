// Derives lighter/darker tints from a single base color (e.g. a track's
// color) so note gradients, borders, and hover states stay in sync with that
// one source of truth instead of needing separate hardcoded shades per track.

function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
}

/**
 * Shifts a hex color toward white (amount > 0) or black (amount < 0).
 * @param {string} hex base color, e.g. '#8fd694'
 * @param {number} amount in [-1, 1] — fraction of the distance to white/black
 */
export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  return rgbToHex({
    r: r + (target - r) * t,
    g: g + (target - g) * t,
    b: b + (target - b) * t,
  });
}

/**
 * Black or white — whichever stays readable as text/icon color drawn on top
 * of an arbitrary accent color (e.g. a letter inside a track's color swatch).
 */
export function contrastTextColor(hex) {
  if (!hex) return '#0b0f12';
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0b0f12' : '#ffffff';
}
