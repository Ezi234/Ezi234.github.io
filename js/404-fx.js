/* =========================================================
   Страница 404 — стена и разрушения.
   Стена не хранится массивом: кирпич в строке r и столбце c
   вычисляется на лету, поэтому сцена одинаково заполняет
   любой экран и не ломается при повороте телефона.

   Пробоина вырезается по форме «404» из отдельного слоя,
   края раскалены и остывают до голубого свечения.
   ========================================================= */
'use strict';

var Fx404 = (function () {

  var HIT = { x: 640, y: 205 };
  var FONT = '900 230px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  var BW = 62, BH = 30, GAP = 3;
  var TONES = ['#2b303b', '#333946', '#262b35', '#2f3542'];

  var mask = null, MW = 1000, MH = 560;
  var cracks = [], edge = [], debris = [], dust = [], sparks = [], embers = [];
  var seed = 1;

  function rand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function rnd(a, b) { return a + rand() * (b - a); }
  function hash(r, c) { var h = Math.sin(r * 127.1 + c * 311.7) * 43758.5453; return h - Math.floor(h); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* ---------- маска цифр: из неё берутся края и обломки ---------- */
  function init() {
    var m = document.createElement('canvas');
    m.width = MW; m.height = MH;
    var g = m.getContext('2d');
    g.font = FONT; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#000';
    g.fillText('404', HIT.x, HIT.y);
    mask = g.getImageData(0, 0, MW, MH).data;

    // Точки на границе цифр — для сколов по краю и угольков
    edge = [];
    for (var y = 60; y < 360; y += 3) {
      for (var x = 380; x < 900; x += 3) {
        if (at(x, y) && (!at(x + 6, y) || !at(x - 6, y) || !at(x, y + 6) || !at(x, y - 6))) edge.push([x, y]);
      }
    }
  }

  function at(x, y) {
    if (x < 0 || y < 0 || x >= MW || y >= MH) return 0;
    return mask[((y | 0) * MW + (x | 0)) * 4 + 3] > 128 ? 1 : 0;
  }

  /* ---------- сброс сцены ---------- */
  function reset() {
    seed = 20260911;
    debris = []; dust = []; sparks = []; embers = [];

    // Трещины расходятся от точки удара ломаными линиями
    cracks = [];
    for (var i = 0; i < 18; i++) {
      var ang = (i / 18) * Math.PI * 2 + rnd(-0.15, 0.15);
      var x = HIT.x + Math.cos(ang) * rnd(30, 70), y = HIT.y + Math.sin(ang) * rnd(24, 50);
      var pts = [[x, y]], len = rnd(150, 380), done = 0;
      while (done < len) {
        ang += rnd(-0.5, 0.5);
        var st = rnd(16, 30);
        x += Math.cos(ang) * st; y += Math.sin(ang) * st * 0.8;
        pts.push([x, y]); done += st;
      }
      cracks.push(pts);
    }
  }

  /* ---------- обломки: идут волной вслед за раскрытием пробоины ---------- */
  function spawnDebris() {
    var pool = [];
    for (var y = 110; y < 310; y += 15) {
      for (var x = 420; x < 870; x += 15) if (at(x, y)) pool.push([x, y]);
    }
    for (var i = pool.length - 1; i > 0; i--) { var k = (rand() * (i + 1)) | 0; var tmp = pool[i]; pool[i] = pool[k]; pool[k] = tmp; }
    pool = pool.slice(0, 170);

    pool.forEach(function (p) {
      var dx = p[0] - HIT.x, dy = p[1] - HIT.y, d = Math.hypot(dx, dy) || 1;
      var toCam = rand() < 0.62;                      // часть летит на зрителя, часть — внутрь
      var sp = rnd(160, 460);
      var verts = [], n = 4 + ((rand() * 3) | 0), r = rnd(6, 15);
      for (var v = 0; v < n; v++) {
        var a = (v / n) * Math.PI * 2 + rnd(-0.3, 0.3);
        verts.push(Math.cos(a) * r * rnd(0.6, 1.1), Math.sin(a) * r * rnd(0.5, 0.9));
      }
      debris.push({
        x: p[0], y: p[1], delay: d / 1300,
        vx: dx / d * sp + rnd(-50, 50), vy: dy / d * sp - rnd(80, 260),
        a: rnd(0, 6.3), va: rnd(-8, 8),
        z: 0, vz: toCam ? rnd(0.9, 2.2) : -rnd(0.5, 0.9),
        verts: verts, tone: TONES[(rand() * 4) | 0], live: false, dead: false
      });
    });
  }

  function burst() {
    spawnDebris();
    for (var s = 0; s < 110; s++) {
      var ang = rnd(0, 6.3), sp = rnd(160, 820);
      sparks.push({ x: HIT.x, y: HIT.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 80, life: rnd(0.3, 1), max: 1 });
    }
    for (var u = 0; u < 46; u++) {
      dust.push({ x: HIT.x + rnd(-190, 190), y: HIT.y + rnd(-110, 110), vx: rnd(-80, 80), vy: rnd(-70, -10),
                  r: rnd(20, 60), life: rnd(1.4, 3), max: 3 });
    }
  }

  // Искры, пока луч держит стену, ещё до пробоя
  function hitSparks(n) {
    for (var i = 0; i < n; i++) {
      var ang = rnd(Math.PI * 0.55, Math.PI * 1.45), sp = rnd(120, 480);
      sparks.push({ x: HIT.x - 20, y: HIT.y + rnd(-10, 10), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 60,
                    life: rnd(0.2, 0.55), max: 0.55 });
    }
  }

  /* ---------- физика ---------- */
  function update(dt, sinceBreak) {
    for (var i = 0; i < debris.length; i++) {
      var p = debris[i];
      if (p.dead) continue;
      if (!p.live) { if (sinceBreak >= p.delay) p.live = true; else continue; }
      p.vy += 820 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      p.a += p.va * dt; p.z += p.vz * dt;
      if (p.y > 900 || p.z < -0.85 || p.z > 3.2) p.dead = true;
    }
    for (var u = 0; u < dust.length; u++) {
      var q = dust[u];
      if (q.life <= 0) continue;
      q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.99; q.r += 24 * dt; q.life -= dt;
    }
    for (var s = 0; s < sparks.length; s++) {
      var sp = sparks[s];
      if (sp.life <= 0) continue;
      sp.vy += 760 * dt; sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.life -= dt;
    }
    // угольки поднимаются от раскалённого края
    if (sinceBreak > 0 && sinceBreak < 3 && embers.length < 90 && rand() < 0.6 && edge.length) {
      var e = edge[(rand() * edge.length) | 0];
      embers.push({ x: e[0], y: e[1], vx: rnd(-14, 14), vy: rnd(-46, -18), life: rnd(1, 2.2), max: 2.2, r: rnd(1, 2.4) });
    }
    for (var k = 0; k < embers.length; k++) {
      var em = embers[k];
      if (em.life <= 0) continue;
      em.x += em.vx * dt + Math.sin(em.life * 6) * 0.3; em.y += em.vy * dt; em.life -= dt;
    }
  }

  /* ---------- что видно сквозь пробоину ---------- */
  function drawBackdrop(g, view, t, open) {
    g.fillStyle = '#04060b';
    g.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    if (open <= 0) return;

    g.save();
    g.globalCompositeOperation = 'lighter';
    var core = g.createRadialGradient(HIT.x, HIT.y, 0, HIT.x, HIT.y, 380);
    core.addColorStop(0, 'rgba(210,236,255,' + 0.9 * open + ')');
    core.addColorStop(0.25, 'rgba(110,170,255,' + 0.55 * open + ')');
    core.addColorStop(1, 'rgba(40,70,160,0)');
    g.fillStyle = core;
    g.fillRect(HIT.x - 400, HIT.y - 400, 800, 800);

    // лучи света медленно вращаются за стеной
    for (var i = 0; i < 12; i++) {
      var a = i / 12 * Math.PI * 2 + t * 0.12;
      var w = 0.07 + 0.04 * Math.sin(t * 0.9 + i);
      g.fillStyle = 'rgba(170,215,255,' + 0.09 * open + ')';
      g.beginPath();
      g.moveTo(HIT.x, HIT.y);
      g.lineTo(HIT.x + Math.cos(a - w) * 700, HIT.y + Math.sin(a - w) * 700);
      g.lineTo(HIT.x + Math.cos(a + w) * 700, HIT.y + Math.sin(a + w) * 700);
      g.closePath(); g.fill();
    }
    g.restore();
  }

  /* ---------- стена на отдельном слое ---------- */
  function drawWall(w, view, t, crackK, holeR, hot) {
    var r0 = Math.floor(view.y0 / (BH + GAP)) - 1, r1 = Math.ceil(view.y1 / (BH + GAP)) + 1;
    var c0 = Math.floor(view.x0 / (BW + GAP)) - 1, c1 = Math.ceil(view.x1 / (BW + GAP)) + 1;

    w.fillStyle = '#12151c';                           // шов
    w.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);

    for (var r = r0; r <= r1; r++) {
      var off = (r & 1) ? -(BW + GAP) / 2 : 0;
      for (var c = c0; c <= c1; c++) {
        var x = c * (BW + GAP) + off, y = r * (BH + GAP);
        var h = hash(r, c);
        w.fillStyle = TONES[(h * 4) | 0];
        w.fillRect(x, y, BW, BH);
        w.fillStyle = 'rgba(255,255,255,.055)'; w.fillRect(x, y, BW, 3);
        w.fillStyle = 'rgba(0,0,0,.26)';        w.fillRect(x, y + BH - 3, BW, 3);
        if (h > 0.82) {                                // редкие сколы на камне
          w.fillStyle = 'rgba(0,0,0,.28)';
          w.fillRect(x + h * 40, y + 8, 6, 4);
        }
      }
    }

    // трещины прорастают, пока луч держит стену
    if (crackK > 0) {
      w.lineJoin = 'round'; w.lineCap = 'round';
      for (var i = 0; i < cracks.length; i++) {
        var pts = cracks[i], n = Math.max(2, Math.ceil(pts.length * crackK));
        w.strokeStyle = 'rgba(0,0,0,.75)'; w.lineWidth = 3.2;
        w.beginPath(); w.moveTo(pts[0][0], pts[0][1]);
        for (var k = 1; k < n; k++) w.lineTo(pts[k][0], pts[k][1]);
        w.stroke();
        w.strokeStyle = 'rgba(160,200,255,' + (0.5 * hot + 0.08) + ')'; w.lineWidth = 1.2;
        w.stroke();
      }
    }

    if (holeR <= 0) return;

    // пробоина: вырезаем цифры в пределах растущего круга
    w.save();
    w.beginPath(); w.arc(HIT.x, HIT.y, holeR, 0, 6.3); w.clip();
    w.globalCompositeOperation = 'destination-out';
    w.font = FONT; w.textAlign = 'center'; w.textBaseline = 'middle';
    w.fillText('404', HIT.x, HIT.y);
    w.lineWidth = 8; w.lineJoin = 'round'; w.strokeText('404', HIT.x, HIT.y);
    for (var e = 0; e < edge.length; e += 11) {        // сколы по краю
      w.beginPath(); w.arc(edge[e][0], edge[e][1], 3 + hash(e, 7) * 6, 0, 6.3); w.fill();
    }

    // раскалённая кромка остывает до голубого
    w.globalCompositeOperation = 'source-atop';
    var rr = Math.round(90 + 165 * hot), gg = Math.round(150 + 60 * hot), bb = Math.round(255 - 135 * hot);
    w.shadowColor = 'rgba(' + rr + ',' + gg + ',' + bb + ',1)'; w.shadowBlur = 22;
    w.strokeStyle = 'rgba(' + rr + ',' + gg + ',' + bb + ',' + (0.45 + 0.5 * hot) + ')';
    w.lineWidth = 22; w.strokeText('404', HIT.x, HIT.y);
    w.restore();
  }

  /* ---------- частицы поверх стены ---------- */
  function drawParticles(g, t) {
    for (var i = 0; i < debris.length; i++) {
      var p = debris[i];
      if (!p.live || p.dead) continue;
      var sc = 1 + p.z;
      g.save();
      g.translate(p.x, p.y); g.rotate(p.a); g.scale(sc, sc);
      g.globalAlpha = p.z < 0 ? clamp(1 + p.z * 1.2, 0, 1) : clamp(1.4 - p.z * 0.4, 0, 1);
      g.fillStyle = p.z < 0 ? '#1c2029' : p.tone;
      g.beginPath(); g.moveTo(p.verts[0], p.verts[1]);
      for (var v = 2; v < p.verts.length; v += 2) g.lineTo(p.verts[v], p.verts[v + 1]);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.fillRect(p.verts[0] - 4, p.verts[1] - 1, 8, 2);
      g.restore();
    }

    g.save();
    for (var u = 0; u < dust.length; u++) {
      var q = dust[u];
      if (q.life <= 0) continue;
      g.globalAlpha = 0.14 * (q.life / q.max);
      g.fillStyle = '#8b93a6';
      g.beginPath(); g.arc(q.x, q.y, q.r, 0, 6.3); g.fill();
    }
    g.restore();

    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    for (var s = 0; s < sparks.length; s++) {
      var sp = sparks[s];
      if (sp.life <= 0) continue;
      var k = sp.life / sp.max;
      g.strokeStyle = 'rgba(210,236,255,' + k + ')'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(sp.x, sp.y); g.lineTo(sp.x - sp.vx * 0.014, sp.y - sp.vy * 0.014); g.stroke();
    }
    for (var e = 0; e < embers.length; e++) {
      var em = embers[e];
      if (em.life <= 0) continue;
      var a = em.life / em.max;
      g.fillStyle = 'rgba(255,190,110,' + a + ')';
      g.beginPath(); g.arc(em.x, em.y, em.r, 0, 6.3); g.fill();
    }
    g.restore();
  }

  function finalize() {                                // для «уменьшить движение»: только итоговый кадр
    debris = []; sparks = []; dust = [];
  }

  return {
    HIT: HIT, init: init, reset: reset, burst: burst, hitSparks: hitSparks,
    update: update, drawBackdrop: drawBackdrop, drawWall: drawWall,
    drawParticles: drawParticles, finalize: finalize
  };
})();
