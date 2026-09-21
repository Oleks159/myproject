// @ts-nocheck -- preserved poker-table renderer from the approved application.
const n = value => Number(value || 0).toLocaleString('de-DE', { maximumFractionDigits: 2 });
const portraits = [
  { box: [68, 410, 132, 102], circle: [127, 466, 53], cards: [131, 479, 68, 33] },
  { box: [369, 411, 110, 105], circle: [424, 466, 52] },
  { box: [659, 411, 125, 103], circle: [713, 467, 52], cards: [720, 480, 64, 34] },
  { box: [674, 751, 109, 106], circle: [729, 805, 51] },
  { box: [60, 752, 123, 102], circle: [115, 807, 52], cards: [117, 818, 65, 36] }
];

// Portrait and its two card backs are ONE source illustration. Never add a
// second HTML card pair over the pair already present in the reference pixels.
export function seatPortrait(index, showBacks = true) {
  const p = portraits[index], id = `portrait-mask-${index}`;
  // Elena/Sora are folded in the source; only those portraits need drawn backs.
  const extraBacks = showBacks && !p.cards ? `<g transform="translate(${p.box[0]+58} ${p.box[1]+69})">${[-5,6].map((angle,i) => `<g transform="translate(${i*16} 0) rotate(${angle} 14 18)"><rect class="single-card-back" width="28" height="36" rx="4" fill="#7b6eac" stroke="#b5a5dd" stroke-width="1.2"/><path fill="#c5b2e7" d="M14 10c-2 4-7 6-7 10a4 4 0 0 0 6 3l-2 4h6l-2-4a4 4 0 0 0 6-3c0-4-5-6-7-10Z"/></g>`).join('')}</g>` : '';
  if (!showBacks && p.cards) {
    const [cx, originalY] = p.circle, cy = originalY - 20, radius = 31;
    return `<svg class="reference-seat-art" data-card-backs="0" viewBox="${cx-radius} ${cy-radius} ${radius*2} ${radius*2}" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${radius}"/></clipPath></defs><image href="/assets/table-reference-avatar-source-v1.png" width="851" height="1849" clip-path="url(#${id})"/></svg>`;
  }
  return `<svg class="reference-seat-art" data-card-backs="${showBacks ? 2 : 0}" viewBox="${p.box.join(' ')}" aria-hidden="true"><defs><mask id="${id}" maskUnits="userSpaceOnUse" x="${p.box[0]}" y="${p.box[1]}" width="${p.box[2]}" height="${p.box[3]}"><circle cx="${p.circle[0]}" cy="${p.circle[1]}" r="${p.circle[2]}" fill="white"/>${p.cards ? `<rect x="${p.cards[0]}" y="${p.cards[1]}" width="${p.cards[2]}" height="${p.cards[3]}" fill="${showBacks ? 'white' : 'black'}"/>` : ''}</mask></defs><image href="/assets/table-reference-avatar-source-v1.png" width="851" height="1849" mask="url(#${id})"/>${extraBacks}</svg>`;
}

const artBoxes = [[37,230,315,172],[388,230,310,172],[735,229,307,173],[37,665,315,176],[390,665,306,176],[736,664,306,177],[470,1028,576,272]];
const fallbackTiers = ['Micro','Low','Mid','High','Elite','Premier','Legend'].map((name, i) => ({ id: name.toLowerCase(), name, big: [10,20,50,100,200,500,1000][i], small: [5,10,25,50,100,250,500][i], buyIn: [1000,2000,5000,10000,20000,50000,100000][i] }));
const streetName = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown', finished: 'Hand beendet', ready: 'Bereit' };

export const canRevealSeat = (state, seat) => Boolean(
  state?.status === 'finished' && state.showdown && !seat?.folded && Array.isArray(seat?.cards)
);

export function createBotUI({ icon, html, card, apiHeaders, render, go, modal, notify, accountState, setAccountState, onSettlement }) {
  let catalog, catalogLoading, loadError = '', state, tier, loading = false, pending = false;
  let amount = 0, amountRevision = -1, preset = 'min', historyHand;
  let focusedControlState = '';
  const currentId = () => new URLSearchParams(location.hash.split('?')[1] || '').get('tier') || 'micro';
  const onTable = () => location.hash.startsWith('#bots');
  const round = value => Math.max(state?.min_raise_to || 0, Math.min(state?.max_raise_to || 0, Math.round(value)));
  async function api(path, data) {
    const options = data ? { method: 'POST', headers: apiHeaders(true), body: JSON.stringify(data) } : { headers: apiHeaders() };
    let response;
    for (let retry = 0; retry < 2; retry++) {
      try { response = await fetch(`/api/bots/${path}`, { ...options, signal: AbortSignal.timeout(35000) }); break; }
      catch (error) { if (retry) throw error; }
    }
    const body = await response.json();
    if (!response.ok) throw Object.assign(new Error(body.error || 'Verbindung zum Bot-Tisch fehlgeschlagen.'), { status: response.status });
    return body;
  }
  function ensureCatalog() {
    if (catalog || catalogLoading) return;
    catalogLoading = api('catalog').then(result => {
      catalog = result; loadError = '';
      render();
    }).catch(error => { loadError = error.message; render(); });
  }
  async function refresh(start = false) {
    if (loading || pending) return;
    loading = true; loadError = ''; render();
    try {
      const id = currentId(), result = await api(`state?tier=${encodeURIComponent(id)}`);
      if (id !== currentId()) return;
      state = result.state; tier = result.tier; amountRevision = -1;
      if (start && state.status === 'empty') {
        const next = await api('next', { tier: id, request_id: crypto.randomUUID(), revision: state.revision });
        state = next.state; tier = next.tier;
      }
    } catch (error) { loadError = error.message; }
    finally { loading = false; render(); }
  }
  async function mutate(operation, data = {}) {
    if (pending || !state) return;
    pending = true; render();
    try {
      const result = await api(operation, { tier: tier.id, request_id: crypto.randomUUID(), revision: state.revision, ...data });
      state = result.state; tier = result.tier; amountRevision = -1; historyHand = null; loadError = '';
      if (result.account) setAccountState?.(result.account);
      if (result.settlement) onSettlement?.(result);
    } catch (error) {
      notify(error.message, true);
      try { const result = await api(`state?tier=${tier.id}`); state = result.state; } catch { loadError = error.message; }
    } finally { pending = false; render(); }
  }
  function lobby() {
    const tiers = catalog?.tiers || fallbackTiers;
    return `<div class="cash-lobby">
      <div class="cash-top-tabs"><button class="selected" aria-pressed="true">${icon('spade')} CASH GAMES</button><button disabled>${icon('trophy')} TURNIERE</button></div>
      <div class="cash-mode-cards" aria-label="Spielmodus"><button class="cash-mode-bots" aria-pressed="true"><span>${icon('bot')}</span><strong>VS BOTS<small>Gegen KI-Gegner spielen</small></strong></button><button class="cash-mode-online" data-bot-action="online" aria-label="Online-Spiel – demnächst"><span>${icon('globe')}</span><strong>ONLINE<small>Demnächst</small></strong><i>${icon('lock')}</i></button></div>
      <div class="cash-intro"><h1>WÄHLE DEINEN TISCH</h1><span>SPIELEN · LERNEN · AUFSTEIGEN</span></div>
      ${loadError ? `<p class="bot-error" role="alert">${html(loadError)} <button data-bot-action="retry-catalog">Erneut verbinden</button></p>` : ''}
      <div class="cash-grid">${tiers.map((t,i) => `<article class="cash-tier cash-tier-${t.id}"><div class="cash-card-head"><span class="cash-badge">${i + 1}</span><h2>${t.name.toUpperCase()}</h2><span class="cash-bots">${icon('users')} 5 Bots</span></div><svg class="cash-art" viewBox="${artBoxes[i].join(' ')}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${i === 6 ? '<defs><filter id="legend-mask-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter><mask id="legend-art-mask" maskUnits="userSpaceOnUse" x="470" y="1028" width="576" height="272"><rect x="470" y="1028" width="576" height="272" fill="white"/><rect x="787" y="1192" width="266" height="95" fill="black" filter="url(#legend-mask-soft)"/><rect x="964" y="1028" width="82" height="65" fill="black" filter="url(#legend-mask-soft)"/></mask></defs>' : ''}<image href="/assets/cash-tables-reference.png" width="1084" height="1451" ${i === 6 ? 'mask="url(#legend-art-mask)"' : ''}/></svg><div class="cash-stats"><div>${icon('chips')}<span>Blinds<strong>${n(t.small)} / ${n(t.big)}</strong></span></div><div>${icon('chips')}<span>Buy-in<strong>${n(t.buyIn)}</strong></span></div><div>${icon('users')}<span>Players<strong>You + 5</strong></span></div></div><button class="cash-play" data-bot-action="join" data-tier="${t.id}" ${!catalog ? 'disabled' : ''}>Play ${icon('arrow')}</button>${i === 6 ? '<p class="legend-motto">HIGHEST STAKES. PROVE YOURSELF.</p>' : ''}</article>`).join('')}</div>
      <div class="cash-foot"><span>GOOD PLAYERS. HIGHER LEVELS.</span><span>SKILL · STRATEGY · BIGGER OPPORTUNITIES.</span></div>
      <p class="bot-model-note">${icon('info')} Spielchips sowie Gewinne und Verluste bleiben am gewählten Bot-Tisch gespeichert. Die Gegner werden automatisch bereitgestellt.</p>
    </div>`;
  }
  const actionText = seat => {
    if (seat.folded) return 'Folded';
    if (seat.all_in) return 'All-in';
    const event = seat.last_action;
    if (!event) return seat.position;
    const label = { check: 'Checked', call: 'Call', bet: 'Bet', raise: 'Raise', small_blind: 'SB', big_blind: 'BB' }[event.action] || event.action;
    return `${label}${event.to_total && event.action !== 'check' ? ' ' + n(event.to_total) : ''}`;
  };
  function table() {
    if (loadError) return `<div class="bot-empty"><h2>Verbindung zum Bot-Tisch</h2><p>${html(loadError)}</p><button class="primary" data-bot-action="refresh">Neu verbinden</button><a href="#play">Zur Tischauswahl</a></div>`;
    if (!state || !tier || tier.id !== currentId()) return '<div class="loading"><span class="spinner"></span>Dein Bot-Tisch wird geladen …</div>';
    if (state.status === 'empty' || state.status === 'ready') return `<div class="bot-empty"><h2>${tier.name} · 6-Max</h2><p>Dein Stack: ${n(state.bankrolls[0])} Chips · Blinds ${tier.small}/${tier.big}</p><button class="primary" data-bot-action="next" ${pending ? 'disabled' : ''}>Hand starten ${icon('arrow')}</button><button class="secondary" data-bot-action="settings">Stacks &amp; Verlauf</button></div>`;
    const done = state.status === 'finished', legal = state.legal_actions;
    const raiseAction = legal.includes('raise') ? 'raise' : 'bet';
    const canRaise = legal.includes(raiseAction), callAction = legal.includes('check') ? 'check' : 'call';
    const hero = state.seats[0], positions = [2, 3, 4, 5, 1], names = ['Viktor_K', 'Elena_M', 'Katia_X', 'Sora', 'Cipher'];
    const account = accountState?.() || {};
    const cycleEnd = Number(account.cycle?.end || account.earning?.end || 0);
    const cycleMs = Math.max(0, cycleEnd - Date.now());
    const cycleText = cycleEnd ? `${Math.floor(cycleMs / 3600000)}h ${String(Math.floor(cycleMs % 3600000 / 60000)).padStart(2, '0')}m` : '0h 00m';
    const qualified = Number(account.qualifiedWinnings || 0);
    if (amountRevision !== state.revision) { amount = state.min_raise_to || 0; amountRevision = state.revision; preset = 'min'; }
    const pot = done ? state.final_pot : state.pot;
    const presets = [['min','MIN',state.min_raise_to], ['half','½', hero.current_bet + state.to_call + .5 * (state.pot + state.to_call)], ['three-quarter','¾', hero.current_bet + state.to_call + .75 * (state.pot + state.to_call)], ['pot','POT', hero.current_bet + state.to_call + state.pot + state.to_call], ['max','MAX',state.max_raise_to]];
    return `<div class="bot-table-page ${done ? 'is-finished' : ''}" aria-busy="${pending || loading}">
      <div class="bot-table-toolbar" aria-label="Spielerfortschritt"><span class="bot-rate">${icon('bolt')}<b>${n(account.rate)}</b> AP/h</span><span class="bot-cycle">${icon('clock')}<b>${cycleText}</b></span><span class="bot-qualified">${qualified >= 0 ? '+' : ''}${n(qualified)} QLF ${icon('info')}</span><button data-bot-action="settings" aria-label="Bot-Tischoptionen">${icon('settings')}</button></div>
      <div class="bot-table-meta"><span>NL ${n(tier.small)}/${n(tier.big)} · BLINDS ${n(tier.small)}/${n(tier.big)}</span><span class="bot-live">● BOT HAND #${state.hand_number}</span></div>
      <div class="bot-arena" aria-label="6-Max Bot-Pokertisch"><div class="bot-felt"></div>
        ${positions.map((seatNo,i) => { const seat = state.seats[seatNo], reveal = canRevealSeat(state, seat); return `<div class="bot-seat bot-seat-${i} ${seat.folded ? 'folded' : ''} ${reveal ? 'revealed' : ''}" aria-label="${names[i]}"><div class="bot-avatar">${seatPortrait(i, !done && !seat.folded)}${state.button_seat === seatNo ? '<span class="bot-dealer">D</span>' : ''}${reveal ? `<div class="bot-revealed" aria-label="Aufgedeckte Karten von ${names[i]}">${seat.cards.map(card).join('')}</div>` : ''}</div><div class="bot-seat-name"><span>${names[i]}</span><strong>${n(seat.stack)}</strong></div><span class="bot-seat-action ${['bet','raise','call'].includes(seat.last_action?.action) && !seat.folded ? 'gold-action' : ''}">${actionText(seat)}</span></div>`; }).join('')}
        <div class="bot-board"><div class="bot-pot"><span class="bot-chip-icon" aria-hidden="true"><svg viewBox="0 0 42 30" width="30" height="23"><g fill="#54ced8" stroke="#bdf8fa" stroke-width="2"><circle cx="14" cy="14" r="11"/><circle cx="27" cy="17" r="11"/></g><g fill="none" stroke="#248f9e" stroke-width="2"><circle cx="14" cy="14" r="7"/><circle cx="27" cy="17" r="7"/></g></svg></span> POT: <strong>${n(pot)}</strong></div><div class="bot-board-cards" aria-label="Gemeinschaftskarten">${Array.from({ length: 5 }, (_,i) => card(state.board[i])).join('')}</div><div class="bot-stage">${done ? (state.showdown ? 'SHOWDOWN · NUR VERBLIEBENE SPIELER OFFEN' : 'HAND BEENDET · GEGNERKARTEN VERDECKT') : `${streetName[state.street]?.toUpperCase()} · DU BIST AM ZUG`}</div></div>
        <div class="bot-hero"><div class="bot-hero-divider"></div><div class="bot-hero-cards" aria-label="Deine Hand">${hero.cards.map(card).join('')}</div><div class="bot-hand-label">${done ? `${state.payoff_bb >= 0 ? '+' : ''}${n(state.payoff_bb)} BB · HANDERGEBNIS` : `${streetName[state.street]?.toUpperCase()} · DEINE ENTSCHEIDUNG`}</div><div class="bot-hero-stack">${state.button_seat === 0 ? '<span class="hero-dealer">D</span>' : ''}<b>Du</b><strong>${n(hero.stack)}</strong><span>In: ${n(hero.current_bet)}</span></div></div>
      </div>
      ${done ? `<div class="bot-posthand"><div class="bot-result"><span>Diese Hand <strong class="${state.payoff_bb < 0 ? 'negative' : ''}">${state.payoff_bb >= 0 ? '+' : ''}${n(state.payoff_bb * tier.big)} Chips</strong></span><span>Gesamt <strong>${state.total_bb >= 0 ? '+' : ''}${n(state.total_bb)} BB</strong></span></div><button class="primary" data-bot-action="next" ${pending ? 'disabled' : ''}>${hero.stack === 0 ? '100 BB nachkaufen & nächste Hand' : 'Nächste Hand'} ${icon('arrow')}</button></div>` : `<div class="bot-controls"><div class="bot-presets">${presets.map(([key,label,value]) => `<button data-bot-action="preset" data-preset="${key}" data-amount="${round(value)}" aria-pressed="${preset === key}" ${!canRaise || pending ? 'disabled' : ''}>${label}${!['min','max'].includes(key) ? `<small>(${n(round(value))})</small>` : ''}</button>`).join('')}</div><div class="bot-actions"><button data-bot-action="move" data-move="fold" ${!legal.includes('fold') || pending ? 'disabled' : ''}>FOLD<small>Hand aufgeben</small></button><button data-bot-action="move" data-move="${callAction}" ${!legal.includes(callAction) || pending ? 'disabled' : ''}>${callAction.toUpperCase()}<small>${state.to_call ? n(state.to_call) : 'Kein Einsatz'}</small></button><button class="bot-raise" data-bot-action="move" data-move="${raiseAction}" ${!canRaise || pending ? 'disabled' : ''}>${raiseAction.toUpperCase()}<small data-bot-raise-label>${n(amount)}</small></button></div><label class="bot-slider"><span>${n(state.min_raise_to)}</span><input data-bot-range type="range" aria-label="Gesamteinsatz auf dieser Straße" min="${state.min_raise_to || 0}" max="${state.max_raise_to || 0}" value="${amount}" step="1" ${!canRaise || pending ? 'disabled' : ''}><output data-bot-amount>${n(amount)}</output></label></div>`}
      <div class="bot-footer"><button data-bot-action="history">${icon('history')} Handverlauf</button><span>${pending ? 'Bots entscheiden …' : `${n(state.timing?.server_ms)} ms · ${state.timing?.bot_decisions || 0} Bot-Züge`}</span><button data-bot-action="settings">${icon('settings')} Tisch</button></div>
    </div>`;
  }
  function settings() {
    const done = ['empty','ready','finished'].includes(state?.status);
    modal('Dein Tisch', `Blinds ${n(tier.small)} / ${n(tier.big)} · Gewinne und Verluste bleiben gespeichert.`, `<button class="secondary" data-bot-action="history">Abgeschlossene Hände</button><button class="secondary" data-bot-action="reset-dialog" ${!done ? 'disabled' : ''}>Stacks zurücksetzen</button><a class="primary" href="#play" data-bot-action="close">Zur Tischauswahl</a><p class="bot-dialog-note">Die Gegner werden automatisch bereitgestellt. Keine künstliche Wartefrist für Bot-Züge.</p>`);
  }
  function showHistory() {
    modal('Handverlauf', 'Die letzten 100 abgeschlossenen Hände dieses Bot-Tisches.', `<div class="bot-history-list">${(state.recent_hands || []).map(hand => `<button class="secondary" data-bot-action="hand" data-hand="${hand.hand_id}"><span>#${hand.hand_number} · ${hand.hero_cards.map(html).join(' ')} · ${hand.board.map(html).join(' ')}</span><strong>${hand.payoff_bb >= 0 ? '+' : ''}${n(hand.payoff_bb)} BB</strong></button>`).join('') || '<p>Noch keine abgeschlossene Hand.</p>'}</div>`);
  }
  async function showHand(id) {
    try {
      historyHand = (await api(`hand?tier=${tier.id}&hand=${encodeURIComponent(id)}`)).hand;
      const hand = historyHand;
      modal(`Hand #${hand.hand_number}`, `Board: ${hand.board.join(' ')} · Ergebnis: ${hand.payoffs_bb[0] >= 0 ? '+' : ''}${n(hand.payoffs_bb[0])} BB`, `<div class="bot-history-detail"><h3>${hand.showdown ? 'Showdown-Karten' : 'Karten'}</h3>${hand.seats.map(s => `<p>${s.seat === 0 ? 'You' : `Bot ${s.seat}`} · ${Array.isArray(s.cards) ? s.cards.map(html).join(' ') : 'verdeckt'} · ${n(hand.ending_stacks[s.seat])} Chips</p>`).join('')}<h3>Aktionen</h3>${hand.history.map(e => `<p>${html(e.phase)} · ${e.seat === 0 ? 'You' : `Bot ${e.seat}`} · ${html(e.action)} ${e.to_total ? n(e.to_total) : ''}</p>`).join('')}</div><button class="secondary" data-bot-action="history">Zurück zum Verlauf</button>`);
    } catch (error) { notify(error.message, true); }
  }
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-bot-action]');
    if (!button || button.disabled || pending) return;
    switch (button.dataset.botAction) {
      case 'join': state = null; tier = null; loadError = ''; go(`bots?tier=${button.dataset.tier}`); break;
      case 'move': await mutate('action', { action: button.dataset.move, ...(['raise','bet'].includes(button.dataset.move) ? { to_total: amount } : {}) }); break;
      case 'preset': preset = button.dataset.preset; amount = round(Number(button.dataset.amount)); render(); break;
      case 'next':
        if (state.seats?.[0].stack === 0 || state.bankrolls?.[0] === 0) modal('100 BB nachkaufen?', `Dein Stack ist leer. Du erhältst ${n(tier.buyIn)} Spielchips. Der Nachkauf wird getrennt vom Ergebnis erfasst.`, '<button class="primary" data-bot-action="rebuy">Nachkaufen & Hand starten</button>');
        else await mutate('next');
        break;
      case 'rebuy': document.querySelector('#modal').close(); await mutate('next', { rebuy_hero: true }); break;
      case 'refresh': await refresh(false); break;
      case 'settings': settings(); break;
      case 'history': showHistory(); break;
      case 'hand': await showHand(button.dataset.hand); break;
      case 'reset-dialog': modal('Stacks zurücksetzen', 'Alle sechs Stacks dieses Bot-Tisches und das Sitzungsergebnis werden neu gestartet. Abgeschlossene Hände bleiben im Verlauf.', `<label class="bot-model-label">Startstack in BB<input data-bot-reset-stack type="number" value="100" min="1" max="10000" step="1"></label><button class="primary" data-bot-action="reset-confirm">Stacks zurücksetzen</button>`); break;
      case 'reset-confirm': { const value = Number(document.querySelector('[data-bot-reset-stack]').value); if (!Number.isInteger(value) || value < 1 || value > 10000) { notify('Bitte 1 bis 10.000 BB eingeben.', true); break; } document.querySelector('#modal').close(); await mutate('reset', { confirm: true, stack_chips: value * tier.big }); break; }
      case 'online': modal('Online-Spiel', 'Spiele gegen andere Menschen werden als eigener Modus ergänzt. Die verfügbaren Tische spielen derzeit gegen fünf Bots.', '<button class="primary" data-action="close-modal">Verstanden</button>'); break;
      case 'retry-catalog': catalogLoading = null; ensureCatalog(); break;
      case 'close': document.querySelector('#modal').close(); break;
    }
  });
  document.addEventListener('input', event => {
    if (!event.target.matches('[data-bot-range]')) return;
    amount = round(Number(event.target.value)); preset = null;
    document.querySelectorAll('[data-bot-raise-label],[data-bot-amount]').forEach(el => { el.textContent = n(amount); });
    document.querySelectorAll('.bot-presets button').forEach(el => el.setAttribute('aria-pressed','false'));
  });
  function revealPlayableControls() {
    if (!onTable() || !state || loading || pending) return;
    const target = document.querySelector(state.status === 'finished' ? '.bot-posthand' : '.bot-controls');
    if (!target) return;
    const focusKey = `${tier?.id || ''}:${state.hand_id || state.hand_number || ''}:${state.revision}:${state.status}`;
    if (focusedControlState === focusKey) return;
    focusedControlState = focusKey;
    requestAnimationFrame(() => target.scrollIntoView({ block: 'end', inline: 'nearest', behavior: 'auto' }));
  }
  return { lobby, table, afterRender() {
    ensureCatalog();
    if (onTable() && !loading && !pending && !loadError && (!state || tier?.id !== currentId())) void refresh(true);
    else revealPlayableControls();
  } };
}
