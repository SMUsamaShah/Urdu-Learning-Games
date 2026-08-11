import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built app works from a GitHub Pages project subpath
  // (user.github.io/Urdu-Learning-Games/) as well as from a domain root.
  base: './',
  server: {
    // Bind all interfaces so the dev server is reachable from a phone on the
    // same wifi, which is the only way to properly test this thing.
    host: true,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
