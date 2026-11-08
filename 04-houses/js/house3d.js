/* =========================================================
   КОНТУР — трёхмерный конструктор дома
   Собственный рендер на WebGL. Никаких библиотек: геометрия
   строится кодом из коробок, четырёхугольников и треугольников,
   освещение считается в шейдере.

   Наружу отдаётся объект HouseScene: init(), setOptions(), dispose().
   ========================================================= */
'use strict';

var HouseScene = (function () {

  /* ---------- Матрицы ---------- */

  function perspective(fovyDeg, aspect, near, far) {
    var f = 1 / Math.tan((fovyDeg * Math.PI / 180) / 2);
    var nf = 1 / (near - far);
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, 2 * far * near * nf, 0
    ]);
  }

  function normalize(v) {
    var len = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / len, v[1] / len, v[2] / len];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

  function lookAt(eye, target, up) {
    var z = normalize(sub(eye, target));
    var x = normalize(cross(up, z));
    var y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
    ]);
  }

  /* ---------- Построитель геометрии ---------- */

  var FACES = [
    { n: [0, 0, 1],  v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },
    { n: [0, 0,-1],  v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },
    { n: [1, 0, 0],  v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },
    { n: [-1,0, 0],  v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },
    { n: [0, 1, 0],  v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
    { n: [0,-1, 0],  v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] }
  ];

  function Builder() { this.pos = []; this.nrm = []; this.col = []; this.glow = []; }

  Builder.prototype.push = function (p, n, c, g) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    this.glow.push(g || 0);
  };

  Builder.prototype.tri = function (a, b, c, color, glow) {
    var n = normalize(cross(sub(b, a), sub(c, a)));
    this.push(a, n, color, glow);
    this.push(b, n, color, glow);
    this.push(c, n, color, glow);
    return this;
  };

  Builder.prototype.quad = function (a, b, c, d, color, glow) {
    this.tri(a, b, c, color, glow);
    this.tri(a, c, d, color, glow);
    return this;
  };

  Builder.prototype.box = function (x, y, z, w, h, d, color, glow) {
    var self = this;
    FACES.forEach(function (face) {
      [0, 1, 2, 0, 2, 3].forEach(function (idx) {
        var v = face.v[idx];
        self.push([x + v[0] * w, y + v[1] * h, z + v[2] * d], face.n, color, glow);
      });
    });
    return this;
  };

  /* ---------- Цвет ---------- */

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function shade(c, k) {
    return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
  }

  /* ---------- Сцена дома ---------- */

  function buildHouse(o) {
    var b = new Builder();

    var wallC = hexToRgb(o.wall);
    var roofC = hexToRgb(o.roof);
    var trim  = [0.93, 0.92, 0.88];
    var glass = [1.0, 0.80, 0.44];        // тёплый свет в окнах
    var ground = [0.16, 0.24, 0.20];
    var path = [0.34, 0.34, 0.33];
    var wood = [0.42, 0.30, 0.19];
    var dark = [0.10, 0.13, 0.18];

    // Габариты зависят от площади и этажности
    var area = o.area;
    var floors = o.floors;                 // 1, 1.5 или 2
    var footprint = area / (floors === 1 ? 1 : floors === 1.5 ? 1.55 : 1.9);
    var W = Math.sqrt(footprint * 1.35);   // ширина по фасаду
    var D = footprint / W;                 // глубина
    W = Math.max(6, Math.min(14, W));
    D = Math.max(6, Math.min(12, D));

    var wallH = floors === 1 ? 3.0 : floors === 1.5 ? 3.6 : 5.8;
    var roofH = floors === 1.5 ? 3.4 : 2.6;
    var over = 0.55;                        // свес кровли

    var x0 = -W / 2, z0 = -D / 2;

    /* --- участок --- */
    b.box(-22, -0.3, -22, 44, 0.3, 44, ground);
    // дорожка к крыльцу
    b.box(-1.4, 0.001, z0 + D, 2.8, 0.02, 9, path);

    /* --- цоколь --- */
    b.box(x0 - 0.25, 0, z0 - 0.25, W + 0.5, 0.55, D + 0.5, dark);

    /* --- стены --- */
    b.box(x0, 0.55, z0, W, wallH, D, wallC);

    // горизонтальная расшивка досок
    var planks = Math.floor(wallH / 0.42);
    for (var p = 1; p < planks; p++) {
      var py = 0.55 + p * 0.42;
      b.box(x0 - 0.012, py, z0 + D, W + 0.024, 0.03, 0.02, shade(wallC, 0.82));
      b.box(x0 - 0.012, py, z0 - 0.02, W + 0.024, 0.03, 0.02, shade(wallC, 0.82));
    }

    /* --- фронтоны и кровля --- */
    var apex = 0.55 + wallH + roofH;
    var cx = 0;

    // Треугольные фронтоны спереди и сзади
    b.tri([x0, 0.55 + wallH, z0 + D], [x0 + W, 0.55 + wallH, z0 + D], [cx, apex, z0 + D], shade(wallC, 1.06));
    b.tri([x0 + W, 0.55 + wallH, z0], [x0, 0.55 + wallH, z0], [cx, apex, z0], shade(wallC, 1.06));

    // Два ската с свесом
    var eaveL = [x0 - over, 0.55 + wallH - 0.15, 0];
    var eaveR = [x0 + W + over, 0.55 + wallH - 0.15, 0];
    var zf = z0 + D + over, zb = z0 - over;

    b.quad([eaveL[0], eaveL[1], zf], [cx, apex, zf], [cx, apex, zb], [eaveL[0], eaveL[1], zb], roofC);
    b.quad([cx, apex, zf], [eaveR[0], eaveR[1], zf], [eaveR[0], eaveR[1], zb], [cx, apex, zb], roofC);
    // торцы кровли, чтобы не просвечивала
    b.tri([eaveL[0], eaveL[1], zf], [eaveR[0], eaveR[1], zf], [cx, apex, zf], shade(roofC, 0.75));
    b.tri([eaveR[0], eaveR[1], zb], [eaveL[0], eaveL[1], zb], [cx, apex, zb], shade(roofC, 0.75));

    /* --- окна --- */
    function window3(x, y, w, h) {
      // рама и стекло на переднем фасаде
      b.box(x - 0.09, y - 0.09, z0 + D - 0.01, w + 0.18, h + 0.18, 0.1, trim);
      b.box(x, y, z0 + D + 0.06, w, h, 0.05, glass, 1);
      // переплёт
      b.box(x + w / 2 - 0.03, y, z0 + D + 0.09, 0.06, h, 0.03, trim);
    }

    var winY = 1.35;
    var winW = 1.5, winH = 1.5;
    var gaps = W > 10 ? 3 : 2;
    for (var i = 0; i < gaps; i++) {
      var wx = x0 + 0.9 + i * ((W - 1.8 - winW) / Math.max(1, gaps - 1));
      if (Math.abs(wx + winW / 2) < 1.5) continue;      // не заезжаем на дверь
      window3(wx, winY, winW, winH);
    }
    if (floors === 2) {
      for (var j = 0; j < gaps; j++) {
        var wx2 = x0 + 0.9 + j * ((W - 1.8 - winW) / Math.max(1, gaps - 1));
        window3(wx2, winY + 2.9, winW, winH);
      }
    }
    if (floors === 1.5) {
      // мансардное окно во фронтоне
      b.box(-0.85, 0.55 + wallH + 0.35, z0 + D + 0.04, 1.7, 1.15, 0.06, glass, 1);
      b.box(-0.95, 0.55 + wallH + 0.25, z0 + D - 0.01, 1.9, 1.35, 0.06, trim);
      b.box(-0.03, 0.55 + wallH + 0.35, z0 + D + 0.08, 0.06, 1.15, 0.03, trim);
    }

    /* --- дверь и крыльцо --- */
    b.box(-0.75, 0.55, z0 + D - 0.02, 1.5, 2.25, 0.12, trim);
    b.box(-0.6, 0.55, z0 + D + 0.05, 1.2, 2.1, 0.06, wood);
    b.box(0.34, 1.55, z0 + D + 0.1, 0.1, 0.28, 0.06, [0.85, 0.72, 0.42]);
    // ступени
    b.box(-1.3, 0.36, z0 + D + 0.1, 2.6, 0.2, 0.5, path);
    b.box(-1.5, 0.18, z0 + D + 0.55, 3.0, 0.2, 0.5, path);

    /* --- терраса --- */
    if (o.terrace) {
      var tW = Math.min(W * 0.62, 6.5), tD = 3.4;
      var tx = x0 + W - tW, tz = z0 + D;
      b.box(tx, 0.34, tz, tW, 0.16, tD, wood);
      for (var s = 0; s < 6; s++) {
        b.box(tx, 0.5, tz + 0.1 + s * 0.55, tW, 0.02, 0.44, shade(wood, 0.86));
      }
      // столбы и навес
      [tx + 0.12, tx + tW - 0.36].forEach(function (px) {
        b.box(px, 0.5, tz + tD - 0.4, 0.24, 2.5, 0.24, trim);
      });
      b.box(tx - 0.1, 3.0, tz - 0.1, tW + 0.2, 0.16, tD + 0.3, shade(roofC, 0.92));
      // фонарь на террасе
      b.box(tx + tW / 2 - 0.14, 2.6, tz + tD / 2, 0.28, 0.28, 0.28, glass, 1);
    }

    /* --- труба --- */
    b.box(W * 0.22, 0.55 + wallH + 0.6, -0.55, 0.75, roofH + 0.9, 0.75, shade(dark, 1.5));
    b.box(W * 0.22 - 0.08, 0.55 + wallH + roofH + 1.4, -0.63, 0.91, 0.14, 0.91, shade(dark, 1.9));

    /* --- ели вокруг --- */
    function fir(x, z, scale) {
      var h = 3.2 * scale;
      b.box(x - 0.13 * scale, 0, z - 0.13 * scale, 0.26 * scale, 0.7 * scale, 0.26 * scale, wood);
      for (var t = 0; t < 3; t++) {
        var base = 0.55 * scale + t * (h / 3.6);
        var r = (1.15 - t * 0.28) * scale;
        var top = base + (h / 2.4);
        var col = shade([0.16, 0.34, 0.24], 1 + t * 0.12);
        b.tri([x - r, base, z + r], [x + r, base, z + r], [x, top, z], col);
        b.tri([x + r, base, z - r], [x - r, base, z - r], [x, top, z], col);
        b.tri([x + r, base, z + r], [x + r, base, z - r], [x, top, z], col);
        b.tri([x - r, base, z - r], [x - r, base, z + r], [x, top, z], col);
      }
    }
    fir(-W / 2 - 3.6, z0 + 1.5, 1.15);
    fir(-W / 2 - 5.2, z0 + D + 2.6, 0.9);
    fir(W / 2 + 3.9, z0 - 0.4, 1.05);
    fir(W / 2 + 5.6, z0 + D + 1.8, 0.8);

    /* --- фонарь у дорожки --- */
    b.box(2.4, 0, z0 + D + 5.2, 0.16, 2.2, 0.16, dark);
    b.box(2.24, 2.2, z0 + D + 5.04, 0.48, 0.42, 0.48, glass, 1);
    b.box(2.18, 2.62, z0 + D + 4.98, 0.6, 0.12, 0.6, dark);

    return b;
  }

  /* ---------- Шейдеры ---------- */

  var VERT = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'attribute vec3 aColor;',
    'attribute float aGlow;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'varying vec3 vNormal;',
    'varying vec3 vColor;',
    'varying vec3 vPos;',
    'varying float vGlow;',
    'void main(){',
    '  vNormal = aNormal;',
    '  vColor = aColor;',
    '  vPos = aPos;',
    '  vGlow = aGlow;',
    '  gl_Position = uProj * uView * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  // Вечерний свет: холодное небо сверху, тёплый закат сбоку,
  // окна светятся сами и подкрашивают воздух вокруг дома
  var FRAG = [
    'precision mediump float;',
    'varying vec3 vNormal;',
    'varying vec3 vColor;',
    'varying vec3 vPos;',
    'varying float vGlow;',
    'uniform vec3 uCam;',
    'void main(){',
    '  vec3 n = normalize(vNormal);',
    '  vec3 key = normalize(vec3(-0.55, 0.62, 0.56));',
    '  float d = max(dot(n, key), 0.0);',
    '  float sky = 0.5 + 0.5 * n.y;',
    '  vec3 ambient = mix(vec3(0.15, 0.19, 0.28), vec3(0.31, 0.36, 0.47), sky);',
    '  vec3 warm = vec3(1.0, 0.86, 0.66);',
    '  vec3 v = normalize(uCam - vPos);',
    '  vec3 h = normalize(key + v);',
    '  float spec = pow(max(dot(n, h), 0.0), 36.0) * 0.22;',
    '  vec3 col = vColor * (ambient + warm * d * 0.88) + vec3(spec);',
    '  col = mix(col, vColor * 1.25 + vec3(0.25, 0.16, 0.02), vGlow);',
    '  float fog = clamp((length(uCam - vPos) - 16.0) / 30.0, 0.0, 0.55);',
    '  col = mix(col, vec3(0.07, 0.10, 0.16), fog);',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(gl, type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('Шейдер не собрался:', gl.getShaderInfoLog(sh));
      gl.deleteShader(sh);
      return null;
    }
    return sh;
  }

  /* ---------- Публичный объект ---------- */

  var state = null;

  function init(canvas, opts) {
    var gl = canvas.getContext('webgl', { antialias: true, alpha: false })
          || canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
    if (!gl) return null;

    var vs = compile(gl, gl.VERTEX_SHADER, VERT);
    var fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('Программа не слинковалась:', gl.getProgramInfoLog(prog));
      return null;
    }
    gl.useProgram(prog);

    state = {
      gl: gl, canvas: canvas, prog: prog,
      buffers: { pos: gl.createBuffer(), nrm: gl.createBuffer(), col: gl.createBuffer(), glow: gl.createBuffer() },
      loc: {
        aPos: gl.getAttribLocation(prog, 'aPos'),
        aNormal: gl.getAttribLocation(prog, 'aNormal'),
        aColor: gl.getAttribLocation(prog, 'aColor'),
        aGlow: gl.getAttribLocation(prog, 'aGlow'),
        uProj: gl.getUniformLocation(prog, 'uProj'),
        uView: gl.getUniformLocation(prog, 'uView'),
        uCam: gl.getUniformLocation(prog, 'uCam')
      },
      count: 0,
      yaw: 0.62, pitch: 0.22, dist: 34,
      targetYaw: 0.55, targetPitch: 0.20,
      dragging: false, lastX: 0, lastY: 0,
      idle: 0, raf: 0, running: true, tick: 0, onScreen: true,
      opts: { wall: opts.wall, roof: opts.roof, area: opts.area, floors: opts.floors, terrace: opts.terrace }
    };

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0.055, 0.078, 0.125, 1);

    upload();
    bindPointer();
    resize();
    window.addEventListener('resize', resize);
    state.raf = requestAnimationFrame(frame);
    return state;
  }

  function upload() {
    var gl = state.gl;
    var built = buildHouse(state.opts);
    state.count = built.pos.length / 3;

    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(built.pos), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.nrm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(built.nrm), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.col);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(built.col), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.glow);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(built.glow), gl.STATIC_DRAW);
  }

  function resize() {
    if (!state) return;
    var c = state.canvas;
    // Ограничиваем плотность пикселей — на слабых машинах это заметно экономит силы
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var w = Math.max(1, Math.round(c.clientWidth * dpr));
    var h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    state.gl.viewport(0, 0, c.width, c.height);
  }

  function bindPointer() {
    var c = state.canvas;

    c.addEventListener('pointerdown', function (e) {
      state.dragging = true;
      state.idle = 0;
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      c.setPointerCapture(e.pointerId);
      c.classList.add('is-grabbing');
    });

    c.addEventListener('pointermove', function (e) {
      if (!state.dragging) return;
      state.targetYaw += (e.clientX - state.lastX) * 0.008;
      state.targetPitch += (e.clientY - state.lastY) * 0.004;
      state.targetPitch = Math.max(0.04, Math.min(0.66, state.targetPitch));
      state.lastX = e.clientX;
      state.lastY = e.clientY;
      state.idle = 0;
    });

    function stop(e) {
      state.dragging = false;
      if (e && c.hasPointerCapture && c.hasPointerCapture(e.pointerId)) c.releasePointerCapture(e.pointerId);
      c.classList.remove('is-grabbing');
    }
    c.addEventListener('pointerup', stop);
    c.addEventListener('pointercancel', stop);

    // Управление с клавиатуры — сцена должна быть доступна без мыши
    c.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 0.3 : 0.12;
      if (e.key === 'ArrowLeft') { state.targetYaw -= step; state.idle = 0; e.preventDefault(); }
      if (e.key === 'ArrowRight') { state.targetYaw += step; state.idle = 0; e.preventDefault(); }
      if (e.key === 'ArrowUp') { state.targetPitch = Math.min(0.66, state.targetPitch + step * 0.5); state.idle = 0; e.preventDefault(); }
      if (e.key === 'ArrowDown') { state.targetPitch = Math.max(0.04, state.targetPitch - step * 0.5); state.idle = 0; e.preventDefault(); }
    });
  }

  function frame() {
    if (!state || !state.running) return;
    var gl = state.gl;

    // Пока канвас за экраном или вкладка скрыта — кадры не рисуем
    state.tick = (state.tick + 1) % 10;
    if (state.tick === 0) {
      var r = state.canvas.getBoundingClientRect();
      state.onScreen = r.bottom > -200 && r.top < window.innerHeight + 200;
    }
    if (!state.onScreen || document.hidden) {
      state.raf = requestAnimationFrame(frame);
      return;
    }

    state.idle++;
    if (!state.dragging && state.idle > 180) state.targetYaw += 0.0014;
    state.yaw += (state.targetYaw - state.yaw) * 0.09;
    state.pitch += (state.targetPitch - state.pitch) * 0.09;

    var target = [0, 2.3, 1.2];
    var eye = [
      target[0] + state.dist * Math.cos(state.pitch) * Math.sin(state.yaw),
      target[1] + state.dist * Math.sin(state.pitch) + 1.6,
      target[2] + state.dist * Math.cos(state.pitch) * Math.cos(state.yaw)
    ];

    var aspect = state.canvas.clientWidth / Math.max(1, state.canvas.clientHeight);
    gl.uniformMatrix4fv(state.loc.uProj, false, perspective(36, aspect, 0.1, 140));
    gl.uniformMatrix4fv(state.loc.uView, false, lookAt(eye, target, [0, 1, 0]));
    gl.uniform3f(state.loc.uCam, eye[0], eye[1], eye[2]);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    bindAttr(state.loc.aPos, state.buffers.pos, 3);
    bindAttr(state.loc.aNormal, state.buffers.nrm, 3);
    bindAttr(state.loc.aColor, state.buffers.col, 3);
    bindAttr(state.loc.aGlow, state.buffers.glow, 1);
    gl.drawArrays(gl.TRIANGLES, 0, state.count);

    state.raf = requestAnimationFrame(frame);
  }

  function bindAttr(location, buffer, size) {
    var gl = state.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
  }

  function setOptions(next) {
    if (!state) return;
    Object.keys(next).forEach(function (k) {
      if (next[k] !== undefined) state.opts[k] = next[k];
    });
    upload();
  }

  function dispose() {
    if (!state) return;
    state.running = false;
    cancelAnimationFrame(state.raf);
    window.removeEventListener('resize', resize);
    state = null;
  }

  function isReady() { return state !== null; }

  return { init: init, setOptions: setOptions, dispose: dispose, isReady: isReady, resize: resize };
})();
