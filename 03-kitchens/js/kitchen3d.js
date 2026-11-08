/* =========================================================
   ФАСАД — трёхмерный конструктор кухни
   Собственный рендер на WebGL. Никаких библиотек: ни three.js,
   ни загрузчиков моделей — вся геометрия строится кодом из
   параллелепипедов, освещение считается в шейдере.

   Почему так: страница остаётся полностью автономной и держит
   строгий Content-Security-Policy, а весь файл весит несколько
   килобайт вместо сотен.

   Наружу отдаётся один объект KitchenScene с методами
   init(), setColors() и dispose().
   ========================================================= */
'use strict';

var KitchenScene = (function () {

  /* ---------- Небольшая матричная математика ---------- */

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
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ];
  }

  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  function lookAt(eye, target, up) {
    var z = normalize([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
    var x = normalize(cross(up, z));
    var y = cross(z, x);
    return new Float32Array([
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
    ]);
  }

  /* ---------- Построение геометрии ---------- */

  // Шесть граней куба: нормаль и четыре угла в единичных координатах
  var FACES = [
    { n: [0, 0, 1],  v: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]] },  // перед
    { n: [0, 0,-1],  v: [[1,0,0],[0,0,0],[0,1,0],[1,1,0]] },  // зад
    { n: [1, 0, 0],  v: [[1,0,1],[1,0,0],[1,1,0],[1,1,1]] },  // право
    { n: [-1,0, 0],  v: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]] },  // лево
    { n: [0, 1, 0],  v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },  // верх
    { n: [0,-1, 0],  v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] }   // низ
  ];

  function Builder() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
  }

  // x,y,z — угол «ближе к началу координат», w,h,d — размеры
  Builder.prototype.box = function (x, y, z, w, h, d, color) {
    var self = this;
    FACES.forEach(function (face) {
      var quad = face.v;
      var order = [0, 1, 2, 0, 2, 3];
      order.forEach(function (idx) {
        var c = quad[idx];
        self.pos.push(x + c[0] * w, y + c[1] * h, z + c[2] * d);
        self.nrm.push(face.n[0], face.n[1], face.n[2]);
        self.col.push(color[0], color[1], color[2]);
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

  function shade(rgb, k) {
    return [
      Math.min(1, Math.max(0, rgb[0] * k)),
      Math.min(1, Math.max(0, rgb[1] * k)),
      Math.min(1, Math.max(0, rgb[2] * k))
    ];
  }

  /* ---------- Сцена кухни ---------- */

  function buildKitchen(opts) {
    var b = new Builder();

    var facade = hexToRgb(opts.facade);
    var top = hexToRgb(opts.top);
    var metal = hexToRgb(opts.metal);

    var wall = [0.90, 0.90, 0.885];
    var floor = [0.66, 0.55, 0.42];
    var dark = [0.13, 0.14, 0.145];
    var glass = [0.72, 0.79, 0.82];

    // пол и стены
    b.box(-6, -0.06, -4, 12, 0.06, 9, floor);
    b.box(-6, 0, -4, 12, 5.4, 0.12, wall);
    b.box(-6.12, 0, -4, 0.12, 5.4, 9, wall);

    // фартук между шкафами
    b.box(-4.4, 1.62, -3.88, 8.8, 1.5, 0.04, shade(wall, 0.97));

    /* --- нижний ряд шкафов --- */
    var baseY = 0.12;
    var baseH = 1.4;
    var baseD = 1.3;
    var startX = -4.4;
    var moduleW = 1.1;
    var modules = 8;

    // цоколь
    b.box(startX, 0, -3.9 + 0.1, moduleW * modules, 0.12, baseD - 0.1, dark);

    for (var i = 0; i < modules; i++) {
      var x = startX + i * moduleW;
      var isOven = (i === 5);
      var body = isOven ? dark : facade;

      b.box(x + 0.02, baseY, -3.9, moduleW - 0.04, baseH, baseD, body);

      if (isOven) {
        // стекло духовки и панель управления
        b.box(x + 0.12, baseY + 0.25, -3.9 - 0.03, moduleW - 0.24, 0.72, 0.04, glass);
        b.box(x + 0.12, baseY + 1.08, -3.9 - 0.03, moduleW - 0.24, 0.12, 0.04, shade(metal, 0.9));
      } else {
        // ручка-рейлинг
        b.box(x + 0.18, baseY + baseH - 0.22, -3.9 - 0.04, moduleW - 0.4, 0.05, 0.05, metal);
        // тонкая линия стыка фасадов
        b.box(x + 0.02, baseY, -3.9 - 0.005, 0.02, baseH, 0.01, shade(body, 0.7));
      }
    }

    // столешница
    b.box(startX - 0.06, baseY + baseH, -3.96, moduleW * modules + 0.12, 0.09, baseD + 0.12, top);
    // мойка
    b.box(-0.2, baseY + baseH - 0.02, -3.6, 1.0, 0.06, 0.62, shade(metal, 0.82));
    b.box(0.24, baseY + baseH + 0.05, -3.86, 0.07, 0.5, 0.07, metal);
    b.box(0.24, baseY + baseH + 0.5, -3.7, 0.07, 0.07, 0.34, metal);

    /* --- верхний ряд шкафов --- */
    var upY = 3.12;
    var upH = 1.5;
    var upD = 0.72;

    for (var j = 0; j < modules; j++) {
      if (j === 3 || j === 4) continue;                 // разрыв под вытяжку
      var ux = startX + j * moduleW;
      b.box(ux + 0.02, upY, -3.9, moduleW - 0.04, upH, upD, facade);
      b.box(ux + 0.18, upY + 0.1, -3.9 - upD - 0.04, moduleW - 0.4, 0.05, 0.05, metal);
    }

    // вытяжка: корпус и раструб
    b.box(-1.2, upY + 0.55, -3.9, 2.2, 0.95, 0.66, shade(metal, 0.95));
    b.box(-0.75, upY + 1.5, -3.9, 1.3, 1.3, 0.5, shade(metal, 0.88));
    b.box(-1.28, upY + 0.42, -3.94, 2.36, 0.14, 0.76, shade(metal, 0.7));

    /* --- остров --- */
    var isX = -2.6, isZ = -0.7, isW = 5.2, isD = 1.5, isH = 1.4;
    b.box(isX + 0.1, 0, isZ + 0.1, isW - 0.2, 0.12, isD - 0.2, dark);
    b.box(isX, 0.12, isZ, isW, isH, isD, facade);
    // фасады острова
    for (var k = 0; k < 4; k++) {
      var kx = isX + 0.06 + k * (isW - 0.12) / 4;
      b.box(kx, 0.2, isZ + isD, (isW - 0.12) / 4 - 0.05, isH - 0.16, 0.03, shade(facade, 1.08));
      b.box(kx + 0.14, 0.2 + isH - 0.36, isZ + isD + 0.03, (isW - 0.12) / 4 - 0.33, 0.05, 0.05, metal);
    }
    // столешница острова со свесом
    b.box(isX - 0.12, 0.12 + isH, isZ - 0.12, isW + 0.24, 0.1, isD + 0.5, top);
    // варочная панель
    b.box(isX + 1.3, 0.12 + isH + 0.1, isZ + 0.24, 1.5, 0.03, 0.8, dark);

    /* --- барные стулья --- */
    [-1.4, 0.6].forEach(function (sx) {
      b.box(sx, 0, isZ + isD + 0.75, 0.6, 0.08, 0.6, shade(metal, 0.75));
      b.box(sx + 0.24, 0.08, isZ + isD + 0.99, 0.12, 1.05, 0.12, shade(metal, 0.85));
      b.box(sx - 0.06, 1.13, isZ + isD + 0.68, 0.72, 0.1, 0.74, shade(facade, 0.72));
    });

    /* --- подвесные светильники --- */
    [-1.6, 0.4, 2.4].forEach(function (lx) {
      b.box(lx - 0.02, 3.6, isZ + isD / 2, 0.04, 1.8, 0.04, dark);
      b.box(lx - 0.22, 3.32, isZ + isD / 2 - 0.22, 0.44, 0.3, 0.44, shade(metal, 1.05));
      b.box(lx - 0.16, 3.28, isZ + isD / 2 - 0.16, 0.32, 0.05, 0.32, [1, 0.92, 0.72]);
    });

    /* --- мелочи на столешнице --- */
    b.box(-3.6, baseY + baseH + 0.09, -3.5, 0.22, 0.42, 0.22, shade(facade, 0.6));
    b.box(-3.25, baseY + baseH + 0.09, -3.5, 0.18, 0.3, 0.18, [0.78, 0.3, 0.24]);
    b.box(2.1, baseY + baseH + 0.09, -3.55, 0.5, 0.34, 0.34, [0.85, 0.86, 0.87]);
    b.box(isX + 3.9, 0.12 + isH + 0.1, isZ + 0.5, 0.34, 0.5, 0.34, [0.35, 0.5, 0.34]);

    return b;
  }

  /* ---------- Шейдеры ---------- */

  var VERT = [
    'attribute vec3 aPos;',
    'attribute vec3 aNormal;',
    'attribute vec3 aColor;',
    'uniform mat4 uProj;',
    'uniform mat4 uView;',
    'varying vec3 vNormal;',
    'varying vec3 vColor;',
    'varying vec3 vPos;',
    'void main(){',
    '  vNormal = aNormal;',
    '  vColor = aColor;',
    '  vPos = aPos;',
    '  gl_Position = uProj * uView * vec4(aPos, 1.0);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'varying vec3 vNormal;',
    'varying vec3 vColor;',
    'varying vec3 vPos;',
    'uniform vec3 uCam;',
    'void main(){',
    '  vec3 n = normalize(vNormal);',
    '  vec3 key = normalize(vec3(-0.45, 0.85, 0.62));',   // основной свет
    '  vec3 fill = normalize(vec3(0.7, 0.35, 0.5));',      // подсветка с другой стороны
    '  float d1 = max(dot(n, key), 0.0);',
    '  float d2 = max(dot(n, fill), 0.0) * 0.32;',
    '  float sky = 0.5 + 0.5 * n.y;',                      // мягкий свет сверху
    '  vec3 v = normalize(uCam - vPos);',
    '  vec3 h = normalize(key + v);',
    '  float spec = pow(max(dot(n, h), 0.0), 42.0) * 0.30;',
    '  vec3 col = vColor * (0.34 * sky + d1 * 0.72 + d2) + vec3(spec);',
    '  float fog = clamp((length(uCam - vPos) - 9.0) / 16.0, 0.0, 0.35);',
    '  col = mix(col, vec3(0.93, 0.94, 0.94), fog);',
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
    if (!gl) return null;                       // вызывающий код покажет запасную картинку

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

    var buffers = {
      pos: gl.createBuffer(),
      nrm: gl.createBuffer(),
      col: gl.createBuffer()
    };

    var loc = {
      aPos: gl.getAttribLocation(prog, 'aPos'),
      aNormal: gl.getAttribLocation(prog, 'aNormal'),
      aColor: gl.getAttribLocation(prog, 'aColor'),
      uProj: gl.getUniformLocation(prog, 'uProj'),
      uView: gl.getUniformLocation(prog, 'uView'),
      uCam: gl.getUniformLocation(prog, 'uCam')
    };

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.clearColor(0.93, 0.94, 0.94, 1);

    state = {
      gl: gl, canvas: canvas, prog: prog, buffers: buffers, loc: loc,
      count: 0,
      yaw: -0.42, pitch: 0.22, dist: 12.4,
      targetYaw: -0.42, targetPitch: 0.22,
      dragging: false, lastX: 0, lastY: 0,
      idle: 0, raf: 0, running: true, tick: 0, onScreen: true,
      colors: { facade: opts.facade, top: opts.top, metal: opts.metal }
    };

    upload();
    bindPointer();
    resize();
    window.addEventListener('resize', resize);
    state.raf = requestAnimationFrame(frame);
    return state;
  }

  function upload() {
    var gl = state.gl;
    var built = buildKitchen(state.colors);
    state.count = built.pos.length / 3;

    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.pos);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(built.pos), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.nrm);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(built.nrm), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, state.buffers.col);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(built.col), gl.STATIC_DRAW);
  }

  function resize() {
    if (!state) return;
    var gl = state.gl;
    var c = state.canvas;
    // Ограничиваем плотность пикселей: на слабых машинах это заметно экономит силы
    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    var w = Math.max(1, Math.round(c.clientWidth * dpr));
    var h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    gl.viewport(0, 0, c.width, c.height);
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
      state.targetPitch += (e.clientY - state.lastY) * 0.005;
      state.targetPitch = Math.max(-0.05, Math.min(0.75, state.targetPitch));
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
      if (e.key === 'ArrowUp') { state.targetPitch = Math.min(0.75, state.targetPitch + step * 0.6); state.idle = 0; e.preventDefault(); }
      if (e.key === 'ArrowDown') { state.targetPitch = Math.max(-0.05, state.targetPitch - step * 0.6); state.idle = 0; e.preventDefault(); }
    });
  }

  function frame() {
    if (!state || !state.running) return;
    var gl = state.gl;

    // Пока канвас за пределами экрана или вкладка скрыта — не рисуем.
    // Проверяем раз в десять кадров, чтобы не дёргать layout каждый кадр.
    state.tick = (state.tick + 1) % 10;
    if (state.tick === 0) {
      var r = state.canvas.getBoundingClientRect();
      state.onScreen = r.bottom > -200 && r.top < window.innerHeight + 200;
    }
    if (!state.onScreen || document.hidden) {
      state.raf = requestAnimationFrame(frame);
      return;
    }

    // Плавное догоняние цели + медленный автоповорот в простое
    state.idle++;
    if (!state.dragging && state.idle > 180) state.targetYaw += 0.0016;
    state.yaw += (state.targetYaw - state.yaw) * 0.09;
    state.pitch += (state.targetPitch - state.pitch) * 0.09;

    var target = [-0.2, 1.5, -1.6];
    var cx = target[0] + state.dist * Math.cos(state.pitch) * Math.sin(state.yaw);
    var cy = target[1] + state.dist * Math.sin(state.pitch) + 1.4;
    var cz = target[2] + state.dist * Math.cos(state.pitch) * Math.cos(state.yaw);
    var eye = [cx, cy, cz];

    var aspect = state.canvas.clientWidth / Math.max(1, state.canvas.clientHeight);
    gl.uniformMatrix4fv(state.loc.uProj, false, perspective(38, aspect, 0.1, 80));
    gl.uniformMatrix4fv(state.loc.uView, false, lookAt(eye, target, [0, 1, 0]));
    gl.uniform3f(state.loc.uCam, eye[0], eye[1], eye[2]);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    bindAttr(state.loc.aPos, state.buffers.pos);
    bindAttr(state.loc.aNormal, state.buffers.nrm);
    bindAttr(state.loc.aColor, state.buffers.col);
    gl.drawArrays(gl.TRIANGLES, 0, state.count);

    state.raf = requestAnimationFrame(frame);
  }

  function bindAttr(location, buffer) {
    var gl = state.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(location);
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
  }

  function setColors(next) {
    if (!state) return;
    if (next.facade) state.colors.facade = next.facade;
    if (next.top) state.colors.top = next.top;
    if (next.metal) state.colors.metal = next.metal;
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

  return { init: init, setColors: setColors, dispose: dispose, isReady: isReady, resize: resize };
})();
