module.exports = {
  purge: [],
  darkMode: false, // or 'media' or 'class'
  content: [
    "./public/**/*.{html,js}",
    "./src/**/*.{js,ts,jsx,tsx,html}"
  ],
  theme: {
    extend: {
      fontFamily: {
        'inter': ['Inter', 'sans-serif'],
      },
    },
  },
  variants: {
    extend: {},
  },
  plugins: [require('daisyui')],
}
