import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

test('HTTP contract: persistence, idempotency, isolation, security and rollback', { timeout: 30000 }, async t => {
  const cwd = fileURLToPath(new URL('..', import.meta.url));
  const directory = mkdtempSync(join(tmpdir(), 'token-poker-farm-test-'));
  const port = 19000 + Math.floor(Math.random() * 20000), origin = `http://127.0.0.1:${port}`;
  const previewOrigin = 'https://preview.example.test';
  let child;
  const start = async () => {
    child = spawn(process.execPath, ['server.mjs'], { cwd, env: { ...process.env, PORT: String(port), TPF_DATA_DIR: directory, NODE_ENV: 'test', TPF_ALLOWED_ORIGINS: previewOrigin }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('server startup timeout')), 8000);
      child.stdout.on('data', chunk => { if (String(chunk).includes('preview:')) { clearTimeout(timer); resolve(); } });
      child.once('error', e => { clearTimeout(timer); reject(e); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}`)); });
    });
  };
  const stop = async () => { if (child && child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); child.kill(); }); };
  t.after(stop); await start();
  const initial = await fetch(`${origin}/api/state`);
  const cookie = initial.headers.get('set-cookie').split(';')[0];
  const state = await initial.json();
  const headers = { cookie, 'Content-Type': 'application/json', 'X-TPF-Request': 'preview' };
  const post = (path, data = {}, commandId = randomUUID(), extra = {}) => fetch(`${origin}/api/${path}`, { method: 'POST', headers: { ...headers, ...extra }, body: JSON.stringify({ ...data, commandId }) });
  const get = async () => (await fetch(`${origin}/api/state`, { headers: { cookie } })).json();

  await t.test('HTML and module are served with content type and CSP', async () => {
    const page = await fetch(origin); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
    const module = await fetch(origin + '/legacy/app.mjs'); assert.equal(module.status, 200); assert.match(module.headers.get('content-type'), /javascript/);
    const pageMarkup = await page.text();
    assert.match(pageMarkup, /href="\/styles\/aurora.css"/);
    for (const file of ['legacy/victory.mjs', 'styles/victory.css', 'styles/table.css', 'styles/aurora.css']) assert.equal((await fetch(`${origin}/${file}`)).status, 200);
  });
  await t.test('daily reward command replays exactly once; conflicts reject', async () => {
    const id = randomUUID(); const first = await (await post('daily/claim', {}, id)).json();
    const second = await (await post('daily/claim', {}, id)).json();
    assert.deepEqual(second, first); assert.equal((await get()).chips, first.state.chips);
    assert.ok(first.result > 0); assert.equal(first.state.chips, state.chips + first.result);
    assert.equal((await post('earning/start', {}, id)).status, 409);
    assert.equal((await post('daily/claim')).status, 409);
    assert.equal((await get()).chips, first.state.chips); // Rollback left connection usable.
  });
  await t.test('cross-origin and missing command header are rejected', async () => {
    assert.equal((await post('earning/start', {}, randomUUID(), { Origin: 'https://example.invalid' })).status, 403);
    assert.equal((await post('earning/start', {}, randomUUID(), { 'X-TPF-Request': '' })).status, 400);
  });
  await t.test('approved hosted preview gets CORS and a persistent header session', async () => {
    const preflight = await fetch(`${origin}/api/state`, { method: 'OPTIONS', headers: {
      Origin: previewOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'x-tpf-request,x-tpf-session'
    } });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), previewOrigin);
    assert.match(preflight.headers.get('access-control-allow-headers'), /X-TPF-Session/i);
    const first = await fetch(`${origin}/api/state`, { headers: { Origin: previewOrigin, 'X-TPF-Request': 'preview' } });
    assert.equal(first.status, 200);
    const previewSession = first.headers.get('x-tpf-session');
    assert.match(previewSession, /^[a-z0-9-]{8,100}$/);
    const firstState = await first.json();
    const second = await fetch(`${origin}/api/state`, { headers: { Origin: previewOrigin, 'X-TPF-Request': 'preview', 'X-TPF-Session': previewSession } });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).id, firstState.id);
  });
  await t.test('separate local browser session cannot read another account', async () => {
    const other = await (await fetch(`${origin}/api/state`)).json();
    assert.notEqual(other.id, state.id); assert.equal(other.chips, state.chips);
  });
  await t.test('active cycle advances, claims exactly once, and cannot auto restart', async () => {
    assert.equal((await post('earning/start')).status, 200);
    assert.equal((await post('earning/claim')).status, 409);
    assert.equal((await post('demo/advance', { hours: 6 })).status, 200);
    const before = await get(), id = randomUUID();
    const after = await (await post('earning/claim', {}, id)).json();
    await post('earning/claim', {}, id);
    assert.equal((await get()).apUnits, after.state.apUnits);
    assert.equal(after.state.rateUnits, before.rateUnits); assert.equal(after.state.activation, 0);
    assert.equal((await post('earning/start')).status, 409);
  });
  await t.test('stale hand IDs rejected, duplicate click cannot settle twice', async () => {
    await post('table/join', { stake: 'micro' });
    assert.equal((await post('table/action', { handId: 'stale', action: 'call' })).status, 409);
    const before = await get(), id = randomUUID(), payload = { handId: before.table.handId, action: 'call' };
    const result = await (await post('table/action', payload, id)).json();
    await post('table/action', payload, id);
    assert.equal((await get()).table.stack, result.state.table.stack);
    assert.equal((await post('table/action', payload)).status, 409);
  });
  await t.test('SQLite account survives a server restart', async () => {
    const before = await get(); await stop(); await start(); const after = await get();
    assert.equal(after.id, before.id); assert.equal(after.apUnits, before.apUnits); assert.equal(after.chips, before.chips); assert.equal(after.table.stack, before.table.stack);
  });
});
