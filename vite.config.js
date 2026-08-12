import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * The instrument the background tune is played on.
 *
 * Kept in step with INSTRUMENT in src/lib/music.js by
 * tests/music-instrument.test.mjs — the failure otherwise is that the app asks
 * for samples the service worker never cached, so the tune works in development
 * and is silent offline.
 */
const MUSIC_INSTRUMENT = 'music_box';

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
  plugins: [
    VitePWA({
      // A three-year-old is never going to tap "a new version is available".
      registerType: 'autoUpdate',

      // Not in dev: a service worker caching a build you are actively editing
      // makes every change look like it did not apply.
      devOptions: { enabled: false },

      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],

      manifest: {
        name: 'اردو کھیل — Urdu Learning Games',
        short_name: 'اردو کھیل',
        description:
          'Free, ad-free games for learning the Urdu alphabet, numbers and first words.',
        lang: 'ur',
        dir: 'rtl',
        // Relative, so an install from a project subpath scopes to that
        // subpath rather than the domain root.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'landscape',
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
        // Workbox's default pattern is {js,css,html,ico,png,svg}, which would
        // silently skip every voice recording, every word picture and both
        // content JSON files — exactly the assets whose absence only shows up
        // once offline. Anything added to public/ needs its extension here.
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,webmanifest}',
          '**/*.{json,woff2}',
          '**/*.{webp,avif,jpg,jpeg}',
          '**/*.{webm,m4a,mp4,mp3,ogg,opus,wav}',
        ],

        // The tune is played on one instrument; the rest of public/audio/
        // instruments/ exists only so it can be auditioned on another voice
        // during development (npm run music:preview -- --instrument celesta).
        // They are gitignored, so a clean clone never has them — but a machine
        // that has fetched them would otherwise quietly ship 300 KB of audio
        // nobody ever hears, and a build that differs from CI's by what happens
        // to be lying around is worth ruling out at the source.
        globIgnores: [
          `audio/instruments/!(${MUSIC_INSTRUMENT})/**`,
        ],

        // The Phaser bundle alone is ~1.4 MB, over Workbox's 2 MiB default once
        // the glyph payload is counted. Everything here must be precached for
        // the app to start with no network, so raise the ceiling rather than
        // let entries be dropped.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,

        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
});
