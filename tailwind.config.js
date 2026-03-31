/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        th: {
          base: 'var(--th-base)',
          surface: 'var(--th-surface)',
          overlay: 'var(--th-overlay)',
          accent: 'var(--th-accent)',
          'accent-hover': 'var(--th-accent-hover)',
          'accent-subtle': 'var(--th-accent-subtle)',
          text: 'var(--th-text)',
          'text-sub': 'var(--th-text-sub)',
          'text-dim': 'var(--th-text-dim)',
          border: 'var(--th-border)',
          'border-subtle': 'var(--th-border-subtle)',
          success: 'var(--th-success)',
          danger: 'var(--th-danger)',
          warning: 'var(--th-warning)',
        },
      },
      boxShadow: {
        glow: '0 0 20px var(--th-glow)',
        'glow-sm': '0 0 10px var(--th-glow)',
      },
    },
  },
  plugins: [],
};
