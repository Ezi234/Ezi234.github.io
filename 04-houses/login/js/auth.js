/* =========================================================
   Вход с двухфакторной защитой — общий движок.
   Один и тот же файл лежит в каждом сайте, внешний вид задаёт тема.

   Настройки читаются из атрибутов <body>:
     data-store   — под каким именем хранить демо-ключ в браузере
     data-issuer  — название, которое видно в приложении-генераторе
     data-account — почта, подставленная в макет телефона

   ВАЖНО. Это демо: ключ лежит в браузере и код проверяется здесь же.
   На рабочем сайте ключ хранится только на сервере, код проверяет
   сервер (пример — server-example.js), а браузер шлёт лишь цифры.

   Что показано честно, как в настоящей системе:
   · коды по стандарту TOTP — подходит любое приложение-генератор;
   · окно ±30 секунд на случай, если часы телефона отстают;
   · один код нельзя ввести дважды;
   · после пяти ошибок — блокировка, каждая следующая вдвое дольше;
   · пароль стирается из памяти страницы сразу после первого шага.
   Весь текст выводится через textContent — страница работает
   под Trusted Types, вставка HTML строкой запрещена браузером.
   ========================================================= */
'use strict';

(function () {
  var $ = function (id) { return document.getElementById(id); };
  var cfg = document.body.dataset;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Рабочий режим включается атрибутом data-api, который подставляет сам сервер
  // (см. server/server.js). Без него страница — демо: код проверяется в браузере.
  var API = cfg.api || '';
  var SERVER = !!API;

  var art = $('art'), stepItems = document.querySelectorAll('.steps__item');
  var stepLogin = $('stepLogin'), step2fa = $('step2fa'), stepDone = $('stepDone');
  var email = $('email'), password = $('password'), togglePass = $('togglePass');
  var meterBar = $('meterBar'), meterText = $('meterText'), emailErr = $('emailErr'), passErr = $('passErr');
  var loginForm = $('loginForm'), loginBtn = $('loginBtn');
  var codeForm = $('codeForm'), cellsBox = $('cells');
  var cells = Array.prototype.slice.call(cellsBox.querySelectorAll('.cell'));
  var codeStatus = $('codeStatus'), verifyBtn = $('verifyBtn'), backBtn = $('backBtn'), triesBox = $('tries');
  var session = $('session'), restartBtn = $('restartBtn');
  var appDigits = $('appDigits'), appCode = $('appCode'), appSeconds = $('appSeconds');
  var ring = $('ring'), appAccount = $('appAccount'), appIssuer = $('appIssuer');
  var secretKey = $('secretKey'), copySecret = $('copySecret'), newSecret = $('newSecret');
  var toasts = $('toasts');

  var ATTEMPTS = 5;

  /* ---------- мелочи ---------- */
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, reduceMotion ? 0 : ms); }); }
  function anim(el, cls) {                       // перезапуск CSS-анимации
    el.classList.remove('is-pop', 'is-type', 'is-flip', 'is-enter', cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }
  function toast(msg, bad) {
    var el = document.createElement('div');
    el.className = 'toast' + (bad ? ' toast--bad' : '');
    el.textContent = msg;
    toasts.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 320);
    }, 4200);
  }
  // Запрос к серверу. Только JSON и только на свой домен: чужой сайт так не сможет.
  async function api(pathname, data) {
    var r, body = {};
    try {
      r = await fetch(API + pathname, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(data)
      });
    } catch (e) {
      return { status: 0, body: { error: 'Сервер не отвечает. Проверьте связь' } };
    }
    try { body = await r.json(); } catch (e) { /* пустой ответ */ }
    return { status: r.status, body: body };
  }

  // Состояния сцены: идёт проверка, ошибка, доступ открыт. Рисует их тема.
  function setArt(state) {
    art.classList.remove('is-scan', 'is-bad', 'is-open');
    void art.getBoundingClientRect();
    if (state) art.classList.add(state);
  }
  function goStep(n) {
    [stepLogin, step2fa, stepDone].forEach(function (el, i) {
      el.hidden = i !== n - 1;
      if (i === n - 1) anim(el, 'is-enter');
    });
    stepItems.forEach(function (li) {
      var k = Number(li.dataset.step);
      li.classList.toggle('is-active', k === n);
      li.classList.toggle('is-done', k < n);
    });
  }

  /* ---------- демо-ключ ----------
     Хранится в браузере только ради демонстрации: так ключ, добавленный
     в ваш телефон, переживает перезагрузку страницы. */
  var STORE = cfg.store || 'demo-2fa-secret';
  function saveSecret(s) { try { localStorage.setItem(STORE, s); } catch (e) { /* приватный режим */ } return s; }
  function loadSecret() {
    try {
      var s = localStorage.getItem(STORE);
      if (s && /^[A-Z2-7]{16,}$/.test(s)) return s;
    } catch (e) { /* нет доступа к хранилищу */ }
    return saveSecret(Totp.randomSecret());
  }

  if (!SERVER && (typeof Totp === 'undefined' || !globalThis.crypto || !globalThis.crypto.subtle)) {
    // Web Crypto работает только на HTTPS и на localhost
    codeStatus.textContent = 'Нужен защищённый адрес (HTTPS): без него браузер не даёт криптографию';
    loginBtn.disabled = true;
    toast('Откройте страницу по HTTPS или через localhost', true);
    return;
  }

  var secret = SERVER ? null : loadSecret();
  var attempts = ATTEMPTS, tries = 0, lockLevel = 0, lockUntil = 0, busy = false;
  var lastCounter = null, lastDrift = 0, shownCode = '', doneInfo = null;

  if (appIssuer && cfg.issuer) appIssuer.textContent = cfg.issuer;
  if (appAccount && cfg.account) appAccount.textContent = cfg.account;

  if (SERVER) {
    // Ключ лежит на сервере, поэтому показывать демо-телефон нечестно: убираем.
    // Код пользователь берёт в своём приложении-генераторе.
    var phone = document.querySelector('.phone');
    if (phone) phone.hidden = true;
    var stage = document.querySelector('.stage');
    if (stage) stage.classList.add('is-solo');
    var demo = document.querySelector('.demo');
    if (demo) {
      demo.classList.add('is-live');
      demo.lastChild.nodeValue = 'Рабочий режим: пароль и код проверяет сервер';
    }
    restartBtn.textContent = 'Открыть кабинет';
  }

  /* ---------- шаг 1: почта и пароль ---------- */
  var LEVELS = ['слишком простой', 'слабый', 'средний', 'хороший', 'отличный'];
  function strength(p) {
    var s = 0;
    if (p.length >= 10) s++;
    if (p.length >= 14) s++;
    if (/[a-zа-яё]/.test(p) && /[A-ZА-ЯЁ]/.test(p)) s++;
    if (/\d/.test(p)) s++;
    if (/[^0-9a-zA-Zа-яёА-ЯЁ]/.test(p)) s++;
    if (/^(.)\1+$/.test(p) || /^(123|qwerty|йцукен|password|пароль)/i.test(p)) s = Math.min(s, 1);
    return Math.min(s, 4);
  }
  function setErr(input, box, msg) { input.closest('.field').classList.add('is-bad'); box.textContent = msg; }
  function clearErr(input, box) { input.closest('.field').classList.remove('is-bad'); box.textContent = ''; }
  function paintMeter() {
    var s = strength(password.value);
    meterBar.style.width = (password.value ? (s + 1) * 20 : 0) + '%';
    meterBar.dataset.level = s;                       // цвет полоски задаёт тема
    meterText.textContent = password.value ? 'Надёжность: ' + LEVELS[s] : 'Надёжность пароля';
  }

  password.addEventListener('input', function () { paintMeter(); clearErr(password, passErr); });
  email.addEventListener('input', function () { clearErr(email, emailErr); });
  togglePass.addEventListener('click', function () {
    var show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    togglePass.setAttribute('aria-pressed', String(show));
    togglePass.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
  });

  loginForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var ok = true, mail = email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) { setErr(email, emailErr, 'Проверьте адрес почты'); ok = false; }
    if (password.value.length < 10) { setErr(password, passErr, 'Пароль короче 10 символов'); ok = false; }
    else if (strength(password.value) < 2) { setErr(password, passErr, 'Слишком простой: добавьте цифры, заглавные буквы или символы'); ok = false; }
    if (!ok) { setArt('is-bad'); return; }

    loginBtn.classList.add('is-busy');
    setArt('is-scan');

    if (SERVER) {
      var r = await api('/login', { email: mail, password: password.value });
      password.value = '';                            // пароль больше не нужен — стираем
      paintMeter();
      loginBtn.classList.remove('is-busy');
      if (r.status !== 200) {
        setArt('is-bad');
        setErr(password, passErr, r.body.error || 'Не удалось войти');
        if (r.body.retryAfter) toast(r.body.error + ': подождите ' + r.body.retryAfter + ' с', true);
        return;
      }
      setArt(null);
    } else {
      await sleep(800);
      loginBtn.classList.remove('is-busy');
      setArt(null);
      password.value = '';
      paintMeter();
    }

    appAccount.textContent = mail;
    goStep(2);
    paintTries();
    if (Date.now() < lockUntil) setStatus('Вход временно заблокирован', 'warn');
    else setStatus('Осталось попыток: ' + attempts);
    cells[0].focus();
  });

  /* ---------- шаг 2: шесть ячеек ---------- */
  cells.forEach(function (c, i) { c.style.setProperty('--i', i); });

  function collect() { return cells.map(function (c) { return c.value; }).join(''); }
  function setStatus(text, kind) {
    codeStatus.textContent = text;
    codeStatus.className = 'code__status' + (kind === 'bad' ? ' is-bad' : kind === 'warn' ? ' is-warn' : '');
  }
  function paintTries() {
    if (!triesBox) return;
    Array.prototype.forEach.call(triesBox.children, function (dot, i) {
      dot.classList.toggle('is-used', i >= attempts);
    });
  }
  function clearCells() {
    cells.forEach(function (c) { c.value = ''; c.classList.remove('is-filled'); });
  }
  function fillFrom(start, digits) {
    digits = digits.slice(0, 6 - start);
    for (var k = 0; k < digits.length; k++) {
      var c = cells[start + k];
      c.value = digits[k];
      c.classList.add('is-filled');
      anim(c, 'is-type');
    }
    cells[Math.min(start + digits.length, 5)].focus();
    if (collect().length === 6) submitCode();
  }

  cells.forEach(function (cell, i) {
    cell.addEventListener('input', function () {
      var digits = cell.value.replace(/\D/g, '');
      if (digits.length > 1) { fillFrom(i, digits); return; }   // код из СМС подставляется целиком
      cell.value = digits;
      cell.classList.toggle('is-filled', !!digits);
      cellsBox.classList.remove('is-bad');
      if (digits) { anim(cell, 'is-pop'); if (i < 5) cells[i + 1].focus(); }
      if (collect().length === 6) submitCode();
    });
    cell.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && !cell.value && i > 0) {
        cells[i - 1].value = '';
        cells[i - 1].classList.remove('is-filled');
        cells[i - 1].focus();
        e.preventDefault();
      } else if (e.key === 'ArrowLeft' && i > 0) { cells[i - 1].focus(); e.preventDefault(); }
      else if (e.key === 'ArrowRight' && i < 5) { cells[i + 1].focus(); e.preventDefault(); }
    });
    cell.addEventListener('focus', function () { cell.select(); });
    cell.addEventListener('paste', function (e) {
      e.preventDefault();
      fillFrom(0, (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, ''));
    });
  });

  codeForm.addEventListener('submit', function (e) { e.preventDefault(); submitCode(); });

  async function submitCode() {
    if (busy || Date.now() < lockUntil) return;
    var code = collect();
    if (code.length !== 6) { setStatus('Введите все шесть цифр', 'bad'); anim(cellsBox, 'is-bad'); return; }

    busy = true; tries++;
    verifyBtn.classList.add('is-busy');
    setArt('is-scan');

    var res;
    if (SERVER) {
      var r = await api('/2fa', { code: code });
      var msg = r.body.error || '';
      res = r.status === 200
        ? { ok: true, counter: null, drift: r.body.drift || 0, info: r.body }
        : {
          ok: false,
          reason: r.status === 429 ? 'locked' : msg.indexOf('уже использован') >= 0 ? 'replay' : 'mismatch',
          error: msg, attemptsLeft: r.body.attemptsLeft, retryAfter: r.body.retryAfter
        };
    } else {
      await sleep(650);                                // на сервере здесь сетевой запрос
      res = await Totp.verify(secret, code, { lastCounter: lastCounter, window: 1 });
    }
    verifyBtn.classList.remove('is-busy');
    busy = false;

    if (res.ok) {
      lastCounter = res.counter;
      lastDrift = res.drift;
      doneInfo = res.info || null;
      cells.forEach(function (c) { c.disabled = true; });
      cellsBox.classList.add('is-ok');
      setArt('is-open');
      setStatus('Код верный');
      await sleep(1100);
      showDone();
      return;
    }

    setArt('is-bad');
    anim(cellsBox, 'is-bad');
    clearCells();
    cells[0].focus();
    if (res.reason === 'replay') {
      setStatus('Этот код уже использован. Дождитесь следующего на телефоне', 'warn');
      return;
    }
    if (res.reason === 'locked') { lockFor(res.retryAfter || 30); return; }
    attempts = (res.attemptsLeft != null) ? res.attemptsLeft : attempts - 1;
    paintTries();
    if (attempts <= 0) { lockout(); return; }
    setStatus('Неверный код. Осталось попыток: ' + attempts, 'bad');
  }

  // Защита от подбора: 30 с, затем 60, 120… до 8 минут.
  // В рабочем режиме срок называет сервер — здесь только показываем отсчёт.
  function lockout() {
    var secs = 30 * Math.pow(2, lockLevel);
    lockLevel = Math.min(lockLevel + 1, 4);
    lockFor(secs);
  }

  function lockFor(secs) {
    lockUntil = Date.now() + secs * 1000;
    cellsBox.classList.add('is-locked');
    cells.forEach(function (c) { c.disabled = true; });
    verifyBtn.disabled = true;
    toast('Вход заблокирован на ' + secs + ' с — защита от подбора кода', true);
    var timer = setInterval(function () {
      var left = Math.ceil((lockUntil - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(timer);
        attempts = ATTEMPTS;
        paintTries();
        cellsBox.classList.remove('is-locked', 'is-bad');
        cells.forEach(function (c) { c.disabled = false; });
        verifyBtn.disabled = false;
        setStatus('Можно снова. Осталось попыток: ' + ATTEMPTS);
        if (!step2fa.hidden) cells[0].focus();
        return;
      }
      setStatus('Слишком много ошибок. Повторите через ' + left + ' с', 'warn');
    }, 250);
  }

  backBtn.addEventListener('click', function () {
    // попытки и блокировка не сбрасываются: иначе их обходили бы кнопкой «назад»
    if (SERVER) api('/logout', {});                  // сервер забывает незавершённый вход
    setArt(null);
    clearCells();
    goStep(1);
    email.focus();
  });

  /* ---------- шаг 3: итог ---------- */
  function browserName() {
    var ua = navigator.userAgent;
    var b = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'браузер';
    var os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS'
      : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
    return os ? b + ', ' + os : b;
  }

  function showDone() {
    var at = doneInfo && doneInfo.at ? new Date(doneInfo.at) : new Date();
    var rows = [
      ['Аккаунт', (doneInfo && doneInfo.account) || appAccount.textContent],
      ['Время входа', at.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })],
      ['Устройство', browserName()],
      ['Часы телефона', lastDrift === 0 ? 'совпадают с сервером' : lastDrift < 0 ? 'отстают на 30 с' : 'спешат на 30 с'],
      ['Код проверил', SERVER ? 'сервер' : 'браузер (демо)'],
      ['Попыток ввода', String(tries)]
    ];
    session.textContent = '';
    rows.forEach(function (r, i) {
      var dt = document.createElement('dt'), dd = document.createElement('dd');
      dt.textContent = r[0];
      dd.textContent = r[1];
      dt.style.setProperty('--i', i);
      dd.style.setProperty('--i', i);
      session.append(dt, dd);
    });
    goStep(3);
    restartBtn.focus();
  }

  restartBtn.addEventListener('click', function () {
    if (SERVER) { location.href = cfg.next || '/kabinet/'; return; }
    attempts = ATTEMPTS; tries = 0;
    paintTries();
    cells.forEach(function (c) { c.disabled = false; });
    cellsBox.classList.remove('is-ok', 'is-bad', 'is-locked');
    clearCells();
    setArt(null);
    goStep(1);
    email.focus();
  });

  /* ---------- телефон: живой генератор ---------- */
  var CIRC = 2 * Math.PI * Number(ring.getAttribute('r') || 16);
  ring.style.strokeDasharray = CIRC.toFixed(2);

  async function tick() {
    var g = await Totp.generate(secret);
    if (g.code !== shownCode) {
      shownCode = g.code;
      appDigits.textContent = g.code.slice(0, 3) + ' ' + g.code.slice(3);
      if (!reduceMotion) anim(appDigits, 'is-flip');
    }
    appSeconds.textContent = g.remaining;
    ring.style.transition = g.remaining >= 29 ? 'none' : '';   // на смене кода кольцо прыгает назад без анимации
    ring.style.strokeDashoffset = (CIRC * (1 - g.remaining / 30)).toFixed(2);
    ring.classList.toggle('is-low', g.remaining <= 5);
  }
  if (!SERVER) { tick(); setInterval(tick, 1000); }   // в рабочем режиме коды живут на телефоне

  appCode.addEventListener('click', async function () {
    if (step2fa.hidden) { toast('Сначала войдите по почте и паролю — код нужен на втором шаге', true); return; }
    if (Date.now() < lockUntil) { toast('Вход временно заблокирован', true); return; }
    var g = await Totp.generate(secret);
    clearCells();
    fillFrom(0, g.code);
  });

  /* ---------- подключение своего телефона ---------- */
  function showSecret() {
    if (!secret) return;                              // в рабочем режиме ключа в браузере нет
    secretKey.textContent = secret.replace(/(.{4})/g, '$1 ').trim();
  }
  showSecret();

  copySecret.addEventListener('click', function () {
    function selectKey() {
      var r = document.createRange();
      r.selectNodeContents(secretKey);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      toast('Ключ выделен — скопируйте его вручную');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(secret).then(function () {
        toast('Ключ скопирован — добавьте его в приложение-генератор');
      }, selectKey);
    } else selectKey();
  });

  newSecret.addEventListener('click', function () {
    secret = saveSecret(Totp.randomSecret());
    lastCounter = null;
    shownCode = '';
    showSecret();
    tick();
    toast('Создан новый ключ. Коды со старого больше не подходят');
  });

  paintTries();
})();
