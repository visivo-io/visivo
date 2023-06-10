/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["mkdocs/overrides/home.html", "./node_modules/flowbite/**/*.js"],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'primary': "#713B57",
        'secondary': "#4F494C",
        'highlight': "#D25946",
        'dark': "#191D33",
        'light': "#ECEFCB",
      },
    },
  },
  plugins: [
    require('flowbite/plugin')
  ],
}
