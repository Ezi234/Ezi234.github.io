/* =========================================================
   Страница 404 — режиссура сцены.
   Герой (404-hero.js) влетает, зависает, поднимает руку,
   копит заряд и бьёт лучом; стена (404-fx.js) трескается
   и раскрывается пробоиной в форме «404».

   Сцена по времени (секунды):
     0.00—1.25  полёт к стене, наклон вперёд, шлейф
     1.50—1.90  рука поднимается к стене
     1.75—2.30  заряд в ладони, стена подсвечивается
     2.30       выстрел, отдача
     2.30—2.52  луч держит стену, трещины прорастают
     2.52       пробой: вспышка, волна, обломки, тряска
     3.05       появляется текст
     3.30—3.90  рука опускается

   Параметр адреса ?frame=2.6 рисует один кадр на заданной
   секунде — удобно для скриншотов в портфолио.
   ========================================================= */
'use strict';

(function () {
  var canvas = document.getElementById('scene');
  if (!canvas || !canvas.getContext) return;
  if (typeof Hero404 === 'undefined' || typeof Fx404 === 'undefined') return;

  var ctx = canvas.getContext('2d');
  var wall = document.createElement('canvas');
  var wctx = wall.getContext('2d');
  if (!ctx || !wctx) return;

  var overlay = document.getElementById('overlay');
  var replay = document.getElementById('replay');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var HIT = Fx404.HIT;

  var T_ARRIVE = 1.25, T_ARM0 = 1.5, T_ARM1 = 1.9, T_CHG0 = 1.75, T_FIRE = 2.3,
      T_BREAK = 2.52, T_BEAM_END = 2.8, T_TEXT = 3.05, T_DOWN0 = 3.3, T_DOWN1 = 3.9;

  var FOCUS = { x: 140, y: 78, w: 740, h: 300 };      // что обязано поместиться в кадр
  var HOVER = { x: 230, y: 215 };

  var t = 0, raf = 0, last = 0, running = false;
  var shake = 0, flash = 0, broke = false, sparkAcc = 0;
  var view = { s: 1, dx: 0, dy: 0, x0: 0, y0: 0, x1: 1000, y1: 560 };
  var sceneBottom = 0;                                  // нижняя граница места под сцену, в пикселях холста

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function easeOut(x) { return 1 - Math.pow(1 - x, 3); }
  function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }

  /* ---------- состояние героя в момент time ---------- */
  function heroAt(time) {
    var s = { time: time, fly: false, arm: 0, charge: 0, thrust: 0.75 };
    if (time < T_ARRIVE) {
      var e = easeOut(clamp(time / T_ARRIVE, 0, 1));
      s.x = -260 + (HOVER.x + 260) * e;
      s.y = 110 + (HOVER.y - 110) * e - Math.sin(Math.PI * e) * 25;
      // наклон считаем от линейного времени: по сглаженному он гас бы почти сразу
      s.tilt = 0.9 * Math.pow(1 - clamp(time / T_ARRIVE, 0, 1), 1.2);
      s.fly = true; s.thrust = 1;
    } else {
      s.x = HOVER.x + Math.sin(time * 1.4) * 3;
      s.y = HOVER.y + Math.sin(time * 2.2) * 5;
      s.tilt = 0.035 * Math.sin(time * 1.3);
      s.thrust = 0.72 + 0.08 * Math.sin(time * 9);
    }
    if (time > T_FIRE) {                                // отдача от выстрела
      var k = Math.exp(-(time - T_FIRE) * 5);
      s.x -= 12 * k; s.tilt -= 0.07 * k;
    }
    var up = clamp((time - T_ARM0) / (T_ARM1 - T_ARM0), 0, 1);
    var down = clamp((time - T_DOWN0) / (T_DOWN1 - T_DOWN0), 0, 1);
    s.arm = easeInOut(up) * (1 - easeInOut(down));
    if (time < T_FIRE) s.charge = clamp((time - T_CHG0) / (T_FIRE - T_CHG0), 0, 1);
    else s.charge = clamp(1 - (time - T_BEAM_END) / 0.4, 0, 1);
    return s;
  }

  /* ---------- раскладка под любой экран ---------- */
  function layout() {
    var W = canvas.width, H = canvas.height;
    // Сцена вписывается в полосу над текстом, какой бы высоты он ни был
    var avail = sceneBottom || H * 0.6;
    var s = Math.min(W * 0.94 / FOCUS.w, avail * 0.9 / FOCUS.h);
    view.s = s;
    view.dx = (W - FOCUS.w * s) / 2 - FOCUS.x * s;
    view.dy = (avail - FOCUS.h * s) / 2 - FOCUS.y * s;
    view.x0 = -view.dx / s - 40; view.x1 = (W - view.dx) / s + 40;
    view.y0 = -view.dy / s - 40; view.y1 = (H - view.dy) / s + 40;
  }

  function glow(g, x, y, r, rgb, a) {
    var grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
  }

  /* ---------- луч репульсора ---------- */
  function drawBeam(g, P, a) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    var w = 13 * a;
    g.strokeStyle = 'rgba(90,170,255,' + 0.28 * a + ')'; g.lineWidth = w * 3.2;
    g.beginPath(); g.moveTo(P[0], P[1]); g.lineTo(HIT.x, HIT.y); g.stroke();
    var grd = g.createLinearGradient(P[0], P[1], HIT.x, HIT.y);
    grd.addColorStop(0, 'rgba(240,252,255,' + a + ')');
    grd.addColorStop(1, 'rgba(127,212,255,' + 0.8 * a + ')');
    g.strokeStyle = grd; g.lineWidth = w;
    g.beginPath(); g.moveTo(P[0], P[1]); g.lineTo(HIT.x, HIT.y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,' + a + ')'; g.lineWidth = w * 0.32;
    g.beginPath(); g.moveTo(P[0], P[1]); g.lineTo(HIT.x, HIT.y); g.stroke();
    for (var i = 0; i < 4; i++) {                      // сгустки бегут по лучу
      var f = (t * 3.2 + i / 4) % 1;
      glow(g, P[0] + (HIT.x - P[0]) * f, P[1] + (HIT.y - P[1]) * f, 16 * a, '220,244,255', 0.9 * a);
    }
    glow(g, P[0], P[1], 34 * a, '220,244,255', a);
    glow(g, HIT.x, HIT.y, 70 * a, '200,236,255', 0.9 * a);
    g.restore();
  }

  /* ---------- кадр ---------- */
  function draw() {
    layout();
    var W = canvas.width, H = canvas.height, s = view.s;
    var sx = shake > 0.001 ? (Math.random() * 2 - 1) * 16 * shake * s : 0;
    var sy = shake > 0.001 ? (Math.random() * 2 - 1) * 16 * shake * s : 0;
    var hero = heroAt(t);
    var open = broke ? easeOut(clamp((t - T_BREAK) / 0.35, 0, 1)) : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(s, 0, 0, s, view.dx + sx, view.dy + sy);
    Fx404.drawBackdrop(ctx, view, t, open);

    // стена рисуется на своём слое, чтобы из неё можно было вырезать цифры
    if (wall.width !== W || wall.height !== H) { wall.width = W; wall.height = H; }
    wctx.setTransform(1, 0, 0, 1, 0, 0);
    wctx.clearRect(0, 0, W, H);
    wctx.setTransform(s, 0, 0, s, view.dx + sx, view.dy + sy);
    var crackK = clamp((t - T_FIRE - 0.04) / (T_BREAK - T_FIRE - 0.04), 0, 1);
    var holeR = broke ? easeOut(clamp((t - T_BREAK) / 0.32, 0, 1)) * 460 : 0;
    var hot = broke ? clamp(1 - (t - T_BREAK) / 1.4, 0, 1) : crackK * 0.6;
    Fx404.drawWall(wctx, view, t, crackK, holeR, hot);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(wall, 0, 0);
    ctx.setTransform(s, 0, 0, s, view.dx + sx, view.dy + sy);

    // свет на стене: от ладони, от точки удара и из пробоины
    var P = Hero404.palm(hero);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (hero.charge > 0) glow(ctx, P[0], P[1], 320, '90,160,255', 0.32 * hero.charge);
    if (t >= T_FIRE && t < T_BEAM_END) glow(ctx, HIT.x, HIT.y, 240, '150,205,255', 0.45);
    if (open > 0) glow(ctx, HIT.x, HIT.y, 560, '90,150,255', 0.22 * open);

    // шлейф за героем в полёте
    if (t < T_ARRIVE + 0.25) {
      for (var k = 1; k <= 10; k++) {
        var tt = t - k * 0.035;
        if (tt < 0) break;
        var st = heroAt(tt), f = 1 - k / 11;
        var bx = st.x - Math.sin(st.tilt) * 88 * Hero404.scale, by = st.y + Math.cos(st.tilt) * 88 * Hero404.scale;
        glow(ctx, bx, by, 22 * f, '127,212,255', 0.4 * f);
      }
    }

    // частицы энергии стягиваются к ладони
    if (hero.charge > 0 && t < T_FIRE) {
      for (var i = 0; i < 20; i++) {
        var ph = (t * 1.5 + i / 20) % 1, ang = i * 2.39996, r = 120 * (1 - ph);
        ctx.fillStyle = 'rgba(200,238,255,' + hero.charge * ph + ')';
        ctx.beginPath(); ctx.arc(P[0] + Math.cos(ang) * r, P[1] + Math.sin(ang) * r * 0.8, 2.2, 0, 6.3); ctx.fill();
      }
    }
    ctx.restore();

    Fx404.drawParticles(ctx, t);

    if (t >= T_FIRE && t < T_BEAM_END) {
      var a = clamp((t - T_FIRE) / 0.06, 0, 1) * clamp((T_BEAM_END - t) / 0.18, 0, 1);
      drawBeam(ctx, P, a);
    }

    Hero404.draw(ctx, hero);

    // ударные волны
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    [0, 0.09].forEach(function (d) {
      var k = (t - T_BREAK - d) / 0.6;
      if (k < 0 || k > 1) return;
      ctx.strokeStyle = 'rgba(200,236,255,' + 0.7 * (1 - k) + ')';
      ctx.lineWidth = 14 * (1 - k);
      ctx.beginPath(); ctx.arc(HIT.x, HIT.y, 30 + 520 * easeOut(k), 0, 6.3); ctx.stroke();
    });
    ctx.restore();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (flash > 0.001) {
      ctx.fillStyle = 'rgba(225,242,255,' + flash * 0.8 + ')';
      ctx.fillRect(0, 0, W, H);
    }
    var vg = ctx.createRadialGradient(W / 2, H * 0.4, Math.min(W, H) * 0.3, W / 2, H * 0.4, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.7)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- шаг времени ---------- */
  function step(dt) {
    t += dt;
    if (t >= T_FIRE && t < T_FIRE + dt) flash = Math.max(flash, 0.3);
    if (t >= T_FIRE && t < T_BREAK) {                   // искры, пока луч держит стену
      sparkAcc += dt * 90;
      Fx404.hitSparks(sparkAcc | 0);
      sparkAcc -= sparkAcc | 0;
    }
    if (!broke && t >= T_BREAK) {
      broke = true;
      Fx404.burst();
      shake = 1; flash = 1;
    }
    Fx404.update(dt, broke ? t - T_BREAK : -1);
    shake = Math.max(0, shake - dt * 1.8);
    flash = Math.max(0, flash - dt * 3.2);
    if (overlay && t >= T_TEXT) overlay.classList.add('is-in');
  }

  function reset() {
    t = 0; shake = 0; flash = 0; broke = false; sparkAcc = 0;
    Fx404.reset();
    if (overlay) overlay.classList.remove('is-in');
  }

  // Прогон до нужной секунды без показа — для ?frame и «уменьшить движение»
  function simulate(until) {
    reset();
    while (t < until) step(1 / 60);
    shake = 0;
  }

  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - last) / 1000 || 0);   // после паузы не прыгаем вперёд
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  function play() {
    cancelAnimationFrame(raf);
    reset();
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function still(at) {
    cancelAnimationFrame(raf);
    running = false;
    simulate(at);
    draw();
  }

  function showFinal() {
    still(4.6);
    Fx404.finalize();
    draw();
  }

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    measure();
    if (!running) draw();
  }

  // Где начинается текст. offsetTop не учитывает transform, поэтому
  // значение верное и до появления блока, пока он сдвинут вниз анимацией.
  function measure() {
    var first = overlay && overlay.querySelector('.eyebrow');
    var top = first ? overlay.offsetTop + first.offsetTop : window.innerHeight * 0.6;
    var k = canvas.height / Math.max(1, canvas.clientHeight);
    sceneBottom = Math.max(canvas.height * 0.3, (top - 14) * k);
  }

  Fx404.init();
  resize();
  window.addEventListener('resize', resize);

  var frameParam = parseFloat(new URLSearchParams(location.search).get('frame'));
  if (!isNaN(frameParam)) still(clamp(frameParam, 0, 8));
  else if (reduceMotion) showFinal();
  else play();

  if (replay) {
    replay.addEventListener('click', function () {
      if (reduceMotion) showFinal(); else play();
    });
  }

  // Пока вкладку не смотрят, кадры не рисуем
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { cancelAnimationFrame(raf); return; }
    if (running) { last = performance.now(); raf = requestAnimationFrame(frame); }
  });
})();
