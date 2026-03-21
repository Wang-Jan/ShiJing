
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./App.tsx",
    "./index.tsx",
    "./views/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        darkBg: '#020617',
      }
    },
  },
  plugins: [],
}
