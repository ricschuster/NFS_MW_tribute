import { defineConfig } from 'vite';

// base: './' keeps asset URLs relative so the built site works from any
// subpath (e.g. GitHub Pages) without extra config.
export default defineConfig({
  base: './',
  server: { open: false },
});
