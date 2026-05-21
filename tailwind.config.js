/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'neon-cyan': '#00d4ff',
        'neon-green': '#00ff41',
        'neon-magenta': '#ff006e',
        'neon-orange': '#ffa500',
        'neon-purple': '#8B5CF6',
      }
    },
  },
  plugins: [],
}
