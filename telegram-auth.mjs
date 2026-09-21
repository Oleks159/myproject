import { createHmac, timingSafeEqual } from 'node:crypto';

export class TelegramAuthError extends Error {
  constructor(message, status = 401) { super(message); this.status = status; }
}

export function validateTelegramInitData(initData, botToken, options = {}) {
  if (typeof initData !== 'string' || !initData || initData.length > 8192) throw new TelegramAuthError('Telegram-Anmeldung fehlt.');
  if (typeof botToken !== 'string' || !botToken) throw new Error('TELEGRAM_BOT_TOKEN fehlt.');
  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash');
  if (!receivedHash || !/^[a-f0-9]{64}$/i.test(receivedHash)) throw new TelegramAuthError('Telegram-Signatur fehlt.');
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secret).update(dataCheckString).digest();
  const actual = Buffer.from(receivedHash, 'hex');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new TelegramAuthError('Telegram-Signatur ist ungültig.');

  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const authDate = Number(params.get('auth_date'));
  const maxAgeSeconds = options.maxAgeSeconds ?? 3600;
  if (!Number.isSafeInteger(authDate) || authDate > nowSeconds + 30 || nowSeconds - authDate > maxAgeSeconds) throw new TelegramAuthError('Telegram-Anmeldung ist abgelaufen.');
  let user;
  try { user = JSON.parse(params.get('user') || ''); } catch { throw new TelegramAuthError('Telegram-Nutzer ist ungültig.'); }
  if (!Number.isSafeInteger(user?.id) || user.id <= 0) throw new TelegramAuthError('Telegram-Nutzer fehlt.');
  return { user, authDate, queryId: params.get('query_id') || null, startParam: params.get('start_param') || null };
}

export function telegramInitDataFromRequest(req) {
  const value = req.headers['x-telegram-init-data'];
  if (Array.isArray(value)) return value[0] || '';
  return typeof value === 'string' ? value : '';
}
