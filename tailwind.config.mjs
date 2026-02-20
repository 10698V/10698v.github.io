/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,ts}"],
  theme: {
    extend: {
      colors: {
        neon: {
          purple: "#a855f7" /* base */,
          deep: "#9333ea"   /* deeper glow */
        }
      },
      boxShadow: {
        neon: "0 0 8px #a855f7, 0 0 16px #9333ea"
      }
    }
  },
  plugins: []
};
