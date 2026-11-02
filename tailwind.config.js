/** @type {import('tailwindcss').Config} */
//
// "Game HUD" palette (2026-10-30, second re-skin of the day — replaces Amber
// Cockpit). The 500+ Tailwind colour utilities already scattered through the tree
// *are* the UI, so the palette is the lever: remapping the families here re-skins
// every screen without touching component behaviour.
//
// Mapping is semantic, not decorative — a family keeps its job and only changes
// hue, so a starfield gradient that used to be blue is still the primary accent:
//
//   blue / indigo / sky / violet  → electric azure → cyan   (primary light)
//   purple / fuchsia / pink       → plasma violet → magenta (secondary light)
//   cyan / teal                   → aqua                    (informational)
//   lime / emerald                → acid green              (positive)
//   red / rose                    → hot red                 (danger / 涨)
//   amber / orange / yellow       → gold                    (currency)
//   gray / slate / zinc           → deep space navy         (neutral)
//
// Chinese market convention: 涨 = red, 跌 = green. Do not "fix" that.
export default {
  content: [
    "./atlas-ui/**/*.{html,js,jsx,ts,tsx}",
    "./atlas-ui/template/**/*.html",
    "./atlas-ui/react/static/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // brand shortcuts kept for older markup
        'atlas-dark': '#04060f',
        'atlas-blue': '#0a1222',
        'atlas-accent': '#2ee6ff',
        'atlas-green': '#37e59b',
        'atlas-cyan': '#2ee6ff',

        black: '#04060f',
        white: '#f2f7ff',

        // surface shortcuts so markup can say `bg-plate border-line`
        line: '#1d2c4a',
        'line-strong': '#2f4468',
        plate: '#0a1222',
        'plate-2': '#101a30',
        'plate-3': '#16233c',
        void: '#04060f',
        signal: '#2ee6ff',
        plasma: '#a06bff',
        gold: '#ffc53d',

        // deep space navy — surfaces, hairlines, muted text
        gray: {
          100: '#e9f1ff', 200: '#cfe0f5', 300: '#a7bddb', 400: '#7f96b8',
          500: '#5a6f8f', 600: '#415572', 700: '#2b3c58', 800: '#1a2740',
          900: '#0d1527',
        },
        slate: {
          200: '#cfe0f5', 300: '#a7bddb', 400: '#7f96b8', 500: '#5a6f8f',
          600: '#415572', 700: '#2b3c58', 800: '#16233c', 900: '#0a1222',
          950: '#04060f',
        },
        zinc: {
          300: '#a7bddb', 400: '#7f96b8', 500: '#5a6f8f', 600: '#415572',
          700: '#2b3c58', 800: '#16233c', 900: '#0a1222',
        },

        // primary light — electric azure → cyan (was blue/indigo/sky)
        blue: {
          200: '#a8f0ff', 300: '#6ee7ff', 400: '#3ddcff', 500: '#2ee6ff',
          600: '#12b8d8', 700: '#0d8ba6', 800: '#0a6376', 900: '#063d4a',
        },
        indigo: {
          100: '#d8f7ff', 200: '#b0efff', 300: '#7ee4ff', 400: '#4fdcff',
          500: '#2ee6ff', 600: '#12b8d8', 700: '#0d8ba6', 900: '#052c36',
        },
        sky: {
          200: '#b8f2ff', 300: '#84ebff', 400: '#4fdcff', 500: '#2ee6ff',
          600: '#12b8d8',
        },

        // secondary light — plasma violet → magenta (was purple/violet/fuchsia/pink)
        purple: {
          200: '#dcc7ff', 300: '#c3a2ff', 400: '#b184ff', 500: '#a06bff',
          600: '#8244e6', 700: '#6532b8', 800: '#4a2387', 900: '#2c1552',
        },
        violet: {
          200: '#dcc7ff', 300: '#c3a2ff', 400: '#b184ff', 500: '#a06bff',
          600: '#8244e6', 900: '#2c1552',
        },
        fuchsia: { 500: '#c964ff' },
        pink: {
          200: '#f7c9ff', 300: '#eda4ff', 400: '#dd7bff', 500: '#c964ff',
          600: '#a63fe0', 700: '#822eb0', 900: '#3f1656',
        },

        // informational — aqua (was cyan/teal)
        cyan: {
          100: '#d6faff', 200: '#aef3ff', 300: '#7deaff', 400: '#4fe0ff',
          500: '#2ee6ff', 600: '#12b8d8', 700: '#0d8ba6', 900: '#052c36',
        },
        teal: { 300: '#7deaff', 500: '#2ee6ff', 600: '#12b8d8' },

        // positive / 跌 — acid green (was green/emerald)
        green: {
          200: '#b6ffd9', 300: '#8bf7c4', 400: '#5cf0ab', 500: '#37e59b',
          600: '#1fbf7c', 900: '#0a3325',
        },
        emerald: {
          200: '#b6ffd9', 300: '#8bf7c4', 400: '#5cf0ab', 500: '#37e59b',
          600: '#1fbf7c',
        },
        lime: { 300: '#c8ff9e', 500: '#8ef05c' },

        // danger / 涨 — hot red (was red/rose)
        red: {
          200: '#ffc4cf', 300: '#ff9aab', 400: '#ff7288', 500: '#ff4d6d',
          600: '#e02a4e', 700: '#b01e3c', 800: '#80162c', 900: '#4f0e1c',
          950: '#2e0811',
        },
        rose: { 500: '#ff4d6d' },

        // currency / highlight — gold (was orange/amber/yellow)
        orange: {
          200: '#ffe3b8', 300: '#ffd18a', 400: '#ffbb55', 500: '#f59e2d',
          600: '#cf7c1c', 700: '#a35f16', 900: '#4d2c0b',
        },
        yellow: {
          100: '#fff4d1', 200: '#ffeaae', 300: '#ffdd80', 400: '#ffcf56',
          500: '#ffc53d', 600: '#e0a520', 700: '#b08019', 800: '#7f5c14',
          900: '#4d380e',
        },
        amber: {
          200: '#ffe8b8', 300: '#ffd88a', 400: '#ffcb5c', 500: '#ffc53d',
          600: '#e0a520', 700: '#b08019', 900: '#4d380e',
        },
      },
      fontFamily: {
        atlas: ['Barlow Condensed', 'Bahnschrift', 'Arial Narrow', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        display: ['Barlow Condensed', 'Bahnschrift', 'Arial Narrow', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Cascadia Mono', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      borderRadius: {
        none: '0px',
        sm: '2px',
        DEFAULT: '2px',
        md: '3px',
        lg: '6px',
        xl: '8px',
        '2xl': '10px',
        '3xl': '12px',
        full: '9999px',
      },
      boxShadow: {
        // game bloom: a colour ring plus a soft halo, never a hard drop only
        atlas: '0 22px 48px -30px rgba(0, 0, 0, 0.98)',
        'atlas-glow': '0 0 0 1px rgba(46, 230, 255, 0.35), 0 0 18px -4px rgba(46, 230, 255, 0.45)',
        'atlas-glow-lg': '0 0 0 1px rgba(46, 230, 255, 0.55), 0 0 34px -6px rgba(46, 230, 255, 0.55)',
        'atlas-violet': '0 0 0 1px rgba(160, 107, 255, 0.4), 0 0 20px -6px rgba(160, 107, 255, 0.5)',
        'atlas-gold': '0 0 0 1px rgba(255, 197, 61, 0.4), 0 0 20px -6px rgba(255, 197, 61, 0.5)',
        'atlas-line': '0 0 0 1px rgba(46, 230, 255, 0.28)',
        'atlas-inset': 'inset 0 1px 0 rgba(242, 247, 255, 0.08)',
      },
      dropShadow: {
        glow: ['0 0 6px rgba(46, 230, 255, 0.65)'],
        'glow-lg': ['0 0 14px rgba(46, 230, 255, 0.55)'],
        violet: ['0 0 8px rgba(160, 107, 255, 0.6)'],
      },
      letterSpacing: {
        hud: '0.16em',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        stargate: 'stargate 0.3s ease-in-out',
        'hud-boot': 'hud-boot 220ms ease-out both',
        'hud-breathe': 'hud-breathe 2.8s ease-in-out infinite',
        'hud-scan': 'hud-scan 6s ease-in-out infinite',
        'hud-flicker': 'hud-flicker 7s steps(1, end) infinite',
      },
      keyframes: {
        stargate: {
          '0%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)' },
        },
        'hud-boot': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'none' },
        },
        'hud-breathe': {
          '0%, 100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        'hud-scan': {
          '0%': { transform: 'translateY(-110%)', opacity: '0' },
          '12%': { opacity: '0.9' },
          '100%': { transform: 'translateY(420%)', opacity: '0' },
        },
        'hud-flicker': {
          '0%, 92%, 100%': { opacity: '1' },
          '93%': { opacity: '0.55' },
          '95%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
