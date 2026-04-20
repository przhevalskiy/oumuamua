/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        abstract: {
          violet:      '#7C3AED',
          cyan:        '#06B6D4',
          amber:       '#F59E0B',
          rose:        '#F43F5E',
          emerald:     '#10B981',
          'deep-purple': '#1E0A3C',
          'near-black':  '#0D0D1A',
        },
      },
      fontFamily: {
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'cell-pop': {
          '0%':   { transform: 'scale(0)' },
          '70%':  { transform: 'scale(1.15)' },
          '100%': { transform: 'scale(1)' },
        },
        'glow-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 8px 2px rgba(124,58,237,0.4), 0 0 24px 6px rgba(6,182,212,0.15)',
          },
          '50%': {
            boxShadow: '0 0 20px 6px rgba(124,58,237,0.75), 0 0 48px 12px rgba(6,182,212,0.35)',
          },
        },
        'fade-slide-in': {
          '0%':   { opacity: '0', transform: 'translateY(18px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'spin-slow': {
          '0%':   { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        'stroke-draw': {
          '0%':   { strokeDashoffset: '60' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        'cell-pop':      'cell-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'glow-pulse':    'glow-pulse 2.4s ease-in-out infinite',
        'fade-slide-in': 'fade-slide-in 0.5s ease-out both',
        'spin-slow':     'spin-slow 20s linear infinite',
        'stroke-draw':   'stroke-draw 0.45s ease-out both',
      },
    },
  },
  plugins: [],
};
