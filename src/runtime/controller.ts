// @ts-nocheck -- faithful typed-file port of the approved DOM controller; page shells are React components.
import { createVictoryAnimator, victoryFixture } from './victory';
import { createBotUI, seatPortrait } from './bots';
import { apiUrl, previewSessionHeaders, rememberApiSession } from './api';

const $ = selector => document.querySelector(selector);
const victory = createVictoryAnimator();
let rewardPreview = ['large', 'small', 'table'].includes(new URLSearchParams(location.search).get('reward')) ? new URLSearchParams(location.search).get('reward') : null;
const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const number = (value, decimals = 0) => Number(value).toLocaleString('de-DE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const metricNumber = (value, decimals = 0) => Number(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
const signed = (value, decimals = 0) => `${value > 0 ? '+' : ''}${number(value, decimals)}`;
const PROGRESS_DEBUG_STATES = new Set(['locked', 'qualified', 'ready', 'active', 'complete']);
const requestedProgressDebug = new URLSearchParams(location.search).get('progressDebug');
const progressDebugState = PROGRESS_DEBUG_STATES.has(requestedProgressDebug) ? requestedProgressDebug : null;
const FRIENDS_DEBUG_STATES = new Set(['empty', 'populated']);
const requestedFriendsDebug = new URLSearchParams(location.search).get('friendsDebug');
const friendsDebugState = FRIENDS_DEBUG_STATES.has(requestedFriendsDebug) ? requestedFriendsDebug : null;
const paths = {
  home: '<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',
  play: '<rect x="4" y="3" width="13" height="18" rx="3"/><path d="m11 8 3 4-3 4-3-4Z"/><path d="m19 5 2 13"/>',
  playCircle: '<circle cx="12" cy="12" r="9"/><path fill="currentColor" stroke="none" d="m10 8 6 4-6 4Z"/>',
  bar: '<path d="M5 20v-5m7 5V9m7 11V4"/><path d="M3 20h18"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-8Z"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  userPlus: '<circle cx="9" cy="8" r="4"/><path d="M2.5 21v-2a6.5 6.5 0 0 1 13 0v2m3-8v6m-3-3h6"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8H8a3 3 0 1 1 3-3Zm0 0h4a3 3 0 1 0-3-3Z"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  trophy: '<path d="M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 5 4m9-7h4v3a4 4 0 0 1-5 4M12 14v6m-4 1h8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  history: '<path d="M3 3v6h6M3 9a9 9 0 1 1-1 6m10-8v5l4 2"/>',
  chips: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 10v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5M4 15v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4"/>',
  settings: '<path d="M3 5h5m4 0h9M3 12h10m4 0h4M3 19h3m4 0h11"/><circle cx="10" cy="5" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="8" cy="19" r="2"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="m12 12 7-7m-2 0h2v2"/>',
  book: '<path d="M3 4.5A2.5 2.5 0 0 1 5.5 2H9a3 3 0 0 1 3 3v16a4 4 0 0 0-4-4H3Z"/><path d="M21 4.5A2.5 2.5 0 0 0 18.5 2H15a3 3 0 0 0-3 3v16a4 4 0 0 1 4-4h5Z"/><path d="M6 7h3m-3 4h3m6-4h3m-3 4h3"/>',
  more: '<circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  spade: '<path fill="currentColor" stroke="none" d="M12 2.3C9.8 5.8 4.2 8.2 4.2 13a4.2 4.2 0 0 0 7 3.1c-.2 2.1-.8 3.6-2.3 5.6h6.2c-1.5-2-2.1-3.5-2.3-5.6a4.2 4.2 0 0 0 7-3.1c0-4.8-5.6-7.2-7.8-10.7Z"/>',
  bot: '<rect x="5" y="6" width="14" height="13" rx="3"/><path d="M12 3v3M8 11h.01M16 11h.01M9 15h6M3 10v5M21 10v5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="m8.2 10.8 7.6-4.6M8.2 13.2l7.6 4.6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
const telegramUser = () => window.Telegram?.WebApp?.initDataUnsafe?.user;
const telegramInitData = () => window.Telegram?.WebApp?.initData || '';
const apiHeaders = (json = false) => ({
  ...(json ? { 'Content-Type': 'application/json' } : {}),
  'X-TPF-Request': telegramInitData() ? 'telegram' : 'preview',
  ...(telegramInitData() ? { 'X-Telegram-Init-Data': telegramInitData() } : previewSessionHeaders())
});
const profilePhoto = () => {
  const url = telegramUser()?.photo_url;
  return typeof url === 'string' && /^https:\/\//.test(url) ? `<img src="${html(url)}" alt="">` : '<img class="demo-profile-photo" src="/assets/reference-avatar-v1.png" alt="">';
};
const progressArt = (className, box) => `<svg class="${className}" viewBox="${box.join(' ')}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><image href="/assets/progress-reference-source-v1.png" width="1024" height="1536"/></svg>`;
const PROGRESS_REFERENCE_MODEL = Object.freeze({
  chips: 44850,
  ap: 3842.60,
  rate: 8.46,
  qualifiedWinnings: 73579,
  validHands: 32,
  requiredHands: 50,
  status: 'locked'
});
const links = [['home', 'Home', 'home'], ['play', 'Tables', 'play'], ['friends', 'Friends', 'users'], ['missions', 'Missions', 'target'], ['profile', 'More', 'more']];
let state, skew = 0, busy = false, polling = false, selectedStake = 'mid', raiseAmount = 750, selectedPreset = null, handKey, toastTimer, revision = 0, renderedRoute, pendingProgressWin;
const now = () => Date.now() + skew;
const route = () => {
  const requested = location.hash.slice(1).split('?')[0] || 'home';
  if (requested === 'earn') { window.history.replaceState(null, '', '#home'); return 'home'; }
  return requested;
};
const setState = next => { state = next; skew = state.serverTime - Date.now(); document.body.classList.toggle('reduced-motion', state.settings.reducedMotion); };
const botUI = createBotUI({ icon, html, card, apiHeaders, apiUrl, rememberApiSession, render, go, modal, notify, accountState: () => state, setAccountState: setState,
  onSettlement: result => {
    const event = result.account?.events?.find(item => item.type === 'earning_rate_increased' && item.at >= Date.now() - 60000);
    if (event) queueProgressWin({ qualifiedWin: event.qualifiedWin, previousRate: event.oldRate, nextRate: event.newRate, at: event.at });
  } });
const seconds = deadline => Math.max(0, Math.ceil((deadline - now()) / 1000));
function duration(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 3600)}h ${String(Math.floor(s % 3600 / 60)).padStart(2, '0')}m`;
}
function clockDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = String(Math.floor(total / 3600)).padStart(2, '0');
  const minutes = String(Math.floor(total % 3600 / 60)).padStart(2, '0');
  const seconds = String(total % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}
function notify(message, error = false) {
  const el = $('#toast'); el.textContent = message; el.className = `visible${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.className = '', 4200);
}
function haptic() {
  if (state?.settings.haptics) window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('light');
}
function go(page) { if (route() === page) render(); else location.hash = page; }
function modal(title, copy, actions) {
  $('#modal').innerHTML = `<button class="dialog-close" data-action="close-modal" aria-label="Dialog schließen">${icon('close')}</button><h2>${title}</h2><p>${copy}</p>${actions}`;
  if (!$('#modal').open) $('#modal').showModal();
}
async function command(path, data = {}, success) {
  if (busy || rewardPreview) return false;
  busy = true; revision++; $('#phone').classList.add('busy'); $('#phone').setAttribute('aria-busy', 'true');
  const payload = JSON.stringify({ ...data, commandId: crypto.randomUUID() });
  try {
    let response;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        response = await fetch(apiUrl(`/api/${path}`), { method: 'POST', headers: apiHeaders(true), body: payload, signal: AbortSignal.timeout(8000) });
        rememberApiSession(response);
        break;
      } catch (e) { if (attempt === 1) throw e; } // Reuse the same command ID after an uncertain network result.
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    if (path === 'table/action' && result.result?.won && result.result?.qualified) queueProgressWin(result.result);
    setState(result.state); haptic(); render();
    if (path === 'table/action' && result.result?.won) playVictory(result.result);
    if (success) notify(success);
    return true;
  } catch (e) {
    notify(e.message === 'Failed to fetch' || e.name === 'TimeoutError' ? 'Keine Verbindung. Bitte den lokalen Server prüfen und erneut versuchen.' : e.message, true);
    return false;
  } finally { busy = false; revision++; $('#phone').classList.remove('busy'); $('#phone').removeAttribute('aria-busy'); }
}
function title(kicker, heading, description = '') {
  return `<div class="page-title"><span class="eyebrow">${kicker}</span><h1>${heading}</h1>${description ? `<p>${description}</p>` : ''}</div>`;
}
function segments() { return `<div class="segments" aria-label="${state.activation} von ${state.config.activationHands} Händen">${Array.from({ length: state.config.activationHands }, (_, i) => `<i class="${i < state.activation ? 'on' : ''}"></i>`).join('')}</div>`; }
function earningLabel() { return ({ locked: 'Fortschritt aufbauen', ready: 'Bereit zum Starten', active: 'Zyklus läuft', claimable: 'AP abholen' })[state.earning.status]; }
function earningButton() {
  const status = state.earning.status;
  if (status === 'ready') return '<button class="primary" data-action="start-cycle">6-Stunden-Zyklus starten</button>';
  if (status === 'claimable') return `<button class="primary" data-action="claim-cycle">${icon('check')} ${number(state.earning.accrued, 2)} AP abholen</button>`;
  if (status === 'active') return route() === 'home' ? '<a class="primary" href="#play">Weiterspielen</a>' : '<a class="primary" href="#home">Zyklus ansehen</a>';
  return '<a class="primary" href="#play">Am Tisch Fortschritt sammeln</a>';
}
function demoLine(table = false) {
  return `<div class="demo-inline"><span>${table ? 'SIMULATION · 5 Demo-Gegner · vorgegebene Hände' : 'ENTWICKLUNGSVORSCHAU · Demo-Konto'}</span><button data-action="demo">${table ? 'Info' : 'Testzustände'}</button></div>`;
}
function legacyHome() {
  const tg = telegramUser();
  const handle = tg?.username ? `@${html(tg.username)}` : '@NoirPlayer';
  const cycleReady = state.activation >= state.config.activationHands;
  const cycleValue = state.cycle ? state.earning.accrued : 29.47;
  const cycleTime = state.cycle ? clockDuration(state.cycle.end - now()) : '02:24:47';
  const homeLevels = [
    { id: 'micro', label: 'STARTER' },
    { id: 'low', label: 'MICRO' },
    { id: 'medium', label: 'LOW' },
    { id: 'high', label: 'HIGH' }
  ];
  const homeStake = state.config.stakes.find(stake => stake.id === selectedStake) || state.config.stakes[2];
  return `<div class="page home-reference">
    <section class="home-profile-card"><div class="home-avatar">${profilePhoto()}</div><div class="home-profile-copy"><div><strong>${handle}</strong><i></i><span>PRO</span></div><small>Salon Live&nbsp; • &nbsp;VIP Member</small></div><a href="#profile">View Profile ${icon('arrow')}</a></section>
    <section class="home-metrics" aria-label="Account overview">
      <div><span class="home-metric-icon chip-stack" aria-hidden="true"><i></i><i></i><i></i></span><p><small>CHIP BALANCE</small><strong>${metricNumber(state.chips)}</strong><em>Chips</em></p></div>
      <div><span class="home-metric-icon">${icon('bolt')}</span><p><small>TOTAL AP</small><strong>${metricNumber(state.ap, 2)}</strong><em>AP</em></p></div>
      <div><span class="home-metric-icon bars-icon" aria-hidden="true"><i></i><i></i><i></i></span><p><small>EARNING RATE</small><strong>${metricNumber(state.rate, 2)}</strong><em>AP/h</em></p></div>
      <div><span class="home-metric-icon">${icon('trophy')}</span><p><small>QUALIFIED WINNINGS</small><strong>${metricNumber(state.qualifiedWinnings)}</strong><em>Chips</em></p></div>
    </section>
    <button class="home-play-card" data-action="play"><span class="home-play-copy"><strong>PLAY POKER</strong><b>6-MAX&nbsp; <i>•</i> &nbsp;PUBLIC TABLES</b><small>${icon('users')} 142 players online</small></span><span class="home-play-arrow">${icon('arrow')}</span></button>
    <section class="home-cycle"><div class="cycle-copy"><small>EARNING</small><strong>${Number(cycleValue).toFixed(2)} <em>AP</em></strong><b>EARNED THIS CYCLE</b><p>${cycleReady ? 'Activation complete' : 'Activation progress'} <i>•</i> <span>${Math.min(state.activation, state.config.activationHands)}/${state.config.activationHands} hands</span></p></div><a class="cycle-help" href="#rules">${icon('info')} HOW IT WORKS</a><div class="cycle-clock">${icon('clock')}<strong>${cycleTime}</strong><small>remaining</small></div><div class="cycle-segments">${Array.from({length:7},(_,i)=>`<i class="${i < Math.min(6, Math.ceil(state.activation / state.config.activationHands * 6)) ? 'on' : ''}"></i>`).join('')}</div></section>
    <div class="home-section-title"><h2>PUBLIC MATCHMAKING</h2><a href="#play">View All ${icon('arrow')}</a></div>
    <section class="salon-card"><div class="salon-title">${icon('users')}<strong>PUBLIC 6-MAX</strong></div><div class="salon-details"><label><select class="salon-level" aria-label="Public table level">${homeLevels.map(level => `<option value="${level.id}" ${level.id === selectedStake ? 'selected' : ''}>${level.label}</option>`).join('')}</select></label><span>Blinds <b>${number(homeStake.small)} / ${number(homeStake.big)}</b></span><i></i><span>142 online</span></div><button class="quick-play" data-action="play">QUICK PLAY</button></section>
    <section class="home-free-chips"><span class="gift-art" aria-hidden="true"></span><div><small>FREE CHIPS</small><strong>${number(state.config.faucetAmount)} <em>available</em></strong><p data-faucet-time>${now() >= state.faucetAt ? 'Reward ready now' : `Next reward in ${duration(state.faucetAt - now())}`}</p></div><button data-action="faucet" ${now() < state.faucetAt ? 'disabled' : ''}>CLAIM</button></section>
    <a class="home-rules" href="#rules"><span>${icon('book')}</span><div><strong>Game Rules</strong><small>Learn how to play, earn and qualify</small></div>${icon('arrow')}</a>
  </div>`;
}
function home() { return earn(); }
function legacyPlay() {
  const configured = Object.fromEntries(state.config.stakes.map(stake => [stake.id, stake]));
  const tiers = [
    { n: 1, id: 'micro', name: 'Micro', label: 'Start your journey', symbol: '♣', players: 482, tone: 'cyan', popular: true },
    { n: 2, name: 'Low', label: 'Build your skills', symbol: '♦', small: 10, big: 20, buyIn: 2000, players: 318, tone: 'green' },
    { n: 3, id: 'low', name: 'Mid', label: 'Find your rhythm', symbol: '♠', players: 176, tone: 'violet' },
    { n: 4, id: 'medium', name: 'High', label: 'A bigger challenge', symbol: '♥', players: 96, tone: 'amber' },
    { n: 5, id: 'high', name: 'Elite', label: 'For experienced players', symbol: '♛', players: 54, tone: 'red' },
    { n: 6, name: 'Premier', label: 'Higher stakes, higher rewards', symbol: '★', small: 250, big: 500, buyIn: 50000, players: 28, tone: 'purple' },
    { n: 7, name: 'Legend', label: 'Only the best', symbol: '❧', small: 500, big: 1000, buyIn: 100000, players: 12, tone: 'gold' }
  ].map(tier => ({ ...(tier.id ? configured[tier.id] : {}), ...tier }));
  return `<div class="page play-reference">
    <div class="game-tabs" role="tablist" aria-label="Game type"><button role="tab" aria-selected="true"><span class="cash-chip-stack" aria-hidden="true"><i></i><i></i><i></i></span>Cash Games</button><button role="tab" aria-selected="false" disabled>${icon('trophy')}<span>Tournaments</span><small>SOON</small></button></div>
    <div class="play-heading"><div><h1>Choose Your Table</h1><p>Different stakes for every player. Climb the ranks. Earn more.</p></div><a href="#rules">${icon('info')} Game Rules</a></div>
    <div class="premium-tier-list" role="list" aria-label="Cash game tables">${tiers.map(tier => `<article class="premium-tier tier-${tier.tone}${tier.popular ? ' featured' : ''}" role="listitem">
      <span class="tier-number">${tier.n}</span><span class="tier-symbol" aria-hidden="true">${tier.symbol}</span>
      <div class="tier-copy"><strong>${tier.name}</strong><small>${tier.label}</small>${tier.popular ? '<em>◆ Most Popular</em>' : ''}</div>
      <div class="tier-stat tier-blinds"><small>Blinds</small><strong>${number(tier.small)} / ${number(tier.big)}</strong></div>
      <div class="tier-stat tier-buyin"><small>Buy-in</small><strong>${number(tier.buyIn)}</strong></div>
      <div class="tier-stat tier-players"><small>Players</small><strong>${icon('users')} ${number(tier.players)}</strong></div>
      <span class="tier-art" aria-hidden="true"></span>
      <button class="tier-quick-play" data-action="${tier.id ? 'quick-join' : 'unavailable-stake'}" ${tier.id ? `data-id="${tier.id}"` : ''}>QUICK PLAY ${icon('arrow')}</button>
    </article>`).join('')}</div>
    <section class="private-table-card"><span>${icon('users')}</span><div><strong>Private Table</strong><small>Play with friends (no AP progression)</small></div><button data-action="private-table">CREATE TABLE ${icon('arrow')}</button></section>
  </div>`;
}
function play() { return botUI.lobby(); }
const suitSymbols = { s: '♠', h: '♥', d: '♦', c: '♣' };
const suitNames = { s: 'Pik', h: 'Herz', d: 'Karo', c: 'Kreuz' };
function card(value) {
  if (!value) return `<div class="playing-card hidden" aria-label="Noch keine Gemeinschaftskarte">${icon('lock')}</div>`;
  const suit = value.slice(-1), rank = value.slice(0, -1).replace(/^T$/, '10');
  return `<div class="playing-card ${'hd'.includes(suit) ? 'red' : ''}" role="img" aria-label="${suitNames[suit]} ${rank === 'A' ? 'Ass' : rank === 'K' ? 'König' : rank === 'Q' ? 'Dame' : rank}"><b>${rank}</b><span>${suitSymbols[suit]}</span></div>`;
}
function table() {
  const t = state.table;
  if (!t) return `<div class="page">${title('POKER', 'Dein Platz ist frei.', 'Wähle einen Tisch, um den Spielablauf auszuprobieren.')}<a class="primary" href="#play">Einsatz wählen</a></div>`;
  const s = state.config.stakes.find(s => s.id === t.stake), active = t.status === 'turn' || Boolean(rewardPreview);
  if (handKey !== t.handId) { handKey = t.handId; raiseAmount = Math.min(t.maxRaise, Math.max(t.minRaise, Math.round(rewardPreview ? 750 : s.big * 7.5))); selectedPreset = rewardPreview === 'table' ? 'three-quarter' : null; }
  const seats = [
    ['VK', 'Viktor_K', 84.2 * s.big, active ? 'Checked' : 'Folded', false],
    ['EM', 'Elena_M', 121 * s.big, 'Folded', true],
    ['KX', 'Katia_X', 69.5 * s.big, active ? `Bet ${metricNumber(t.call)}` : t.result.folded ? 'Not shown' : t.result.won ? 'Pair Kings' : 'Trips', false],
    ['SN', 'Sora', 42 * s.big, 'Folded', true],
    ['CP', 'Cipher', 158 * s.big, active ? `Call ${metricNumber(t.call)}` : 'Folded', !active],
  ];
  const board = t.result?.folded ? t.board.slice(0, 4) : t.board;
  const presets = [['min', 'MIN', t.minRaise], ['half', '½', Math.round(t.pot / 2)], ['three-quarter', '¾', Math.floor(t.pot * .75 / 10) * 10], ['pot', 'POT', t.pot], ['max', 'MAX', t.maxRaise]];
  const cycleText = rewardPreview === 'table' ? '3h 42m' : state.cycle ? `<span data-cycle-time>${duration(state.cycle.end - now())}</span>` : state.earning?.status === 'ready' ? 'Ready' : 'Inactive';
  const tableQualified = rewardPreview === 'table' ? `+${metricNumber(state.qualifiedWinnings)}` : metricNumber(state.qualifiedWinnings ?? 0);
  return `<div class="table-page">
    <div class="table-status" aria-label="Spielerfortschritt">
      <strong class="table-rate">${icon('bolt')}<span class="table-rate-value">${number(state.rate, 2)}</span><small>AP/h</small></strong>
      <span class="table-cycle" title="Earning-Zyklus">${icon('clock')}${cycleText}</span>
      <span class="table-qw" title="Lebenslange qualifizierte Nettogewinne">${tableQualified} QLF ${icon('info')}</span>
      <button class="table-options" data-action="demo" aria-label="Tischoptionen und Vorschau">${icon('settings')}</button>
    </div>
    <div class="table-meta"><span>NL ${number(s.small)}/${number(s.big)} • BLINDS ${number(s.small)}/${number(s.big)}</span><span class="table-hand-id"><i></i>${rewardPreview ? 'LIVE' : 'DEMO'} HAND #${String(t.handNo).padStart(3, '0')}</span></div>
    <div class="arena" aria-label="6-Max Pokertisch, von oben"><div class="felt"></div>
      ${seats.map(([initial, name, chips, action, folded], i) => `<div class="seat s${i} ${folded ? 'folded' : ''}"><div class="avatar">${seatPortrait(i, !folded)}${i === 2 ? '<span class="dealer">D</span>' : ''}</div><div class="seat-label"><span class="seat-name">${name}</span><span class="seat-chips">${metricNumber(chips)}</span></div><span class="seat-action ${i === 2 && active ? 'bet' : ''}">${action}</span></div>`).join('')}
      <div class="community"><div class="pot"><span class="pot-chips" aria-hidden="true"><i></i><i></i></span><span>POT: <strong>${metricNumber(t.pot)}</strong></span></div><div class="cards" aria-label="Gemeinschaftskarten">${Array.from({ length: 5 }, (_, i) => card(board[i])).join('')}</div><div class="hand-caption">${icon('check')}<span>${active ? 'TURN REACHED · AP RATE UNLOCKED' : t.result.folded ? 'FOLDED' : 'SHOWDOWN'}</span></div></div>
      <div class="hero-zone"><div class="decision-track" aria-hidden="true"><span data-decision-progress style="width:${active ? '100' : '0'}%"></span></div><div class="cards" aria-label="Deine Hand">${t.hero.map(card).join('')}</div><div class="hero-hand-label">ROYAL FLUSH DRAW (A-K-Q-J-10)</div><div class="hero-stack"><b>You</b><strong>${metricNumber(rewardPreview === 'table' ? t.displayStack ?? t.stack : t.stack)}</strong><span class="hero-committed">In: ${metricNumber(rewardPreview === 'table' ? t.displayContribution ?? t.contribution : t.contribution)}</span></div></div>
      ${active ? `<div class="turn-time" aria-label="Verbleibende Entscheidungszeit"><span data-turn-time>${seconds(t.deadline)}s</span></div>` : ''}
    </div>
    ${active ? `<div class="table-controls">
      <div class="bet-presets" aria-label="Raise-Vorgaben">${presets.map(([key, label, value]) => { const amount = Math.min(t.maxRaise, Math.max(t.minRaise, value)); return `<button data-action="preset" data-preset="${key}" data-amount="${amount}" aria-pressed="${selectedPreset === key}" aria-label="${label} Raise auf ${metricNumber(amount)} Chips" ${t.maxRaise < t.minRaise ? 'disabled' : ''}><span>${label}</span>${['MIN', 'MAX'].includes(label) ? '' : `<small>(${metricNumber(value)})</small>`}</button>`; }).join('')}</div>
      <div class="actions"><button data-action="poker" data-move="fold">FOLD<small>Hand aufgeben</small></button><button data-action="poker" data-move="call">CALL<small>${number(Math.min(t.call, t.stack))}</small></button><button class="raise" data-action="poker" data-move="raise" ${t.maxRaise < t.minRaise ? 'disabled' : ''}><span id="raise-label">${rewardPreview === 'table' || raiseAmount !== t.maxRaise ? 'RAISE' : 'ALL-IN'}</span><small id="raise-button-amount">${number(raiseAmount)}</small></button></div>
      <div class="raise-slider"><span class="range-min">${number(t.minRaise)}</span><input id="raise-input" aria-label="Raise auf Chips" type="range" min="${t.minRaise}" max="${Math.max(t.minRaise, t.maxRaise)}" step="1" value="${raiseAmount}" ${t.maxRaise < t.minRaise ? 'disabled' : ''}><output id="raise-output" for="raise-input">${number(raiseAmount)}</output></div>
    </div>` : `<div class="post-hand-controls"><div class="win-strip ${t.result.won ? '' : 'loss'}" role="status"><div><strong>${t.result.won ? '+' + number(t.result.payout) + ' Chips' : t.result.label}</strong><span>${signed(t.result.net)} Chips netto</span></div></div><button class="primary" data-action="next-hand">Nächste Demo-Hand ${icon('arrow')}</button></div>`}
    <div class="table-footer"><span>5 Demo-Gegner · AP werden nie gesetzt</span><button data-action="leave">Tisch verlassen</button></div></div>`;
}
function cycleProgress() {
  if (!state.cycle) return state.activation / state.config.activationHands * 100;
  return Math.min(100, Math.max(0, (now() - state.cycle.start) / state.config.cycleDuration * 100));
}
function localAccrued() {
  if (!state.cycle) return 0;
  const end = Math.min(now(), state.cycle.end);
  return state.cycle.segments.reduce((sum, seg, i, all) => sum + Math.max(0, Math.min(end, all[i + 1]?.at ?? end) - seg.at) * seg.rate / 3600000 / state.config.rateScale, 0);
}
function queueProgressWin(result) {
  const event = {
    qualifiedWin: Math.max(0, result.net || 0),
    previousRate: result.previousRate / state.config.rateScale,
    nextRate: result.rate / state.config.rateScale,
    at: Date.now()
  };
  pendingProgressWin = event;
  try { sessionStorage.setItem('tpf-progress-win', JSON.stringify(event)); } catch { /* Session storage is optional. */ }
}
function takeProgressWin() {
  if (progressDebugState === 'qualified') return { qualifiedWin: 3100, previousRate: 8.46, nextRate: 8.71, at: Date.now() };
  if (pendingProgressWin) { const event = pendingProgressWin; pendingProgressWin = null; return event; }
  try {
    const stored = JSON.parse(sessionStorage.getItem('tpf-progress-win') || 'null');
    sessionStorage.removeItem('tpf-progress-win');
    return stored && Date.now() - stored.at < 300000 ? stored : null;
  } catch { return null; }
}
function progressPhaseOneModel() {
  const target = state.config.activationHands;
  const base = {
    debug: Boolean(progressDebugState),
    status: state.earning.status === 'claimable' ? 'complete' : state.earning.status,
    rate: state.rate,
    hands: Math.min(state.activation, target),
    target,
    accrued: state.cycle ? localAccrued() : state.earning.accrued || 0,
    remainingMs: state.earning.end ? Math.max(0, state.earning.end - now()) : 0,
    remainingLabel: state.earning.end ? clockDuration(state.earning.end - now()) : '06:00:00',
    totalAP: state.ap,
    qualifiedWinnings: state.qualifiedWinnings,
    win: null
  };
  if (!progressDebugState) { base.win = takeProgressWin(); return base; }
  const fixtures = {
    locked: { status: 'locked', rate: 8.46, hands: 32, target: 50, accrued: 0, remainingLabel: '06:00:00' },
    qualified: { status: 'locked', rate: 8.71, hands: 32, target: 50, accrued: 0, remainingLabel: '06:00:00' },
    ready: { status: 'ready', rate: 8.71, hands: 50, target: 50, accrued: 0, remainingLabel: '06:00:00' },
    active: { status: 'active', rate: 10.24, hands: 17, target: 50, accrued: 24.62, remainingLabel: '03:11:42' },
    complete: { status: 'complete', rate: 8.71, hands: 0, target: 50, accrued: 52.26, remainingLabel: '00:00:00' }
  };
  Object.assign(base, fixtures[progressDebugState]);
  base.win = takeProgressWin();
  return base;
}
function progressPhaseSegments(hands, target, className = '') {
  const filled = Math.min(10, Math.round(hands / target * 10));
  return `<div class="progress-live-segments ${className}" aria-label="${hands} of ${target} valid hands">${Array.from({ length: 10 }, (_, i) => `<i class="${i < filled ? 'on' : ''}"></i>`).join('')}</div>`;
}
function progressPhaseAction(model, action, debugNext, label) {
  return `<button class="progress-live-action" data-action="${model.debug ? 'progress-debug-next' : action}"${model.debug ? ` data-progress-next="${debugNext}"` : ''}>${icon('playCircle')}<span>${label}</span></button>`;
}
function progressRateState(model) {
  const left = Math.max(0, model.target - model.hands);
  const rate = metricNumber(model.rate, 2);
  const accruedAttr = model.debug ? '' : ' data-progress-accrued';
  const timeAttr = model.debug ? '' : ' data-progress-cycle-time';
  let main;
  if (model.status === 'ready') {
    main = `<div class="progress-live-ready-copy"><span class="progress-live-kicker">${icon('bolt')} EARNING READY</span><div class="progress-live-primary-value">${rate}<em>AP/h</em></div><p>Your earning cycle is unlocked.</p>${progressPhaseSegments(model.target, model.target, 'is-complete')}${progressPhaseAction(model, 'start-cycle', 'active', 'Start 6h Earning')}</div>`;
  } else if (model.status === 'active') {
    main = `<div class="progress-live-active-copy"><div class="progress-live-state-row"><span class="progress-live-kicker">${icon('bolt')} EARNING</span><b><i></i>Active</b></div><div class="progress-live-primary-value">${rate}<em>AP/h</em></div><div class="progress-live-active-metrics"><span>${icon('clock')}<strong${timeAttr}>${model.remainingLabel}</strong><small>remaining</small></span><span><strong>+<i${accruedAttr}>${number(model.accrued, 2)}</i></strong><small>AP earned</small></span><span class="progress-live-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div></div>`;
  } else if (model.status === 'complete') {
    main = `<div class="progress-live-ready-copy is-finished"><span class="progress-live-kicker">${icon('trophy')} EARNING COMPLETE</span><div class="progress-live-primary-value"><span${accruedAttr}>${number(model.accrued, 2)}</span><em>AP</em></div><p>Ready to claim</p>${progressPhaseAction(model, 'claim-cycle', 'locked', 'Claim AP')}</div>`;
  } else {
    main = `<div class="progress-live-locked-copy"><div class="progress-live-value-line"><div class="progress-live-primary-value">${rate}<em>AP/h</em></div><span class="progress-live-lock">${icon('lock')}<b>Earning locked</b></span></div><div class="progress-live-hands"><div><strong>${model.hands} / ${model.target}</strong><span>valid hands</span><b>${left} hands<small>until unlock</small></b></div>${progressPhaseSegments(model.hands, model.target)}</div><p>Play poker to unlock earning. Your rate is already growing!</p></div>`;
  }
  const previewRate = model.win ? model.win.nextRate : model.rate;
  return `<section class="progress-live-card progress-live-rate phase-${model.status}${model.win ? ' is-qualified-win' : ''}" aria-label="Earning Rate: ${model.status}">
    <div class="progress-live-card-head"><span>${icon('bolt')}</span><div><h2>EARNING RATE</h2><p>Your poker success increases your rate permanently.</p></div><a href="#rules">How it works? ${icon('arrow')}</a></div>
    <div class="progress-live-rate-grid"><div class="progress-live-rate-main">${main}</div><div class="progress-live-preview"><h3>RATE PREVIEW</h3><p><span>Current Rate</span><strong>${metricNumber(previewRate, 2)} <em>AP/h</em></strong></p><p><span>Status</span><strong>${model.status === 'complete' ? 'CLAIM' : model.status.toUpperCase()}</strong></p><p><span>Qualified Winnings</span><strong>${metricNumber(model.qualifiedWinnings)} <em>◎</em></strong></p><p><span>Total AP (lifetime)</span><strong>${metricNumber(model.totalAP, 2)} <em>AP</em></strong></p></div></div>
    ${model.win ? `<div class="progress-qualified-win" role="status" aria-live="polite"><div class="progress-win-particles" aria-hidden="true">${Array.from({ length: 8 }, () => '<i></i>').join('')}</div><span>QUALIFIED WIN</span><strong>+${metricNumber(model.win.qualifiedWin)} ◎</strong><b>Rate Increased!</b><p>${metricNumber(model.win.previousRate, 2)} <i>→</i> <em data-rate-count data-from="${model.win.previousRate}" data-to="${model.win.nextRate}">${metricNumber(model.win.previousRate, 2)}</em> <small>AP/h</small></p></div>` : ''}
  </section>`;
}
function progressCycleState(model) {
  const left = Math.max(0, model.target - model.hands);
  const rate = metricNumber(model.rate, 2);
  const accruedAttr = model.debug ? '' : ' data-progress-accrued';
  const timeAttr = model.debug ? '' : ' data-progress-cycle-time';
  let body;
  if (model.status === 'ready') {
    body = `<div class="progress-live-cycle-ready"><div><strong>${rate}<em>AP/h</em></strong><span>6 hours available</span></div>${progressPhaseAction(model, 'start-cycle', 'active', 'Start Earning')}</div>`;
  } else if (model.status === 'active') {
    body = `<div class="progress-live-cycle-active"><div><strong>+<span${accruedAttr}>${number(model.accrued, 2)}</span><em>AP</em></strong><small>${rate} AP/h</small></div><div><span>${icon('clock')}<strong${timeAttr}>${model.remainingLabel}</strong> remaining</span><b>NEXT ACTIVATION</b><p>${model.hands} / ${model.target} hands</p>${progressPhaseSegments(model.hands, model.target)}</div><span class="progress-live-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span></div>`;
  } else if (model.status === 'complete') {
    body = `<div class="progress-live-cycle-complete"><div>${icon('trophy')}<span><strong><b${accruedAttr}>${number(model.accrued, 2)}</b><em>AP</em></strong><small>Ready to claim</small></span></div>${progressPhaseAction(model, 'claim-cycle', 'locked', 'Claim AP')}</div>`;
  } else {
    body = `<div class="progress-live-cycle-locked"><p>Play ${model.target} hands to unlock your earning cycle.</p><div><strong>${model.hands} / ${model.target} hands</strong><span>${left} remaining</span></div>${progressPhaseSegments(model.hands, model.target)}</div>`;
  }
  const heading = model.status === 'ready' ? 'EARNING READY' : model.status === 'active' ? 'EARNING' : model.status === 'complete' ? 'EARNING COMPLETE' : 'EARNING CYCLE';
  return `<section class="progress-live-card progress-live-cycle phase-${model.status}" aria-label="Earning Cycle: ${model.status}"><div class="progress-live-cycle-head"><span>${model.status === 'complete' ? icon('trophy') : icon('clock')}</span><div><h2>${heading}</h2><p>${model.status === 'locked' ? 'Turn your activity into AP. Play to unlock, then earn automatically.' : model.status === 'active' ? 'Your six-hour earning cycle is running.' : model.status === 'complete' ? 'Your cycle is ready to be claimed.' : 'Your six-hour earning cycle is available.'}</p></div><b class="progress-live-status"><i></i>${model.status === 'complete' ? 'CLAIMABLE' : model.status.toUpperCase()}</b></div>${body}</section>`;
}
function progressMetricsState(model) {
  return `<section class="progress-live-metrics" aria-label="Live account metrics">
    <div>${icon('chips')}<span>CHIP BALANCE<strong>${metricNumber(state.chips)}</strong><small>Chips</small></span></div>
    <div>${icon('bolt')}<span>TOTAL AP<strong>${metricNumber(model.totalAP, 2)}</strong><small>AP</small></span></div>
    <div>${icon('bar')}<span>EARNING RATE<strong>${metricNumber(model.rate, 2)}</strong><small>AP/h</small></span></div>
    <div>${icon('trophy')}<span>QUALIFIED WINNINGS<strong>${metricNumber(model.qualifiedWinnings)}</strong><small>Chips</small></span></div>
  </section>`;
}
function progressGoalsState(model) {
  const league = state.leagueProgress || { league: state.league || 'Bronze', division: state.leagueDivision || 'I', rating: state.leagueRating || 0 };
  const thresholds = state.config.leagueThresholds || {};
  const nextRating = Object.values(thresholds).find(value => value > league.rating) || league.rating;
  return `<div class="progress-live-goals" aria-label="Live progress values">
    <span class="goal-hands"><strong>Play More</strong><b>${model.hands} / ${model.target} hands</b><small>Unlock earning cycle</small></span>
    <span class="goal-winnings"><strong>Win More</strong><b>${metricNumber(model.qualifiedWinnings)} ◎</b><small>Increase earning rate</small></span>
    <span class="goal-league"><strong>Climb Leagues</strong><b>${html(league.league)} ${html(league.division || 'I')}&nbsp;&nbsp; ${metricNumber(league.rating)} / ${metricNumber(nextRating)}</b><small>Unlock higher stakes</small></span>
  </div>`;
}
function initProgressPhaseOneAnimations() {
  const target = $('[data-rate-count]');
  if (!target) return;
  const from = Number(target.dataset.from), to = Number(target.dataset.to);
  if (state.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches) { target.textContent = metricNumber(to, 2); return; }
  const start = performance.now() + 480, duration = 860;
  const tick = time => {
    const progress = Math.min(1, Math.max(0, (time - start) / duration));
    const eased = 1 - Math.pow(1 - progress, 3);
    target.textContent = metricNumber(from + (to - from) * eased, 2);
    if (progress < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
function legacyEarn() {
  // This screen is the visual reference fixture. Keep the account engine live,
  // but render the exact supplied Progress state instead of inventing another.
  const status = PROGRESS_REFERENCE_MODEL.status;
  const target = PROGRESS_REFERENCE_MODEL.requiredHands;
  const hands = PROGRESS_REFERENCE_MODEL.validHands;
  const left = Math.max(0, target - hands);
  const rate = metricNumber(PROGRESS_REFERENCE_MODEL.rate, 2);
  const qualified = metricNumber(PROGRESS_REFERENCE_MODEL.qualifiedWinnings);
  const cycleClass = { locked:'step-one', ready:'step-two', active:'step-three', claimable:'step-four' }[status];
  const rateStatus = { locked:'Earning locked', ready:'Earning ready', active:'Earning active', claimable:'Ready to claim' }[status];
  return `<div class="progress-page">
    <section class="progress-intro"><img class="progress-hero-art" src="/assets/progress/hero-poker-art.webp" alt="" aria-hidden="true"><div><h1>Progress</h1><p>Play. Win. Improve. Earn more.</p></div><span>SMALL EDGES<br>BIG FUTURE.</span></section>
    <section class="progress-metrics" aria-label="Account metrics">
      <div>${icon('chips')}<span>CHIP BALANCE<strong>${metricNumber(PROGRESS_REFERENCE_MODEL.chips)}</strong><small>Chips</small></span></div>
      <div>${icon('bolt')}<span>TOTAL AP<strong>${metricNumber(PROGRESS_REFERENCE_MODEL.ap,2)}</strong><small>AP</small></span></div>
      <div>${icon('bar')}<span>EARNING RATE<strong>${rate}</strong><small>AP/h</small></span></div>
      <div>${icon('trophy')}<span>QUALIFIED WINNINGS<strong>${qualified}</strong><small>Chips</small></span></div>
    </section>
    <section class="progress-rate-panel">
      <div class="progress-section-head"><span class="progress-head-icon">${icon('bolt')}</span><div><h2>EARNING RATE</h2><p>Your poker success increases your rate permanently.</p></div><a href="#rules">How it works? ${icon('arrow')}</a></div>
      <div class="progress-rate-body"><div class="progress-rate-main"><div class="progress-rate-value"><strong>${rate}</strong><em>AP/h</em><span>${icon('lock')}<b>${rateStatus}</b></span></div><div class="progress-hands"><div><strong>${hands} / ${target}</strong><span>valid hands</span><b>${left} hands<br><small>until unlock</small></b></div><div class="progress-segments" style="--filled:${Math.round(hands / target * 10)}">${Array.from({length:10},(_,i)=>`<i class="${i < Math.round(hands / target * 10) ? 'on' : ''}"></i>`).join('')}</div></div><p>Play poker to unlock earning. Your rate is already growing!</p></div>
      <div class="progress-rate-preview"><h3>RATE PREVIEW</h3><p><span>Current Rate</span><strong>${rate} <em>AP/h</em></strong></p><p><span>After Unlock</span><strong>${rate} <em>AP/h</em></strong></p><p><span>Qualified Winnings</span><strong>${qualified} <em>◎</em></strong></p><p><span>Total AP (lifetime)</span><strong>${metricNumber(PROGRESS_REFERENCE_MODEL.ap,2)} <em>AP</em></strong></p></div></div>
    </section>
    <section class="progress-growth-panel"><div class="progress-section-head"><span class="progress-head-icon">Ⓐ</span><h2>HOW YOUR RATE GROWS</h2><p>The better you play, the more you earn.</p><a href="#rules">Learn more ${icon('arrow')}</a></div><div class="progress-growth-flow">
      <div><span>${icon('chips')}</span><p>Win qualified pots</p></div>${icon('arrow')}
      <div><span>${icon('bar')}</span><p>Increase<br>Qualified Winnings</p></div>${icon('arrow')}
      <div><span>${icon('bolt')}</span><p>Earning Rate<br>grows permanently</p></div>${icon('arrow')}
      <div><span>${icon('gift')}</span><p>Earn more AP<br>every 6 hours</p></div>
    </div></section>
    <section class="progress-cycle-panel ${cycleClass}"><div class="progress-section-head"><span class="progress-head-icon">${icon('clock')}</span><div><h2>EARNING CYCLE</h2><p>Turn your activity into AP. Play to unlock, then earn automatically.</p></div><span class="progress-cycle-status">Current Status <b>${status.toUpperCase()}</b></span></div><div class="progress-cycle-track">
      <div><b>1</b><strong>Play ${target} hands</strong></div><i></i><div><b>2</b><span>Start 6h earning</span></div><i></i><div><b>3</b><span>Earn AP</span></div><i></i><div><b>4</b><span>Claim rewards</span></div>
    </div></section>
    <div class="progress-lower-grid">
      <section class="progress-league-panel"><div class="progress-section-head"><span class="progress-head-icon">${icon('trophy')}</span><div><h2>LEAGUE</h2><p>Show your skill. Unlock higher stakes.</p></div></div><div class="progress-league-body"><div class="progress-current-league">${progressArt('progress-gold-emblem',[62,1090,205,135])}<strong>GOLD I</strong><div><i></i></div><span>1,840 / 2,200</span></div><a class="progress-next-league" href="#play" aria-label="Next league: Platinum"><span>Next League</span><strong>PLATINUM</strong>${progressArt('progress-platinum-emblem',[365,1160,90,98])}<p>Unlocks:<br>● Elite 100 / 200<br>● Bigger Rewards</p>${icon('arrow')}</a></div></section>
      <section class="progress-goals-panel"><div class="progress-section-head"><span class="progress-head-icon">${icon('bar')}</span><div><h2>YOUR PROGRESS</h2><p>Three ways to get stronger.</p></div></div><a href="#play"><span>${icon('playCircle')}</span><div><strong>Play More</strong><p>${hands} / ${target} hands</p><small>Unlock earning cycle</small></div>${icon('arrow')}</a><a href="#play"><span>${icon('chips')}</span><div><strong>Win More</strong><p>${qualified} ◎</p><small>Increase earning rate</small></div>${icon('arrow')}</a><a href="#play"><span>${icon('trophy')}</span><div><strong>Climb Leagues</strong><p>Gold I&nbsp;&nbsp; 1,840 / 2,200</p><small>Unlock higher stakes</small></div>${icon('arrow')}</a></section>
    </div>
    <section class="progress-rewards">${progressArt('progress-gift-art',[35,1356,170,80])}<div><strong>Milestones &amp; Rewards</strong><p>Reach new milestones and get exclusive rewards.</p></div><a href="#missions">View Rewards ${icon('arrow')}</a></section>
  </div>`;
}
function earn() {
  const progressModel = progressPhaseOneModel();
  return `<main class="progress-approved-screen" aria-label="Progress">
    <div class="progress-master-crop">
      <div class="progress-master-canvas">
        <img class="progress-approved-master" src="/assets/progress/progress-approved-master.png" width="1024" height="1536" alt="" aria-hidden="true" draggable="false">
        <div class="progress-motion-stage">
          <img class="progress-motion-hero-clean" src="/assets/progress/hero-poker-art.webp" width="964" height="126" alt="" aria-hidden="true" draggable="false">
          <header class="progress-motion-header" aria-label="Progress header">
            <button class="progress-motion-back" data-action="back" aria-label="Back">${icon('back')}</button>
            <span class="progress-motion-brand" aria-hidden="true">${icon('spade')}</span>
            <div class="progress-motion-title">Velvet &amp; Noir<small>TOKEN POKER FARM</small></div>
            <a class="progress-motion-ap" href="#home" aria-label="${number(state.ap, 2)} AP">${icon('bolt')}<strong>${number(state.ap, 2)} AP</strong></a>
            <a class="progress-motion-profile" href="#profile" aria-label="Profile">${profilePhoto()}<i></i></a>
            <a class="progress-motion-settings" href="#profile" aria-label="Settings">${icon('gear')}</a>
          </header>
        </div>
        <div class="progress-live-phase-one">
          ${progressMetricsState(progressModel)}
          ${progressRateState(progressModel)}
          ${progressCycleState(progressModel)}
          ${progressGoalsState(progressModel)}
        </div>
        <div class="progress-interactions" aria-label="Progress navigation">
          <a class="progress-hitbox hit-how" href="#rules" aria-label="How it works?"></a>
          <a class="progress-hitbox hit-learn" href="#rules" aria-label="Learn more"></a>
          <a class="progress-hitbox hit-play-more" href="#play" aria-label="Play More"></a>
          <a class="progress-hitbox hit-win-more" href="#play" aria-label="Win More"></a>
          <a class="progress-hitbox hit-climb-leagues" href="#play" aria-label="Climb Leagues"></a>
          <a class="progress-hitbox hit-view-rewards" href="#missions" aria-label="View Rewards"></a>
        </div>
      </div>
    </div>
  </main>`;
}
function missions() {
  return `<div class="page">${title('ETWAS MEHR MITNEHMEN', 'Deine Missionen', 'Kleine Ziele. Zusätzliche Spielchips. Keine gekaufte Earning-Rate.')}${state.missions.map(m => `<section class="list-card"><div class="row"><h3>${m.title}</h3><span class="tag">+${number(m.reward)} Chips</span></div><p>${m.description}</p><div class="progress-line"><span style="width:${m.progress / m.target * 100}%"></span></div><div class="row"><span class="small muted">${m.progress} / ${m.target}</span><button class="reward-button" data-action="mission" data-id="${m.id}" ${m.claimed || m.progress < m.target ? 'disabled' : ''}>${m.claimed ? 'Abgeholt ✓' : m.progress >= m.target ? 'Chips abholen' : 'In Arbeit'}</button></div></section>`).join('')}<p class="info-note">Vorschau-Missionen: Fortschritt wird hier durch Demo-Hände erzeugt. Live-Prüfung und Tagesmissionen sind noch nicht angebunden.</p></div>`;
}
const FRIENDS_POPULATED_FIXTURE = Object.freeze([
  { id: 'alex-preview', username: '@AlexPoker', league: 'Gold', earningRate: 18.40, earningStatus: 'active', cycleRemainingMs: 13320000, qualifiedHands: 50, earned24h: 3.84, avatarIndex: 0 },
  { id: 'emma-preview', username: '@EmmaCards', league: 'Silver', earningRate: 8.24, earningStatus: 'inactive', lastCycleHours: 7, qualifiedHands: 50, earned24h: .33, avatarIndex: 1 },
  { id: 'tom-preview', username: '@PokerTom', league: 'Diamond', earningRate: 26.80, earningStatus: 'active', cycleRemainingMs: 4680000, qualifiedHands: 50, earned24h: 5.62, avatarIndex: 2 },
  { id: 'nik-preview', username: '@NikHoldem', league: 'Bronze', earningRate: 4.12, earningStatus: 'qualifying', qualifiedHands: 32, earned24h: 0, avatarIndex: 3 },
  { id: 'lisa-preview', username: '@LisaPoker', league: 'Gold', earningRate: 12.60, earningStatus: 'inactive', lastCycleHours: 24, qualifiedHands: 50, earned24h: 1.14, avatarIndex: 4 },
  { id: 'chris-preview', username: '@ChrisWin', league: 'Diamond', earningRate: 31.20, earningStatus: 'active', cycleRemainingMs: 15120000, qualifiedHands: 50, earned24h: 6.40, avatarIndex: 5 }
]);

function normalizedFriend(player, index, capBps) {
  const playerShareBps = Number(player.playerShareBps ?? (player.playerShare != null ? player.playerShare * 100 : state.config.referralRatesBps[player.league] || 0));
  const effectiveShareBps = Math.min(capBps, playerShareBps);
  const earningRate = Number(player.earningRate || 0);
  const status = player.earningStatus || (player.qualified ? 'inactive' : 'qualifying');
  return { ...player, avatarIndex: Number(player.avatarIndex ?? index) % 6, earningRate, earningStatus: status,
    playerShare: playerShareBps / 100, effectiveShare: effectiveShareBps / 100,
    capped: playerShareBps > capBps,
    referralAPPerHour: status === 'active' ? earningRate * effectiveShareBps / 10000 : 0,
    earned24h: Number(player.earned24h || 0) };
}

function friendsPageModel() {
  const source = state.referrals || { league: state.league || 'Bronze', players: [] };
  const capBps = Number(state.config.referralRatesBps[source.league] ?? source.capBps ?? 0);
  const rawPlayers = friendsDebugState === 'empty' ? [] : friendsDebugState === 'populated' ? FRIENDS_POPULATED_FIXTURE : (source.players || []);
  const players = rawPlayers.map((player, index) => normalizedFriend(player, index, capBps));
  const leagues = Object.keys(state.config.referralRatesBps);
  const leagueIndex = leagues.indexOf(source.league);
  const nextLeague = leagueIndex >= 0 ? leagues[leagueIndex + 1] : null;
  return {
    league: source.league, leagueLabel: `${source.league} I`, capBps, rate: capBps / 100,
    nextLeague, nextRate: nextLeague ? state.config.referralRatesBps[nextLeague] / 100 : null,
    invite: `https://t.me/${state.config.botHandle}?start=ref_${state.referralCode}`, players,
    total: players.length, active: players.filter(player => player.earningStatus === 'active').length,
    liveRate: players.reduce((sum, player) => sum + player.referralAPPerHour, 0),
    earned24h: players.reduce((sum, player) => sum + player.earned24h, 0)
  };
}

function friendProgress(player) {
  const target = Number(state.config.activationHands || 50), count = 8;
  const on = Math.round(Math.min(target, Number(player.qualifiedHands || 0)) / target * count);
  return `<div class="friends-hand-progress"><strong>${number(player.qualifiedHands || 0)} / ${target} hands</strong><span>${Array.from({ length: count }, (_, index) => `<i class="${index < on ? 'on' : ''}"></i>`).join('')}</span></div>`;
}

function friendStatus(player) {
  if (player.earningStatus === 'active') return `<div class="friends-status active"><strong><i></i>Earning active</strong><span>${duration(player.cycleRemainingMs || 0)} remaining</span></div>`;
  if (player.earningStatus === 'qualifying') return friendProgress(player);
  return `<div class="friends-status inactive"><strong><i></i>Earning inactive</strong><span>Last cycle: ${Number(player.lastCycleHours || 24) >= 24 ? '1d ago' : `${number(player.lastCycleHours || 0)}h ago`}</span></div>`;
}

function friendRow(player) {
  const share = `${metricNumber(player.effectiveShare, player.effectiveShare % 1 ? 1 : 0)}%${player.capped ? ' (max)' : ''}`;
  const contribution = player.earningStatus === 'active' ? `+${metricNumber(player.referralAPPerHour, 3)} AP/h` : player.earned24h > 0 ? `+${metricNumber(player.earned24h, 2)} AP` : '–';
  return `<article class="friends-person-row" data-friend-search="${html(`${player.username} ${player.league}`.toLowerCase())}"><div class="friends-avatar avatar-${player.avatarIndex}" aria-hidden="true"><i></i></div><div class="friends-person"><strong>${html(player.username)}</strong><span><b class="friends-league-badge league-${html(player.league.toLowerCase())}">♠</b>${html(player.league)} I</span></div><div class="friends-rate">${icon('bolt')}<span><strong>${metricNumber(player.earningRate, 2)} <em>AP/h</em></strong><small>Earning Rate</small></span></div>${friendStatus(player)}<div class="friends-share"><small>Share from this player ${icon('info')}</small><strong>${share}</strong><b>${contribution}</b><span>${player.earned24h > 0 ? `+${metricNumber(player.earned24h, 2)} AP (24h)` : ''}</span></div><button class="friends-details" data-action="friend-details" data-friend-id="${html(player.id)}" aria-label="Open ${html(player.username)} details">${icon('arrow')}</button>${player.showCapNote ? `<p class="friends-cap-note">Player share: ${metricNumber(player.playerShare, player.playerShare % 1 ? 1 : 0)}% &nbsp;•&nbsp; Your share is capped at ${metricNumber(player.effectiveShare, player.effectiveShare % 1 ? 1 : 0)}%</p>` : ''}</article>`;
}

function friendsShareCard(model) {
  const progression = model.nextLeague ? `<div class="friends-share-next"><div><p>Reach ${html(model.nextLeague)} to increase<br>your max share to ${metricNumber(model.nextRate, model.nextRate % 1 ? 1 : 0)}%.</p><span><i style="width:${Math.min(100, model.rate / model.nextRate * 100)}%"></i></span></div><b class="friends-next-badge">♠</b></div>` : `<div class="friends-share-next"><p>You have reached the highest configured referral-share level.</p></div>`;
  const explanation = `<div class="friends-share-copy">Invite friends and earn a share<br>of their Earning Rate while they<br>are actively earning.</div>`;
  return `<section class="friends-share-card"><div class="friends-share-current"><span>%</span><div><small>${model.total ? 'YOUR MAX REFERRAL SHARE' : 'YOUR REFERRAL SHARE'}</small><strong>${metricNumber(model.rate, model.rate % 1 ? 1 : 0)}%</strong><b>${html(model.leagueLabel)}</b></div></div>${model.total ? progression : explanation}<button data-action="referral-help">How it works? ${icon('arrow')}</button></section>`;
}

function friendsInviteCard(model) {
  const encodedUrl = encodeURIComponent(model.invite), encodedText = encodeURIComponent('Join me at Velvet & Noir.');
  return `<section class="friends-invite-card ${model.total ? 'is-populated' : 'is-empty'}"><div class="friends-card-title"><span>${icon('link')}</span><h2>Your Invitation Link</h2></div><div class="friends-invite-main"><label><input class="friends-invite-input referral-link" aria-label="Referral link" readonly value="${html(model.invite)}"><button data-action="copy" data-copy-value="${html(model.invite)}" aria-label="Copy referral link">${icon('copy')}</button></label>${model.total ? '' : `<button class="friends-gold-button" data-action="share-referral">${icon('share')} Share Link</button>`}</div><div class="friends-share-actions"><a href="https://t.me/share/url?url=${encodedUrl}&text=${encodedText}" target="_blank" rel="noopener" aria-label="Share with Telegram">${icon('send')}<span>Telegram</span></a><a href="https://wa.me/?text=${encodedText}%20${encodedUrl}" target="_blank" rel="noopener" aria-label="Share with WhatsApp"><b>◉</b><span>WhatsApp</span></a>${model.total ? '' : `<button data-action="copy" data-copy-value="${html(model.invite)}">${icon('copy')}<span>Copy Link</span></button>`}<button data-action="share-referral">${icon('more')}<span>More</span></button></div></section>`;
}

function friendsNetwork(model) {
  return `<section class="friends-network-card"><div class="friends-network-head">${icon('users')}<div><h2>Your Referral Network</h2><p>Overview of your invited friends and their activity.</p></div><label>Last 24 Hours <select aria-label="Referral time range"><option>Last 24 Hours</option></select>${icon('arrow')}</label></div><div class="friends-network-stats"><div>${icon('users')}<strong>${model.total}</strong><span>Invited Friends</span></div><div><i></i><strong>${model.active}</strong><span>Earning Now</span></div><div>${icon('bar')}<strong>+${metricNumber(model.liveRate, 2)} <em>AP/h</em></strong><span>Live from Referrals</span></div><div>${icon('chips')}<strong>+${metricNumber(model.earned24h, 2)} <em>AP</em></strong><span>Earned (24h)</span></div></div></section>`;
}

function friendsEmptyState() {
  const steps = [['link', '1. Invite', 'Share your link<br>with friends.'], ['user', '2. They play', 'Your friends play<br>and activate their<br>earning cycle.'], ['%', '3. You earn', 'You receive a share<br>of their Earning Rate<br>while they are earning.'], ['gift', '4. Grow together', 'The more active friends<br>you have, the more<br>you earn.']];
  return `<section class="friends-empty-panel"><img src="/assets/friends/empty-friends-glow-v1.png" alt="" aria-hidden="true"><h2>You haven’t invited any friends yet</h2><p>Share your link with friends and earn a share of their Earning Rate<br>while they are actively earning. The more active players you invite,<br>the more you earn!</p><button class="friends-gold-button" data-action="share-referral">${icon('share')} Invite Friends</button></section><section class="friends-guide" id="friends-guide"><div><h2>How it works?</h2><button data-action="friends-guide">See full guide ${icon('arrow')}</button></div><div class="friends-guide-steps">${steps.map(([symbol, heading, copy], index) => `<article><span>${symbol === '%' ? '%' : icon(symbol)}</span><h3>${heading}</h3><p>${copy}</p></article>${index < steps.length - 1 ? `<i>${icon('arrow')}</i>` : ''}`).join('')}</div></section>`;
}

function friendsPopulatedState(model) {
  const lastCapped = [...model.players].reverse().find(player => player.capped)?.id;
  return `<section class="friends-list-section"><div class="friends-list-head"><h2>Your Friends</h2><label>${icon('search')}<input type="search" data-friends-search placeholder="Search friends..." aria-label="Search friends"></label></div><div class="friends-list" data-friends-list>${model.players.map(player => friendRow({ ...player, showCapNote: player.id === lastCapped })).join('')}</div><p class="friends-no-results" hidden>No friends match your search.</p></section>`;
}

function friends() {
  const model = friendsPageModel();
  return `<div class="friends-page ${model.total ? 'has-referrals' : 'is-empty'}"><section class="friends-hero"><div><h1>Friends</h1><p>Invite friends. Play together. Earn more.</p></div><span>${model.total ? 'REAL PLAYERS<br>BIGGER<br>REWARDS.' : 'PLAY<br>TOGETHER<br>GROW TOGETHER'}</span></section>${friendsShareCard(model)}${friendsInviteCard(model)}${friendsNetwork(model)}${model.total ? friendsPopulatedState(model) : friendsEmptyState()}</div>`;
}
function referrals() { return friends(); }
function rules() {
  return `<div class="page rules-page">
    <div class="rules-intro"><span>${icon('bolt')}</span><div><small>YOUR PROGRESSION</small><h1>How it works</h1><p>Verbessere deine dauerhafte Earning Rate und aktiviere regelmäßig neue AP-Zyklen.</p></div></div>
    <section class="rules-rate"><small>DEINE AKTUELLE EARNING RATE</small><strong>${number(state.rate, 2)} <em>AP/h</em></strong><p>Die Rate kann durch qualifizierte Poker-Aktivität steigen und fällt nicht wieder zurück.</p></section>
    <div class="rules-steps">
      <article><span>1</span><div><h2>Öffentlich Poker spielen</h2><p>Qualifizierte Hände zählen, sobald der Turn erreicht wurde und die normalen Tischbedingungen erfüllt sind.</p></div></article>
      <article><span>2</span><div><h2>Earning Rate verbessern</h2><p>Positive qualifizierte Nettogewinne erhöhen deine dauerhafte Rate. Chips werden dabei nicht in AP umgewandelt.</p></div></article>
      <article><span>3</span><div><h2>${state.config.activationHands} Hände qualifizieren</h2><p>Nach ${state.config.activationHands} qualifizierten Händen kannst du einen neuen Earning Cycle manuell starten.</p></div></article>
      <article><span>4</span><div><h2>6 Stunden AP sammeln</h2><p>Während des Zyklus entstehen AP anhand deiner aktiven Rate. Eine spätere Erhöhung zählt erst ab diesem Zeitpunkt.</p></div></article>
      <article><span>5</span><div><h2>AP abholen und neu beginnen</h2><p>Nach sechs Stunden holst du die AP ab. Für den nächsten Zyklus werden erneut 15 qualifizierte Hände benötigt.</p></div></article>
    </div>
    <section class="rules-note"><strong>Wichtig</strong><p>AP und Spielchips bleiben getrennt. Private Spiele erhöhen die Earning Rate nicht. Referral-Rewards entstehen ausschließlich durch direkte, qualifizierte Referrals.</p></section>
    <a class="rules-cta" href="#play">PLAY POKER ${icon('arrow')}</a>
  </div>`;
}
function profile() {
  return `<div class="page"><div class="profile-hero"><div class="avatar">A</div><h1>${html(state.name)}</h1><p>Demo-Profil · Avatare bleiben vorerst Platzhalter</p></div><div class="metric-grid"><div class="metric"><label>Gespielte Hände</label><strong>${number(state.stats.hands)}</strong></div><div class="metric"><label>Qualifizierte Nettogewinne</label><strong class="gold">${number(state.qualifiedWinnings)}</strong></div></div><div class="list-card"><div class="row"><h3>Dein Kontoverlauf</h3>${icon('history')}</div><p>Chips, AP und Rate nachvollziehbar getrennt.</p><a class="text-button" href="#history">Buchungen ansehen ${icon('arrow')}</a></div><h2 class="section-label">Deine Einstellungen</h2><label class="setting-row"><span>Haptisches Feedback<p>Wenn der Telegram-Client es unterstützt</p></span><input type="checkbox" class="toggle" data-setting="haptics" aria-label="Haptisches Feedback" ${state.settings.haptics ? 'checked' : ''}></label><label class="setting-row"><span>Weniger Bewegung<p>Animationen und Übergänge reduzieren</p></span><input type="checkbox" class="toggle" data-setting="reducedMotion" aria-label="Weniger Bewegung" ${state.settings.reducedMotion ? 'checked' : ''}></label><button class="text-button" data-action="demo">Entwicklungsvorschau: Testzustände ${icon('arrow')}</button><p class="info-note">Keine Echtgeldfunktion. Kein Wallet und keine Auszahlung. Dieser lokale Entwicklungsstand ist noch nicht mit deinem Telegram-Konto oder Bot verbunden.</p></div>`;
}
function history() {
  return `<div class="page">${title('NACHVOLLZIEHBAR', 'Kontoverlauf', 'Lokale Demo-Buchungen, neueste zuerst.')}<p class="info-note">„Chips“ sind Kontobewegungen, „Tischchips“ das Spielergebnis am Tisch. Ein Buy-in ist nur ein Transfer. Der AP-Stand kann Demo-Startwerte enthalten.</p>${state.history.map(h => `<div class="history-row"><div>${html(h.source)}<small>${new Date(h.at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${html(h.asset)}</small></div><div class="history-amount ${h.amount < 0 ? 'negative' : ''}">${h.asset === 'Info' ? '—' : signed(h.amount, h.asset === 'AP' ? 2 : 0)}</div></div>`).join('')}</div>`;
}
function render() {
  if (!state) return;
  victory.cancel();
  $('#phone').classList.toggle('reward-design-preview', Boolean(rewardPreview));
  const r = route(), isTable = ['table', 'bots'].includes(r);
  $('#phone').classList.toggle('is-poker-table', r === 'table');
  $('#phone').classList.toggle('is-bot-table', r === 'bots');
  $('#phone').classList.toggle('is-play-lobby', r === 'play');
  $('#phone').classList.toggle('is-progress-page', r === 'home');
  $('#phone').classList.toggle('is-friends-page', ['friends', 'referrals'].includes(r));
  const activeNav = r === 'referrals' ? 'friends' : r === 'rules' ? 'home' : r === 'history' ? 'profile' : isTable ? 'play' : r;
  const headerName = ({ home: 'Home', play: 'Spielen', table: 'Am Tisch', missions: 'Missionen', rules: 'How it works', friends: 'Freunde', referrals: 'Referrals', profile: 'Profil', history: 'Kontoverlauf' })[r] || 'Home';
  $('#app-header').innerHTML = `${['table', 'missions', 'rules', 'history'].includes(r) ? `<button class="icon-button header-back" data-action="${isTable ? 'table-back' : 'back'}" aria-label="Zurück">${icon('back')}</button>` : '<span class="brand-icon">♠</span>'}<div class="header-title">${headerName}<small>TOKEN POKER FARM</small></div><a class="header-ap" href="#home" aria-label="${number(state.ap, 2)} gesammelte AP">ϟ ${number(state.ap, 2)} AP</a><button class="demo-tag" data-action="demo">DEMO</button>`;
  if (['friends', 'referrals'].includes(r)) $('#app-header').innerHTML = `<button class="icon-button header-back" data-action="back" aria-label="Back">${icon('back')}</button><span class="brand-icon">${icon('spade')}</span><div class="header-title">Velvet &amp; Noir<small>TOKEN POKER FARM</small></div><a class="header-ap" href="#home" aria-label="${number(state.ap, 2)} collected AP">${icon('bolt')} ${number(state.ap, 2)} AP</a><a class="table-profile home-header-profile" href="#profile" aria-label="Open profile">${profilePhoto()}<i></i></a><a class="home-settings" href="#profile" aria-label="Settings">${icon('gear')}</a>`;
  if (r === 'home') $('#app-header').innerHTML = '';
  if (r === 'play') $('#app-header').innerHTML = `<button class="icon-button header-back" data-action="back" aria-label="Zurück zur Startseite">${icon('back')}</button><span class="table-brand" aria-hidden="true">${icon('spade')}</span><div class="header-title">Live Tables<small>TEXAS HOLD’EM&nbsp; • &nbsp;PUBLIC TABLES</small></div><a class="header-ap" href="#home" aria-label="${number(state.ap, 2)} gesammelte AP">${icon('bolt')} ${metricNumber(state.ap)} AP</a><a class="table-profile" href="#profile" aria-label="Telegram-Profil öffnen">${profilePhoto()}<i></i></a><a class="play-settings" href="#profile" aria-label="Einstellungen">${icon('gear')}</a>`;
  if (isTable) $('#app-header').innerHTML = `<button class="icon-button header-back" data-action="table-back" aria-label="Zurück zur Tischauswahl">${icon('back')}</button><span class="table-brand" aria-hidden="true">${icon('spade')}</span><div class="header-title">Live Tables</div><a class="header-ap" href="#home" aria-label="${number(state.ap, 2)} gesammelte AP">${icon('bolt')} ${metricNumber(state.ap)} AP</a><a class="table-profile" href="#profile" aria-label="Telegram-Profil öffnen">${profilePhoto()}<i></i></a><button class="icon-button table-close" data-action="${r === 'bots' ? 'bot-back' : rewardPreview ? 'exit-preview' : 'leave'}" aria-label="Tisch schließen">${icon('close')}</button>`;
  if (r === 'bots') {
    $('#app-header .header-back').dataset.action = 'bot-back';
  }
  $('#bottom-nav').hidden = isTable;
  $('#bottom-nav').innerHTML = links.map(([id, name, sym]) => `<a href="#${id}" ${activeNav === id ? 'class="active" aria-current="page"' : ''}>${icon(sym)}${name}</a>`).join('');
  $('#studio-nav').innerHTML = links.map(([id, name], i) => `<a href="#${id}" ${activeNav === id ? 'class="active"' : ''}><span>0${i + 1}</span>${name}</a>`).join('');
  const scroll = renderedRoute === r ? $('#view').scrollTop : 0;
  $('#view').innerHTML = r === 'bots' ? botUI.table() : ({ home, play, table, missions, rules, friends, referrals, profile, history }[r] || home)();
  if (r === 'home') requestAnimationFrame(initProgressPhaseOneAnimations);
  if (isTable) {
    if (rewardPreview) {
      $('.table-controls').inert = true;
      $('.turn-time').hidden = true;
      $('.hand-caption span').textContent = rewardPreview === 'table' ? 'TURN REACHED · AP RATE UNLOCKED' : 'SHOWDOWN';
      if (rewardPreview !== 'table') $('.seat.s2 .seat-action').textContent = 'Paar Könige';
      $('.table-footer').innerHTML = `<div class="reward-preview-controls"><button data-action="reward-preview" data-mode="table" aria-pressed="${rewardPreview === 'table'}">Tisch</button><button data-action="reward-preview" data-mode="large" aria-pressed="${rewardPreview === 'large'}">Großer Gewinn</button><button data-action="reward-preview" data-mode="small" aria-pressed="${rewardPreview === 'small'}">Kleiner Anstieg</button><button class="reward-replay" data-action="reward-replay" aria-label="Animation wiederholen" ${rewardPreview === 'table' ? 'disabled' : ''}>↻</button></div>`;
    }
  }
  $('#view').scrollTop = scroll;
  renderedRoute = r;
  updateTimers();
  const back = window.Telegram?.WebApp?.BackButton;
  if (back) r === 'home' ? back.hide() : back.show();
  if (r === 'play' || r === 'bots') botUI.afterRender();
}
function updateTimers() {
  if (!state) return;
  document.querySelectorAll('[data-turn-time]').forEach(e => e.textContent = `${seconds(state.table?.deadline || now())}s`);
  document.querySelectorAll('[data-decision-progress]').forEach(e => e.style.width = `${rewardPreview === 'table' ? 62 : state.table?.status === 'turn' ? Math.min(100, seconds(state.table.deadline) / 15 * 100) : 0}%`);
  document.querySelectorAll('[data-cycle-time]').forEach(e => e.textContent = duration((state.earning.end || now()) - now()));
  document.querySelectorAll('[data-accrued]').forEach(e => e.textContent = number(localAccrued(), 2));
  document.querySelectorAll('[data-progress-cycle-time]').forEach(e => e.textContent = clockDuration((state.earning.end || now()) - now()));
  document.querySelectorAll('[data-progress-accrued]').forEach(e => e.textContent = number(localAccrued(), 2));
  if (state.cycle) {
    if ($('[data-ring-value]')) $('[data-ring-value]').textContent = number(localAccrued(), 2);
    document.querySelectorAll('[data-cycle-bar]').forEach(e => e.style.width = cycleProgress() + '%');
    document.querySelectorAll('[data-cycle-ring]').forEach(e => e.style.setProperty('--progress', cycleProgress() + '%'));
  }
  if ($('[data-faucet-time]')) $('[data-faucet-time]').textContent = now() >= state.faucetAt ? 'Ein Paket ist bereit' : `Wieder in ${duration(state.faucetAt - now())}`;
}
function demoModal() {
  if (rewardPreview) {
    modal('Gewinn-Animation', 'Reine Designvorschau. Keine Chips oder AP werden gebucht.', '<button class="secondary" data-action="reward-preview" data-mode="large">Großer Anstieg · 8.42 → 10.20</button><button class="secondary" data-action="reward-preview" data-mode="small">Kleiner Anstieg · 8.42 → 8.45</button><a class="primary" href="/#home">Zurück zur App</a>');
    return;
  }
  modal('Vorschau testen', 'Nur lokale Testdaten. Die Gegner und Handergebnisse sind vorgegeben. Ein Testzustand ersetzt dein aktuelles Demo-Konto inklusive laufendem Tisch. Dein echter Bot bleibt unverändert.', `<div class="demo-options"><button class="secondary" data-action="scenario" data-scenario="new">Neuer Account · 0 AP/h</button><button class="secondary" data-action="scenario" data-scenario="ready">${state.config.activationHands} Hände geschafft · startbereit</button><button class="secondary" data-action="scenario" data-scenario="active">Aktiver Zyklus · noch 2h 30m</button><button class="secondary" data-action="scenario" data-scenario="claimable">Zyklus fertig · AP abholen</button></div><button class="primary" data-action="advance">Demo-Zeit um 6 Stunden vorspulen</button>`);
  $('#modal').insertAdjacentHTML('beforeend', '<p>Designvorschau – ohne Kontoveränderung:</p><button class="secondary" data-action="reward-preview" data-mode="table">Neuen Haupttisch ansehen</button><button class="secondary" data-action="reward-preview" data-mode="large">Großer Rate-Anstieg</button><button class="secondary" data-action="reward-preview" data-mode="small">Kleiner Rate-Anstieg</button>');
}

function playVictory(result = state.table?.result) {
  if (!result?.won || route() !== 'table' || document.hidden) return;
  victory.play({ host: $('.arena'), rateTarget: $('.table-rate-value'), reducedMotion: state.settings.reducedMotion,
    reward: { pot: result.payout, qualifiedWin: result.qualified ? Math.max(0, result.net) : 0,
      previousRate: result.previousRate / state.config.rateScale, nextRate: result.rate / state.config.rateScale } });
}
function showRewardPreview(mode) {
  if (!['large', 'small', 'table'].includes(mode)) return;
  rewardPreview = mode; $('#modal').close();
  window.history.replaceState(null, '', `/?reward=${mode}#table`);
  setState(victoryFixture(mode)); render();
  requestAnimationFrame(() => playVictory());
}
document.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled || busy) return;
  const action = button.dataset.action;
  switch (action) {
    case 'play': go('play'); break;
    case 'bot-back': go('play'); break;
    case 'stake': selectedStake = button.dataset.id; render(); break;
    case 'join': if (state.table || await command('table/join', { stake: selectedStake })) go('table'); break;
    case 'quick-join': selectedStake = button.dataset.id; if (state.table || await command('table/join', { stake: selectedStake })) go('table'); break;
    case 'unavailable-stake': modal('Table coming soon', 'This visual tier is included to match the approved table-selection design, but it is not yet enabled in the current demo economy.', '<button class="primary" data-action="close-modal">Got it</button>'); break;
    case 'private-table': modal('Private tables coming soon', 'Private games are not connected yet and will not generate AP progression.', '<button class="primary" data-action="close-modal">Got it</button>'); break;
    case 'faucet': await command('faucet/claim', {}, 'Freie Chips sind auf deinem Konto.'); break;
    case 'start-cycle': if (await command('earning/start', {}, 'Dein 6-Stunden-Zyklus läuft.')) go('earn'); break;
    case 'claim-cycle': await command('earning/claim', {}, 'AP abgeholt. Deine dauerhafte Rate bleibt erhalten.'); break;
    case 'progress-debug-next': {
      const query = new URLSearchParams(location.search); query.set('progressDebug', button.dataset.progressNext);
      location.assign(`${location.pathname}?${query}#home`); break;
    }
    case 'mission': await command('mission/claim', { id: button.dataset.id }, 'Missions-Chips abgeholt.'); break;
    case 'preset': selectedPreset = button.dataset.preset || null; setRaise(Number(button.dataset.amount)); break;
    case 'poker': await command('table/action', { handId: state.table.handId, action: button.dataset.move, amount: raiseAmount }); break;
    case 'next-hand': await command('table/next'); break;
    case 'table-back': go('home'); notify(state.table?.status === 'turn' ? 'Du bleibst am Tisch. Die Entscheidungszeit läuft weiter.' : 'Deine Tischchips bleiben am Tisch.'); break;
    case 'leave': modal('Tisch verlassen?', 'Deine verbleibenden Tischchips gehen zurück auf dein Konto. Eine offene Hand wird gefoldet.', '<button class="primary" data-action="confirm-leave">Tisch verlassen</button><button class="secondary" data-action="close-modal">Weiterspielen</button>'); break;
    case 'confirm-leave': if (await command('table/leave', {}, 'Tischchips zurückgebucht.')) { $('#modal').close(); go('home'); } break;
    case 'back': go(route() === 'history' ? 'profile' : 'home'); break;
    case 'demo': demoModal(); break;
    case 'referral-help':
    case 'friends-guide': modal('How referral rewards work', `Invite a direct friend, let them qualify and activate their earning cycle, and receive the configured share of their active Earning Rate. Your ${state.referrals?.league || 'Bronze'} league caps the effective share. Their own AP is never reduced.`, '<button class="primary" data-action="close-modal">Got it</button>'); break;
    case 'share-referral': {
      const model = friendsPageModel();
      try {
        if (navigator.share) await navigator.share({ title: 'Velvet & Noir', text: 'Join me at Velvet & Noir.', url: model.invite });
        else { await navigator.clipboard.writeText(model.invite); notify('Referral link copied.'); }
      } catch (error) { if (error?.name !== 'AbortError') notify('Sharing is not available. Copy the invitation link instead.', true); }
      break;
    }
    case 'friend-details': {
      const friend = friendsPageModel().players.find(player => player.id === button.dataset.friendId);
      if (friend) modal(friend.username, `${friend.league} I · ${metricNumber(friend.earningRate, 2)} AP/h. Your effective referral share is ${metricNumber(friend.effectiveShare, friend.effectiveShare % 1 ? 1 : 0)}%${friend.capped ? `, capped from the player's ${metricNumber(friend.playerShare, friend.playerShare % 1 ? 1 : 0)}% share.` : '.'}`, '<button class="primary" data-action="close-modal">Close</button>');
      break;
    }
    case 'reward-preview': showRewardPreview(button.dataset.mode); break;
    case 'reward-replay': playVictory(); break;
    case 'exit-preview': location.assign('/#home'); break;
    case 'close-modal': $('#modal').close(); break;
    case 'scenario': if (await command('demo/scenario', { scenario: button.dataset.scenario }, 'Demo-Testzustand geladen.')) { $('#modal').close(); go('home'); } break;
    case 'advance': if (await command('demo/advance', { hours: 6 }, 'Nur die Demo-Zeit wurde um 6 Stunden vorgestellt.')) $('#modal').close(); break;
    case 'copy': try { await navigator.clipboard.writeText(button.dataset.copyValue || $('.referral-link')?.value || `https://t.me/${state.config.botHandle}`); notify('Referral link copied.'); } catch { $('.referral-link')?.select(); notify('Please copy the selected link manually.'); } break;
    case 'retry': await bootstrap(); break;
  }
});
function setRaise(value) {
  const t = state.table;
  raiseAmount = Math.max(t.minRaise, Math.min(t.maxRaise, Math.round(value)));
  $('#raise-input').value = raiseAmount;
  $('#raise-output').textContent = number(raiseAmount);
  $('#raise-button-amount').textContent = number(raiseAmount);
  $('#raise-label').textContent = rewardPreview === 'table' || raiseAmount !== t.maxRaise ? 'RAISE' : 'ALL-IN';
  document.querySelectorAll('[data-action="preset"]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.preset === selectedPreset)));
}
document.addEventListener('input', e => {
  if (e.target.id === 'raise-input') { selectedPreset = null; setRaise(Number(e.target.value)); return; }
  if (e.target.matches('[data-friends-search]')) {
    const query = e.target.value.trim().toLowerCase();
    const rows = [...document.querySelectorAll('[data-friend-search]')];
    rows.forEach(row => { row.hidden = Boolean(query) && !row.dataset.friendSearch.includes(query); });
    const empty = $('.friends-no-results'); if (empty) empty.hidden = rows.some(row => !row.hidden);
  }
});
document.addEventListener('change', async e => {
  if (e.target.classList.contains('salon-level')) { selectedStake = e.target.value; render(); return; }
  if (e.target.dataset.setting) { const ok = await command('settings', { [e.target.dataset.setting]: e.target.checked }); if (!ok) render(); }
});
window.addEventListener('hashchange', () => {
  victory.cancel();
  if (rewardPreview && route() !== 'table') { location.replace(`/#${route()}`); return; }
  render(); $('#view').scrollTop = 0;
});
document.addEventListener('visibilitychange', () => { if (document.hidden) victory.cancel(); });
function signature(a) { return JSON.stringify([a.table?.handId, a.table?.status, a.chips, a.apUnits, a.rateUnits, a.earning.status, a.activation, a.faucetAt <= a.serverTime, a.missionClaims, a.settings]); }
async function poll() {
  if (polling || busy || !state || document.hidden || rewardPreview || route() === 'bots') return;
  polling = true;
  const startingRevision = revision;
  try {
    const response = await fetch(apiUrl('/api/state'), { headers: apiHeaders(), signal: AbortSignal.timeout(5000) });
    rememberApiSession(response);
    if (!response.ok || busy) return;
    const next = await response.json();
    if (busy || startingRevision !== revision) return;
    const changed = signature(state) !== signature(next);
    setState(next); if (changed) render();
  } catch { /* Commands surface connection errors; preserve the current view during a brief interruption. */ }
  finally { polling = false; }
}
async function bootstrap() {
  if (rewardPreview) { showRewardPreview(rewardPreview); return; }
  try {
    const response = await fetch(apiUrl('/api/state'), { headers: apiHeaders(), signal: AbortSignal.timeout(8000) });
    rememberApiSession(response);
    if (!response.ok) throw new Error('Server nicht bereit');
    setState(await response.json()); render();
  } catch { $('#view').innerHTML = `<div class="error-state"><h2>Verbindung unterbrochen</h2><p>Starte den lokalen Vorschau-Server und lade dein Konto erneut.</p><button class="primary" data-action="retry">Erneut verbinden</button></div>`; }
}
// Presentation uses initDataUnsafe only for Telegram-owned display fields. The server authenticates initData.
const tg = window.Telegram?.WebApp;
if (tg?.initData) {
  tg.ready(); tg.expand(); tg.setHeaderColor('#302340'); tg.setBackgroundColor('#323866');
  tg.BackButton.onClick(() => go('home'));
}
await bootstrap();
window.__TPF_RENDER__ = render;
window.addEventListener('tpf:react-view-ready', () => {
  if (state) render();
});
setInterval(updateTimers, 500);
setInterval(poll, 2000);
