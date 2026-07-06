/** First character of a label, used as a compact-mode hint inside color swatches. */
export function initialLetter(name) {
  const trimmed = (name ?? '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '';
}
