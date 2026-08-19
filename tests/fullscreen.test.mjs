import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import {
  canFullscreen,
  enterFullscreen,
  exitFullscreen,
  isFullscreen,
  onFullscreenChange,
  toggleFullscreen,
} from '../src/lib/fullscreen.js';

const originalDocument = globalThis.document;

function installDocument({ requestRejects = false, exitRejects = false } = {}) {
  const listeners = new Map();
  const document = {
    fullscreenElement: null,
    documentElement: {
      async requestFullscreen() {
        if (requestRejects) throw new Error('request refused');
        document.fullscreenElement = document.documentElement;
        listeners.get('fullscreenchange')?.forEach((callback) => callback());
      },
    },
    async exitFullscreen() {
      if (exitRejects) throw new Error('exit refused');
      document.fullscreenElement = null;
      listeners.get('fullscreenchange')?.forEach((callback) => callback());
    },
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) ?? new Set();
      callbacks.add(callback);
      listeners.set(type, callbacks);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
  };
  globalThis.document = document;
  return document;
}

afterEach(() => {
  globalThis.document = originalDocument;
});

describe('fullscreen helper', () => {
  test('detects support and enters fullscreen from a permitted gesture', async () => {
    const document = installDocument();

    assert.equal(canFullscreen(), true);
    assert.equal(isFullscreen(), false);
    assert.equal(await enterFullscreen(), true);
    assert.equal(isFullscreen(), true);
    assert.equal(document.fullscreenElement, document.documentElement);
  });

  test('exits and toggles fullscreen', async () => {
    installDocument();

    assert.equal(await toggleFullscreen(), true);
    assert.equal(isFullscreen(), true);
    assert.equal(await toggleFullscreen(), true);
    assert.equal(isFullscreen(), false);
    assert.equal(await exitFullscreen(), true);
  });

  test('reports refusal instead of throwing when the browser denies fullscreen', async () => {
    installDocument({ requestRejects: true });

    assert.equal(await enterFullscreen(), false);
    assert.equal(isFullscreen(), false);
  });

  test('notifies and unsubscribes fullscreenchange listeners', async () => {
    installDocument();
    let calls = 0;
    const unsubscribe = onFullscreenChange(() => calls++);

    await enterFullscreen();
    assert.equal(calls, 1);
    unsubscribe();
    await exitFullscreen();
    assert.equal(calls, 1);
  });
});
