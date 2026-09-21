// @ts-nocheck -- preserved reward animation runtime from the approved application.
// Presentation only. This module never sends commands or books chips/AP.
export const victoryStyle = Object.freeze({ duration: 2500, countDuration: 620, centralRateDelta: 1 });
const integer = n => Math.round(n).toLocaleString('en-US');
const decimal = n => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function rewardPresentation({ pot, qualifiedWin, previousRate, nextRate }) {
  for (const n of [pot, qualifiedWin, previousRate, nextRate]) {
    if (!Number.isFinite(n) || n < 0) throw new RangeError('Reward display requires non-negative finite values.');
  }
  if (qualifiedWin > pot || nextRate < previousRate) throw new RangeError('Inconsistent reward display.');
  const delta = Math.round((nextRate - previousRate) * 1e6) / 1e6;
  return Object.freeze({ pot, qualifiedWin, previousRate, nextRate, delta,
    mode: delta >= victoryStyle.centralRateDelta ? 'large' : 'small',
    label: `POT WON +${integer(pot)} CHIPS. +${integer(qualifiedWin)} QUALIFIED WIN.${delta > 0 ? ` EARNING RATE UP ${decimal(previousRate)} → ${decimal(nextRate)} AP/h.` : ''}` });
}

export function countedReward(from, to, elapsed) {
  const progress = Math.max(0, Math.min(1, elapsed / victoryStyle.countDuration));
  return from + (to - from) * (1 - Math.pow(1 - progress, 4));
}

// Read-only sample used by ?reward=large/small#table. Never merged into a saved account.
export function victoryFixture(mode = 'large') {
  const nextRate = mode === 'table' ? 8.42 : mode === 'small' ? 8.45 : 10.20;
  const result = { won: true, folded: false, qualified: true, pot: 4200, payout: 4200,
    contribution: 1100, net: 3100, previousRate: 8420000, rate: Math.round(nextRate * 1e6),
    opponent: ['Kh', 'Qs'], label: 'Deine Asse gewinnen' };
  return { name: 'Alex', ap: 1420, rate: nextRate, rateUnits: result.rate, qualifiedWinnings: mode === 'table' ? 3100 : 72800, earning: { status: 'ready' },
    serverTime: Date.now(), settings: { haptics: false, reducedMotion: false },
    config: { rateScale: 1e6, stakes: [{ id: 'medium', name: 'Medium', small: 50, big: 100 }] },
    table: { handId: `visual-only-${mode}`, handNo: 42, stake: 'medium', status: mode === 'table' ? 'turn' : 'between',
      stack: mode === 'table' ? 9700 : 13100, displayStack: mode === 'table' ? 9850 : null, pot: mode === 'table' ? 1450 : 4200, contribution: mode === 'table' ? 300 : 1100, displayContribution: mode === 'table' ? 300 : null, call: 300, minRaise: 300, maxRaise: 750,
      hero: mode === 'table' ? ['Js', '9s'] : ['As', 'Ah'], board: mode === 'table' ? ['As', 'Kd', '10c', 'Qs'] : ['Kc', '9d', '4h', '7s', '2c'], result: mode === 'table' ? null : result } };
}

export function createVictoryAnimator() {
  let cleanups = [], frame = 0, timer = 0;
  function cancel() {
    cancelAnimationFrame(frame); clearTimeout(timer);
    for (const cleanup of cleanups.splice(0)) cleanup();
  }
  function play({ host, rateTarget, reward, reducedMotion = false, rateLocale = 'de-DE' }) {
    cancel();
    if (!host?.isConnected) return;
    const r = rewardPresentation(reward), doc = host.ownerDocument;
    const small = r.mode === 'small';
    const reduced = reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = doc.createElement('div');
    root.className = `victory-overlay victory-${r.mode}`;
    root.dataset.mode = r.mode;
    root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite');
    root.innerHTML = `<span class="victory-sr">${r.label}</span><div class="victory-atmosphere" aria-hidden="true"></div>
      <div class="victory-copy" aria-hidden="true"><div class="victory-pot-label">POT WON</div>
      <div class="victory-pot"><span data-pot>+${integer(r.pot)}</span><small>CHIPS</small></div>
      <div class="victory-qualified"><span data-qualified>+${integer(r.qualifiedWin)}</span> QUALIFIED WIN</div>
      ${small ? '' : `<div class="victory-rate-label">EARNING RATE UP</div><div class="victory-rate"><span>${decimal(r.previousRate)}</span><span class="victory-arrow">→</span><strong data-rate>${decimal(r.nextRate)}</strong><small>AP/h</small></div>`}</div>`;
    host.append(root);
    const page = host.closest('.table-page'); page?.classList.add('victory-playing');
    cleanups.push(() => { root.remove(); page?.classList.remove('victory-playing'); });
    const rateFormat = n => n.toLocaleString(rateLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (rateTarget) {
      rateTarget.textContent = rateFormat(r.nextRate);
      cleanups.push(() => { rateTarget.textContent = rateFormat(r.nextRate); });
    }
    const animate = (element, keys, options) => {
      const a = element.animate(keys, { fill: 'both', ...options });
      cleanups.push(() => a.cancel()); return a;
    };
    if (r.delta > 0 && rateTarget) {
      const tick = doc.createElement('span'); tick.className = 'victory-rate-tick';
      tick.textContent = `+${r.delta < .01 ? r.delta.toFixed(3) : decimal(r.delta)}`;
      tick.setAttribute('aria-hidden', 'true'); rateTarget.parentElement.append(tick);
      cleanups.push(() => tick.remove());
      if (!reduced) {
        animate(tick, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'translateY(-4px)', offset: .18 }, { opacity: 1, transform: 'translateY(-4px)', offset: .65 }, { opacity: 0, transform: 'translateY(-10px)' }], { duration: 1600 });
        animate(rateTarget, [{ color: '#a0f4fa', transform: 'translateY(0)' }, { color: '#f1fcff', transform: 'translateY(-2px)', offset: .2 }, { color: '#a0f4fa', transform: 'translateY(0)', offset: 1 }], { duration: 760, easing: 'ease-out' });
      }
    }
    if (!reduced) {
      // All labels arrive together. Final amounts settle by 620 ms, with no staged panels.
      animate(root, [{ opacity: 0 }, { opacity: 1, offset: .065 }, { opacity: 1, offset: .83 }, { opacity: 0 }], { duration: victoryStyle.duration });
      animate(root.querySelector('.victory-copy'), [{ transform: 'translate(-50%, calc(-50% + 9px)) scale(.94)' }, { transform: 'translate(-50%, -50%) scale(1.025)', offset: .45 }, { transform: 'translate(-50%, -50%) scale(1)' }], { duration: 440, easing: 'cubic-bezier(.16,1,.3,1)' });
      const started = performance.now();
      const update = () => {
        const elapsed = performance.now() - started;
        root.querySelector('[data-pot]').textContent = `+${integer(countedReward(0, r.pot, elapsed))}`;
        root.querySelector('[data-qualified]').textContent = `+${integer(countedReward(0, r.qualifiedWin, elapsed))}`;
        if (root.querySelector('[data-rate]')) root.querySelector('[data-rate]').textContent = decimal(countedReward(r.previousRate, r.nextRate, elapsed));
        if (rateTarget) rateTarget.textContent = rateFormat(countedReward(r.previousRate, r.nextRate, elapsed));
        if (elapsed < victoryStyle.countDuration) frame = requestAnimationFrame(update);
      };
      update();
      const width = host.clientWidth, height = host.clientHeight;
      // A restrained chip arc from the pot toward the player's already-credited stack.
      for (let i = 0; i < (small ? 4 : 8); i++) {
        const chip = doc.createElement('i'); chip.className = 'victory-chip'; chip.setAttribute('aria-hidden', 'true');
        chip.innerHTML = `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="chip-gold-${i}" x2=".8" y2="1"><stop stop-color="#ffe7b0"/><stop offset=".48" stop-color="#e8b36d"/><stop offset="1" stop-color="#a76b32"/></linearGradient></defs><circle cx="24" cy="26" r="21" fill="#774a23"/><circle cx="24" cy="23" r="21" fill="url(#chip-gold-${i})" stroke="#efc68b"/><circle cx="24" cy="23" r="18" fill="none" stroke="#83552d" stroke-width="5" stroke-dasharray="8 6"/><circle cx="24" cy="23" r="13" fill="none" stroke="#fff0cc" stroke-opacity=".75"/><circle cx="24" cy="23" r="11" fill="#d29b57"/><path d="M24 13c-2 4-9 7-9 12 0 5 6 6 8 2-1 5-3 6-4 7h10c-1-1-3-2-4-7 2 4 8 3 8-2 0-5-7-8-9-12Z" fill="#73502c"/><path d="M8 13A20 20 0 0 1 34 5" fill="none" stroke="#fff1ce" stroke-width="1.3" stroke-linecap="round"/></svg>`;
        root.append(chip);
        const x = ((i % 2 ? 1 : -1) * (32 + i * 10)), end = (i - (small ? 1.5 : 3.5)) * 4;
        animate(chip, [
          { opacity: 0, transform: 'translate3d(-50%, -50%, 0) rotate(-20deg) scale(.55)' },
          { opacity: 1, transform: `translate3d(calc(-50% + ${x}px), calc(-50% - ${34 + i * 3}px), 0) rotate(${i * 27}deg) scale(1)`, offset: .34 },
          { opacity: 1, transform: `translate3d(calc(-50% + ${end}px), calc(-50% + ${height * .41}px), 0) rotate(${160 + i * 34}deg) scale(.76)`, offset: .86 },
          { opacity: 0, transform: `translate3d(calc(-50% + ${end}px), calc(-50% + ${height * .44}px), 0) rotate(220deg) scale(.3)` },
        ], { duration: 1060, delay: 120 + i * 54, easing: 'cubic-bezier(.2,.55,.35,1)' });
      }
      for (let i = 0; i < (small ? 5 : 18); i++) {
        const particle = doc.createElement('i'); particle.className = `victory-particle${i % 4 === 0 ? ' ember' : ''}`;
        particle.setAttribute('aria-hidden', 'true'); root.append(particle);
        const angle = i * 2.39996, radius = Math.min(width * .36, 125) * (.55 + i % 3 * .19);
        const x = Math.cos(angle) * radius, y = Math.sin(angle) * radius * .82;
        animate(particle, [{ opacity: 0, transform: `translate(${x * .5}px,${y * .5}px) scale(.5)` }, { opacity: .8, offset: .2 }, { opacity: 0, transform: `translate(${x}px,${y - 22}px) scale(0)` }], { duration: 1250 + i % 4 * 110, delay: i * 24, easing: 'ease-out' });
      }
      const stack = host.querySelector('.hero-stack');
      if (stack) animate(stack, [{ boxShadow: '0 0 0 0 #ffcb7400' }, { boxShadow: '0 0 20px 2px #ffcb7444', offset: .35 }, { boxShadow: '0 0 0 0 #ffcb7400' }], { duration: 800, delay: 880 });
    }
    timer = setTimeout(cancel, victoryStyle.duration);
  }
  return { play, cancel };
}
