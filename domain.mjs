import { randomUUID } from 'node:crypto';
import { config } from './config.mjs';

export class RuleError extends Error { constructor(message, status = 409) { super(message); this.status = status; } }
const requireRule = (value, message) => { if (!value) throw new RuleError(message); };
const leagues = Object.keys(config.leagueThresholds);
export function leagueForRating(rating = 0) {
  return leagues.reduce((current, league) => rating >= config.leagueThresholds[league] ? league : current, 'Bronze');
}
export function unlockedStakesForLeague(league) {
  return config.stakes.slice(0, config.leagueStakeUnlocks[league] || 0).map(stake => stake.id);
}
export function rateFromQualifiedWinnings(winnings) {
  return Math.round(config.rateCurveMultiplier * Math.log(1 + Math.max(0, winnings) / config.rateCurveDivisor) * config.rateScale);
}
export function ledger(a, asset, amount, source, now, type = source, sourceId = null) {
  a.history.unshift({ id: randomUUID(), accountId: a.id, asset, type, amount, source, sourceId, relatedHandId: type === 'HAND_SETTLEMENT' ? sourceId : null, timestamp: now, at: now, config: config.version });
  a.history = a.history.slice(0, 300);
}
export function referralRateBps(league) {
  const rate = config.referralRatesBps[league];
  requireRule(Number.isSafeInteger(rate), 'Unbekannte Spieler-League.');
  return rate;
}
export function referralRewardUnits(qualifiedApUnits, league) {
  requireRule(typeof qualifiedApUnits === 'bigint' && qualifiedApUnits > 0n, 'Qualifizierte Referral-AP müssen positiv sein.');
  return qualifiedApUnits * BigInt(referralRateBps(league)) / 10000n;
}
export function creditDirectReferralAP(a, referralId, qualifiedApUnits, now) {
  const referral = a.directReferrals?.find(r => r.id === referralId);
  requireRule(referral, 'Nur eigene direkte Referrals können Belohnungen erzeugen.');
  requireRule(referral.qualified, 'Der Referral muss zuerst die normale Qualification erfüllen.');
  const reward = referralRewardUnits(qualifiedApUnits, a.league);
  referral.seasonQualifiedApUnits = (BigInt(referral.seasonQualifiedApUnits || 0) + qualifiedApUnits).toString();
  referral.rewardForOwnerUnits = (BigInt(referral.rewardForOwnerUnits || 0) + reward).toString();
  a.apUnits = (BigInt(a.apUnits) + reward).toString();
  ledger(a, 'AP', Number(reward) / config.rateScale, `Direkter Referral: ${referral.username}`, now);
  return reward;
}
function demoDirectReferrals() {
  return [
    { id: 'alex', username: '@alex_poker', league: 'Diamond', qualifiedHands: 2184, activeDays: 28, qualified: true, earningRateUnits: 18400000, earningStatus: 'active', cycleRemainingMs: 13320000, earned24hUnits: String(1840 * config.rateScale), seasonQualifiedApUnits: String(18420 * config.rateScale), rewardForOwnerUnits: String(1842 * config.rateScale) },
    { id: 'ton', username: '@ton_master', league: 'Gold', qualifiedHands: 842, activeDays: 16, qualified: true, earningRateUnits: 12600000, earningStatus: 'active', cycleRemainingMs: 4680000, earned24hUnits: String(1260 * config.rateScale), seasonQualifiedApUnits: String(7850 * config.rateScale), rewardForOwnerUnits: String(785 * config.rateScale) },
    { id: 'sara', username: '@sara_holdem', league: 'Silver', qualifiedHands: 320, activeDays: 9, qualified: true, earningRateUnits: 8240000, earningStatus: 'inactive', lastCycleHours: 7, earned24hUnits: String(330 * config.rateScale), seasonQualifiedApUnits: String(2140 * config.rateScale), rewardForOwnerUnits: String(214 * config.rateScale) },
    { id: 'max', username: '@max92', league: 'Bronze', qualifiedHands: 32, activeDays: 3, qualified: false, earningRateUnits: 4120000, earningStatus: 'qualifying', earned24hUnits: '0', seasonQualifiedApUnits: String(460 * config.rateScale), rewardForOwnerUnits: String(46 * config.rateScale) },
    { id: 'elena', username: '@elena_play', league: 'Gold', qualifiedHands: 112, activeDays: 6, qualified: true, earningRateUnits: 10600000, earningStatus: 'inactive', lastCycleHours: 24, earned24hUnits: String(1140 * config.rateScale), seasonQualifiedApUnits: String(1120 * config.rateScale), rewardForOwnerUnits: String(112 * config.rateScale) }
  ];
}
export function account(scenario = 'ready', now = Date.now()) {
  const a = { id: randomUUID(), name: 'Alex', chips: config.startingChips, apUnits: '0', rateUnits: 0,
    qualifiedWinnings: 0, activation: 0, cycle: null, faucetAt: 0, offset: 0,
    stats: { hands: 0, qualifiedHands: 0, wins: 0, cycles: 0, sessionBB: 0, lifetimeBB: 0, handsPlayed: 0, bbPer100: 0 }, missionClaims: [], history: [], table: null,
    processedHands: [], settings: { haptics: true, reducedMotion: false }, league: scenario === 'new' ? 'Bronze' : 'Gold',
    leagueDivision: 'I', leagueRating: scenario === 'new' ? 0 : 1840,
    referrerId: null, referralCode: randomUUID().replaceAll('-', '').slice(0, 12), createdAt: now,
    dailyReward: { lastClaimedAt: 0 }, events: [],
    directReferrals: scenario === 'new' ? [] : demoDirectReferrals(), scenario };
  if (scenario !== 'new') Object.assign(a, { chips: 44850, apUnits: '3893380000', rateUnits: rateFromQualifiedWinnings(73579),
    qualifiedWinnings: 73579, activation: config.activationHands, stats: { hands: 59, qualifiedHands: config.activationHands, wins: 4, cycles: 0, sessionBB: 0, lifetimeBB: 0, handsPlayed: 59, bbPer100: 0 } });
  ledger(a, 'Chips', a.chips, scenario === 'new' ? 'Starting balance' : 'Demo balance', now, 'STARTING_BALANCE');
  if (scenario === 'active' || scenario === 'claimable') {
    startCycle(a, now - (scenario === 'active' ? 12600000 : config.cycleDuration));
  }
  return a;
}

export function normalizeAccount(a, now = Date.now()) {
  a.createdAt ||= now;
  a.referralCode ||= String(a.id || randomUUID()).replaceAll('-', '').slice(0, 12);
  a.referrerId ??= null;
  a.leagueRating = Number.isFinite(a.leagueRating) ? a.leagueRating : (a.league === 'Gold' ? 1840 : 0);
  a.league = leagueForRating(a.leagueRating);
  a.leagueDivision ||= 'I';
  const previousStats = a.stats || {};
  a.stats = { hands: 0, qualifiedHands: 0, wins: 0, cycles: 0,
    sessionBB: 0, lifetimeBB: 0, handsPlayed: Number(previousStats.hands || 0), bbPer100: 0, ...previousStats };
  a.history ||= [];
  a.processedHands ||= [];
  a.missionClaims ||= [];
  a.settings ||= { haptics: true, reducedMotion: false };
  a.directReferrals ||= [];
  a.dailyReward ||= { lastClaimedAt: 0 };
  a.events ||= [];
  a.activation = Math.max(0, Math.min(config.activationHands, Number(a.activation || 0)));
  a.rateUnits = rateFromQualifiedWinnings(a.qualifiedWinnings || 0);
  a.apUnits = String(a.apUnits || '0');
  a.faucetAt ||= 0;
  a.offset ||= 0;
  return a;
}
export function accruedUnits(cycle, now) {
  if (!cycle) return 0n;
  const end = Math.min(now, cycle.end);
  let weighted = 0n;
  for (let i = 0; i < cycle.segments.length; i++) {
    const s = cycle.segments[i];
    const stop = Math.min(end, cycle.segments[i + 1]?.at ?? end);
    if (stop > s.at) weighted += BigInt(stop - s.at) * BigInt(s.rate);
  }
  return weighted / 3600000n;
}
export function setRate(a, rate, now) {
  requireRule(Number.isSafeInteger(rate) && rate >= a.rateUnits, 'Die dauerhafte Rate darf nicht sinken.');
  if (rate === a.rateUnits) return;
  a.rateUnits = rate;
  if (a.cycle && now < a.cycle.end) a.cycle.segments.push({ at: now, rate });
}
export function startCycle(a, now) {
  normalizeAccount(a, now);
  requireRule(!a.cycle, 'Es gibt bereits einen offenen Zyklus.');
  requireRule(a.activation >= config.activationHands, `Spiele zuerst ${config.activationHands} qualifizierende Hände.`);
  // Explicit preview policy: no zero-rate cycles. Not a production economy decision.
  requireRule(a.rateUnits > 0, 'Baue zuerst durch qualifizierte Gewinne eine Rate auf.');
  a.cycle = { id: randomUUID(), start: now, end: now + config.cycleDuration, segments: [{ at: now, rate: a.rateUnits }] };
  a.activation = 0; a.stats.cycles++;
  ledger(a, 'Info', 0, '6-Stunden-Zyklus gestartet', now, 'EARNING_CYCLE_STARTED', a.cycle.id);
}
export function claimCycle(a, now) {
  normalizeAccount(a, now);
  requireRule(a.cycle && now >= a.cycle.end, 'Der Zyklus ist noch nicht abgeschlossen.');
  const amount = accruedUnits(a.cycle, now);
  a.apUnits = (BigInt(a.apUnits) + amount).toString();
  ledger(a, 'AP', Number(amount) / config.rateScale, 'Earning-Zyklus abgeholt', now, 'EARNING_CYCLE_CLAIMED', a.cycle.id);
  a.cycle = null;
}
export function claimFaucet(a, now) {
  normalizeAccount(a, now);
  requireRule(a.chips < config.faucetThreshold, `Recovery Chips sind erst unter ${config.faucetThreshold} Chips verfügbar.`);
  requireRule(now >= a.faucetAt, 'Die nächsten freien Chips sind noch nicht bereit.');
  const amount = config.faucetTarget - a.chips;
  requireRule(amount > 0, 'Recovery Chips sind derzeit nicht verfügbar.');
  a.chips += amount;
  a.faucetAt = now + config.faucetInterval;
  ledger(a, 'Chips', amount, 'Recovery Chips', now, 'FAUCET');
  return amount;
}
export function recordHand(a, result, now) {
  normalizeAccount(a, now);
  requireRule(!a.processedHands.includes(result.id), 'Diese Hand wurde bereits abgerechnet.');
  a.processedHands.push(result.id); // No bounded cache: duplicate settlement protection survives long sessions.
  a.stats.hands++;
  const valid = result.public && result.participants >= config.minParticipants && result.approved &&
    result.seated !== false && result.dealtIn !== false && result.sittingOut !== true && result.completedNormally !== false;
  if (valid) {
    a.stats.qualifiedHands++;
    a.activation = Math.min(config.activationHands, a.activation + 1);
  }
  const net = result.payout - result.contribution;
  if (net > 0) a.stats.wins++;
  const qualifiesForWinnings = valid && result.street >= config.minQualifiedStreet && net > 0;
  if (qualifiesForWinnings) {
    const previousRate = a.rateUnits;
    a.qualifiedWinnings += net;
    setRate(a, rateFromQualifiedWinnings(a.qualifiedWinnings), now);
    if (a.rateUnits > previousRate) a.events.unshift({ id: randomUUID(), type: 'earning_rate_increased', at: now,
      oldRate: previousRate / config.rateScale, newRate: a.rateUnits / config.rateScale, qualifiedWin: net });
  }
  return { net, valid, qualified: qualifiesForWinnings };
}

export function recordBotHand(a, botState, tier, now) {
  normalizeAccount(a, now);
  if (!botState?.hand_id || botState.status !== 'finished' || a.processedHands.includes(botState.hand_id)) return null;
  const big = Number(tier?.big || botState.big_blind || 0);
  const net = Math.round(Number(botState.payoff_bb || 0) * big);
  a.chips = Math.max(0, a.chips + net);
  ledger(a, 'Chips', net, 'Bot-Hand abgeschlossen', now, 'HAND_SETTLEMENT', botState.hand_id);
  const boardLength = Array.isArray(botState.board) ? botState.board.length : 0;
  const result = recordHand(a, { id: botState.hand_id, public: true, participants: 6,
    street: boardLength >= 5 ? 4 : boardLength >= 4 ? 3 : boardLength >= 3 ? 2 : 0,
    approved: true, seated: true, dealtIn: true, sittingOut: false, completedNormally: true,
    payout: Math.max(0, net), contribution: Math.max(0, -net) }, now);
  const bb = big ? net / big : 0;
  a.stats.sessionBB += bb; a.stats.lifetimeBB += bb; a.stats.handsPlayed++;
  a.stats.bbPer100 = a.stats.handsPlayed ? a.stats.lifetimeBB / a.stats.handsPlayed * 100 : 0;
  if (a.stats.handsPlayed % 100 === 0) {
    a.leagueRating = Math.max(0, a.leagueRating + Math.max(-100, Math.min(100, Math.round(10 * a.stats.bbPer100))));
    a.league = leagueForRating(a.leagueRating);
  }
  return { ...result, chips: net, leagueRating: a.leagueRating };
}

export function claimDailyReward(a, now) {
  normalizeAccount(a, now);
  requireRule(now >= a.dailyReward.lastClaimedAt + config.dailyRewardInterval, 'Die tägliche Bankroll wurde bereits abgeholt.');
  const base = config.dailyRewardBase[a.league];
  const bonus = Math.min(config.dailyRewardRateBonusCap, a.rateUnits / config.rateScale);
  const amount = Math.round(base * (1 + bonus / 100));
  a.chips += amount; a.dailyReward.lastClaimedAt = now;
  ledger(a, 'Chips', amount, 'Daily Bankroll Reward', now, 'DAILY_REWARD');
  return amount;
}

// This is an explicit scripted interaction preview, NOT a multiplayer poker engine.
// Neither opponents nor results are represented as real player activity.
export function enterTable(a, stakeId, now) {
  normalizeAccount(a, now);
  requireRule(!a.table, 'Du sitzt bereits an einem Tisch.');
  const s = config.stakes.find(s => s.id === stakeId);
  requireRule(s, 'Unbekannte Einsatzstufe.');
  requireRule(unlockedStakesForLeague(a.league).includes(s.id), `${s.name} wird ab ${s.league} freigeschaltet.`);
  requireRule(a.chips >= s.buyIn, 'Nicht genug Chips. Wähle kleinere Einsätze oder hole freie Chips.');
  a.chips -= s.buyIn;
  a.table = { id: randomUUID(), stake: s.id, stack: s.buyIn, handNo: 0, result: null, status: 'between' };
  ledger(a, 'Chips', -s.buyIn, 'Buy-in: Transfer an Demo-Tisch', now);
  nextHand(a, now);
}
export function nextHand(a, now) {
  const t = a.table;
  requireRule(t && t.status === 'between', 'Die aktuelle Hand läuft noch.');
  const s = config.stakes.find(s => s.id === t.stake);
  const opening = Math.min(s.big * 2, t.stack);
  requireRule(t.stack > s.big * 5, 'Zu wenig Tischchips. Verlasse den Tisch und wähle einen kleineren Buy-in.');
  Object.assign(t, { handId: randomUUID(), handNo: t.handNo + 1, status: 'turn', stage: 'turn',
    contribution: opening, streetContribution: 0, call: s.big * 3, minRaise: s.big * 6,
    maxRaise: t.stack - opening, pot: s.big * 16 + opening, deadline: now + config.decisionMs,
    stack: t.stack - opening, result: null, hero: ['As', 'Ah'], board: ['Kc', '9d', '4h', '7s'], previousRate: a.rateUnits });
}
export function tableAction(a, action, amount, now) {
  const t = a.table;
  requireRule(t && t.status === 'turn', 'Du bist gerade nicht am Zug.');
  requireRule(['fold', 'call', 'raise'].includes(action), 'Diese Aktion ist hier nicht erlaubt.');
  if (now >= t.deadline) action = 'fold';
  if (action === 'raise') requireRule(Number.isSafeInteger(amount) && amount >= t.minRaise && amount <= t.maxRaise, 'Ungültiger Raise-Betrag.');
  const payment = action === 'fold' ? 0 : action === 'call' ? Math.min(t.call, t.stack) : amount;
  const opponentExtra = action === 'raise' ? Math.max(0, payment - t.call) : 0;
  t.stack -= payment; t.contribution += payment; t.pot += payment + opponentExtra;
  // Alternate clearly disclosed demo outcomes, while Fold always loses contributed chips.
  const won = action !== 'fold' && t.handNo % 3 !== 0;
  t.board.push(won ? '2c' : 'Kd');
  const payout = won ? t.pot : 0;
  t.stack += payout;
  const prevRate = a.rateUnits;
  const result = recordHand(a, { id: t.handId, public: true, participants: 6, street: 3,
    approved: true, payout, contribution: t.contribution }, now);
  t.result = { ...result, won, folded: action === 'fold', pot: t.pot, payout, contribution: t.contribution,
    previousRate: prevRate, rate: a.rateUnits, opponent: ['Kh', 'Qs'],
    label: won ? 'Deine Asse gewinnen' : action === 'fold' ? 'Hand gefoldet' : 'Drilling schlägt dein Paar' };
  t.status = 'between'; t.deadline = null;
  ledger(a, 'Tischchips', payout - t.contribution, won ? 'Demo-Hand gewonnen (netto)' : 'Demo-Hand verloren', now);
  return t.result;
}
export function leaveTable(a, now) {
  requireRule(a.table, 'Du sitzt an keinem Tisch.');
  if (a.table.status === 'turn') tableAction(a, 'fold', 0, now);
  a.chips += a.table.stack;
  ledger(a, 'Chips', a.table.stack, 'Tischchips zurück ins Konto', now);
  a.table = null;
}
export function claimMission(a, id, now) {
  const m = config.missions.find(m => m.id === id);
  requireRule(m && !a.missionClaims.includes(id), 'Diese Mission kann nicht abgeholt werden.');
  requireRule(a.stats[m.metric] >= m.target, 'Die Mission ist noch nicht abgeschlossen.');
  a.chips += m.reward; a.missionClaims.push(id); ledger(a, 'Chips', m.reward, `Mission: ${m.title}`, now);
}
export function snapshot(a, now) {
  normalizeAccount(a, now);
  if (a.table?.status === 'turn' && now >= a.table.deadline) tableAction(a, 'fold', 0, now);
  if (!Array.isArray(a.directReferrals)) a.directReferrals = a.scenario === 'new' ? [] : demoDirectReferrals();
  const referralRate = referralRateBps(a.league) / 100;
  const referralCapBps = referralRateBps(a.league);
  const referralPlayers = a.directReferrals.map((r, index) => {
    const playerShareBps = config.referralRatesBps[r.league] || 0;
    const effectiveShareBps = Math.min(playerShareBps, referralCapBps);
    const earningRate = Number(r.earningRateUnits || 0) / config.rateScale;
    const status = r.earningStatus || (r.qualified ? 'inactive' : 'qualifying');
    return { ...r,
      avatarIndex: index,
      earningRate,
      earningStatus: status,
      playerShare: playerShareBps / 100,
      effectiveShare: effectiveShareBps / 100,
      capped: playerShareBps > referralCapBps,
      referralAPPerHour: status === 'active' ? earningRate * effectiveShareBps / 10000 : 0,
      earned24h: Number(BigInt(r.earned24hUnits || 0)) / config.rateScale,
      seasonQualifiedAP: Number(BigInt(r.seasonQualifiedApUnits || 0)) / config.rateScale,
      earnedForYou: Number(BigInt(r.rewardForOwnerUnits || 0)) / config.rateScale };
  });
  const referralActive = referralPlayers.filter(r => r.earningStatus === 'active').length;
  const referralLiveRate = referralPlayers.reduce((sum, r) => sum + r.referralAPPerHour, 0);
  const referralEarned24h = referralPlayers.reduce((sum, r) => sum + r.earned24h, 0);
  const dailyReadyAt = a.dailyReward.lastClaimedAt + config.dailyRewardInterval;
  const dailyBase = config.dailyRewardBase[a.league];
  const dailyBonus = Math.min(config.dailyRewardRateBonusCap, a.rateUnits / config.rateScale);
  return { ...a, chipBalance: a.chips, totalAP: Number(BigInt(a.apUnits)) / config.rateScale,
    validHandsForActivation: a.activation, nextActivationHands: a.activation,
    currentUnlockedStakes: unlockedStakesForLeague(a.league),
    referralMaxShare: referralRateBps(a.league) / 100,
    ap: Number(BigInt(a.apUnits)) / config.rateScale, rate: a.rateUnits / config.rateScale,
    serverTime: now, earning: a.cycle ? { status: now >= a.cycle.end ? 'claimable' : 'active',
      start: a.cycle.start, end: a.cycle.end, accrued: Number(accruedUnits(a.cycle, now)) / config.rateScale } :
      { status: a.activation >= config.activationHands && a.rateUnits > 0 ? 'ready' : 'locked', accrued: 0 },
    dailyReward: { ...a.dailyReward, readyAt: dailyReadyAt, available: now >= dailyReadyAt,
      amount: Math.round(dailyBase * (1 + dailyBonus / 100)) },
    recoveryFaucet: { available: a.chips < config.faucetThreshold && now >= a.faucetAt,
      amount: Math.max(0, config.faucetTarget - a.chips), readyAt: a.faucetAt },
    leagueProgress: { rating: a.leagueRating, league: a.league, division: a.leagueDivision,
      next: leagues.find(league => config.leagueThresholds[league] > a.leagueRating) || null,
      thresholds: config.leagueThresholds },
    missions: config.missions.map(m => ({ ...m, progress: Math.min(m.target, a.stats[m.metric]), claimed: a.missionClaims.includes(m.id) })),
    referrals: { league: a.league, rate: referralRate, capBps: referralCapBps,
      total: referralPlayers.length, active: referralActive,
      qualified: referralPlayers.filter(r => r.qualified).length,
      pending: referralPlayers.filter(r => !r.qualified).length,
      diamondPlus: referralPlayers.filter(r => r.league === 'Diamond').length,
      liveRate: referralLiveRate, earned24h: referralEarned24h, players: referralPlayers },
    config, demo: true, multiplayer: false };
}
