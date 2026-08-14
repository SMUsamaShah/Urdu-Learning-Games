/**
 * The two rules worth having, and nothing else.
 *
 * This is not here to argue about semicolons. It is here because a refactor
 * that tidied an import list left `stopAll()` called with nothing importing it,
 * and the only thing that noticed was a headless browser run of the tracing
 * game — three minutes of Playwright to find a name that is not defined. That
 * is the wrong tool for that job by two orders of magnitude.
 *
 * So: `no-undef` and `no-unused-vars`, on every source file, in `npm test`,
 * plus `no-new-func` because a test already carries a disable comment for it
 * and a disable comment for a rule nobody enabled documents nothing. Style is
 * left alone deliberately: a lint run that also has opinions about formatting
 * is one people learn to skim.
 */

import js from '@eslint/js';

/** Browser globals the app uses. Node's are added for tools/ and tests/ below. */
const BROWSER = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  performance: 'readonly',
  location: 'readonly',
  localStorage: 'readonly',
  indexedDB: 'readonly',
  Image: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FileReader: 'readonly',
  URL: 'readonly',
  Audio: 'readonly',
  AudioContext: 'readonly',
  OfflineAudioContext: 'readonly',
  MediaRecorder: 'readonly',
  MediaStream: 'readonly',
  DecompressionStream: 'readonly',
  CompressionStream: 'readonly',
  Response: 'readonly',
  Request: 'readonly',
  Headers: 'readonly',
  FormData: 'readonly',
  CustomEvent: 'readonly',
  Event: 'readonly',
  HTMLElement: 'readonly',
  getComputedStyle: 'readonly',
  matchMedia: 'readonly',
  btoa: 'readonly',
  atob: 'readonly',
  structuredClone: 'readonly',
  crypto: 'readonly',
  self: 'readonly',
  alert: 'readonly',
  requestIdleCallback: 'readonly',
  Path2D: 'readonly',
  DOMPoint: 'readonly',
  screen: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  getSelection: 'readonly',
  caches: 'readonly',
  MutationObserver: 'readonly',
  Element: 'readonly',
  ErrorEvent: 'readonly',
};

const NODE = {
  process: 'readonly',
  Buffer: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
  Blob: 'readonly',
  File: 'readonly',
  FormData: 'readonly',
  Response: 'readonly',
  Request: 'readonly',
  Headers: 'readonly',
  DecompressionStream: 'readonly',
  CompressionStream: 'readonly',
  structuredClone: 'readonly',
  crypto: 'readonly',
  __dirname: 'readonly',
};

const rules = {
  'no-undef': 'error',
  'no-new-func': 'error',
  // Arguments are exempt: a subclass hook that ignores a parameter its siblings
  // use still has to declare it, and QuizScene is full of those. Rest siblings
  // too — `const { upem, ...rest } = baked` is how you drop a key, and the
  // named half being unused is the entire point.
  'no-unused-vars': [
    'error',
    { args: 'none', caughtErrors: 'none', ignoreRestSiblings: true },
  ],
};

export default [
  { ignores: ['dist/**', 'node_modules/**', 'public/**', 'content/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: BROWSER },
    rules,
  },
  {
    // The recording studio is a browser page served by a Node script, so both
    // sets of globals are in play depending on the file.
    files: ['tools/**/*.{js,mjs}', 'tests/**/*.mjs', '*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...BROWSER, ...NODE },
    },
    rules,
  },
];
