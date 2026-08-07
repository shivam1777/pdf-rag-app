// /** @type {import('tailwindcss').Config} */
// export default {
//   darkMode: "class",
//   content: [
//     "./index.html",
//     "./src/**/*.{js,jsx,ts,tsx}",
//   ],
//   theme: {
//     extend: {},
//   },
//   plugins: [
//     require("@tailwindcss/typography"),
//   ],
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      keyframes: {
        geminiGlow: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)', filter: 'blur(80px)' },
          '33%': { transform: 'translate(30px, -50px) scale(1.1)', filter: 'blur(90px)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.9)', filter: 'blur(70px)' },
        },
      },
      animation: {
        'gemini-glow': 'geminiGlow 10s ease-in-out infinite',
      },
    },
  },
}
