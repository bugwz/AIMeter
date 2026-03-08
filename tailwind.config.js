/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        claude: '#D97757',
        kimi: '#5B5FE3',
        openrouter: '#635BFF',
        minimax: '#2A2A2A',
      },
    },
  },
  plugins: [],
}
