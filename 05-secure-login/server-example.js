'use strict';
/* =========================================================
   ЦИТАДЕЛЬ — проверка кода на сервере (пример для рабочего сайта).

   Демо-страница проверяет код прямо в браузере, чтобы анимация
   работала без сервера. На настоящем сайте так делать нельзя:
   секрет, лежащий в браузере, может прочитать кто угодно. Правильно так:

     1. Пользователь вводит почту и пароль. Сервер проверяет пароль и
        заводит «полусессию»: пароль верный, но вход ещё не выдан.
     2. Браузер присылает шесть цифр. Сервер берёт секрет ЭТОГО
        пользователя из базы и сверяет код. Только после этого
        выдаётся настоящая сессия.

   В примере один пользователь, секрет берётся из переменной окружения.
   Нужен Node 18 или новее, зависимостей нет.

   Запуск:
     TOTP_SECRET=ВАШ_КЛЮЧ_BASE32 node server-example.js
     node server-example.js --selftest      # проверка по векторам RFC 6238
   Запрос:
     curl -X POST http://127.0.0.1:8787/api/2fa -H "Content-Type: application/json" -d "{\"code\":\"123456\"}"
   ========================================================= */
const http = require('node:http');
const crypto = require('node:crypto');

const STEP = 30, DIGITS = 6, WINDOW = 1;   // окно ±1: часы телефона могут расходиться на 30 с
const MAX_FAILS = 5;                        // ошибок подряд до блокировки аккаунта
const IP_LIMIT = 20;                        // ошибок с одного адреса за период
const IP_PERIOD = 15 * 60e3;                // 15 минут

/* ---------- TOTP (RFC 6238) ---------- */
function base32ToBuffer(str) {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const out = [];
  for (const ch of str.toUpperCase().replace(/[\s=]/g, '')) {
    const v = abc.indexOf(ch);
    if (v < 0) throw new Error('Ключ не в формате Base32');
    value = ((value << 5) | v) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

function hotp(key, counter, digits = DIGITS) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const off = h[h.length - 1] & 15;
  const num = h.readUInt32BE(off) & 0x7fffffff;
  return String(num % 10 ** digits).padStart(digits, '0');
}

// Сравнение за одинаковое время: по скорости ответа нельзя угадать совпавшие цифры
function safeEqual(a, b) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Проверяем все окна без раннего выхода, чтобы время ответа не выдавало, какое совпало
function verifyTotp(key, code, lastCounter, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: 'format' };
  const current = Math.floor(now / 1000 / STEP);
  let match = null;
  for (let d = -WINDOW; d <= WINDOW; d++) {
    if (safeEqual(hotp(key, current + d), code)) match = current + d;
  }
  if (match === null) return { ok: false, reason: 'mismatch' };
  if (lastCounter !== null && match <= lastCounter) return { ok: false, reason: 'replay' };
  return { ok: true, counter: match, drift: match - current };
}

/* ---------- попытки и блокировки ----------
   В жизни это поля пользователя в базе данных. В памяти их можно
   держать только в примере: после перезапуска всё обнуляется. */
const ipFails = new Map();   // адрес -> времена неудачных попыток

function newUser(key) { return { key, lastCounter: null, fails: 0, lockLevel: 0, lockedUntil: 0 }; }

function tryCode(user, ip, code, now = Date.now()) {
  const recent = (ipFails.get(ip) || []).filter((t) => now - t < IP_PERIOD);
  ipFails.set(ip, recent);
  if (recent.length >= IP_LIMIT) {
    return { status: 429, error: 'Слишком много попыток с вашего адреса. Попробуйте позже', retryAfter: Math.ceil((recent[0] + IP_PERIOD - now) / 1000) };
  }
  if (now < user.lockedUntil) {
    return { status: 429, error: 'Вход временно заблокирован', retryAfter: Math.ceil((user.lockedUntil - now) / 1000) };
  }

  const res = verifyTotp(user.key, typeof code === 'string' ? code : '', user.lastCounter, now);
  if (res.ok) {
    user.lastCounter = res.counter;   // этот и более ранние коды больше не примут
    user.fails = 0;
    user.lockLevel = 0;
    return { status: 200, ok: true };
  }
  if (res.reason === 'replay') return { status: 401, error: 'Этот код уже использован. Дождитесь следующего' };

  recent.push(now);
  user.fails++;
  if (user.fails >= MAX_FAILS) {
    const secs = 30 * 2 ** user.lockLevel;           // 30 с, 60, 120… до 8 минут
    user.lockLevel = Math.min(user.lockLevel + 1, 4);
    user.lockedUntil = now + secs * 1000;
    user.fails = 0;
    return { status: 429, error: 'Вход временно заблокирован', retryAfter: secs };
  }
  // Не пишем, что именно не так: код, формат или что-то ещё — подсказки помогают подбору
  return { status: 401, error: 'Неверный код', attemptsLeft: MAX_FAILS - user.fails };
}

/* ---------- HTTP ---------- */
function send(res, status, body, extra) {
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }, extra));
  res.end(JSON.stringify(body));
}

function start() {
  let key;
  try { key = base32ToBuffer(process.env.TOTP_SECRET || ''); } catch (e) { key = Buffer.alloc(0); }
  if (key.length < 10) {
    console.error('Задайте TOTP_SECRET — ключ Base32 длиной от 16 символов');
    process.exit(1);
  }
  const user = newUser(key);

  http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/2fa') return send(res, 404, { error: 'Нет такого адреса' });
    // Только JSON. Заодно это защита от подделки запроса с чужого сайта:
    // обычная HTML-форма так отправить не может, а fetch с чужого домена
    // браузер остановит на предварительном запросе, на который мы не отвечаем.
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) return send(res, 415, { error: 'Нужен JSON' });

    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024) { send(res, 413, { error: 'Слишком большой запрос' }); req.destroy(); }
    });
    req.on('end', () => {
      let code;
      try { code = JSON.parse(body).code; } catch (e) { return send(res, 400, { error: 'Не удалось прочитать запрос' }); }
      // За Cloudflare настоящий адрес посетителя лежит в заголовке CF-Connecting-IP
      const ip = req.socket.remoteAddress;
      const { status, retryAfter, ...payload } = tryCode(user, ip, code);
      send(res, status, payload, retryAfter ? { 'Retry-After': String(retryAfter) } : undefined);
    });
  }).listen(8787, '127.0.0.1', () => console.log('Проверка кодов: POST http://127.0.0.1:8787/api/2fa'));
}

/* ---------- самопроверка ---------- */
function selftest() {
  const assert = require('node:assert');
  const key = Buffer.from('12345678901234567890');   // ключ из RFC 6238
  [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
   [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']]
    .forEach(([t, code]) => assert.strictEqual(hotp(key, Math.floor(t / STEP), 8), code, 'RFC 6238, T=' + t));
  assert.strictEqual(base32ToBuffer('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ').toString(), '12345678901234567890');

  const now = 1111111111 * 1000;
  const cur = Math.floor(now / 1000 / STEP);
  const codeAt = (c) => hotp(key, c);
  const wrong = (c) => codeAt(c) === '000000' ? '000001' : '000000';

  let u = newUser(key);
  assert.strictEqual(tryCode(u, 'a', codeAt(cur), now).status, 200, 'верный код');
  assert.strictEqual(tryCode(u, 'a', codeAt(cur), now).status, 401, 'повтор того же кода');
  assert.strictEqual(tryCode(u, 'a', codeAt(cur - 1), now).status, 401, 'более ранний код после входа');

  assert.strictEqual(tryCode(newUser(key), 'b', codeAt(cur - 1), now).status, 200, 'часы отстают на 30 с');
  assert.strictEqual(tryCode(newUser(key), 'b', codeAt(cur + 1), now).status, 200, 'часы спешат на 30 с');
  assert.strictEqual(tryCode(newUser(key), 'b', codeAt(cur - 4), now).status, 401, 'код двухминутной давности');
  assert.strictEqual(tryCode(newUser(key), 'b', '12a456', now).status, 401, 'буквы в коде');
  assert.strictEqual(tryCode(newUser(key), 'b', 123456, now).status, 401, 'число вместо строки');

  u = newUser(key);
  for (let i = 1; i < MAX_FAILS; i++) assert.strictEqual(tryCode(u, 'c', wrong(cur), now).attemptsLeft, MAX_FAILS - i);
  assert.strictEqual(tryCode(u, 'c', wrong(cur), now).retryAfter, 30, 'пятая ошибка — блокировка на 30 с');
  assert.strictEqual(tryCode(u, 'c', codeAt(cur), now + 1000).status, 429, 'во время блокировки не пускает даже с верным кодом');
  const later = now + 31000;
  assert.strictEqual(tryCode(u, 'c', codeAt(Math.floor(later / 1000 / STEP)), later).status, 200, 'после блокировки пускает');

  for (let i = 0; i < IP_LIMIT; i++) tryCode(newUser(key), 'd', wrong(cur), now);
  assert.strictEqual(tryCode(newUser(key), 'd', codeAt(cur), now).status, 429, 'лимит на адрес работает для любых аккаунтов');

  console.log('Самопроверка пройдена: RFC 6238, окно ±30 с, повтор, блокировки');
}

if (process.argv.includes('--selftest')) selftest();
else start();
