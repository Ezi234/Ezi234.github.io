/* =========================================================
   TOTP — одноразовые коды по стандарту RFC 6238,
   те же, что показывают Google Authenticator, Яндекс Ключ
   и любое другое приложение-генератор.

   Код = HMAC-SHA1(секрет, номер 30-секундного окна),
   урезанный до шести цифр. Считается через Web Crypto:
   без библиотек и без eval, поэтому работает под строгим CSP.

   Работает и в браузере, и в Node.js 18+ (для тестов).
   ========================================================= */
'use strict';

var Totp = (function () {
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var subtle = globalThis.crypto && globalThis.crypto.subtle;

  /* ---------- Base32: так секрет записывают в приложения ---------- */
  function base32ToBytes(str) {
    var clean = String(str).toUpperCase().replace(/[\s=-]/g, '');
    var bits = 0, value = 0, out = [];
    for (var i = 0; i < clean.length; i++) {
      var idx = ALPHABET.indexOf(clean[i]);
      if (idx < 0) throw new Error('Недопустимый символ в секрете: ' + clean[i]);
      value = (value << 5) | idx;
      bits += 5;
      if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }

  function bytesToBase32(bytes) {
    var bits = 0, value = 0, out = '';
    for (var i = 0; i < bytes.length; i++) {
      value = (value << 8) | bytes[i];
      bits += 8;
      while (bits >= 5) { out += ALPHABET[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
    return out;
  }

  // 20 байт = 160 бит — рекомендация стандарта для HMAC-SHA1
  function randomSecret(len) {
    var bytes = new Uint8Array(len || 20);
    globalThis.crypto.getRandomValues(bytes);
    return bytesToBase32(bytes);
  }

  /* ---------- HOTP: код для конкретного счётчика (RFC 4226) ---------- */
  async function hotp(secretBytes, counter, digits) {
    var key = await subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
    var msg = new ArrayBuffer(8);
    var view = new DataView(msg);
    view.setUint32(0, Math.floor(counter / 0x100000000));
    view.setUint32(4, counter >>> 0);
    var mac = new Uint8Array(await subtle.sign('HMAC', key, msg));
    var off = mac[mac.length - 1] & 0x0f;
    var bin = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
    return String(bin % Math.pow(10, digits)).padStart(digits, '0');
  }

  /* ---------- TOTP: счётчик = номер окна времени ---------- */
  async function generate(secret, opts) {
    opts = opts || {};
    var step = opts.step || 30, digits = opts.digits || 6;
    var now = opts.time != null ? opts.time : Date.now();
    var counter = Math.floor(now / 1000 / step);
    var code = await hotp(base32ToBytes(secret), counter, digits);
    var remaining = step - Math.floor((now / 1000) % step);
    return { code: code, counter: counter, remaining: remaining, step: step };
  }

  // Сравнение за постоянное время: по скорости ответа нельзя подбирать цифры
  function safeEqual(a, b) {
    if (a.length !== b.length) return false;
    var diff = 0;
    for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
  }

  /* Проверка кода.
     window — сколько соседних окон принимать (часы телефона могут отставать);
     lastCounter — номер окна последнего принятого кода: повторно его не пускаем,
     иначе подсмотренный код можно ввести второй раз. */
  async function verify(secret, code, opts) {
    opts = opts || {};
    var step = opts.step || 30, digits = opts.digits || 6, win = opts.window == null ? 1 : opts.window;
    var now = opts.time != null ? opts.time : Date.now();
    var clean = String(code).replace(/\s/g, '');
    if (!new RegExp('^\\d{' + digits + '}$').test(clean)) return { ok: false, reason: 'format' };

    var bytes = base32ToBytes(secret);
    var current = Math.floor(now / 1000 / step);
    for (var d = -win; d <= win; d++) {
      var counter = current + d;
      if (counter < 0) continue;
      if (safeEqual(await hotp(bytes, counter, digits), clean)) {
        if (opts.lastCounter != null && counter <= opts.lastCounter) return { ok: false, reason: 'replay' };
        return { ok: true, counter: counter, drift: d };
      }
    }
    return { ok: false, reason: 'mismatch' };
  }

  // Ссылка для приложения-генератора: из неё же строится QR-код
  function otpauthUri(secret, account, issuer) {
    return 'otpauth://totp/' + encodeURIComponent(issuer + ':' + account) +
      '?secret=' + secret + '&issuer=' + encodeURIComponent(issuer) + '&algorithm=SHA1&digits=6&period=30';
  }

  return {
    base32ToBytes: base32ToBytes, bytesToBase32: bytesToBase32, randomSecret: randomSecret,
    hotp: hotp, generate: generate, verify: verify, otpauthUri: otpauthUri
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Totp;
