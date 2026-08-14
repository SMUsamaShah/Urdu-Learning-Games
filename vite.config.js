import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { TUNES } from './src/lib/tunes.js';

/**
 * Every instrument the app can ask for, read from the tunes themselves.
 *
 * This used to be one name written out by hand, with a test to keep it in step
 * with src/lib/tunes.js. That was the right shape when there was one tune and
 * no way to change it. Now that all five are choosable from the grown-ups
 * screen, every one of their instruments has to be precached, and a
 * hand-maintained list of five would be five chances to make the mistake the
 * test existed to catch.
 *
 * So the list is derived. tunes.js is plain data with no imports, which is what
 * makes it importable from a build config at all — worth keeping that way.
 *
 * The failure this prevents: the app asks for samples the service worker never
 * cached, so the tune plays in development, plays on the first online load, and
 * is silent offline. That is the worst shape a bug can have here, because
 * offline is the case this app exists for.
 */
const TUNE_INSTRUMENTS = [...new Set(Object.values(TUNES).map((t) => t.instrument))];

/**
 * The instrument the reward flourishes are played on, from src/lib/flourish.js.
 *
 * Still written out, because flourish.js is not data — importing it from here
 * would pull in Tone and the whole audio layer at config time.
 *
 * Worth its extra 100 KB: it has to cut through the tune without the tune
 * ducking for it, which a bright metal strike does and a soft wooden one does
 * not.
 */
const FLOURISH_INSTRUMENT = 'glockenspiel';

/** Everything under audio/instruments/ that must survive into the build. */
const KEPT_INSTRUMENTS = [...TUNE_INSTRUMENTS, FLOURISH_INSTRUMENT];

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
        // Deliberately not 'landscape'. A manifest lock is absolute — an
        // installed app can never turn, including on the grown-ups screens,
        // where the tracing editor wants a tall window and a finger. The app
        // asks for landscape itself and releases it there; see
        // src/lib/orientation.js.
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

        // Only the instruments something actually plays. The rest of
        // public/audio/instruments/ exists so a tune can be auditioned on
        // another voice during development (npm run music:preview --
        // --instrument koto). They are gitignored, so a clean clone never has
        // them — but a machine that has fetched them would otherwise quietly
        // ship a few hundred KB of audio nobody ever hears, and a build that
        // differs from CI's by what happens to be lying around is worth ruling
        // out at the source.
        globIgnores: [`audio/instruments/!(${KEPT_INSTRUMENTS.join('|')})/**`],

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
