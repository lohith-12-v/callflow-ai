/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brandBg: "#050015",
        brandCard: "#090022",
        brandAccent: "#a855f7",
      },
      boxShadow: {
        glow: "0 0 80px rgba(168, 85, 247, 0.6)",
      },
    },
  },
  plugins: [],
};
