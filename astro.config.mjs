import { defineConfig } from "astro/config";
import tailwind from "@astrojs/tailwind";

export default defineConfig({
  site: process.env.SITE_URL ?? "https://10698v.github.io",
  base: process.env.BASE_PATH ?? "/",
  output: "static", // GitHub Pages friendly
  integrations: [tailwind()],
  vite: {
    server: { fs: { strict: false } },
    build: { sourcemap: false },
  }
});
