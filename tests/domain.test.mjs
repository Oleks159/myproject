import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as d from '../domain.mjs';
import { config } from '../config.mjs';

const NOW = 1800000000000;
const HOUR = 3600000;
const hand = (id, overrides = {}) => ({ id, public: true, participants: 3, street: 3, approved: true, payout: 200, contribution: 100, ...overrides });

test('new accounts start with zero AP and zero permanent rate', () => {
  const a = d.account('new', NOW);
  assert.equal(a.apUnits, '0'); assert.equal(a.rateUnits, 0); assert.equal(a.activation, 0);
  assert.equal(a.chips, config.startingChips); assert.equal(d.snapshot(a, NOW).earning.status, 'locked');
});
test('recovery faucet only restores a low balance to 1,000 every six hours', () => {
  const a = d.account('new', NOW);
  assert.throws(() => d.claimFaucet(a, NOW), /unter 1000/);
  a.chips = 240; assert.equal(d.claimFaucet(a, NOW), 760); assert.equal(a.chips, 1000);
  a.chips = 0; assert.throws(() => d.claimFaucet(a, NOW), /noch nicht/);
  d.claimFaucet(a, NOW + 30 * HOUR); assert.equal(a.chips, 1000);
  assert.equal(a.faucetAt, NOW + 36 * HOUR);
});
test('50 qualifying hands, not 50 wins, unlock activity requirement', () => {
  const a = d.account('new', NOW);
  for (let i = 0; i < config.activationHands; i++) d.recordHand(a, hand(String(i), { payout: 0 }), NOW + i);
  assert.equal(a.activation, config.activationHands); assert.equal(a.stats.wins, 0); assert.equal(a.rateUnits, 0);
  assert.throws(() => d.startCycle(a, NOW + 60), /Rate/); // Explicit preview zero-rate policy.
  d.recordHand(a, hand('first-win'), NOW + 61);
  assert.ok(a.rateUnits > 0); d.startCycle(a, NOW + 62);
  assert.ok(a.cycle); assert.equal(a.activation, 0);
});
test('rate uses positive NET winnings and never chips balance or gross pot', () => {
  const a = d.account('new', NOW);
  d.recordHand(a, hand('net'), NOW);
  assert.equal(a.qualifiedWinnings, 100); assert.equal(a.chips, config.startingChips);
  assert.equal(a.rateUnits, d.rateFromQualifiedWinnings(100));
  const rate = a.rateUnits;
  d.recordHand(a, hand('loss', { payout: 0 }), NOW + 1);
  d.recordHand(a, hand('return', { payout: 100 }), NOW + 2);
  assert.equal(a.rateUnits, rate); assert.equal(a.qualifiedWinnings, 100); assert.equal(a.stats.wins, 1);
});
test('invalid hands do not count; valid pre-turn folds count but cannot create Qualified Winnings', () => {
  for (const override of [{ public: false }, { participants: 2 }, { approved: false }, { seated: false }, { sittingOut: true }]) {
    const a = d.account('new', NOW); d.recordHand(a, hand('ineligible', override), NOW);
    assert.equal(a.rateUnits, 0); assert.equal(a.activation, 0); assert.equal(a.qualifiedWinnings, 0);
  }
  const preTurn = d.account('new', NOW); d.recordHand(preTurn, hand('pre-turn', { street: 0 }), NOW);
  assert.equal(preTurn.activation, 1); assert.equal(preTurn.qualifiedWinnings, 0); assert.equal(preTurn.rateUnits, 0);
});
test('all-in marker does not multiply rewards', () => {
  const a = d.account('new', NOW), b = d.account('new', NOW);
  d.recordHand(a, hand('ordinary'), NOW); d.recordHand(b, hand('allin', { allIn: true }), NOW);
  assert.equal(a.rateUnits, b.rateUnits);
});
test('settlement is rejected twice, including after serialization', () => {
  const a = d.account('new', NOW); d.recordHand(a, hand('one'), NOW);
  const restored = JSON.parse(JSON.stringify(a));
  assert.throws(() => d.recordHand(restored, hand('one'), NOW), /bereits/);
});
test('cycle requires explicit start and rejects a second start or early claim', () => {
  const a = d.account('ready', NOW); assert.equal(a.cycle, null);
  d.startCycle(a, NOW);
  assert.throws(() => d.startCycle(a, NOW), /offenen/);
  assert.throws(() => d.claimCycle(a, NOW + 5 * HOUR), /nicht abgeschlossen/);
});
test('mid-cycle rate increase applies forward only, caps at six hours', () => {
  const a = d.account('ready', NOW);
  d.startCycle(a, NOW); const base = a.rateUnits; d.setRate(a, base + 3 * config.rateScale, NOW + 2 * HOUR);
  const expected = BigInt(base) * 6n + 12n * BigInt(config.rateScale);
  assert.equal(d.accruedUnits(a.cycle, NOW + 6 * HOUR), expected);
  assert.equal(d.accruedUnits(a.cycle, NOW + 100 * HOUR), expected);
  d.setRate(a, base + 8 * config.rateScale, NOW + 7 * HOUR);
  assert.equal(d.accruedUnits(a.cycle, NOW + 100 * HOUR), expected);
});
test('sub-second segments are rounded only once, not on every poll', () => {
  const cycle = { start: NOW, end: NOW + HOUR, segments: [{ at: NOW, rate: 3 }, { at: NOW + HOUR / 2, rate: 5 }] };
  for (let i = 1; i < 1000; i++) d.accruedUnits(cycle, NOW + i);
  assert.equal(d.accruedUnits(cycle, NOW + HOUR), 4n);
});
test('claim credits AP once, preserves rate and preserves one prepared activation', () => {
  const a = d.account('ready', NOW), oldAP = BigInt(a.apUnits);
  d.startCycle(a, NOW); const rate = a.rateUnits;
  for (let i = 0; i < 20; i++) d.recordHand(a, hand(`during-${i}`, { payout: 0 }), NOW + i);
  assert.equal(a.activation, 20);
  d.claimCycle(a, NOW + 6 * HOUR);
  assert.equal(BigInt(a.apUnits), oldAP + BigInt(rate) * 6n);
  assert.equal(a.rateUnits, rate); assert.equal(a.cycle, null); assert.equal(a.activation, 20);
  assert.throws(() => d.claimCycle(a, NOW + 6 * HOUR), /nicht abgeschlossen/);
  assert.throws(() => d.startCycle(a, NOW + 6 * HOUR), /50/);
});
test('permanent rate cannot decrease', () => {
  const a = d.account('ready', NOW);
  assert.throws(() => d.setRate(a, a.rateUnits - 1, NOW), /nicht sinken/);
});
test('buy-in is a transfer; leave returns remaining chips after a fold', () => {
  const a = d.account('ready', NOW), total = a.chips;
  d.enterTable(a, 'high', NOW);
  assert.equal(a.chips + a.table.stack + a.table.contribution, total);
  const committed = a.table.contribution;
  d.leaveTable(a, NOW + 1);
  assert.equal(a.chips, total - committed); assert.equal(a.table, null);
});
test('scripted win credits table pot and tracks net once, then can be left', () => {
  const a = d.account('ready', NOW), total = a.chips;
  d.enterTable(a, 'high', NOW);
  const result = d.tableAction(a, 'call', 0, NOW + 100);
  assert.equal(result.net, result.payout - result.contribution);
  assert.equal(a.chips + a.table.stack, total + result.net);
  assert.throws(() => d.tableAction(a, 'call', 0, NOW + 101), /nicht am Zug/);
  d.leaveTable(a, NOW + 102); assert.equal(a.chips, total + result.net);
});
test('deadline is server enforced at exact boundary even when no poll occurred', () => {
  const a = d.account('ready', NOW); d.enterTable(a, 'high', NOW);
  const rate = a.rateUnits;
  const result = d.tableAction(a, 'raise', a.table.maxRaise, NOW + config.decisionMs);
  assert.ok(result.folded); assert.equal(a.rateUnits, rate);
});
test('read snapshot settles expired demo hand only once', () => {
  const a = d.account('ready', NOW); d.enterTable(a, 'micro', NOW);
  d.snapshot(a, NOW + 16000); const stack = a.table.stack, hands = a.stats.hands;
  d.snapshot(a, NOW + 17000);
  assert.equal(a.table.stack, stack); assert.equal(a.stats.hands, hands); assert.equal(a.table.status, 'between');
});
test('raise limits, unknown stakes, and insufficient chip balances are rejected', () => {
  const a = d.account('new', NOW);
  assert.throws(() => d.enterTable(a, 'unknown', NOW), /Unbekannte/);
  a.leagueRating = 1200; a.league = 'Gold';
  assert.throws(() => d.enterTable(a, 'high', NOW), /Nicht genug/);
  d.enterTable(a, 'micro', NOW);
  for (const amount of [-1, 0, 1.5, a.table.minRaise - 1, a.table.maxRaise + 1]) {
    assert.throws(() => d.tableAction(a, 'raise', amount, NOW + 1), /Ungültiger/);
  }
});
test('demo cards form distinct valid hands, including the scripted losing river', () => {
  const a = d.account('ready', NOW); d.enterTable(a, 'micro', NOW);
  for (let i = 0; i < 3; i++) {
    const result = d.tableAction(a, 'call', 0, NOW + 1);
    const all = [...a.table.hero, ...a.table.board, ...result.opponent];
    assert.equal(new Set(all).size, 9); all.forEach(c => assert.match(c, /^[2-9TJQKA][shdc]$/));
    assert.equal(result.won, i < 2);
    if (i < 2) d.nextHand(a, NOW + 2);
  }
});
test('mission rewards are claimable only once and require actual preview progress', () => {
  const a = d.account('new', NOW);
  assert.throws(() => d.claimMission(a, 'hands15', NOW), /nicht abgeschlossen/);
  a.stats.qualifiedHands = 15;
  d.claimMission(a, 'hands15', NOW); assert.equal(a.chips, 7000);
  assert.throws(() => d.claimMission(a, 'hands15', NOW), /nicht abgeholt/);
});

test('direct referral rewards use the referrer current player League and are additive', () => {
  const a = d.account('ready', NOW), referral = a.directReferrals.find(r => r.id === 'ton');
  a.league = 'Gold';
  const ownerBefore = BigInt(a.apUnits), referralActivityBefore = BigInt(referral.seasonQualifiedApUnits);
  const qualified = 8000n * BigInt(config.rateScale);
  const reward = d.creditDirectReferralAP(a, referral.id, qualified, NOW);
  assert.equal(reward, 320n * BigInt(config.rateScale));
  assert.equal(BigInt(a.apUnits), ownerBefore + reward);
  assert.equal(BigInt(referral.seasonQualifiedApUnits), referralActivityBefore + qualified);
  a.league = 'Diamond';
  assert.equal(d.creditDirectReferralAP(a, referral.id, 1000n * BigInt(config.rateScale), NOW + 1), 60n * BigInt(config.rateScale));
});

test('unqualified and non-direct players cannot create referral AP', () => {
  const a = d.account('ready', NOW), unqualified = a.directReferrals.find(r => !r.qualified);
  assert.throws(() => d.creditDirectReferralAP(a, unqualified.id, 100n * BigInt(config.rateScale), NOW), /Qualification/);
  assert.throws(() => d.creditDirectReferralAP(a, 'second-level-or-unknown', 100n * BigInt(config.rateScale), NOW), /direkte Referrals/);
  assert.deepEqual(['Bronze','Silver','Gold','Platinum','Diamond','Master'].map(l => d.referralRateBps(l)), [200,300,400,500,600,700]);
});

test('referral snapshot totals and live earnings come from direct player data', () => {
  const populated = d.snapshot(d.account('ready', NOW), NOW).referrals;
  assert.equal(populated.total, populated.players.length);
  assert.equal(populated.active, populated.players.filter(player => player.earningStatus === 'active').length);
  const capped = populated.players.find(player => player.league === 'Diamond');
  assert.equal(capped.playerShare, 6);
  assert.equal(capped.effectiveShare, 4);
  assert.equal(capped.capped, true);
  assert.ok(Math.abs(capped.referralAPPerHour - capped.earningRate * .04) < 1e-9);
  assert.ok(Math.abs(populated.liveRate - populated.players.reduce((sum, player) => sum + player.referralAPPerHour, 0)) < 1e-9);
  const empty = d.snapshot(d.account('new', NOW), NOW).referrals;
  assert.deepEqual([empty.total, empty.active, empty.liveRate, empty.earned24h], [0, 0, 0, 0]);
});

test('V1 logarithmic rate curve matches the configured Qualified Winnings model', () => {
  const rate = d.rateFromQualifiedWinnings(73579) / config.rateScale;
  assert.ok(Math.abs(rate - 8.49) < .01);
});

test('bot settlement updates the shared account once and preflop completion still advances activation', () => {
  const a = d.account('new', NOW), tier = config.stakes[0];
  const state = { status: 'finished', hand_id: 'bot-1', payoff_bb: -2, big_blind: tier.big, board: [] };
  const before = a.chips;
  const result = d.recordBotHand(a, state, tier, NOW);
  assert.equal(result.valid, true); assert.equal(result.qualified, false);
  assert.equal(a.activation, 1); assert.equal(a.chips, before - 2 * tier.big);
  assert.equal(d.recordBotHand(a, state, tier, NOW + 1), null);
});

test('daily bankroll reward uses League base plus capped Rate bonus and is claimable once per day', () => {
  const a = d.account('new', NOW); a.leagueRating = 1200; a.qualifiedWinnings = 73579;
  d.normalizeAccount(a, NOW);
  const expected = Math.round(config.dailyRewardBase.Gold * (1 + Math.min(50, a.rateUnits / config.rateScale) / 100));
  assert.equal(d.claimDailyReward(a, NOW), expected);
  assert.throws(() => d.claimDailyReward(a, NOW + HOUR), /bereits/);
});
