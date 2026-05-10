import animate from 'tailwindcss-animate';

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx,js,jsx,astro,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"General Sans"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        brand: {
          bg:        '#0d0d0d',
          surface:   '#1c1c1c',
          'surface-2':'#171717',
          fg:        '#ffffff',
          muted:     '#b5b3b0',
          dim:       '#6f6e6c',
          line:      '#333333',
          panel:     '#ffffff',
          'panel-2': '#f5f5f7',
          cream:     '#f0f0ec',
          ink:       '#0d0d0d',
          'ink-2':   '#1c1c1c',
          'ink-3':   '#525252',
          orange:    '#fc6630',
          blue:      '#005bff',
          'blue-2':  '#2e69ff',
        },
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [animate],
}
