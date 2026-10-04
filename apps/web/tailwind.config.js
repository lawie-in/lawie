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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['var(--font-lora)', 'Georgia', 'serif'],
      },
    },
  },
  plugins: [],
};
