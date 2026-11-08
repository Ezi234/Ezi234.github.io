/* =========================================================
   КОНТУР — скрипты
   Чистый JavaScript, без библиотек и внешних запросов.
   Трёхмерная сцена живёт в отдельном файле house3d.js.

   Принципы безопасности, заложенные в код:
   · нет inline-обработчиков (onclick=...) — всё через addEventListener;
   · нет style="" в разметке — цвета приходят из data-атрибутов и
     выставляются через CSSOM, который строгий CSP не блокирует;
   · пользовательские данные выводятся только через textContent;
   · скрытое поле-ловушка (honeypot) отсекает спам-ботов;
   · значения обрезаются по длине, телефон приводится к цифрам;
   · нет eval, new Function и innerHTML с данными пользователя.
   ========================================================= */
'use strict';

document.addEventListener('DOMContentLoaded', function () {

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover)').matches;

  /* ---------------------------------------------------------
     0. Мелочи
     --------------------------------------------------------- */
  document.querySelectorAll('[data-sw]').forEach(function (el) {
    el.style.setProperty('--sw', el.dataset.sw);
  });

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  var heroTitle = document.getElementById('heroTitle');
  if (heroTitle) requestAnimationFrame(function () { heroTitle.classList.add('is-in'); });

  function spaced(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  // Русское склонение: 1 день, 2 дня, 5 дней
  function plural(n, one, few, many) {
    var abs = Math.abs(n);
    var t10 = abs % 10;
    var t100 = abs % 100;
    if (t100 >= 11 && t100 <= 14) return many;
    if (t10 === 1) return one;
    if (t10 >= 2 && t10 <= 4) return few;
    return many;
  }

  /* ---------------------------------------------------------
     1. Навигация: активный пункт по позиции прокрутки
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
     2. Прокрутка: шапка, прогресс, кнопка «наверх», таймлайн
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
    if (y > 420 && y > lastY + 6) header.classList.add('is-hidden');
    else if (y < lastY - 6) header.classList.remove('is-hidden');
    lastY = y;

    if (progressBar) {
      var read = docHeight > 0 ? (y / docHeight) * 100 : 0;
      progressBar.style.width = Math.min(100, Math.max(0, read)).toFixed(2) + '%';
    }
    if (toTop) toTop.hidden = y < 700;

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
     3. Мобильное меню
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
     4. Появление блоков при прокрутке
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
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------------------------------------------------------
     5. Магнитные кнопки и наклон карточек
     --------------------------------------------------------- */
  if (!reduceMotion && canHover) {
    document.querySelectorAll('.magnetic').forEach(function (btn) {
      btn.addEventListener('mousemove', function (e) {
        var box = btn.getBoundingClientRect();
        var dx = (e.clientX - box.left - box.width / 2) * 0.2;
        var dy = (e.clientY - box.top - box.height / 2) * 0.3;
        btn.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
      });
      btn.addEventListener('mouseleave', function () { btn.style.transform = ''; });
    });

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
     6. Трёхмерный конструктор дома
     --------------------------------------------------------- */
  var configForm = document.getElementById('configForm');
  var lastConfig = '';

  if (configForm) {
    var canvas = document.getElementById('scene');
    var fallback = document.getElementById('sceneFallback');
    var hint = document.getElementById('viewHint');
    var sumEl = document.getElementById('sum');
    var sumBox = document.querySelector('.price__sum');
    var priceNote = document.getElementById('priceNote');
    var termEl = document.getElementById('term');
    var perSqmEl = document.getElementById('perSqm');
    var wallName = document.getElementById('wallName');
    var roofName = document.getElementById('roofName');
    var areaInput = document.getElementById('area');
    var areaOut = document.getElementById('areaOut');
    var terraceInput = document.getElementById('terrace');
    var orderBtn = document.getElementById('orderBtn');

    var TERRACE_PRICE = 240000;
    var scene = null;
    var shown = { sum: 0, term: 0, sqm: 0 };
    var firstPaint = true;

    function picked(name) {
      return configForm.querySelector('input[name="' + name + '"]:checked');
    }

    function options() {
      return {
        wall: picked('wall').value,
        roof: picked('roof').value,
        area: Number(areaInput.value),
        floors: parseFloat(picked('floors').value),
        terrace: terraceInput.checked
      };
    }

    function startScene() {
      if (scene || !canvas) return;
      scene = HouseScene.init(canvas, options());
      if (!scene) {
        // WebGL недоступен — показываем статичную картинку
        canvas.hidden = true;
        if (hint) hint.hidden = true;
        if (fallback) fallback.hidden = false;
      }
    }
    startScene();

    if (canvas && hint) {
      ['pointerdown', 'keydown'].forEach(function (evt) {
        canvas.addEventListener(evt, function () { hint.classList.add('is-gone'); }, { once: true });
      });
    }

    function animateTo(el, key, value, instant) {
      if (instant || reduceMotion) {
        el.textContent = spaced(value);
        shown[key] = value;
        return;
      }
      var start = shown[key];
      var t0 = performance.now();
      function tick(now) {
        var p = Math.min((now - t0) / 420, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = spaced(Math.round(start + (value - start) * eased));
        if (p < 1) requestAnimationFrame(tick);
        else shown[key] = value;
      }
      requestAnimationFrame(tick);
    }

    function compute() {
      var floors = picked('floors');
      var wall = picked('wall');
      var roof = picked('roof');
      var area = Number(areaInput.value);
      var terrace = terraceInput.checked;

      var perMeter = Number(floors.dataset.rate) + Number(wall.dataset.add) + Number(roof.dataset.add);
      var total = perMeter * area + (terrace ? TERRACE_PRICE : 0);
      total = Math.round(total / 1000) * 1000;

      var extraFloors = parseFloat(floors.value) === 2 ? 20 : parseFloat(floors.value) === 1.5 ? 12 : 0;
      var days = Math.round(60 + area * 0.35 + extraFloors + (terrace ? 7 : 0));

      return { total: total, area: area, days: days, sqm: Math.round(total / area) };
    }

    function render(rebuild) {
      var r = compute();
      var instant = firstPaint;
      firstPaint = false;

      areaOut.textContent = r.area + ' м²';
      wallName.textContent = picked('wall').dataset.name;
      roofName.textContent = picked('roof').dataset.name;

      if (!instant && !reduceMotion && sumBox) {
        sumBox.classList.remove('is-flash');
        void sumBox.offsetWidth;             // перезапуск анимации
        sumBox.classList.add('is-flash');
      }
      animateTo(sumEl, 'sum', r.total, instant);
      animateTo(perSqmEl, 'sqm', r.sqm, instant);
      termEl.textContent = r.days + ' ' + plural(r.days, 'день', 'дня', 'дней');

      var floorsText = picked('floors').parentElement.querySelector('span').firstChild.textContent.trim().toLowerCase();
      priceNote.textContent = r.area + ' м² · ' + floorsText + ' · ' + picked('wall').dataset.name.toLowerCase();

      // Заливаем пройденную часть ползунка
      var pct = (r.area - areaInput.min) / (areaInput.max - areaInput.min) * 100;
      areaInput.style.background =
        'linear-gradient(90deg, var(--amber) 0%, var(--amber) ' + pct + '%, var(--line) ' + pct + '%, var(--line) 100%)';

      lastConfig = r.area + ' м² · ' + floorsText +
        ' · фасад ' + picked('wall').dataset.name +
        ' · кровля ' + picked('roof').dataset.name +
        (terraceInput.checked ? ' · с террасой' : ' · без террасы') +
        ' · ' + spaced(r.total) + ' ₽';
      if (orderBtn) orderBtn.dataset.config = lastConfig;

      // Держим сборку в форме заявки всегда актуальной
      var leadField = document.getElementById('l-config-field');
      var leadInput = document.getElementById('l-config');
      if (leadField && leadInput) {
        leadInput.value = lastConfig;
        leadField.hidden = false;
      }

      if (rebuild && scene) HouseScene.setOptions(options());
    }

    configForm.addEventListener('change', function (e) {
      if (!e.target.matches('input')) return;
      // Геометрию перестраиваем на любое изменение: этажность, площадь,
      // цвета и терраса — всё влияет на модель
      render(true);
    });
    areaInput.addEventListener('input', function () { render(false); });
    // Площадь меняет габариты дома, но перестраивать сцену на каждый пиксель
    // ползунка расточительно — делаем это, когда человек отпустил ручку
    areaInput.addEventListener('change', function () { render(true); });

    var leadFormEl = document.getElementById('leadForm');
    if (leadFormEl) {
      leadFormEl.addEventListener('reset', function () {
        setTimeout(function () { render(false); }, 0);
      });
    }

    render(false);
  }

  /* ---------------------------------------------------------
     7. Фильтр проектов
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
     8. Лайтбокс проектов
     --------------------------------------------------------- */
  var lightbox = document.getElementById('lightbox');
  var lbIndex = 0;
  var lbReturnFocus = null;

  function visibleWorks() {
    return Array.prototype.filter.call(works, function (w) {
      return !w.classList.contains('is-hidden');
    });
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove('is-locked');
    if (lbReturnFocus) lbReturnFocus.focus();
  }

  if (lightbox) {
    var lbImg = document.getElementById('lbImg');
    var lbTitle = document.getElementById('lbTitle');
    var lbMeta = document.getElementById('lbMeta');
    var lbText = document.getElementById('lbText');
    var lbPrice = document.getElementById('lbPrice');

    function showWork(list, index) {
      if (!list.length) return;
      lbIndex = (index + list.length) % list.length;
      var work = list[lbIndex];
      lbImg.src = work.dataset.img;
      lbImg.alt = work.dataset.title;
      // textContent, а не innerHTML — данные не могут стать разметкой
      lbTitle.textContent = work.dataset.title;
      lbMeta.textContent = work.dataset.meta;
      lbText.textContent = work.dataset.text;
      lbPrice.textContent = work.dataset.price;
    }

    function openLightbox(work) {
      var list = visibleWorks();
      lbReturnFocus = work;
      lightbox.hidden = false;
      document.body.classList.add('is-locked');
      showWork(list, list.indexOf(work));
      document.getElementById('lbNext').focus();
    }

    works.forEach(function (work) {
      work.addEventListener('click', function () { openLightbox(work); });
    });
    lightbox.querySelectorAll('[data-close-lightbox]').forEach(function (el) {
      el.addEventListener('click', closeLightbox);
    });
    document.getElementById('lbPrev').addEventListener('click', function () { showWork(visibleWorks(), lbIndex - 1); });
    document.getElementById('lbNext').addEventListener('click', function () { showWork(visibleWorks(), lbIndex + 1); });

    document.addEventListener('keydown', function (e) {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      if (e.key === 'ArrowLeft') showWork(visibleWorks(), lbIndex - 1);
      if (e.key === 'ArrowRight') showWork(visibleWorks(), lbIndex + 1);
    });
  }

  /* ---------------------------------------------------------
     9. Аккордеон вопросов
     --------------------------------------------------------- */
  document.querySelectorAll('.acc__head').forEach(function (head) {
    head.addEventListener('click', function () {
      var item = head.closest('.acc');
      var willOpen = !item.classList.contains('is-open');
      document.querySelectorAll('.acc').forEach(function (other) {
        other.classList.remove('is-open');
        other.querySelector('.acc__head').setAttribute('aria-expanded', 'false');
      });
      item.classList.toggle('is-open', willOpen);
      head.setAttribute('aria-expanded', String(willOpen));
    });
  });

  /* ---------------------------------------------------------
     10. Модальное окно (с ловушкой фокуса)
     --------------------------------------------------------- */
  var modal = document.getElementById('modal');
  var modalBox = modal ? modal.querySelector('.modal__box') : null;
  var lastFocused = null;

  function openModal(config) {
    closeLightbox();
    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-locked');

    var configField = document.getElementById('q-config-field');
    var configInput = document.getElementById('q-config');
    var value = config || lastConfig;
    if (value && configField && configInput) {
      configInput.value = value;
      configField.hidden = false;
    } else if (configField) {
      configField.hidden = true;
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
    btn.addEventListener('click', function () { openModal(btn.dataset.config); });
  });

  if (modal) {
    modal.querySelectorAll('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });
    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') { closeModal(); return; }
      if (e.key !== 'Tab') return;
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
     11. Уведомления
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
     12. Маска телефона
     --------------------------------------------------------- */
  function maskPhone(input) {
    function format() {
      var digits = input.value.replace(/\D/g, '');
      // Ведущие 8 или 7 — код страны, а не первая цифра номера
      var head = digits.charAt(0);
      if (head === '8' || head === '7') digits = digits.slice(1);
      digits = digits.slice(0, 10);
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
     13. Проверка и отправка форм
     --------------------------------------------------------- */
  function showError(field, message) {
    var wrap = field.closest('.field') || field.closest('.check');
    if (wrap) wrap.classList.add('is-invalid');
    var err = document.querySelector('[data-err-for="' + field.id + '"]');
    if (err) { err.textContent = message; err.classList.add('is-shown'); }
    field.setAttribute('aria-invalid', 'true');
  }

  function clearError(field) {
    var wrap = field.closest('.field') || field.closest('.check');
    if (wrap) wrap.classList.remove('is-invalid');
    var err = document.querySelector('[data-err-for="' + field.id + '"]');
    if (err) { err.textContent = ''; err.classList.remove('is-shown'); }
    field.removeAttribute('aria-invalid');
  }

  function validate(form) {
    var ok = true;
    var firstBad = null;
    function fail(el, msg) { showError(el, msg); ok = false; if (!firstBad) firstBad = el; }

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

    var area = form.querySelector('input[name="area"][type="number"]');
    if (area) {
      clearError(area);
      if (area.value !== '') {
        var v = Number(area.value);
        if (!Number.isFinite(v) || v < 30 || v > 600) fail(area, 'Укажите площадь от 30 до 600 м²');
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

    form.addEventListener('input', function (e) {
      if (e.target.matches('input, select, textarea')) clearError(e.target);
    });
  }

  var leadForm = document.getElementById('leadForm');
  if (leadForm) handleSubmit(leadForm, 'Заявка принята! Перезвоним в течение 15 минут и обсудим участок.');

  var quickForm = document.getElementById('quickForm');
  if (quickForm) handleSubmit(quickForm, 'Спасибо! Перезвоним вам в ближайшее время.');

  /* ---------------------------------------------------------
     14. Плавная прокрутка с учётом высоты шапки
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
