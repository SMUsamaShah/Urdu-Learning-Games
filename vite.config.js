import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { TUNES } from './src/lib/tunes.js';

/* Every instrument the app can ask for, read from the tunes themselves. */
const TUNE_INSTRUMENTS = [...new Set(Object.values(TUNES).map((t) => t.instrument))];

/* The instrument the reward flourishes are played on, from src/lib/flourish.js. */
const FLOURISH_INSTRUMENT = 'glockenspiel';

/* Everything under audio/instruments/ that must survive into the build. */
const KEPT_INSTRUMENTS = [...TUNE_INSTRUMENTS, FLOURISH_INSTRUMENT];

export default defineConfig({
  // Use a relative base so GitHub Pages project subpaths work.
  base: './',
  server: {
    // Bind all interfaces so the dev server is reachable from a phone on the same wifi.
    host: true,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  plugins: [
    VitePWA({
      // A three-year-old is never going to tap "a new version is available".
      registerType: 'autoUpdate',

      // Not in dev: a service worker caching a build you are actively editing makes every change look like it did not apply.
      devOptions: { enabled: false },

      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],

      manifest: {
        name: 'اردو کھیل — Urdu Learning Games',
        short_name: 'اردو کھیل',
        description:
          'Free, ad-free games for learning the Urdu alphabet, numbers and first words.',
        lang: 'ur',
        dir: 'rtl',
        // Relative, so an install from a project subpath scopes to that subpath rather than the domain root.
        start_url: '.',
        scope: '.',
        // Installed PWAs should launch without browser chrome when supported.
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        id: '.',
        // Deliberately not 'landscape', even though the app now is landscape everywhere.
        orientation: 'any',
        background_color: '#8fd4f5',
        theme_color: '#8fd4f5',
        categories: ['education', 'kids'],
        icons: [
          { src: 'icons/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Include recordings, pictures, and content JSON in the precache.
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webmanifest}',
          '**/*.{json,woff2}',
          '**/*.{webp,avif,jpg,jpeg}',
          '**/*.{webm,m4a,mp4,mp3,ogg,opus,wav}',
        ],

        // Only the instruments something actually plays.
        globIgnores: [`audio/instruments/!(${KEPT_INSTRUMENTS.join('|')})/**`],

        // The Phaser bundle alone is ~1.4 MB, over Workbox's 2 MiB default once the glyph payload is counted.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,

        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
});
