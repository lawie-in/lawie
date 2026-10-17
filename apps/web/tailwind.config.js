const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.resolve(__dirname, './src/pages/**/*.{js,ts,jsx,tsx,mdx}'),
    path.resolve(__dirname, './src/components/**/*.{js,ts,jsx,tsx,mdx}'),
    path.resolve(__dirname, './src/app/**/*.{js,ts,jsx,tsx,mdx}'),
    path.resolve(__dirname, '../../packages/shared/src/**/*.{js,ts,jsx,tsx}'),
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        border: 'hsl(var(--border))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
        },
        // T-005 brand tokens (Meera approved). Gold is never small text; teal only for focus and success fills.
        brand: {
          navy: '#0D1F3C',
          gold: '#C8850E',
          teal: '#0D9488',
          'teal-dark': '#0A6F66',
          'gold-dark': '#7A4E00',
          'gold-light': '#FBF1DC',
          'teal-light': '#DDF3F0',
          error: '#B3261E',
          'error-light': '#FCE9E7',
          page: '#FAF8F3',
          line: '#DCD6C8',
          muted: '#566580',
        },
        lawie: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          900: '#1e3a5f',
        },
        // T-511 Night Library colours: `bg-nl-card`, `text-nl-text`, `border-nl-line`, ...
        // Brass fill is never small text; use `text-nl-brass-dark` for brass text (spec 2.1).
        nl: {
          wall: 'var(--bg-wall)',
          wood: 'var(--bg-wood)',
          card: 'var(--bg-card)',
          text: 'var(--text)',
          soft: 'var(--text-soft)',
          muted: 'var(--muted)',
          line: 'var(--line)',
          brass: 'var(--brass)',
          'brass-dark': 'var(--brass-dark)',
          'brass-light': 'var(--brass-light)',
          'on-brass': 'var(--on-brass)',
          ox: 'var(--ox)',
          'ox-hi': 'var(--ox-hi)',
          ok: 'var(--ok)',
          'ok-light': 'var(--ok-light)',
          err: 'var(--err)',
          'err-light': 'var(--err-light)',
          warn: 'var(--warn)',
          'warn-light': 'var(--warn-light)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['var(--font-lora)', 'Georgia', 'serif'],
        // T-511 Night Library type (spec 2.3). Mukta for body and headings below 20px, Tiro
        // Devanagari Hindi for headings 20px and above. Variables come from app/layout.tsx.
        'nl-body': [
          'var(--font-mukta)',
          'Nirmala UI',
          'Kohinoor Devanagari',
          'Noto Sans Devanagari',
          'system-ui',
          'sans-serif',
        ],
        'nl-display': [
          'var(--font-tiro)',
          'Nirmala UI',
          'Kohinoor Devanagari',
          'Noto Sans Devanagari',
          'system-ui',
          'serif',
        ],
      },
      // T-511 Night Library tokens (spec 2.1, 2.2). Namespaced `nl-*` so nothing collides with
      // the legacy shadcn, brand and lawie keys above. Values live in app/globals.css on `.nl`.
      spacing: {
        'nl-1': 'var(--space-1)',
        'nl-2': 'var(--space-2)',
        'nl-3': 'var(--space-3)',
        'nl-4': 'var(--space-4)',
        'nl-5': 'var(--space-5)',
        'nl-6': 'var(--space-6)',
        'nl-8': 'var(--space-8)',
        'nl-10': 'var(--space-10)',
        'nl-12': 'var(--space-12)',
        'nl-16': 'var(--space-16)',
      },
      borderRadius: {
        'nl-none': 'var(--radius-none)',
        'nl-sm': 'var(--radius-sm)',
        'nl-md': 'var(--radius-md)',
        'nl-pill': 'var(--radius-pill)',
      },
      boxShadow: {
        'nl-card': 'var(--shadow-card)',
        'nl-halo': '0 0 0 4px var(--brass-light)',
      },
      backgroundImage: {
        'nl-lamp': 'radial-gradient(circle at 70% 20%, var(--lamp), transparent 60%)',
      },
    },
  },
  plugins: [],
};
