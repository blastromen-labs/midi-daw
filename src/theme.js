// Canvas-rendered UI (piano roll grid, keyboard, velocity lane) can't read
// Tailwind classes, so its exact colors live here as the single source of
// truth for the app's dark slate-blue/green palette. Keep these in sync with
// the matching entries in tailwind.config.js, which drive the same palette
// for DOM-based UI (panels, toolbars, buttons).
export const THEME = {
  grid: {
    rowLight: '#34444e',
    rowDark: '#2e3e48',
    lineBeat: '#4a5a64',
    lineSub: '#2a3a44',
  },
  keys: {
    whiteTop: '#d2d7dc',
    whiteBottom: '#a9afb6',
    // Tints the C-note row so octave boundaries are readable at a glance.
    whiteOctave: '#9ca0a7',
    blackStart: '#2c2d2f',
    blackEnd: '#4a4b4d',
    borderWhite: '#8b9096',
    borderBlack: '#1c1c1e',
    pressed: '#6fae78',
    labelOnWhite: '#33393c',
    labelOnBlack: '#e8ece9',
    labelOnPressed: '#12201a',
  },
  velocity: {
    background: '#34444e',
    guide: '#3d4d57',
  },
  note: {
    cornerRadius: 1,
    selectedOutline: '#eaffef',
  },
};
