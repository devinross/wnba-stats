import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The app reads a static data file (public/data/sparks.json) produced by
// `npm run fetch`, so there is no dev/prod proxy to stats.wnba.com anymore.
// `base: "./"` keeps asset + data paths relative so the build works at the site
// root or inside a subfolder.
export default defineConfig({
  plugins: [react()],
  base: "./",
  // Honor PORT when something else already holds 5173 (e.g. the marketing site
  // running alongside this one).
  server: { port: Number(process.env.PORT) || 5173 },
});
