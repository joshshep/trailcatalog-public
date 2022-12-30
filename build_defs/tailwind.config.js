const defaultTheme = require('tailwindcss/defaultTheme')

module.exports = {
  content: [
    `bazel-out/k8-fastbuild/bin/{java,js}/**/*.{js,ts,jsx,tsx}`,
    `{java,js}/**/*.{js,ts,jsx,tsx}`,
  ],
  theme: {
    extend: {
      colors: {
        'black-opaque': {
          20: '#00000014',
        },
        'highlight': '#ffe600',
        'tc-gray': {
          900: '#222222',
          700: '#363636',
          600: '#3a3a3a',
          400: '#737a80',
          200: '#e2e2e2',
          100: '#f3f3f3',
        },
        'tc-green': {
          700: '#9fe26b',
        },
        'white-opaque': {
          160: '#ffffffa0',
        },
      },
      fontFamily: {
        'header': ['Barlow', ...defaultTheme.fontFamily.sans],
        'input': ['Nunito Sans', ...defaultTheme.fontFamily.sans],
        'sans': ['Roboto', ...defaultTheme.fontFamily.sans],
      },
    },
  },
  plugins: [],
};
