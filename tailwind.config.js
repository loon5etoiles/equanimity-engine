/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy:    { DEFAULT: "#081426", 800: "#0d1f3c", 700: "#122952" },
        charcoal: { DEFAULT: "#1F2937" },
        gold:    { DEFAULT: "#B88900", light: "#D4A017", muted: "#8a6500" },
        teal:    { DEFAULT: "#14B8A6", light: "#2dd4bf", dark: "#0d9488" },
      },
      fontFamily: {
        heading: ["Playfair Display", "Georgia", "serif"],
        body:    ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
}
