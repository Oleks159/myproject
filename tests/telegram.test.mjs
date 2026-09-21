import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { handleUpdate, parseCommand } from '../telegram-bot.mjs';
import { TelegramAuthError, validateTelegramInitData } from '../telegram-auth.mjs';

const token = '123456789:integration-test-token';
function signedInitData({ user = { id: 991, first_name: 'Alex', username: 'noir_player' }, authDate = 1_800_000_000, startParam = 'ref_42' } = {}) {
  const params = new URLSearchParams({ auth_date: String(authDate), query_id: 'AAH-test', user: JSON.stringify(user) });
  if (startParam) params.set('start_param', startParam);
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(token).digest();
  params.set('hash', createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}

test('Telegram initData is authenticated and parsed', () => {
  const identity = validateTelegramInitData(signedInitData(), token, { now: 1_800_000_500_000, maxAgeSeconds: 600 });
  assert.equal(identity.user.id, 991);
  assert.equal(identity.user.username, 'noir_player');
  assert.equal(identity.startParam, 'ref_42');
});

test('Telegram initData rejects tampering and expiration', () => {
  const valid = signedInitData();
  assert.throws(() => validateTelegramInitData(valid.replace('noir_player', 'attacker'), token, { now: 1_800_000_500_000 }), TelegramAuthError);
  assert.throws(() => validateTelegramInitData(valid, token, { now: 1_800_004_000_000, maxAgeSeconds: 3600 }), /abgelaufen/);
});

test('bot commands are scoped to the configured bot', () => {
  assert.deepEqual(parseCommand('/start ref_alex', 'No_RakePokerbot'), { command: 'start', parameter: 'ref_alex' });
  assert.deepEqual(parseCommand('/help@No_RakePokerbot', 'No_RakePokerbot'), { command: 'help', parameter: null });
  assert.equal(parseCommand('/start@OtherBot', 'No_RakePokerbot'), null);
});

test('/start records referral and returns a Telegram Web App button', async () => {
  const calls = [], referrals = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const handled = await handleUpdate({ message: { text: '/start ref_alex', chat: { id: 7 }, from: { id: 991 } } }, {
    token, appUrl: 'https://poker.example/app', botUsername: 'No_RakePokerbot', fetch: fakeFetch,
    recordReferral: (user, code) => referrals.push({ user, code })
  });
  assert.equal(handled, true);
  assert.deepEqual(referrals, [{ user: { id: 991 }, code: 'ref_alex' }]);
  assert.equal(calls[0].body.chat_id, 7);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://poker.example/app');
});
