/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        panel: '#1a1a1f',
        surface: '#252530',
        accent: '#ff6b35',
        'accent-dim': '#cc5529',
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
