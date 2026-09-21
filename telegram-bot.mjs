import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = process.env.TELEGRAM_WEBAPP_URL;
const expectedUsername = (process.env.TELEGRAM_BOT_USERNAME || 'No_RakePokerbot').replace(/^@/, '');
const apiBase = process.env.TELEGRAM_API_BASE || 'https://api.telegram.org';

export async function callTelegram(method, payload, options = {}) {
  const botToken = options.token || token;
  if (!botToken) throw new Error('TELEGRAM_BOT_TOKEN fehlt.');
  const response = await (options.fetch || fetch)(`${options.apiBase || apiBase}/bot${botToken}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(35000)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method}: ${result.description || response.status}`);
  return result.result;
}

export function parseCommand(text, botUsername = expectedUsername) {
  const match = String(text || '').trim().match(/^\/(start|help)(?:@([A-Za-z0-9_]+))?(?:\s+([^\s]{1,64}))?\s*$/i);
  if (!match || (match[2] && match[2].toLowerCase() !== botUsername.toLowerCase())) return null;
  return { command: match[1].toLowerCase(), parameter: match[3] || null };
}

export async function handleUpdate(update, options = {}) {
  const message = update?.message;
  const command = parseCommand(message?.text, options.botUsername || expectedUsername);
  if (!message?.chat?.id || !command) return false;
  const webAppUrl = options.appUrl || appUrl;
  if (!/^https:\/\//i.test(webAppUrl || '')) throw new Error('TELEGRAM_WEBAPP_URL muss eine öffentliche HTTPS-Adresse sein.');
  if (command.command === 'start' && command.parameter && options.recordReferral) {
    options.recordReferral(message.from, command.parameter);
  }
  const help = command.command === 'help';
  await callTelegram('sendMessage', {
    chat_id: message.chat.id,
    text: help
      ? 'Öffne die Poker-App über den Button. Dort findest du Spielregeln, Earning-Zyklen und deinen Fortschritt.'
      : 'Willkommen bei Velvet & Noir. Öffne die Poker-App und spiele direkt in Telegram.',
    reply_markup: { inline_keyboard: [[{ text: '♠ Poker-App öffnen', web_app: { url: webAppUrl } }]] }
  }, options);
  return true;
}

export async function configureBot(options = {}) {
  const webAppUrl = options.appUrl || appUrl;
  if (!/^https:\/\//i.test(webAppUrl || '')) throw new Error('TELEGRAM_WEBAPP_URL muss eine öffentliche HTTPS-Adresse sein.');
  const me = await callTelegram('getMe', {}, options);
  if ((options.botUsername || expectedUsername) && me.username?.toLowerCase() !== (options.botUsername || expectedUsername).toLowerCase()) {
    throw new Error(`Das Token gehört @${me.username}, erwartet wurde @${options.botUsername || expectedUsername}.`);
  }
  await callTelegram('setMyCommands', { commands: [{ command: 'start', description: 'Poker-App öffnen' }, { command: 'help', description: 'Hilfe anzeigen' }] }, options);
  await callTelegram('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Poker spielen', web_app: { url: webAppUrl } } }, options);
  return me;
}

export async function runPollingBot(options = {}) {
  const dataDirectory = process.env.TPF_DATA_DIR || join(root, 'data');
  mkdirSync(dataDirectory, { recursive: true });
  const db = new DatabaseSync(join(dataDirectory, 'preview.sqlite'));
  db.exec('CREATE TABLE IF NOT EXISTS telegram_referrals(telegram_id TEXT PRIMARY KEY, referral_code TEXT NOT NULL, captured_at INTEGER NOT NULL)');
  const saveReferral = db.prepare('INSERT OR IGNORE INTO telegram_referrals VALUES(?,?,?)');
  const me = await configureBot(options);
  console.log(`Telegram bot @${me.username} ist bereit.`);
  let offset = 0;
  while (true) {
    try {
      const updates = await callTelegram('getUpdates', { offset, timeout: Number(process.env.TELEGRAM_POLL_TIMEOUT || 25), allowed_updates: ['message'] }, options);
      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        await handleUpdate(update, { ...options, recordReferral: (from, code) => {
          if (from?.id && /^[A-Za-z0-9_-]{1,64}$/.test(code)) saveReferral.run(String(from.id), code, Date.now());
        }});
      }
    } catch (error) {
      console.error(error.message);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) runPollingBot().catch(error => { console.error(error.message); process.exitCode = 1; });
