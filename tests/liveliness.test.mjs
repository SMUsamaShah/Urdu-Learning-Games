import { test } from 'node:test';
import assert from 'node:assert/strict';
import { popIn } from '../src/lib/liveliness.js';

test('popIn reveals without changing the target size', () => {
  const calls = [];
  const scene = {
    tweens: {
      add(config) {
        calls.push(config);
        return config;
      },
    },
  };
  const target = {
    alpha: 1,
    scaleX: 2,
    scaleY: 3,
    setAlpha(value) {
      this.alpha = value;
      return this;
    },
  };

  popIn(scene, target, { delay: 40, duration: 260 });

  assert.equal(target.alpha, 0);
  assert.deepEqual(calls[0], {
    targets: target,
    alpha: 1,
    delay: 40,
    duration: 260,
    ease: 'Quad.easeOut',
  });
  assert.equal(target.scaleX, 2);
  assert.equal(target.scaleY, 3);
});
