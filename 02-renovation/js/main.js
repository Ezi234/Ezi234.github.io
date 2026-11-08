/* =========================================================
   ПОРЯДОК — скрипты
   Чистый JavaScript, без библиотек и внешних запросов.

   Принципы безопасности, заложенные в код:
   · нет inline-обработчиков (onclick=...) — всё через addEventListener,
     благодаря чему работает строгий Content-Security-Policy;
   · пользовательские данные попадают на страницу только через textContent —
     XSS через имя или комментарий невозможен;
   · скрытое поле-ловушка (honeypot) отсекает спам-ботов;
   · значения обрезаются по длине, телефон приводится к цифрам;
   · нет eval, new Function и innerHTML с данными пользователя.
   ========================================================= */
'use strict';

document.addEventListener('DOMContentLoaded', function () {

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     0. Мелочи: оттенки аватарок и год в подвале
     --------------------------------------------------------- */
  document.querySelectorAll('[data-hue]').forEach(function (el) {
    el.style.setProperty('--h', el.dataset.hue);
  });

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------------------------------------------------------
     1. Заголовок первого экрана: строки выезжают снизу
     --------------------------------------------------------- */
  var heroTitle = document.querySelector('.hero__title');
  if (heroTitle) requestAnimationFrame(function () { heroTitle.classList.add('is-in'); });

  /* ---------------------------------------------------------
     2. Навигация: активный пункт по позиции прокрутки
     Объявляем до onScroll — она вызывает spy() сразу при загрузке.
     --------------------------------------------------------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link'));
  var navTargets = navLinks.map(function (link) {
    return { link: link, section: document.querySelector(link.getAttribute('href')) };
  }).filter(function (pair) { return pair.section !== null; });

  function spy(y) {
    var pos = y + 160;
    var current = -1;
    navTargets.forEach(function (pair, i) {
      if (pair.section.offsetTop <= pos) current = i;
    });
    navTargets.forEach(function (pair, i) {
      pair.link.classList.toggle('is-active', i === current);
    });
  }

  /* ---------------------------------------------------------
     3. Прокрутка: шапка, полоса прогресса, кнопка «наверх»,
        заполнение линии этапов. Всё в одном обработчике,
        привязанном к кадрам отрисовки — так браузер не перегружается.
     --------------------------------------------------------- */
  var header = document.getElementById('header');
  var progressBar = document.getElementById('progressBar');
  var toTop = document.getElementById('toTop');
  var timeline = document.getElementById('timeline');
  var timelineFill = document.getElementById('timelineFill');

  var lastY = window.scrollY;
  var ticking = false;

  function onScrollFrame() {
    var y = window.scrollY;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;

    header.classList.toggle('is-stuck', y > 30);

    // Шапка прячется при движении вниз и возвращается при движении вверх
    if (y > 420 && y > lastY + 6) header.classList.add('is-hidden');
    else if (y < lastY - 6) header.classList.remove('is-hidden');
    lastY = y;

    if (progressBar) {
      progressBar.style.width = (docHeight > 0 ? (y / docHeight) * 100 : 0) + '%';
    }
    if (toTop) toTop.hidden = y < 700;

    // Линия этапов заполняется по мере прохождения секции
    if (timeline && timelineFill) {
      var rect = timeline.getBoundingClientRect();
      var start = window.innerHeight * 0.75;
      var progress = (start - rect.top) / (rect.height * 0.85);
      timelineFill.style.height = Math.max(0, Math.min(1, progress)) * 100 + '%';
    }

    spy(y);
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScrollFrame);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  onScrollFrame();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  }

  /* ---------------------------------------------------------
     4. Мобильное меню
     --------------------------------------------------------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');

  function closeNav() {
    nav.classList.remove('is-open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Открыть меню');
    document.body.classList.remove('is-locked');
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
      document.body.classList.toggle('is-locked', open);
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('.nav__link, .nav__cta')) closeNav();
    });
  }

  /* ---------------------------------------------------------
     5. Появление блоков при прокрутке
     --------------------------------------------------------- */
  var revealItems = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });

    revealItems.forEach(function (el, i) {
      el.style.transitionDelay = (i % 3) * 80 + 'ms';
      revealObserver.observe(el);
    });
  } else {
    // Старые браузеры: показываем всё сразу, ничего не ломая
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------------------------------------------------------
     6. Счётчики
     --------------------------------------------------------- */
  function spaced(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // Русское склонение: 1 день, 2 дня, 5 дней, 21 день, 111 дней
  function plural(n, one, few, many) {
    var abs = Math.abs(n);
    var tail10 = abs % 10;
    var tail100 = abs % 100;
    if (tail100 >= 11 && tail100 <= 14) return many;
    if (tail10 === 1) return one;
    if (tail10 >= 2 && tail10 <= 4) return few;
    return many;
  }

  function runCounter(el) {
    var target = parseFloat(el.dataset.count);
    var suffix = el.dataset.suffix || '';
    var duration = 1500;
    var start = performance.now();

    function tick(now) {
      var p = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = spaced(Math.round(target * eased)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window && counters.length) {
    var countObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        runCounter(entry.target);
        countObserver.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    counters.forEach(function (el) { countObserver.observe(el); });
  } else {
    counters.forEach(function (el) {
      el.textContent = spaced(el.dataset.count) + (el.dataset.suffix || '');
    });
  }

  /* ---------------------------------------------------------
     7. Параллакс композиции в первом экране
     --------------------------------------------------------- */
  var heroVisual = document.getElementById('heroVisual');
  if (heroVisual && !reduceMotion && window.matchMedia('(hover: hover)').matches) {
    var layers = heroVisual.querySelectorAll('[data-depth]');
    heroVisual.addEventListener('mousemove', function (e) {
      var box = heroVisual.getBoundingClientRect();
      var dx = (e.clientX - box.left - box.width / 2) / box.width;
      var dy = (e.clientY - box.top - box.height / 2) / box.height;
      layers.forEach(function (layer) {
        var depth = parseFloat(layer.dataset.depth) * 100;
        layer.style.transform = 'translate3d(' + (dx * depth).toFixed(2) + 'px,' + (dy * depth).toFixed(2) + 'px,0)';
      });
    });
    heroVisual.addEventListener('mouseleave', function () {
      layers.forEach(function (layer) { layer.style.transform = ''; });
    });
  }

  /* ---------------------------------------------------------
     8. Магнитные кнопки — слегка тянутся к курсору
     --------------------------------------------------------- */
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.magnetic').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var box = btn.getBoundingClientRect();
        var dx = (e.clientX - box.left - box.width / 2) * 0.22;
        var dy = (e.clientY - box.top - box.height / 2) * 0.32;
        btn.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });
  }

  /* ---------------------------------------------------------
     8а. Наклон карточек услуг вслед за курсором
     --------------------------------------------------------- */
  if (!reduceMotion && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.tilt').forEach(function (card) {
      card.addEventListener('mouseenter', function () { card.classList.add('is-tilting'); });
      card.addEventListener('mousemove', function (e) {
        var box = card.getBoundingClientRect();
        var dx = (e.clientX - box.left) / box.width - 0.5;
        var dy = (e.clientY - box.top) / box.height - 0.5;
        card.style.setProperty('--ry', (dx * 8).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-dy * 8).toFixed(2) + 'deg');
        card.style.setProperty('--ty', '-7px');
      });
      card.addEventListener('mouseleave', function () {
        card.classList.remove('is-tilting');
        card.style.setProperty('--ry', '0deg');
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ty', '0px');
      });
    });
  }

  /* ---------------------------------------------------------
     9. Калькулятор сметы
     --------------------------------------------------------- */
  var RATES = { cosmetic: 4500, capital: 9800, design: 16500 };
  // Санузел под ключ считается отдельно: работы там дороже квадратного метра комнат
  var BATH = { cosmetic: 70000, capital: 145000, design: 210000 };
  // Дней на квадратный метр
  var PACE = { cosmetic: 0.55, capital: 1.05, design: 1.45 };

  var calcForm = document.getElementById('calcForm');

  if (calcForm) {
    var areaInput = document.getElementById('area');
    var areaOut = document.getElementById('areaOut');
    var bathInput = document.getElementById('bath');
    var bathOut = document.getElementById('bathOut');
    var sumFrom = document.getElementById('sumFrom');
    var sumTo = document.getElementById('sumTo');
    var perSqm = document.getElementById('perSqm');
    var termOut = document.getElementById('term');
    var termWord = document.getElementById('termWord');
    var calcBar = document.getElementById('calcBar');
    var calcCta = document.getElementById('calcCta');

    var MAX_BATH = 4;
    var shown = { from: 0, to: 0, sqm: 0, term: 0 };
    var lastEstimate = null;

    function paintRange() {
      // Заливаем пройденную часть ползунка цветом
      var pct = (areaInput.value - areaInput.min) / (areaInput.max - areaInput.min) * 100;
      areaInput.style.background =
        'linear-gradient(90deg, var(--clay) 0%, var(--clay) ' + pct + '%, var(--line) ' + pct + '%, var(--line) 100%)';
    }

    function compute() {
      var area = Number(areaInput.value);
      var type = calcForm.querySelector('input[name="type"]:checked').value;
      var baths = Number(bathInput.value);

      var base = area * RATES[type] + baths * BATH[type];
      var percent = 0;
      var fixed = 0;

      calcForm.querySelectorAll('input[name="opt"]:checked').forEach(function (opt) {
        var amount = Number(opt.dataset.amount);
        if (opt.dataset.kind === 'rate') base += area * amount;
        else if (opt.dataset.kind === 'percent') percent += amount;
        else fixed += amount;
      });

      var total = Math.round((base * (1 + percent / 100) + fixed) / 1000) * 1000;
      var days = Math.round(area * PACE[type] + baths * 8);

      return {
        from: total,
        to: Math.round(total * 1.18 / 1000) * 1000,
        sqm: Math.round(total / area),
        term: Math.max(14, days),
        area: area,
        type: type,
        baths: baths
      };
    }

    // Плавная перекрутка цифр вместо резкого скачка.
    // Первый расчёт ставим сразу: иначе при загрузке страницы
    // на долю секунды видны нули вместо суммы.
    function animateTo(el, key, value, instant) {
      if (instant || reduceMotion) {
        el.textContent = spaced(value);
        shown[key] = value;
        return;
      }

      var start = shown[key];
      var startTime = performance.now();
      var duration = 420;

      function tick(now) {
        var p = Math.min((now - startTime) / duration, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        var current = Math.round(start + (value - start) * eased);
        el.textContent = spaced(current);
        if (p < 1) requestAnimationFrame(tick);
        else shown[key] = value;
      }
      requestAnimationFrame(tick);
    }

    var firstRender = true;

    function render() {
      var r = compute();
      lastEstimate = r;

      var instant = firstRender;
      firstRender = false;

      // Короткая подсветка суммы, чтобы изменение параметра было заметно
      if (!instant && !reduceMotion) {
        var sumBox = document.querySelector('.calc__sum');
        if (sumBox) {
          sumBox.classList.remove('is-flash');
          void sumBox.offsetWidth;          // перезапуск анимации
          sumBox.classList.add('is-flash');
        }
      }

      areaOut.textContent = r.area + ' м²';
      animateTo(sumFrom, 'from', r.from, instant);
      animateTo(sumTo, 'to', r.to, instant);
      animateTo(perSqm, 'sqm', r.sqm, instant);
      animateTo(termOut, 'term', r.term, instant);
      if (termWord) termWord.textContent = plural(r.term, 'день', 'дня', 'дней');

      // Полоса показывает, где расчёт находится между минимумом и максимумом вилки
      var share = Math.min(1, r.from / 6000000);
      calcBar.style.width = (8 + share * 92) + '%';

      if (calcCta) {
        calcCta.dataset.estimate =
          spaced(r.from) + ' — ' + spaced(r.to) + ' ₽ · ' + r.area + ' м² · ' +
          r.term + ' ' + plural(r.term, 'день', 'дня', 'дней');
      }
      paintRange();
    }

    function setBaths(next) {
      var value = Math.max(0, Math.min(MAX_BATH, next));
      bathInput.value = String(value);
      bathOut.textContent = String(value);
      calcForm.querySelectorAll('.stepper__btn').forEach(function (btn) {
        var step = Number(btn.dataset.step);
        btn.disabled = (step < 0 && value === 0) || (step > 0 && value === MAX_BATH);
      });
      render();
    }

    areaInput.addEventListener('input', render);
    calcForm.addEventListener('change', function (e) {
      if (e.target.matches('input[name="type"], input[name="opt"]')) render();
    });
    calcForm.querySelectorAll('.stepper__btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setBaths(Number(bathInput.value) + Number(btn.dataset.step));
      });
    });

    setBaths(Number(bathInput.value));
  }

  /* ---------------------------------------------------------
     10. Слайдер «до и после»
     --------------------------------------------------------- */
  var frame = document.getElementById('compareFrame');

  if (frame) {
    var handle = document.getElementById('compareHandle');
    var dragging = false;

    function setPos(percent) {
      var value = Math.max(0, Math.min(100, percent));
      frame.style.setProperty('--pos', value + '%');
      handle.setAttribute('aria-valuenow', String(Math.round(value)));
      handle.setAttribute('aria-valuetext', Math.round(value) + ' процентов');
    }

    function posFromEvent(clientX) {
      var box = frame.getBoundingClientRect();
      setPos(((clientX - box.left) / box.width) * 100);
    }

    frame.addEventListener('pointerdown', function (e) {
      dragging = true;
      frame.setPointerCapture(e.pointerId);
      posFromEvent(e.clientX);
    });
    frame.addEventListener('pointermove', function (e) {
      if (dragging) posFromEvent(e.clientX);
    });
    frame.addEventListener('pointerup', function (e) {
      dragging = false;
      if (frame.hasPointerCapture(e.pointerId)) frame.releasePointerCapture(e.pointerId);
    });
    frame.addEventListener('pointercancel', function () { dragging = false; });

    // Управление с клавиатуры
    handle.addEventListener('keydown', function (e) {
      var current = Number(handle.getAttribute('aria-valuenow'));
      var stepBy = e.shiftKey ? 10 : 2;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { setPos(current - stepBy); e.preventDefault(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { setPos(current + stepBy); e.preventDefault(); }
      else if (e.key === 'Home') { setPos(0); e.preventDefault(); }
      else if (e.key === 'End') { setPos(100); e.preventDefault(); }
    });

    setPos(50);

    // Первое появление в кадре: короткая подсказка, что ползунок двигается
    if (!reduceMotion && 'IntersectionObserver' in window) {
      var hintObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          hintObserver.disconnect();
          var startTime = performance.now();
          (function sweep(now) {
            var p = Math.min((now - startTime) / 1400, 1);
            var eased = Math.sin(p * Math.PI);
            setPos(50 - eased * 22);
            if (p < 1) requestAnimationFrame(sweep);
          })(startTime);
        });
      }, { threshold: 0.45 });
      hintObserver.observe(frame);
    }
  }

  /* ---------------------------------------------------------
     11. Фильтр работ
     --------------------------------------------------------- */
  var filters = document.querySelectorAll('.filter');
  var works = document.querySelectorAll('.work');
  var worksEmpty = document.getElementById('worksEmpty');

  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cat = btn.dataset.filter;
      filters.forEach(function (b) { b.classList.toggle('is-active', b === btn); });

      var visible = 0;
      works.forEach(function (work) {
        var match = cat === 'all' || work.dataset.cat === cat;
        work.classList.toggle('is-hidden', !match);
        if (match) visible++;
      });
      if (worksEmpty) worksEmpty.hidden = visible > 0;
    });
  });

  /* ---------------------------------------------------------
     12. Лайтбокс портфолио
     --------------------------------------------------------- */
  var lightbox = document.getElementById('lightbox');

  if (lightbox) {
    var lbImg = document.getElementById('lbImg');
    var lbTitle = document.getElementById('lbTitle');
    var lbMeta = document.getElementById('lbMeta');
    var lbText = document.getElementById('lbText');
    var lbIndex = 0;
    var lbReturnFocus = null;

    function visibleWorks() {
      return Array.prototype.filter.call(works, function (w) {
        return !w.classList.contains('is-hidden');
      });
    }

    function showWork(list, index) {
      lbIndex = (index + list.length) % list.length;
      var work = list[lbIndex];
      lbImg.src = work.dataset.img;
      lbImg.alt = work.dataset.title;
      // textContent, а не innerHTML — данные не могут стать разметкой
      lbTitle.textContent = work.dataset.title;
      lbMeta.textContent = work.dataset.meta;
      lbText.textContent = work.dataset.text;
    }

    function openLightbox(work) {
      var list = visibleWorks();
      lbReturnFocus = work;
      lightbox.hidden = false;
      document.body.classList.add('is-locked');
      showWork(list, list.indexOf(work));
      document.getElementById('lbNext').focus();
    }

    function closeLightbox() {
      lightbox.hidden = true;
      document.body.classList.remove('is-locked');
      if (lbReturnFocus) lbReturnFocus.focus();
    }

    works.forEach(function (work) {
      work.addEventListener('click', function () { openLightbox(work); });
    });

    lightbox.querySelectorAll('[data-close-lightbox]').forEach(function (el) {
      el.addEventListener('click', closeLightbox);
    });
    document.getElementById('lbPrev').addEventListener('click', function () {
      showWork(visibleWorks(), lbIndex - 1);
    });
    document.getElementById('lbNext').addEventListener('click', function () {
      showWork(visibleWorks(), lbIndex + 1);
    });

    document.addEventListener('keydown', function (e) {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showWork(visibleWorks(), lbIndex - 1);
      if (e.key === 'ArrowRight') showWork(visibleWorks(), lbIndex + 1);
    });
  }

  /* ---------------------------------------------------------
     13. Аккордеон вопросов
     --------------------------------------------------------- */
  document.querySelectorAll('.acc__head').forEach(function (head) {
    head.addEventListener('click', function () {
      var item = head.closest('.acc');
      var willOpen = !item.classList.contains('is-open');

      // Открыт только один вопрос за раз
      document.querySelectorAll('.acc').forEach(function (other) {
        other.classList.remove('is-open');
        other.querySelector('.acc__head').setAttribute('aria-expanded', 'false');
      });

      item.classList.toggle('is-open', willOpen);
      head.setAttribute('aria-expanded', String(willOpen));
    });
  });

  /* ---------------------------------------------------------
     14. Модальное окно заявки (с ловушкой фокуса)
     --------------------------------------------------------- */
  var modal = document.getElementById('modal');
  var modalBox = modal ? modal.querySelector('.modal__box') : null;
  var lastFocused = null;

  function openModal(service, estimate) {
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-locked');

    var serviceField = document.getElementById('q-service-field');
    var serviceInput = document.getElementById('q-service');
    if (service && serviceField && serviceInput) {
      serviceInput.value = service;
      serviceField.hidden = false;
    } else if (serviceField) {
      serviceField.hidden = true;
    }

    var estimateField = document.getElementById('q-estimate-field');
    var estimateInput = document.getElementById('q-estimate');
    if (estimate && estimateField && estimateInput) {
      estimateInput.value = estimate;
      estimateField.hidden = false;
    } else if (estimateField) {
      estimateField.hidden = true;
    }

    var first = modalBox.querySelector('input:not([readonly]):not([type="hidden"])');
    if (first) first.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('is-locked');
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('[data-open-lead]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openModal(btn.dataset.service, btn.dataset.estimate);
    });
  });

  if (modal) {
    modal.querySelectorAll('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key !== 'Tab') return;

      // Не выпускаем фокус за пределы окна
      var focusable = modalBox.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea');
      var list = Array.prototype.filter.call(focusable, function (el) {
        return !el.disabled && el.offsetParent !== null;
      });
      if (!list.length) return;
      var firstEl = list[0];
      var lastEl = list[list.length - 1];

      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    });
  }

  /* ---------------------------------------------------------
     15. Уведомления
     --------------------------------------------------------- */
  var toastBox = document.getElementById('toasts');

  function toast(message, type) {
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'error' ? ' toast--error' : '');
    el.textContent = message;               // textContent, а не innerHTML — защита от XSS
    toastBox.appendChild(el);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 300);
    }, 5000);
  }

  /* ---------------------------------------------------------
     16. Маска телефона +7 (___) ___-__-__
     --------------------------------------------------------- */
  function maskPhone(input) {
    function format() {
      // Работаем с десятью цифрами самого номера, код страны рисуем сами.
      var digits = input.value.replace(/\D/g, '');

      // Ведущие 8 или 7 — это код страны, а не первая цифра номера,
      // поэтому «89261234567», «79261234567» и «9261234567» дают один результат.
      var head = digits.charAt(0);
      if (head === '8' || head === '7') digits = digits.slice(1);
      digits = digits.slice(0, 10);

      // Пока цифр номера нет — поле пустое, подсказку показывает placeholder.
      if (!digits.length) { input.value = ''; return; }

      var out = '+7 (' + digits.slice(0, 3);
      if (digits.length >= 4) out += ') ' + digits.slice(3, 6);
      if (digits.length >= 7) out += '-' + digits.slice(6, 8);
      if (digits.length >= 9) out += '-' + digits.slice(8, 10);
      input.value = out;
    }
    input.addEventListener('input', format);
  }
  document.querySelectorAll('input[type="tel"]').forEach(maskPhone);

  /* ---------------------------------------------------------
     17. Проверка и отправка форм
     --------------------------------------------------------- */
  function showError(field, message) {
    var wrap = field.closest('.field') || field.closest('.check');
    if (wrap) wrap.classList.add('is-invalid');
    var err = document.querySelector('[data-err-for="' + field.id + '"]');
    if (err) {
      err.textContent = message;
      err.classList.add('is-shown');
    }
    field.setAttribute('aria-invalid', 'true');
  }

  function clearError(field) {
    var wrap = field.closest('.field') || field.closest('.check');
    if (wrap) wrap.classList.remove('is-invalid');
    var err = document.querySelector('[data-err-for="' + field.id + '"]');
    if (err) {
      err.textContent = '';
      err.classList.remove('is-shown');
    }
    field.removeAttribute('aria-invalid');
  }

  function validate(form) {
    var ok = true;
    var firstBad = null;

    function fail(el, msg) {
      showError(el, msg);
      ok = false;
      if (!firstBad) firstBad = el;
    }

    var name = form.querySelector('input[name="name"]');
    if (name) {
      clearError(name);
      var nameVal = name.value.trim();
      if (nameVal.length < 2) fail(name, 'Введите имя — минимум 2 символа');
      else if (!/^[А-Яа-яЁёA-Za-z\s'-]+$/.test(nameVal)) fail(name, 'В имени допустимы только буквы, пробел и дефис');
    }

    var phone = form.querySelector('input[name="phone"]');
    if (phone) {
      clearError(phone);
      if (phone.value.replace(/\D/g, '').length !== 11) fail(phone, 'Телефон должен содержать 11 цифр');
    }

    var area = form.querySelector('input[name="area"]');
    if (area && area.type === 'number') {
      clearError(area);
      if (area.value !== '') {
        var areaVal = Number(area.value);
        if (!Number.isFinite(areaVal) || areaVal < 10 || areaVal > 500) {
          fail(area, 'Укажите площадь от 10 до 500 м²');
        }
      }
    }

    var agree = form.querySelector('input[name="agree"]');
    if (agree) {
      clearError(agree);
      if (!agree.checked) fail(agree, 'Без согласия мы не сможем принять заявку');
    }

    if (firstBad) firstBad.focus();
    return ok;
  }

  function collect(form) {
    // Собираем и очищаем данные. Наружу уходят только эти поля.
    var data = {};
    new FormData(form).forEach(function (value, key) {
      if (key === 'company') return;                    // honeypot не отправляем
      data[key] = String(value).trim().slice(0, 500);   // обрезаем аномально длинные значения
    });
    if (data.phone) data.phone = data.phone.replace(/\D/g, '');
    return data;
  }

  function handleSubmit(form, successText) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();

      // Ловушка для ботов: человек это поле не видит и не заполнит
      var honeypot = form.querySelector('input[name="company"]');
      if (honeypot && honeypot.value !== '') {
        toast('Заявка отклонена системой защиты.', 'error');
        return;
      }

      if (!validate(form)) {
        toast('Проверьте отмеченные поля.', 'error');
        return;
      }

      var data = collect(form);
      var btn = form.querySelector('button[type="submit"]');
      var label = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Отправляем…';

      /* ------------------------------------------------------------------
         ЗДЕСЬ ПОДКЛЮЧАЕТСЯ ОТПРАВКА НА СЕРВЕР.
         Демоверсия просто имитирует задержку сети.

         fetch('/api/lead', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(data)
         })

         Важно: проверку данных обязательно продублировать на сервере —
         валидация в браузере защищает от опечаток, а не от злоумышленника.
         ------------------------------------------------------------------ */
      console.info('Заявка готова к отправке:', data);

      setTimeout(function () {
        btn.disabled = false;
        btn.textContent = label;
        form.reset();
        form.querySelectorAll('[aria-invalid]').forEach(clearError);
        toast(successText);
        if (modal && !modal.hidden) closeModal();
      }, 900);
    });

    // Убираем ошибку, как только человек начал исправлять поле
    form.addEventListener('input', function (e) {
      if (e.target.matches('input, select, textarea')) clearError(e.target);
    });
  }

  var leadForm = document.getElementById('leadForm');
  if (leadForm) handleSubmit(leadForm, 'Заявка принята! Перезвоним в течение 15 минут и согласуем замер.');

  var quickForm = document.getElementById('quickForm');
  if (quickForm) handleSubmit(quickForm, 'Спасибо! Перезвоним вам в ближайшее время.');

  /* ---------------------------------------------------------
     18. Плавная прокрутка с учётом высоты шапки
     --------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;

      e.preventDefault();
      var offset = header.offsetHeight + 16;
      var top = target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

});
