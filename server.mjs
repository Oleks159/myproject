import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as d from './domain.mjs';
import { config } from './config.mjs';
import { BotEngine } from './bot-engine.mjs';
import { telegramInitDataFromRequest, validateTelegramInitData } from './telegram-auth.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const clientRoot = process.env.TPF_CLIENT_ROOT || join(root, 'dist');
const mode = process.env.TPF_MODE === 'telegram' ? 'telegram' : 'preview';
const telegramMode = mode === 'telegram';
if (process.env.NODE_ENV === 'production' && process.env.TPF_ALLOW_DEMO_DEPLOYMENT !== '1') throw new Error('This is a Telegram-authenticated beta, not a production poker backend. Set TPF_ALLOW_DEMO_DEPLOYMENT=1 only for a closed demo.');
const port = Number(process.env.PORT || 8790);
const renderHostname = process.env.RENDER_EXTERNAL_HOSTNAME?.trim();
const localOrigin = `http://127.0.0.1:${port}`;
const origin = process.env.TPF_PUBLIC_ORIGIN?.trim() || (renderHostname ? `https://${renderHostname}` : localOrigin);
if (telegramMode && !origin) throw new Error('TPF_PUBLIC_ORIGIN fehlt.');
if (telegramMode && process.env.NODE_ENV !== 'test' && !origin.startsWith('https://')) throw new Error('TPF_PUBLIC_ORIGIN muss HTTPS verwenden.');
if (telegramMode && !process.env.TELEGRAM_BOT_TOKEN) throw new Error('TELEGRAM_BOT_TOKEN fehlt.');
const configuredHosts = process.env.TPF_ALLOWED_HOSTS?.split(',').map(value => value.trim()).filter(Boolean) || [];
const allowedHosts = new Set(configuredHosts.length ? configuredHosts : [new URL(origin).host, `127.0.0.1:${port}`, `localhost:${port}`]);
const allowedOrigins = new Set([origin, localOrigin, `http://localhost:${port}`]);
const bindHost = process.env.HOST || (renderHostname || telegramMode ? '0.0.0.0' : '127.0.0.1');
const dataDirectory = process.env.TPF_DATA_DIR || join(root, 'data');
mkdirSync(dataDirectory, { recursive: true });
const botEngine = new BotEngine(root, dataDirectory);
const db = new DatabaseSync(join(dataDirectory, 'preview.sqlite'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS receipts(account_id TEXT NOT NULL, command_id TEXT NOT NULL, request TEXT NOT NULL, response TEXT NOT NULL, PRIMARY KEY(account_id,command_id));
CREATE TABLE IF NOT EXISTS telegram_referrals(telegram_id TEXT PRIMARY KEY, referral_code TEXT NOT NULL, captured_at INTEGER NOT NULL);`);
const get = db.prepare('SELECT json FROM accounts WHERE id = ?');
const put = db.prepare('INSERT INTO accounts(id,json) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET json=excluded.json');
const receipt = db.prepare('SELECT * FROM receipts WHERE account_id=? AND command_id=?');
const saveReceipt = db.prepare('INSERT INTO receipts VALUES(?,?,?,?)');
const pendingTelegramReferral = db.prepare('SELECT referral_code FROM telegram_referrals WHERE telegram_id=?');
const accountByReferralCode = db.prepare("SELECT json FROM accounts WHERE json_extract(json,'$.referralCode')=? LIMIT 1");
const save = a => put.run(a.id, JSON.stringify(a));
function attachPendingReferral(a, telegramIdentity, now) {
  const pending = pendingTelegramReferral.get(String(telegramIdentity.user.id));
  const code = pending?.referral_code?.match(/^ref_([A-Za-z0-9]{4,64})$/)?.[1];
  if (!code || a.referrerId) return;
  const row = accountByReferralCode.get(code);
  if (!row) return;
  const referrer = JSON.parse(row.json);
  if (referrer.id === a.id || referrer.referrerId === a.id) return;
  a.referrerId = referrer.id;
  referrer.directReferrals ||= [];
  if (!referrer.directReferrals.some(item => item.id === a.id)) referrer.directReferrals.push({ id: a.id,
    username: telegramIdentity.user.username ? `@${telegramIdentity.user.username}` : telegramIdentity.user.first_name || 'Friend',
    qualified: false, qualifiedHands: 0, seasonQualifiedApUnits: '0', rewardForOwnerUnits: '0' });
  d.ledger(referrer, 'Info', 0, 'Direkter Referral verknüpft', now, 'REFERRAL_LINKED', a.id);
  save(referrer);
}
function snapshotWithReferrals(a, now) {
  d.normalizeAccount(a, now);
  for (const referral of a.directReferrals || []) {
    const row = get.get(referral.id);
    if (!row) continue;
    const player = JSON.parse(row.json); d.normalizeAccount(player, now);
    referral.username = player.telegram?.username ? `@${player.telegram.username}` : player.name;
    referral.league = player.league; referral.qualifiedHands = player.stats.qualifiedHands;
    referral.qualified = player.stats.qualifiedHands >= config.activationHands || player.stats.cycles > 0;
    referral.earningRateUnits = player.rateUnits;
    referral.earningStatus = player.cycle && now < player.cycle.end ? 'active' : referral.qualified ? 'inactive' : 'qualifying';
    referral.cycleRemainingMs = referral.earningStatus === 'active' ? player.cycle.end - now : 0;
  }
  return d.snapshot(a, now);
}
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

function serveClientFile(pathname, res) {
  const rootPath = resolve(clientRoot);
  const relativePath = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  let filePath = resolve(clientRoot, relativePath);
  if (filePath !== rootPath && !filePath.startsWith(`${rootPath}${sep}`)) return false;
  if ((!existsSync(filePath) || !statSync(filePath).isFile()) && !extname(relativePath) && !relativePath.endsWith('/')) filePath = join(clientRoot, 'index.html');
  if (!existsSync(filePath) || !statSync(filePath).isFile()) return false;
  res.writeHead(200, { 'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
  return true;
}

async function body(req) {
  let s = '';
  for await (const chunk of req) { s += chunk; if (Buffer.byteLength(s) > 16000) throw new d.RuleError('Anfrage zu groß.', 413); }
  try { return JSON.parse(s || '{}'); } catch { throw new d.RuleError('Ungültige Anfrage.', 400); }
}
function send(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
export const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; base-uri 'self'");
  try {
    if (!allowedHosts.has(req.headers.host)) throw new d.RuleError('Host nicht erlaubt.', 403);
    const url = new URL(req.url, origin);
    if (req.method === 'GET' && !url.pathname.startsWith('/api/') && serveClientFile(url.pathname, res)) return;
    if (!url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Nicht gefunden.' });
    if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) throw new d.RuleError('Fremde Herkunft abgewiesen.', 403);
    let id, a, telegramIdentity;
    if (telegramMode) {
      telegramIdentity = validateTelegramInitData(telegramInitDataFromRequest(req), process.env.TELEGRAM_BOT_TOKEN, {
        maxAgeSeconds: Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE || 3600)
      });
      id = `telegram-${telegramIdentity.user.id}`;
      const saved = get.get(id);
      a = saved ? JSON.parse(saved.json) : d.account('new');
      a.id = id;
      a.name = telegramIdentity.user.first_name || telegramIdentity.user.username || a.name;
      a.telegram = { id: telegramIdentity.user.id, username: telegramIdentity.user.username || null, firstName: telegramIdentity.user.first_name || null, photoUrl: telegramIdentity.user.photo_url || null };
      d.normalizeAccount(a, Date.now() + a.offset);
      if (!saved) attachPendingReferral(a, telegramIdentity, Date.now() + a.offset);
      save(a);
    } else {
      id = req.headers.cookie?.match(/(?:^|;\s*)tpf_session=([a-z0-9-]+)/)?.[1];
      const saved = id && get.get(id);
      a = saved ? JSON.parse(saved.json) : d.account();
      if (!id || a.id !== id) {
        save(a); res.setHeader('Set-Cookie', `tpf_session=${a.id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);
      }
    }
    if (url.pathname.startsWith('/api/bots/')) {
      if (req.method === 'GET' && url.pathname === '/api/bots/catalog') return send(res, 200, await botEngine.request('catalog'));
      if (req.method === 'GET' && url.pathname === '/api/bots/state') return send(res, 200, await botEngine.request('state', a.id, url.searchParams.get('tier')));
      if (req.method === 'GET' && url.pathname === '/api/bots/hand') return send(res, 200, await botEngine.request('hand', a.id, url.searchParams.get('tier'), { hand_id: url.searchParams.get('hand') }));
      if (req.method !== 'POST' || req.headers['x-tpf-request'] !== mode || !req.headers['content-type']?.startsWith('application/json') || req.headers['sec-fetch-site'] === 'cross-site') throw new d.RuleError('Ungültiger Bot-Befehl.', 400);
      const command = url.pathname.slice('/api/bots/'.length);
      if (!['next', 'action', 'reset'].includes(command)) throw new d.RuleError('Nicht gefunden.', 404);
      const b = await body(req);
      const botResult = await botEngine.request(command, a.id, b.tier, b);
      db.exec('BEGIN IMMEDIATE');
      try {
        a = JSON.parse(get.get(a.id).json);
        const now = Date.now() + a.offset;
        const settlement = d.recordBotHand(a, botResult.state, botResult.tier, now);
        botResult.settlement = settlement;
        botResult.account = snapshotWithReferrals(a, now);
        save(a); db.exec('COMMIT');
      } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
      return send(res, 200, botResult);
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      db.exec('BEGIN IMMEDIATE');
      try { const result = snapshotWithReferrals(a, Date.now() + a.offset); save(a); db.exec('COMMIT'); return send(res, 200, result); }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    }
    if (req.method !== 'POST' || req.headers['x-tpf-request'] !== mode || !req.headers['content-type']?.startsWith('application/json')) throw new d.RuleError('Ungültiger Befehl.', 400);
    const b = await body(req);
    if (!/^[a-zA-Z0-9-]{8,100}$/.test(b.commandId || '')) throw new d.RuleError('Befehls-ID fehlt.', 400);
    const fingerprint = JSON.stringify({ route: url.pathname, body: b });
    db.exec('BEGIN IMMEDIATE');
    try {
      const old = receipt.get(a.id, b.commandId);
      if (old) {
        if (old.request !== fingerprint) throw new d.RuleError('Befehls-ID wurde mit anderen Daten wiederverwendet.');
        db.exec('COMMIT'); return send(res, 200, JSON.parse(old.response));
      }
      a = JSON.parse(get.get(a.id).json);
      const now = Date.now() + a.offset;
      let result = null;
      switch (url.pathname) {
        case '/api/faucet/claim': d.claimFaucet(a, now); break;
        case '/api/daily/claim': result = d.claimDailyReward(a, now); break;
        case '/api/earning/start': d.startCycle(a, now); break;
        case '/api/earning/claim': d.claimCycle(a, now); break;
        case '/api/table/join': d.enterTable(a, b.stake, now); break;
        case '/api/table/action':
          if (b.handId !== a.table?.handId) throw new d.RuleError('Diese Aktion gehört zu einer älteren Hand.');
          result = d.tableAction(a, b.action, b.amount, now); break;
        case '/api/table/next': d.nextHand(a, now); break;
        case '/api/table/leave': d.leaveTable(a, now); break;
        case '/api/mission/claim': d.claimMission(a, b.id, now); break;
        case '/api/settings':
          if (typeof b.haptics === 'boolean') a.settings.haptics = b.haptics;
          if (typeof b.reducedMotion === 'boolean') a.settings.reducedMotion = b.reducedMotion;
          break;
        case '/api/demo/advance':
          if (b.hours !== 6) throw new d.RuleError('Nur der markierte Demo-Zeitsprung ist erlaubt.');
          a.offset += 21600000; break;
        case '/api/demo/scenario': {
          if (!['new', 'ready', 'active', 'claimable'].includes(b.scenario)) throw new d.RuleError('Unbekanntes Demo-Szenario.');
          const fresh = d.account(b.scenario); fresh.id = a.id; a = fresh; break;
        }
        default: throw new d.RuleError('Nicht gefunden.', 404);
      }
      const response = { state: snapshotWithReferrals(a, Date.now() + a.offset), result };
      save(a); saveReceipt.run(a.id, b.commandId, fingerprint, JSON.stringify(response));
      db.exec('COMMIT'); send(res, 200, response);
    } catch (e) { if (db.isTransaction) db.exec('ROLLBACK'); throw e; }
  } catch (e) { send(res, e.status || 500, { error: e.status ? e.message : 'Die Vorschau konnte die Anfrage nicht verarbeiten.' }); }
});
server.listen(port, bindHost, () => {
  console.log(`TokenPokerFarm ${mode}: ${origin} (${telegramMode ? 'verified Telegram beta' : 'local preview'})`);
  if (process.env.TPF_BOTS_DISABLED !== '1') botEngine.start().then(() => console.log('EURO6 models ready; bot tables share one model cache.')).catch(error => console.error(error.message));
});
server.on('close', () => botEngine.close());
process.on('exit', () => botEngine.close());
