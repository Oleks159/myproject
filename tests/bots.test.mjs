import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { canRevealSeat, seatPortrait } from '../public/legacy/bots.mjs';

test('every active opponent seat has one two-card pair, never two pairs', () => {
  for (let index = 0; index < 5; index++) {
    const active = seatPortrait(index, true);
    const folded = seatPortrait(index, false);
    assert.match(active, /data-card-backs="2"/);
    assert.ok((active.match(/single-card-back/g) || []).length <= 2);
    assert.match(folded, /data-card-backs="0"/);
    assert.equal((folded.match(/single-card-back/g) || []).length, 0);
  }
});

test('table reveals only live opponents at a real showdown', () => {
  const showdown = { status:'finished', showdown:true };
  assert.equal(canRevealSeat(showdown, { folded:false, cards:['As','Kd'] }), true);
  assert.equal(canRevealSeat(showdown, { folded:true, cards:null }), false);
  assert.equal(canRevealSeat({ status:'finished', showdown:false }, { folded:false, cards:null }), false);
  assert.equal(canRevealSeat({ status:'hero_turn', showdown:false }, { folded:false, cards:['As','Kd'] }), false);
});

test('bot HTTP: real hands, isolated accounts, legal moves, retry and process restart', { timeout: 45000 }, async t => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const data = mkdtempSync(join(tmpdir(), 'tpf-bot-http-'));
  const port = 21000 + Math.floor(Math.random() * 15000), base = `http://127.0.0.1:${port}`;
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['server.mjs'], { cwd, windowsHide: true,
      env: { ...process.env, PORT: String(port), TPF_DATA_DIR: data, NODE_ENV: 'test', TPF_BOTS_DISABLED: '0' }, stdio: ['ignore','pipe','pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Bot startup timeout')), 10000);
      child.stdout.on('data', chunk => { if (String(chunk).includes('models ready')) { clearTimeout(timer); resolve(); } });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
      child.stderr.on('data', chunk => { if (String(chunk).includes('Traceback')) process.stderr.write(chunk); });
    });
  };
  const stop = async () => { if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); };
  t.after(stop);
  await start();
  const accountResponse = await fetch(`${base}/api/state`);
  const beforeAccount = await accountResponse.json();
  const cookie = accountResponse.headers.get('set-cookie').split(';')[0];
  const headers = { cookie, 'X-TPF-Request': 'preview', 'Content-Type': 'application/json' };
  const get = async path => { const r = await fetch(`${base}/api/bots/${path}`, { headers }); assert.equal(r.status, 200); return r.json(); };
  const post = (action, payload, extra = {}) => fetch(`${base}/api/bots/${action}`, { method:'POST', headers: { ...headers, ...extra }, body:JSON.stringify(payload) });
  const catalog = await get('catalog');
  assert.equal(catalog.tiers.length, 7); assert.equal(catalog.bots, 5); assert.equal(catalog.mode, 'practice');
  assert.equal('profiles' in catalog, false); assert.equal('model_count' in catalog, false);
  for (const file of ['legacy/bots.mjs','styles/bots.css','styles/progress.css','assets/cash-tables-reference.png','assets/bot-table-arena-reference-v4.png','assets/progress-reference-source-v1.png']) assert.equal((await fetch(`${base}/${file}`)).status, 200);
  for (const path of ['bot_engine/worker.py','data/bot_tables/','bot-engine.mjs']) assert.equal((await fetch(`${base}/${path}`)).status, 404);
  const begin = { tier:'micro', request_id:randomUUID(), revision:0 };
  let result = await post('next', begin); assert.equal(result.status, 200);
  let state = (await result.json()).state;
  assert.equal(state.small_blind,5); assert.equal(state.big_blind,10);
  assert.deepEqual((await (await post('next',begin)).json()).state, state);
  assert.equal((await post('next',{ ...begin, profile:'mixed' })).status,400);
  assert.equal((await post('action',{ tier:'micro', revision:state.revision, request_id:randomUUID(),action:'call' }, { Origin:'https://example.invalid' })).status,403);
  assert.equal((await post('action',{ tier:'micro', revision:state.revision, request_id:randomUUID(),action:'call' }, { 'X-TPF-Request':'' })).status,400);
  const other = await (await fetch(`${base}/api/bots/state?tier=micro`)).json();
  assert.equal(other.state.status,'empty');
  assert.equal((await get('state?tier=legend')).state.status,'empty');
  if (state.status === 'hero_turn') {
    assert.ok(state.seats.slice(1).every(s => s.cards === null));
    assert.equal(state.seats[0].cards.length,2);
  }
  for (let i=0; state.status !== 'finished' && i<100; i++) {
    const payload = { tier:'micro', revision:state.revision, request_id:randomUUID(), action:state.legal_actions.includes('check')?'check':'call' };
    const response = await post('action',payload); assert.equal(response.status,200);
    const next = (await response.json()).state;
    assert.equal(next.revision,state.revision+1);
    assert.deepEqual((await (await post('action',payload)).json()).state,next);
    state = next;
  }
  assert.equal(state.status,'finished');
  const finishedState = state;
  assert.equal(state.showdown, state.board.length === 5 && state.seats.filter(s=>!s.folded).length > 1);
  for (const seat of state.seats) {
    const shouldReveal = seat.seat === 0 || (state.showdown && !seat.folded);
    assert.equal(seat.revealed, shouldReveal);
    assert.equal(Array.isArray(seat.cards), shouldReveal);
    if (shouldReveal) assert.equal(seat.cards.length,2);
  }
  const completed = await get(`hand?tier=micro&hand=${state.hand_id}`);
  assert.equal(completed.hand.hand_id,state.hand_id); assert.ok(completed.hand.history.length>2);
  for (const seat of completed.hand.seats) {
    const shouldReveal = seat.seat === 0 || (completed.hand.showdown && !seat.folded);
    assert.equal(Array.isArray(seat.cards), shouldReveal);
  }
  const ending = state.seats.map(s=>s.stack);
  const resumeRequest = { tier:'micro', request_id:randomUUID(), revision:state.revision, rebuy_hero:true };
  state = (await (await post('next',resumeRequest)).json()).state;
  assert.deepEqual(state.starting_stacks,ending.map(n=>n || 1000));
  await stop(); await start();
  assert.deepEqual((await get('state?tier=micro')).state,state);
  assert.deepEqual((await (await post('next',resumeRequest)).json()).state,state);
  const afterAccount = await (await fetch(`${base}/api/state`,{ headers })).json();
  assert.equal(afterAccount.chips,beforeAccount.chips + Math.round(finishedState.payoff_bb * finishedState.big_blind));
  assert.equal(afterAccount.activation, Math.min(afterAccount.config.activationHands, beforeAccount.activation + 1));
  assert.equal(afterAccount.apUnits,beforeAccount.apUnits);
});
