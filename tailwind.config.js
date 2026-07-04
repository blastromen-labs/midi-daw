/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Dark slate-blue/green palette — sampled from the reference piano
        // roll (greenish rounded notes, glossy keyboard, lighter grey-blue
        // grid). Canvas-rendered pieces (grid/keys/notes/velocity) can't use
        // these classes directly — see src/theme.js for the matching values.
        panel: '#1d262b',
        surface: '#3f484d',
        'surface-hover': '#4c565c',
        'surface-active': '#5a6570',
        grid: '#34444e',
        'grid-alt': '#2e3e48',
        line: '#2a3a44',
        'line-light': '#3d4d57',
        muted: '#96a3ab',
        'muted-dim': '#6c7981',
        accent: '#6fae78',
        'accent-dim': '#4f8858',
        note: {
          light: '#b1dfb9',
          DEFAULT: '#a7d7af',
          dark: '#9ecda7',
          border: '#708c75',
        },
        velocity: {
          line: '#598a60',
          dot: '#ceffd5',
        },
        playhead: '#ffb454',
        drum: {
          kick: '#ff4444',
          snare: '#ffaa00',
          hat: '#44dd88',
          clap: '#aa66ff',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
