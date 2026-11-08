/* =========================================================
   Страница 404 — бронированный герой.
   Рисуется векторами на canvas 2D: шлем с забралом и
   светящимися прорезями, реактор в груди, пластины брони,
   реактивные ботинки и репульсор в ладони.

   Наружу — объект Hero404:
     draw(g, s)  — нарисовать героя в состоянии s
     palm(s)     — мировые координаты ладони (откуда бьёт луч)

   Состояние s: { x, y, tilt, arm, charge, thrust, time, fly }
     arm    0..1 — рука опущена / вытянута к стене
     charge 0..1 — заряд в ладони
     thrust 0..1 — сила тяги ботинок
   ========================================================= */
'use strict';

var Hero404 = (function () {

  var S = 1.55;                         // масштаб фигуры относительно сцены

  var C = {
    red: '#b3212c', redHi: '#e3464b', redLo: '#6f1119',
    steel: '#8e98a4', steelHi: '#d3dae2', steelLo: '#56606b',
    dark: '#1f232a', darkHi: '#343a44'
  };

  /* ---------- геометрия руки ----------
     Плечо неподвижно, угол руки плавно идёт от «опущена» к «вытянута». */
  var SHOULDER = [24, -28], UPPER = 30, FORE = 30;

  function armJoints(arm) {
    var a = 1.35 * (1 - arm);                     // 1.35 рад — вниз, 0 — вправо
    var b = a - 0.35 * (1 - arm);                 // опущенная рука слегка согнута
    var elbow = [SHOULDER[0] + Math.cos(a) * UPPER, SHOULDER[1] + Math.sin(a) * UPPER];
    var hand = [elbow[0] + Math.cos(b) * FORE, elbow[1] + Math.sin(b) * FORE];
    var palm = [hand[0] + Math.cos(b) * 7, hand[1] + Math.sin(b) * 7];
    return { elbow: elbow, hand: hand, palm: palm, dir: b };
  }

  function toWorld(s, p) {
    var c = Math.cos(s.tilt), si = Math.sin(s.tilt);
    return [s.x + (p[0] * c - p[1] * si) * S, s.y + (p[0] * si + p[1] * c) * S];
  }

  function palm(s) {
    return toWorld(s, armJoints(s.arm).palm);
  }

  /* ---------- примитивы ---------- */
  function poly(g, pts, fill) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.fill();
  }

  // Сегмент брони: толстая линия + светлая грань по верху
  function limb(g, a, b, w, col, hi) {
    g.lineCap = 'round';
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    g.strokeStyle = hi; g.lineWidth = w * 0.28;
    g.beginPath(); g.moveTo(a[0], a[1] - w * 0.22); g.lineTo(b[0], b[1] - w * 0.22); g.stroke();
  }

  function joint(g, p, r) {
    g.fillStyle = C.dark;
    g.beginPath(); g.arc(p[0], p[1], r, 0, 6.3); g.fill();
    g.fillStyle = C.darkHi;
    g.beginPath(); g.arc(p[0] - r * 0.25, p[1] - r * 0.3, r * 0.45, 0, 6.3); g.fill();
  }

  function glow(g, x, y, r, a) {
    var grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(240,252,255,' + a + ')');
    grd.addColorStop(0.3, 'rgba(127,212,255,' + (a * 0.8) + ')');
    grd.addColorStop(1, 'rgba(90,170,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
  }

  // Реактивная струя: сужающийся язык пламени вдоль угла ang
  function flame(g, x, y, ang, len, w, time) {
    var flick = 0.82 + 0.18 * Math.sin(time * 38 + x);
    var L = len * flick;
    var c = Math.cos(ang), s = Math.sin(ang);
    var px = -s, py = c;
    var grd = g.createLinearGradient(x, y, x + c * L, y + s * L);
    grd.addColorStop(0, 'rgba(240,252,255,.95)');
    grd.addColorStop(0.25, 'rgba(127,212,255,.8)');
    grd.addColorStop(1, 'rgba(90,150,255,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x + px * w, y + py * w);
    g.quadraticCurveTo(x + c * L * 0.45 + px * w * 0.7, y + s * L * 0.45 + py * w * 0.7, x + c * L, y + s * L);
    g.quadraticCurveTo(x + c * L * 0.45 - px * w * 0.7, y + s * L * 0.45 - py * w * 0.7, x - px * w, y - py * w);
    g.closePath();
    g.fill();
  }

  /* ---------- сам герой ---------- */
  function draw(g, s) {
    var j = armJoints(s.arm);
    var t = s.time;

    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.tilt);
    g.scale(S, S);

    /* струи: из ботинок вниз и из левой ладони — стабилизатор */
    g.globalCompositeOperation = 'lighter';
    var boost = s.fly ? 1.8 : 1;
    flame(g, -15, 89, Math.PI / 2, 42 * s.thrust * boost, 5.5, t);
    flame(g, 19, 87, Math.PI / 2, 42 * s.thrust * boost, 5.5, t + 1.7);
    flame(g, -35, 31, Math.PI / 2 + 0.15, 20 * s.thrust, 4, t + 0.9);
    glow(g, -15, 90, 14, 0.55 * s.thrust);
    glow(g, 19, 88, 14, 0.55 * s.thrust);
    g.globalCompositeOperation = 'source-over';

    /* дальняя нога — темнее, она в тени корпуса */
    limb(g, [-10, 22], [-14, 52], 15, C.redLo, C.red);
    limb(g, [-14, 52], [-16, 80], 14, C.redLo, C.red);
    joint(g, [-14, 52], 5);
    poly(g, [-25, 74, -9, 74, -5, 86, -3, 90, -27, 90], C.redLo);

    /* дальняя рука висит, ладонь вниз */
    limb(g, [-24, -28], [-33, 0], 13, C.redLo, C.red);
    joint(g, [-33, 0], 4.5);
    limb(g, [-33, 0], [-35, 24], 13.5, C.redLo, C.red);
    joint(g, [-35, 28], 7);

    /* корпус: тёмный поддоспешник и красная кираса */
    poly(g, [-24, -34, 24, -34, 16, 20, -16, 20], C.dark);
    poly(g, [-22, -33, 22, -33, 20, -6, 8, 4, -8, 4, -20, -6], C.red);
    poly(g, [-22, -33, 22, -33, 19, -26, -19, -26], C.redHi);
    // пресс сегментами
    for (var r = 0; r < 2; r++) {
      poly(g, [-11, 6 + r * 6, -2, 6 + r * 6, -2, 10.5 + r * 6, -11, 10.5 + r * 6], C.red);
      poly(g, [2, 6 + r * 6, 11, 6 + r * 6, 11, 10.5 + r * 6, 2, 10.5 + r * 6], C.red);
    }
    poly(g, [-15, 17, 15, 17, 14, 22, -14, 22], C.steel);

    /* ближняя нога */
    limb(g, [10, 22], [14, 50], 16, C.red, C.redHi);
    limb(g, [14, 50], [18, 78], 15, C.red, C.redHi);
    joint(g, [14, 50], 5.5);
    poly(g, [7, 72, 25, 72, 31, 84, 33, 88, 7, 88], C.red);
    poly(g, [22, 80, 31, 84, 33, 88, 22, 88], C.steel);

    /* наплечники */
    g.fillStyle = C.red;
    g.beginPath(); g.ellipse(24, -29, 12, 10, -0.25, 0, 6.3); g.fill();
    g.fillStyle = C.redHi;
    g.beginPath(); g.ellipse(22, -33, 8, 4.5, -0.25, 0, 6.3); g.fill();
    g.fillStyle = C.redLo;
    g.beginPath(); g.ellipse(-23, -29, 11, 9, 0.25, 0, 6.3); g.fill();

    /* шлем: красная каска, серебристое забрало, прорези глаз */
    poly(g, [-6, -40, 7, -40, 6, -32, -5, -32], C.dark);
    g.fillStyle = C.red;
    g.beginPath(); g.ellipse(1, -55, 15.5, 18.5, 0, 0, 6.3); g.fill();
    g.fillStyle = C.redHi;
    g.beginPath(); g.ellipse(-2, -66, 9, 5, -0.2, 0, 6.3); g.fill();
    poly(g, [-7, -63, 14, -65, 17, -52, 13, -42, 5, -37, -4, -39, -9, -50], C.steel);
    poly(g, [-7, -63, 14, -65, 15, -60, -6, -58], C.steelHi);
    poly(g, [5, -37, 13, -42, 12, -40, 5, -36], C.steelLo);
    // прорези глаз светятся
    g.shadowColor = 'rgba(127,212,255,1)'; g.shadowBlur = 10;
    poly(g, [-4, -55, 3, -57, 3, -54, -3, -52], '#eafaff');
    poly(g, [6, -57, 14, -58, 13, -55, 6, -54], '#eafaff');
    g.shadowBlur = 0;
    g.strokeStyle = C.steelLo; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(0, -44); g.lineTo(11, -45.5); g.stroke();

    /* ближняя рука — к стене */
    limb(g, SHOULDER, j.elbow, 13.5, C.red, C.redHi);
    joint(g, j.elbow, 5);
    limb(g, j.elbow, j.hand, 15, C.red, C.redHi);
    // серебристая полоса на наруче
    g.strokeStyle = C.steel; g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(j.elbow[0] + (j.hand[0] - j.elbow[0]) * 0.35, j.elbow[1] + (j.hand[1] - j.elbow[1]) * 0.35 - 3);
    g.lineTo(j.elbow[0] + (j.hand[0] - j.elbow[0]) * 0.85, j.elbow[1] + (j.hand[1] - j.elbow[1]) * 0.85 - 3);
    g.stroke();
    joint(g, j.hand, 8);

    /* реактор в груди */
    g.globalCompositeOperation = 'lighter';
    var pulse = 0.85 + 0.15 * Math.sin(t * 5);
    glow(g, 0, -17, 22 * pulse, 0.85);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = C.steelLo;
    g.beginPath(); g.arc(0, -17, 7.5, 0, 6.3); g.fill();
    g.fillStyle = '#eafaff';
    g.beginPath(); g.arc(0, -17, 5, 0, 6.3); g.fill();

    /* репульсор в ладони: тлеет всегда, разгорается при заряде */
    g.globalCompositeOperation = 'lighter';
    var pr = 5 + s.charge * 15 + (s.charge > 0 ? Math.sin(t * 42) * 1.5 : 0);
    glow(g, j.palm[0], j.palm[1], pr * 2.2, 0.35 + 0.65 * s.charge);
    if (s.charge > 0.05) {
      g.strokeStyle = 'rgba(200,238,255,' + (0.55 * s.charge) + ')';
      g.lineWidth = 1.4;
      for (var k = 0; k < 3; k++) {
        var rr = 30 - ((t * 55 + k * 10) % 30);
        g.beginPath(); g.arc(j.palm[0], j.palm[1], Math.max(2, rr), 0, 6.3); g.stroke();
      }
    }
    g.globalCompositeOperation = 'source-over';

    g.restore();
  }

  return { draw: draw, palm: palm, scale: S };
})();
