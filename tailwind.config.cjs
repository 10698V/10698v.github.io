// File: tailwind.config.cjs
module.exports = {
  content: ["./src/**/*.{astro,html,js,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Neue Haas Grotesk"', 'Helvetica Neue', 'Arial', 'sans-serif'], // primary UI font
        mono: ['"JetBrains Mono"', 'monospace'] // monospaced font for headings or code
      },
      colors: {
        // Example custom colors (adjust to your branding)
        'gray-900': '#1a1a1a',
        'blue-400': '#61dafb'
        // ... add more if needed
      }
    }
  },
  plugins: []
};
