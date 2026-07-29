/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'noc-bg':      '#0f1117',
        'noc-surface': '#1a1f2e',
        'noc-border':  '#2a3042',
        'noc-muted':   '#64748b',
      },
    },
  },
  plugins: [],
}
