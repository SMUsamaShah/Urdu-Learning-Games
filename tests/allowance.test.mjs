/**
 * That a daily limit is a limit, and that it never charges him for time he
 * did not have.
 *
 * Two of these matter more than the rest.
 *
 * **The sleeping phone.** Some Androids do not fire `visibilitychange` when the
 * screen goes off under a covered sensor, so the page can be "visible" through
 * an entire nap. If a long gap counted, a twenty-minute allowance would be gone
 * before he woke up, and that is the one failure a parent cannot argue with
 * because there is nothing on screen to show what happened.
 *
 * **The new day.** The rollover is checked on read rather than scheduled,
 * because nothing of ours runs while the app is closed — which is most of the
 * time. A phone switched off for a week must come back to a full allowance.
 *
 * Importable in plain node: src/lib/allowance.js touches localStorage only
 * inside try/catch and `document` only inside the interval, which the tests
 * never start. Same discipline as tests/mastery.test.mjs.
 *
 * Run: npm test
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  LIMITS,
  accrual,
  dayKey,
  endToday,
  forgetToday,
  grant,
  isUp,
  limitMinutes,
  onAllowance,
  onRanOut,
  ranOutNow,
  remainingMs,
  rollover,
  setLimitMinutes,
  spentMs,
} from '../src/lib/allowance.js';

const MINUTE = 60000;

/** Fresh state between tests: no localStorage in node, so this is the reset. */
beforeEach(() => {
  setLimitMinutes(0);
  forgetToday();
});

describe('the limit itself', () => {
  test('is off on a device nobody has set one on', () => {
    assert.equal(limitMinutes(), 0);
    assert.equal(remainingMs(), Infinity);
    assert.equal(isUp(), false);
  });

  test('off means never up, however long he plays', () => {
    grant(-600); // ten hours spent
    assert.equal(isUp(), false, 'no limit must never run out');
  });

  test('only offers the minutes Settings lists', () => {
    setLimitMinutes(20);
    setLimitMinutes(17);
    assert.equal(limitMinutes(), 20, 'a number not in LIMITS is ignored');
    assert.ok(LIMITS.includes(0), 'no limit has to be one of the choices');
  });

  test('counts down and then runs out', () => {
    setLimitMinutes(10);
    assert.equal(remainingMs(), 10 * MINUTE);
    grant(-9); // nine minutes spent
    assert.equal(remainingMs(), MINUTE);
    assert.equal(isUp(), false);
    grant(-1);
    assert.equal(remainingMs(), 0);
    assert.equal(isUp(), true);
  });

  test('never reports less than nothing left', () => {
    setLimitMinutes(10);
    grant(-90);
    assert.equal(remainingMs(), 0);
  });
});

describe('handing time back', () => {
  test('a grant takes minutes off what he has spent, not off tomorrow', () => {
    setLimitMinutes(20);
    grant(-20);
    assert.equal(isUp(), true);

    grant(10);
    assert.equal(isUp(), false);
    assert.equal(remainingMs(), 10 * MINUTE);
    assert.equal(limitMinutes(), 20, 'tomorrow still starts from the number chosen');
  });

  test('a grant cannot bank time by going below zero spent', () => {
    setLimitMinutes(20);
    grant(60);
    assert.equal(spentMs(), 0);
    assert.equal(remainingMs(), 20 * MINUTE, 'not 80 minutes');
  });

  test('ending the day early uses the rest of it up', () => {
    setLimitMinutes(30);
    endToday();
    assert.equal(isUp(), true);
  });

  test('ending the day does nothing when there is no limit', () => {
    // Not merely "does not crash": the minutes he has already played are still
    // on the Settings row, and switching the limit off must not quietly wipe
    // them. A no-op has to be a no-op.
    setLimitMinutes(10);
    grant(-4);
    setLimitMinutes(0);
    endToday();
    assert.equal(spentMs(), 4 * MINUTE);
    assert.equal(isUp(), false);
  });

  test('forgetting today puts the whole allowance back', () => {
    setLimitMinutes(15);
    endToday();
    forgetToday();
    assert.equal(spentMs(), 0);
    assert.equal(isUp(), false);
  });

  test('tells its listeners when the numbers move', () => {
    const seen = [];
    const stop = onAllowance((state) => seen.push(state.remaining));
    setLimitMinutes(10);
    grant(-5);
    stop();
    grant(-1);
    assert.deepEqual(seen, [10 * MINUTE, 5 * MINUTE], 'and stops when unsubscribed');
  });
});

describe('the moment it runs out', () => {
  /**
   * The clock is not the only thing that can spend the last minute, and when
   * this edge lived inside the ticking clock the other two ways were silent:
   * the "that's enough for today" screen simply never appeared. Found by
   * tools/verify-limit.mjs, which is why it is here.
   */
  const watch = () => {
    let times = 0;
    const stop = onRanOut(() => (times += 1));
    return { count: () => times, stop };
  };

  test('ending the day early says so', () => {
    setLimitMinutes(20);
    const ran = watch();
    endToday();
    ran.stop();
    assert.equal(ran.count(), 1);
  });

  test('lowering the limit past what he has played says so', () => {
    setLimitMinutes(60);
    grant(-30);
    const ran = watch();
    setLimitMinutes(20);
    ran.stop();
    assert.equal(ran.count(), 1, 'thirty minutes played and a twenty minute limit is up');
  });

  test('is an edge, not a repeat', () => {
    setLimitMinutes(20);
    const ran = watch();
    endToday();
    endToday();
    grant(-5);
    ran.stop();
    assert.equal(ran.count(), 1, 'still up is not running out again');
  });

  test('handing time back arms it for next time', () => {
    setLimitMinutes(20);
    const ran = watch();
    endToday();
    grant(10);
    endToday();
    ran.stop();
    assert.equal(ran.count(), 2);
  });

  test('says nothing while there is time left', () => {
    setLimitMinutes(20);
    const ran = watch();
    grant(-19);
    ran.stop();
    assert.equal(ran.count(), 0);
  });

  test('midnight arms it again', () => {
    // An app left open past bedtime rolls over to a fresh allowance, and when
    // that one goes it is a new edge — even though the last thing announced was
    // "out of time". Checked on the rule rather than by waiting for midnight.
    const out = { day: '2026-8-23', remaining: 0 };
    assert.equal(ranOutNow(out, out), false, 'still out is not out again');
    assert.equal(ranOutNow(out, { day: '2026-8-24', remaining: 0 }), true, 'a new day is');
  });

  test('the rule itself', () => {
    const some = { day: '2026-8-23', remaining: 5000 };
    assert.equal(ranOutNow(some, { day: '2026-8-23', remaining: 0 }), true);
    assert.equal(ranOutNow(some, some), false);
    assert.equal(
      ranOutNow({ day: '', remaining: Infinity }, { day: '2026-8-23', remaining: Infinity }),
      false,
      'no limit at all never runs out'
    );
  });

  test('says nothing at all when there is no limit', () => {
    const ran = watch();
    grant(-600);
    endToday();
    ran.stop();
    assert.equal(ran.count(), 0);
  });
});

describe('a new day', () => {
  const state = { limit: 20, day: '2026-8-23', spent: 12 * MINUTE };

  test('same day keeps what he has spent', () => {
    assert.equal(rollover(state, '2026-8-23'), state, 'and does not even copy it');
  });

  test('the next day is a fresh allowance', () => {
    assert.deepEqual(rollover(state, '2026-8-24'), { limit: 20, day: '2026-8-24', spent: 0 });
  });

  test('a phone switched off for a week comes back to a full one', () => {
    assert.equal(rollover(state, '2026-9-1').spent, 0);
  });

  test('the limit a parent chose survives the rollover', () => {
    assert.equal(rollover(state, '2026-8-24').limit, 20);
  });

  test('the day is the local one, not UTC', () => {
    // Half past eleven at night in Karachi is already the next day in UTC, and
    // rolling on UTC would hand out a second allowance at bedtime — which is
    // exactly when it would be noticed.
    //
    // Asserted against a clock whose local and UTC answers differ, rather than
    // against a real Date, because these tests run in whatever timezone the
    // machine is in and on a UTC box the two are the same. This one caught
    // nothing at all until it was written this way.
    const bedtimeInKarachi = {
      getFullYear: () => 2026,
      getMonth: () => 7,
      getDate: () => 23,
      getUTCFullYear: () => 2026,
      getUTCMonth: () => 7,
      getUTCDate: () => 24,
    };
    assert.equal(dayKey(bedtimeInKarachi), '2026-8-23');
    assert.equal(dayKey(new Date(2026, 7, 24, 12, 0)), '2026-8-24', 'and a real date works');
  });
});

describe('what counts as time spent', () => {
  const playing = { gap: 1000, paused: false, visible: true, limit: 20 };

  test('a normal tick while he is playing counts', () => {
    assert.equal(accrual(playing), 1000);
  });

  test('a sleeping phone counts for nothing', () => {
    // The one that matters. See the note at the top of this file.
    assert.equal(accrual({ ...playing, gap: 8 * 3600 * 1000 }), 0);
  });

  test('a slow frame still counts', () => {
    assert.equal(accrual({ ...playing, gap: 3000 }), 3000, 'a stretched tick is still playing');
  });

  test('a grown-up in Settings is not spending his time', () => {
    assert.equal(accrual({ ...playing, paused: true }), 0);
  });

  test('a hidden page is not playing', () => {
    assert.equal(accrual({ ...playing, visible: false }), 0);
  });

  test('nothing accrues when there is no limit', () => {
    assert.equal(accrual({ ...playing, limit: 0 }), 0);
  });

  test('a clock that went backwards costs him nothing', () => {
    // Daylight saving, or an NTP correction. Negative spent time would hand
    // back minutes, which is harmless, but so is refusing to.
    assert.equal(accrual({ ...playing, gap: -5000 }), 0);
  });
});
