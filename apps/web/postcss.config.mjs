// PostCSS para Tailwind CSS v4 (Next 15). El plugin procesa @import "tailwindcss"
// y el bloque @theme de globals.css. No hace falta tailwind.config.js en v4.
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
