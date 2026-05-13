import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  // Toggle dark mode by adding/removing a `dark` class on <html>. A tiny inline
  // script in <head> reconciles localStorage with prefers-color-scheme before
  // hydration so there's no flash.
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // CGA palette 1 (high intensity): cyan / magenta / white / black.
        cga: {
          black: '#000000',
          white: '#ffffff',
          cyan: '#55ffff',
          magenta: '#ff55ff',
          // a couple of useful in-between tones for hover / muted text
          dim: '#aaaaaa',
          ink: '#0a0a0a',
        },
      },
      fontFamily: {
        // Loaded from a CDN in globals.css. Liberation Mono primary; falls back
        // to platform monospace if the fetch fails.
        sans: ['"Liberation Mono"', '"DejaVu Sans Mono"', '"Menlo"', 'ui-monospace', 'monospace'],
        mono: ['"Liberation Mono"', '"DejaVu Sans Mono"', '"Menlo"', 'ui-monospace', 'monospace'],
        display: ['"Liberation Mono"', '"DejaVu Sans Mono"', '"Menlo"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        // No soft blurs — all offsets are hard, ANSI-style.
        cga: '4px 4px 0 0 #000',
        'cga-cyan': '4px 4px 0 0 #55ffff',
        'cga-magenta': '4px 4px 0 0 #ff55ff',
        'cga-inverse': '4px 4px 0 0 #fff',
      },
    },
  },
  plugins: [],
};

export default config;
