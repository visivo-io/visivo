const colors = require('tailwindcss/colors')

/** @type {import('tailwindcss').Config} */
// https://www.colors.tools/tints-and-shades/?currentColor=713B57&currentColorMixed=8589f5&currentSteps=20&currentHarmony=180&currentHarmonyDominance=50,50,50,50
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'primary': {
          100: "#e2d7dd",
          200: "#c6b0bb",
          300: "#a9899a",
          400: "#8d6278",
          500: "#713B57",
          DEFAULT: "#713B57",
          600: "#5a2f45",
          700: "#432334",
          800: "#2d1722",
          900: "#160b11"
        },
        'secondary': {
          100: "#dbdadb",
          200: "#b8b6b7",
          300: "#959193",
          400: "#726d6f",
          500: "#4F494C",
          DEFAULT: "#4F494C",
          600: "#3f3a3c",
          700: "#2f2b2d",
          800: "#1f1d1e",
          900: "#0f0e0f"
        },
        'highlight': {
          100: "#f6ddda",
          200: "#edbcb5",
          300: "#e49b90",
          400: "#db7a6b",
          500: "#D25946",
          DEFAULT: "#D25946",
          600: "#a84738",
          700: "#7e352a",
          800: "#54231c",
          900: "#29110d"
        },
        'dark': "#191D33",
        'light': "#ECEFCB",
      },
      keyframes: {
        fadeOutLeft: {
          '0%': { 
            opacity: '1',
            transform: 'translateX(0)'
          },
          '100%': { 
            opacity: '0',
            transform: 'translateX(-100%)'
          }
        }
      },
      animation: {
        fadeOutLeft: 'fadeOutLeft 0.3s ease-out forwards'
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography')
  ],
}