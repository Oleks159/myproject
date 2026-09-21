import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewardPresentation, countedReward, victoryStyle, victoryFixture } from '../public/legacy/victory.mjs';

const sample = { pot: 4200, qualifiedWin: 3100, previousRate: 8.42, nextRate: 10.20 };
test('requested example is central, has all exact amounts and lasts 2.5 seconds', () => {
  const result = rewardPresentation(sample);
  assert.equal(result.mode, 'large'); assert.equal(result.delta, 1.78);
  assert.equal(result.label, 'POT WON +4,200 CHIPS. +3,100 QUALIFIED WIN. EARNING RATE UP 8.42 → 10.20 AP/h.');
  assert.equal(victoryStyle.duration, 2500);
});
test('small increase and no increase never request a central rate overlay', () => {
  assert.equal(rewardPresentation({ ...sample, nextRate: 8.45 }).mode, 'small');
  const unchanged = rewardPresentation({ ...sample, nextRate: 8.42 });
  assert.equal(unchanged.mode, 'small'); assert.doesNotMatch(unchanged.label, /RATE UP/);
});
test('presentation threshold is explicit and inclusive, independent of economy', () => {
  assert.equal(rewardPresentation({ ...sample, nextRate: 9.419999 }).mode, 'small');
  assert.equal(rewardPresentation({ ...sample, nextRate: 9.42 }).mode, 'large');
});
test('all counters settle before one second without overshooting', () => {
  assert.equal(countedReward(8.42, 10.20, 0), 8.42);
  assert.equal(countedReward(8.42, 10.20, 620), 10.20);
  assert.equal(countedReward(0, 4200, 800), 4200);
  let previous = 0;
  for (let ms = 0; ms < 1000; ms += 10) {
    const n = countedReward(0, 4200, ms); assert.ok(n >= previous && n <= 4200); previous = n;
  }
});
test('invalid rewards are rejected rather than silently showing false wins', () => {
  for (const override of [{ pot: -1 }, { nextRate: NaN }, { qualifiedWin: 4201 }, { nextRate: 8 }]) {
    assert.throws(() => rewardPresentation({ ...sample, ...override }), RangeError);
  }
});
test('preview fixtures are fresh, read-only data unrelated to any account ID', () => {
  const a = victoryFixture('large'), b = victoryFixture('small');
  assert.equal(a.rate, 10.20); assert.equal(b.rate, 8.45); assert.equal(a.id, undefined);
  assert.equal(a.table.result.payout - a.table.result.contribution, 3100);
  a.table.stack = 0; assert.equal(victoryFixture().table.stack, 13100);
});
test('main-table design fixture has an active hand, no reward and correct chip separation', () => {
  const a = victoryFixture('table');
  assert.equal(a.table.status, 'turn'); assert.equal(a.table.result, null);
  assert.equal(a.table.board.length, 4); assert.equal(a.rate, 8.42);
  assert.equal(a.table.stack + a.table.contribution, 10000);
});
