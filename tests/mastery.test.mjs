/**
 * That a letter he keeps missing really does come up more often.
 *
 * Most of this file checks the bookkeeping — the window rolls, the weight is
 * bounded, a lucky pair of right answers does not certify a letter. Those are
 * worth having and none of them is the feature.
 *
 * **The feature is a distribution**, and the last test is the only one that
 * looks at one. A `pickWeighted` that ignored its weights entirely and called
 * `GetRandom` would pass every other assertion in this file, which is exactly
 * the failure this is here to catch: the thing silently doing nothing.
 *
 * Importable in plain node because src/lib/mastery.js touches localStorage only
 * inside a try/catch and pulls in neither Phaser nor the content store. That is
 * deliberate; see the note in tests/spelling.test.mjs about what happens when a
 * module cannot be imported here.
 *
 * Run: npm test
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  WINDOW,
  bandOf,
  historyOf,
  pickSomeWeighted,
  pickWeighted,
  record,
  reset,
  weightFrom,
  weightOf,
} from '../src/lib/mastery.js';

/** Answers an item `times` times, all right or all wrong. */
const answer = (id, correct, times) => {
  for (let i = 0; i < times; i++) record('letter', id, correct);
};

beforeEach(() => reset());

describe('the record', () => {
  test('keeps the newest answers and forgets the rest', () => {
    answer('be', false, 4);
    answer('be', true, WINDOW);
    assert.equal(historyOf('letter', 'be').length, WINDOW);
    assert.equal(historyOf('letter', 'be'), '1'.repeat(WINDOW), 'the four misses should have rolled off');
  });

  test('writes oldest first, so the newest answer is last', () => {
    record('letter', 'be', true);
    record('letter', 'be', false);
    assert.equal(historyOf('letter', 'be'), '10');
  });

  test('keeps the kinds apart', () => {
    answer('be', false, 6);
    record('number', 'be', true);
    assert.equal(historyOf('letter', 'be'), '000000');
    assert.equal(historyOf('number', 'be'), '1');
  });

  test('an item never answered has no record and does not invent one', () => {
    assert.equal(historyOf('letter', 'never'), '');
    assert.equal(historyOf('nonsense', 'never'), '');
  });
});

describe('the weight', () => {
  test('runs from 1 for always right to 4 for always wrong', () => {
    assert.equal(weightFrom('1'.repeat(WINDOW)), 1);
    assert.equal(weightFrom('0'.repeat(WINDOW)), 4);
  });

  test('never leaves that range, whatever the record', () => {
    for (let wrong = 0; wrong <= WINDOW; wrong++) {
      const history = '0'.repeat(wrong) + '1'.repeat(WINDOW - wrong);
      const weight = weightFrom(history);
      assert.ok(weight >= 1 && weight <= 4, `${history} weighed ${weight}`);
    }
  });

  test('rises as the misses do', () => {
    let last = 0;
    for (let wrong = 0; wrong <= WINDOW; wrong++) {
      const weight = weightFrom('0'.repeat(wrong) + '1'.repeat(WINDOW - wrong));
      assert.ok(weight > last, `${wrong} misses did not weigh more than ${wrong - 1}`);
      last = weight;
    }
  });

  test('an unseen item sits between a mastered one and a struggling one', () => {
    const unseen = weightFrom('');
    assert.ok(unseen > weightFrom('1'.repeat(WINDOW)), 'unseen should beat mastered');
    assert.ok(unseen < weightFrom('0'.repeat(WINDOW)), 'unseen should not beat struggling');
  });

  test('two right answers do not weigh the same as ten', () => {
    // The whole reason the miss rate is blended in rather than used raw: a
    // lucky pair of taps must not retire a letter he cannot do.
    assert.ok(
      weightFrom('11') > weightFrom('1'.repeat(WINDOW)),
      'a letter answered right twice is not yet a letter he knows'
    );
  });

  test('reading a weight does not create a record', () => {
    weightOf('letter', 'be');
    assert.equal(historyOf('letter', 'be'), '');
  });
});

describe('the bands a person reads', () => {
  test('say what happened rather than what the dealer thinks', () => {
    assert.equal(bandOf('letter', 'be'), 'new');

    answer('te', true, 5);
    assert.equal(bandOf('letter', 'te'), 'solid');

    // Two wrong out of two. The *weight* blends this toward NEW because the
    // evidence is thin; the band must not, or a page meant to tell a parent
    // what to work on would file it under "getting there".
    answer('se', false, 2);
    assert.equal(bandOf('letter', 'se'), 'missing');

    record('letter', 'jeem', false);
    answer('jeem', true, 9);
    assert.equal(bandOf('letter', 'jeem'), 'getting-there');
  });
});

describe('picking', () => {
  const POOL = ['alif', 'be', 'te', 'se', 'jeem'];

  test('returns something in the pool, and nothing else', () => {
    for (let i = 0; i < 50; i++) assert.ok(POOL.includes(pickWeighted('letter', POOL)));
  });

  test('avoids what it is told to avoid', () => {
    for (let i = 0; i < 200; i++) {
      assert.notEqual(pickWeighted('letter', POOL, { avoid: ['alif'] }), 'alif');
    }
  });

  test('drops the avoid rule rather than returning nothing', () => {
    // What every scene was writing as `pool.length ? pool : this.pool`. A round
    // with one letter left in play still has to deal a round.
    assert.equal(pickWeighted('letter', ['alif'], { avoid: ['alif'] }), 'alif');
  });

  test('an empty pool is null, not a crash', () => {
    assert.equal(pickWeighted('letter', []), null);
    assert.deepEqual(pickSomeWeighted('letter', [], 3), []);
  });

  test('deals distinct items, and never more than there are', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickSomeWeighted('letter', POOL, 3);
      assert.equal(picked.length, 3);
      assert.equal(new Set(picked).size, 3, `${picked} has a duplicate`);
    }
    assert.equal(pickSomeWeighted('letter', POOL, 99).length, POOL.length);
  });

  test('does not put the struggling one in the same seat every time', () => {
    answer('se', false, WINDOW);
    const firsts = new Set();
    for (let i = 0; i < 200; i++) firsts.add(pickSomeWeighted('letter', POOL, 3)[0]);
    assert.ok(firsts.size > 1, 'the board is always dealt in weight order');
  });
});

describe('the distribution, which is the actual feature', () => {
  const POOL = ['alif', 'be', 'te', 'se', 'jeem'];
  const DRAWS = 20000;

  /** How often each id came up over `DRAWS` picks. */
  function tally() {
    const counts = Object.fromEntries(POOL.map((id) => [id, 0]));
    for (let i = 0; i < DRAWS; i++) counts[pickWeighted('letter', POOL)]++;
    return counts;
  }

  test('with no record at all, everything comes up about equally', () => {
    const counts = tally();
    for (const id of POOL) {
      const share = counts[id] / DRAWS;
      assert.ok(Math.abs(share - 0.2) < 0.02, `${id} took ${(share * 100).toFixed(1)}%`);
    }
  });

  test('a letter he always misses comes up about four times as often', () => {
    answer('se', false, WINDOW);
    for (const id of ['alif', 'be', 'te', 'jeem']) answer(id, true, WINDOW);

    const counts = tally();
    // Four at weight 1 and one at weight 4: eight parts, four of them the
    // struggling letter.
    const share = counts.se / DRAWS;
    assert.ok(
      Math.abs(share - 0.5) < 0.03,
      `the struggling letter took ${(share * 100).toFixed(1)}% of 20,000 draws, expected about 50%`
    );

    const ratio = counts.se / (counts.alif + counts.be + counts.te + counts.jeem);
    assert.ok(ratio > 0.85 && ratio < 1.15, `struggling:mastered came out at ${ratio.toFixed(2)}:1 over four letters`);
  });

  test('getting better makes it fade back into the pack', () => {
    answer('se', false, WINDOW);
    for (const id of ['alif', 'be', 'te', 'jeem']) answer(id, true, WINDOW);
    const struggling = tally().se / DRAWS;

    answer('se', true, WINDOW);
    const recovered = tally().se / DRAWS;

    assert.ok(
      recovered < struggling / 2,
      `a fixed letter still took ${(recovered * 100).toFixed(1)}%, down only from ${(struggling * 100).toFixed(1)}%`
    );
    assert.ok(Math.abs(recovered - 0.2) < 0.02, 'and it should be back to its even share');
  });
});
