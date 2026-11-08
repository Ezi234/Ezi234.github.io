/* =========================================================
   БРИТВА №9 — скрипты
   Чистый JavaScript, без библиотек и внешних запросов.
   Единственный сторонний адрес — карта Яндекса, и она грузится
   только когда посетитель сам нажмёт «Показать карту».

   Принципы безопасности, заложенные в код:
   · нет inline-обработчиков (onclick=...) — всё через addEventListener,
     благодаря чему работает строгий Content-Security-Policy;
   · пользовательские данные вставляются только через textContent —
     XSS через имя или комментарий невозможен;
   · скрытое поле-ловушка (honeypot) отсекает спам-ботов;
   · телефон и имя очищаются от лишних символов перед отправкой;
   · нет eval, new Function, innerHTML с данными пользователя.
   ========================================================= */
'use strict';

document.addEventListener('DOMContentLoaded', function () {

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canHover = window.matchMedia('(hover: hover)').matches;

  /* ---------------------------------------------------------
     0. Цвет кружков-аватаров в отзывах
     --------------------------------------------------------- */
  document.querySelectorAll('[data-hue]').forEach(function (el) {
    el.style.setProperty('--h', el.dataset.hue);
  });

  /* ---------------------------------------------------------
     1. Год в подвале
     --------------------------------------------------------- */
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  /* ---------------------------------------------------------
     2. Заголовок первого экрана: строки выезжают снизу
     --------------------------------------------------------- */
  var heroTitle = document.getElementById('heroTitle');
  if (heroTitle) requestAnimationFrame(function () { heroTitle.classList.add('is-in'); });

  /* ---------------------------------------------------------
     3. Удержание фокуса внутри открытого окна.
     Общая функция для записи, политики и лайтбокса: Tab
     по кругу ходит только по кнопкам и полям самого окна.
     --------------------------------------------------------- */
  function trapFocus(e, box) {
    if (e.key !== 'Tab') return;
    var focusable = box.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea');
    var list = Array.prototype.filter.call(focusable, function (el) {
      return !el.disabled && el.tabIndex !== -1 && el.offsetParent !== null;
    });
    if (!list.length) return;
    var firstEl = list[0];
    var lastEl = list[list.length - 1];
    if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
    else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
  }

  /* ---------------------------------------------------------
     4. Подсветка активного пункта меню при прокрутке
     Объявляем до onScroll — она вызывает spy() сразу при загрузке.
     --------------------------------------------------------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link'));
  var navTargets = navLinks.map(function (link) {
    return { link: link, section: document.querySelector(link.getAttribute('href')) };
  }).filter(function (pair) { return pair.section !== null; });

  function spy(y) {
    var pos = y + 150;
    var current = -1;
    navTargets.forEach(function (pair, i) {
      if (pair.section.offsetTop <= pos) current = i;
    });
    navTargets.forEach(function (pair, i) {
      pair.link.classList.toggle('is-active', i === current);
    });
  }

  /* ---------------------------------------------------------
     5. Прокрутка: шапка, полоса прогресса, кнопка «наверх».
     Всё в одном обработчике, привязанном к кадрам отрисовки,
     чтобы не считать по десять раз на каждый пиксель.
     --------------------------------------------------------- */
  var header = document.getElementById('header');
  var progressBar = document.getElementById('progressBar');
  var toTop = document.getElementById('toTop');
  var lastY = window.scrollY;
  var ticking = false;

  function onScrollFrame() {
    var y = window.scrollY;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;

    header.classList.toggle('is-stuck', y > 30);

    // Шапка прячется при движении вниз и возвращается при движении вверх.
    // Пока открыто мобильное меню — не прячем: кнопка-крестик живёт в шапке.
    var menuOpen = nav && nav.classList.contains('is-open');
    if (!menuOpen && y > 420 && y > lastY + 6) header.classList.add('is-hidden');
    else if (y < lastY - 6 || menuOpen) header.classList.remove('is-hidden');
    lastY = y;

    if (progressBar) {
      var read = docHeight > 0 ? (y / docHeight) * 100 : 0;
      progressBar.style.width = Math.min(100, Math.max(0, read)).toFixed(2) + '%';
    }
    if (toTop) toTop.hidden = y < 700;

    spy(y);
    ticking = false;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(onScrollFrame);
  }

  /* ---------------------------------------------------------
     6. Мобильное меню
     --------------------------------------------------------- */
  var burger = document.getElementById('burger');
  var nav = document.getElementById('nav');
  var navBackdrop = document.getElementById('navBackdrop');

  function setNav(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
    document.body.classList.toggle('is-locked', open);
    if (navBackdrop) navBackdrop.hidden = !open;
    if (open) header.classList.remove('is-hidden');
  }
  function closeNav() {
    if (nav && nav.classList.contains('is-open')) setNav(false);
  }

  if (burger && nav) {
    burger.addEventListener('click', function () {
      setNav(!nav.classList.contains('is-open'));
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('.nav__link, .nav__cta, .nav__phone')) closeNav();
    });
    if (navBackdrop) navBackdrop.addEventListener('click', closeNav);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('is-open')) { closeNav(); burger.focus(); }
    });
    // Повернули телефон или растянули окно до десктопа — меню больше не выдвижное
    window.matchMedia('(min-width: 769px)').addEventListener('change', function (mq) {
      if (mq.matches) closeNav();
    });
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
     7. Появление блоков при прокрутке
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
      el.style.animationDelay = (i % 4) * 70 + 'ms';
      revealObserver.observe(el);
    });
  } else {
    // Старые браузеры: показываем всё сразу, ничего не ломая
    revealItems.forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------------------------------------------------------
     8. Анимированные счётчики в первом экране
     --------------------------------------------------------- */
  function spaced(value) {
    return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  function runCounter(el) {
    var target = parseFloat(el.dataset.count);
    var decimals = parseInt(el.dataset.decimals || '0', 10);
    var suffix = el.dataset.suffix || '';
    var duration = 1500;
    var start = performance.now();

    function tick(now) {
      var p = Math.min((now - start) / duration, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = spaced((target * eased).toFixed(decimals)) + suffix;
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  var counters = document.querySelectorAll('[data-count]');
  if ('IntersectionObserver' in window && counters.length && !reduceMotion) {
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
      var decimals = parseInt(el.dataset.decimals || '0', 10);
      el.textContent = spaced(parseFloat(el.dataset.count).toFixed(decimals)) + (el.dataset.suffix || '');
    });
  }

  /* ---------------------------------------------------------
     9. Первый экран: свет за курсором и параллакс композиции
     --------------------------------------------------------- */
  var hero = document.getElementById('hero');
  var heroVisual = document.getElementById('heroVisual');

  if (hero && !reduceMotion && canHover) {
    hero.addEventListener('mousemove', function (e) {
      var box = hero.getBoundingClientRect();
      hero.classList.add('is-lit');
      hero.style.setProperty('--sx', (e.clientX - box.left) + 'px');
      hero.style.setProperty('--sy', (e.clientY - box.top) + 'px');
    });
    hero.addEventListener('mouseleave', function () { hero.classList.remove('is-lit'); });
  }

  if (heroVisual && !reduceMotion && canHover) {
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
     10. Магнитные кнопки — слегка тянутся к курсору
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
  }

  /* ---------------------------------------------------------
     11. Наклон карточек услуг вслед за курсором
     --------------------------------------------------------- */
  if (!reduceMotion && canHover) {
    document.querySelectorAll('.tilt').forEach(function (card) {
      card.addEventListener('mouseenter', function () { card.classList.add('is-tilting'); });
      card.addEventListener('mousemove', function (e) {
        var box = card.getBoundingClientRect();
        var dx = (e.clientX - box.left) / box.width - 0.5;
        var dy = (e.clientY - box.top) / box.height - 0.5;
        card.style.setProperty('--ry', (dx * 9).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-dy * 9).toFixed(2) + 'deg');
        card.style.setProperty('--ty', '-6px');
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
     12. Фильтр галереи
     --------------------------------------------------------- */
  var filters = document.querySelectorAll('.filter');
  var shots = document.querySelectorAll('.shot');
  var galleryEmpty = document.getElementById('galleryEmpty');

  filters.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var cat = btn.dataset.filter;
      filters.forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
        b.setAttribute('aria-pressed', String(b === btn));
      });

      var shown = 0;
      shots.forEach(function (shot) {
        var match = cat === 'all' || shot.dataset.cat === cat;
        shot.classList.toggle('is-hidden', !match);
        if (match) {
          // Перезапускаем появление: карточка всплывает, фото открывается шторкой.
          // Снятие класса + чтение offsetWidth сбрасывает анимацию на начало.
          shot.classList.remove('is-visible');
          void shot.offsetWidth;
          shot.style.animationDelay = (shown % 4) * 60 + 'ms';
          shot.classList.add('is-visible');
          shown++;
        }
      });
      if (galleryEmpty) galleryEmpty.hidden = shown > 0;
    });
  });

  /* ---------------------------------------------------------
     13. Лайтбокс галереи
     --------------------------------------------------------- */
  var lightbox = document.getElementById('lightbox');
  var lightboxBox = lightbox ? lightbox.querySelector('.lightbox__box') : null;
  var lbIndex = 0;
  var lbReturnFocus = null;

  function visibleShots() {
    return Array.prototype.filter.call(shots, function (s) {
      return !s.classList.contains('is-hidden');
    });
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove('is-locked');
    if (lbReturnFocus) lbReturnFocus.focus();
  }

  if (lightbox) {
    var lbShot = document.getElementById('lbShot');
    var lbTitle = document.getElementById('lbTitle');
    var lbMeta = document.getElementById('lbMeta');
    var lbText = document.getElementById('lbText');
    var lbCount = document.getElementById('lbCount');
    var lbBook = document.getElementById('lbBook');

    function showShot(list, index) {
      if (!list.length) return;
      lbIndex = (index + list.length) % list.length;
      var shot = list[lbIndex];
      lbShot.src = shot.dataset.img;
      lbShot.alt = shot.querySelector('img') ? shot.querySelector('img').alt : shot.dataset.label;
      // Перезапуск плавного проявления при листании
      lbShot.classList.remove('is-swap');
      void lbShot.offsetWidth;
      lbShot.classList.add('is-swap');
      // textContent, а не innerHTML — данные не могут стать разметкой
      lbTitle.textContent = shot.dataset.label;
      lbMeta.textContent = shot.dataset.master + ' · ' + shot.dataset.time;
      lbText.textContent = shot.dataset.text;
      lbCount.textContent = (lbIndex + 1) + ' / ' + list.length;
      lbBook.dataset.master = shot.dataset.master;
      lbBook.dataset.service = shot.dataset.service || '';
    }

    function openLightbox(shot) {
      var list = visibleShots();
      lbReturnFocus = shot;
      lightbox.hidden = false;
      document.body.classList.add('is-locked');
      showShot(list, list.indexOf(shot));
      document.getElementById('lbNext').focus();
    }

    shots.forEach(function (shot) {
      shot.addEventListener('click', function () { openLightbox(shot); });
    });

    lightbox.querySelectorAll('[data-close-lightbox]').forEach(function (el) {
      el.addEventListener('click', closeLightbox);
    });
    document.getElementById('lbPrev').addEventListener('click', function () {
      showShot(visibleShots(), lbIndex - 1);
    });
    document.getElementById('lbNext').addEventListener('click', function () {
      showShot(visibleShots(), lbIndex + 1);
    });

    document.addEventListener('keydown', function (e) {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') closeLightbox();
      else if (e.key === 'ArrowLeft') showShot(visibleShots(), lbIndex - 1);
      else if (e.key === 'ArrowRight') showShot(visibleShots(), lbIndex + 1);
      else trapFocus(e, lightboxBox);
    });

    // Свайп по фото на телефоне листает работы
    var lbStartX = 0;
    lightboxBox.addEventListener('touchstart', function (e) {
      lbStartX = e.changedTouches[0].clientX;
    }, { passive: true });
    lightboxBox.addEventListener('touchend', function (e) {
      var delta = e.changedTouches[0].clientX - lbStartX;
      if (Math.abs(delta) > 45) showShot(visibleShots(), delta < 0 ? lbIndex + 1 : lbIndex - 1);
    }, { passive: true });
  }

  /* ---------------------------------------------------------
     14. Слайдер отзывов: стрелки, точки, клавиатура, свайп, автоплей
     --------------------------------------------------------- */
  var track = document.getElementById('sliderTrack');

  if (track) {
    var slides = track.children;
    var total = slides.length;
    var index = 0;
    var dotsBox = document.getElementById('sliderDots');
    var timer = null;

    for (var i = 0; i < total; i++) {
      var dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'slider__dot';
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Отзыв ' + (i + 1));
      dot.dataset.index = String(i);
      dotsBox.appendChild(dot);
    }
    var dots = dotsBox.querySelectorAll('.slider__dot');

    function goTo(n) {
      index = (n + total) % total;
      track.style.transform = 'translateX(-' + index * 100 + '%)';
      dots.forEach(function (d, k) {
        d.classList.toggle('is-active', k === index);
        d.setAttribute('aria-selected', String(k === index));
      });
      for (var s = 0; s < total; s++) {
        slides[s].setAttribute('aria-hidden', String(s !== index));
      }
    }

    function restartAuto() {
      if (timer) clearInterval(timer);
      if (reduceMotion) return;
      timer = setInterval(function () { goTo(index + 1); }, 6500);
    }

    document.getElementById('prevBtn').addEventListener('click', function () { goTo(index - 1); restartAuto(); });
    document.getElementById('nextBtn').addEventListener('click', function () { goTo(index + 1); restartAuto(); });
    dotsBox.addEventListener('click', function (e) {
      var d = e.target.closest('.slider__dot');
      if (!d) return;
      goTo(parseInt(d.dataset.index, 10));
      restartAuto();
    });

    var slider = document.getElementById('slider');
    slider.addEventListener('mouseenter', function () { if (timer) clearInterval(timer); });
    slider.addEventListener('mouseleave', restartAuto);
    slider.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { goTo(index - 1); restartAuto(); }
      if (e.key === 'ArrowRight') { goTo(index + 1); restartAuto(); }
    });

    // Свайп пальцем на телефоне
    var startX = 0;
    slider.addEventListener('touchstart', function (e) {
      startX = e.changedTouches[0].clientX;
    }, { passive: true });
    slider.addEventListener('touchend', function (e) {
      var delta = e.changedTouches[0].clientX - startX;
      if (Math.abs(delta) > 45) { goTo(delta < 0 ? index + 1 : index - 1); restartAuto(); }
    }, { passive: true });

    goTo(0);
    restartAuto();
  }

  /* ---------------------------------------------------------
     15. Модальное окно быстрой записи (с ловушкой фокуса)
     --------------------------------------------------------- */
  var modal = document.getElementById('modal');
  var modalBox = modal ? modal.querySelector('.modal__box') : null;
  var lastFocused = null;

  function openModal(service, master) {
    // Если открыт лайтбокс или меню — сначала закрываем, чтобы не было двух окон разом
    closeLightbox();
    closeNav();

    lastFocused = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('is-locked');

    // Услуга: из кнопки, если она её знает, иначе «определимся по телефону».
    // Сбрасываем явно — иначе в окне осталась бы услуга с прошлого раза.
    var sel = document.getElementById('q-service');
    if (sel) {
      sel.selectedIndex = 0;
      if (service) {
        for (var i = 0; i < sel.options.length; i++) {
          if (sel.options[i].value === service || sel.options[i].text === service) {
            sel.selectedIndex = i;
            break;
          }
        }
      }
    }

    var masterField = document.getElementById('q-master-field');
    var masterInput = document.getElementById('q-master');
    if (master && masterField && masterInput) {
      masterInput.value = master;
      masterField.hidden = false;
    } else if (masterField && masterInput) {
      masterInput.value = '';
      masterField.hidden = true;
    }

    var first = modalBox.querySelector('input:not([readonly]):not([type="hidden"])');
    if (first) first.focus();
  }

  function closeModal() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('is-locked');
    if (lastFocused) lastFocused.focus();
  }

  document.querySelectorAll('[data-open-booking]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      openModal(btn.dataset.service, btn.dataset.master);
    });
  });

  if (modal) {
    modal.querySelectorAll('[data-close-modal]').forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    document.addEventListener('keydown', function (e) {
      if (modal.hidden) return;
      if (e.key === 'Escape') { closeModal(); return; }
      trapFocus(e, modalBox);
    });
  }

  /* ---------------------------------------------------------
     16. Окно политики конфиденциальности
     --------------------------------------------------------- */
  var privacy = document.getElementById('privacy');
  var privacyBox = privacy ? privacy.querySelector('.modal__box') : null;
  var privacyReturn = null;

  function closePrivacy() {
    if (!privacy || privacy.hidden) return;
    privacy.hidden = true;
    // Блокировку прокрутки снимаем, только если под политикой нет другого окна
    if (!modal || modal.hidden) document.body.classList.remove('is-locked');
    if (privacyReturn) privacyReturn.focus();
  }

  if (privacy) {
    document.querySelectorAll('[data-open-privacy]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        privacyReturn = link;
        privacy.hidden = false;
        document.body.classList.add('is-locked');
        privacy.querySelector('.modal__close').focus();
      });
    });
    privacy.querySelectorAll('[data-close-privacy]').forEach(function (el) {
      el.addEventListener('click', closePrivacy);
    });
    document.addEventListener('keydown', function (e) {
      if (privacy.hidden) return;
      if (e.key === 'Escape') { e.stopImmediatePropagation(); closePrivacy(); return; }
      trapFocus(e, privacyBox);
    }, true);
  }

  /* ---------------------------------------------------------
     17. Карта: грузим Яндекс только по нажатию.
     До этого на странице нет ни одного стороннего запроса.
     --------------------------------------------------------- */
  var map = document.getElementById('map');
  var mapLoad = document.getElementById('mapLoad');
  if (map && mapLoad) {
    mapLoad.addEventListener('click', function () {
      if (map.classList.contains('is-loaded')) return;
      var frame = document.createElement('iframe');
      frame.className = 'map__frame';
      frame.title = 'Карта: Москва, ул. Пятницкая, 27, стр. 1';
      frame.src = map.dataset.mapSrc;
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      frame.setAttribute('loading', 'eager');
      map.appendChild(frame);
      map.classList.add('is-loaded');
      frame.focus();
    });
  }

  /* ---------------------------------------------------------
     18. Уведомления
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
     19. Маска телефона +7 (___) ___-__-__
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
      // Иначе «+7» подставился бы раньше, чем человек допечатает свой код.
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
     20. Дата: запрещаем прошлое, по умолчанию — завтра.
     Считаем по местному времени: toISOString() дал бы дату по Гринвичу,
     и ночью в Москве «сегодня» оказалось бы вчерашним днём.
     --------------------------------------------------------- */
  var dateInput = document.getElementById('f-date');
  function iso(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function setDefaultDate() {
    if (!dateInput) return;
    var today = new Date();
    var tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    var limit = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 60);
    dateInput.min = iso(today);
    dateInput.max = iso(limit);
    dateInput.value = iso(tomorrow);
  }
  setDefaultDate();

  /* ---------------------------------------------------------
     21. Валидация форм
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

    var date = form.querySelector('input[name="date"]');
    if (date && date.required) {
      clearError(date);
      if (!date.value) fail(date, 'Выберите дату визита');
      else if (date.value < date.min) fail(date, 'Эта дата уже прошла');
      else if (date.max && date.value > date.max) fail(date, 'Запись открыта на 60 дней вперёд');
    }

    var time = form.querySelector('select[name="time"]');
    if (time && time.required) {
      clearError(time);
      if (!time.value) fail(time, 'Выберите время');
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
    // Собираем и очищаем данные. Всё, что уходит на сервер, — только эти поля.
    var data = {};
    new FormData(form).forEach(function (value, key) {
      if (key === 'company') return;                    // honeypot наружу не отправляем
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

         fetch('/api/booking', {
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
        if (form.contains(dateInput)) setDefaultDate();   // reset() стирает дату — возвращаем «завтра»
        toast(successText);
        if (modal && !modal.hidden) closeModal();
      }, 900);
    });

    // Убираем ошибку, как только человек начал исправлять поле
    form.addEventListener('input', function (e) {
      if (e.target.matches('input, select, textarea')) clearError(e.target);
    });
    form.addEventListener('change', function (e) {
      if (e.target.matches('input[type="checkbox"], select')) clearError(e.target);
    });
  }

  var bookingForm = document.getElementById('bookingForm');
  if (bookingForm) handleSubmit(bookingForm, 'Заявка принята! Администратор перезвонит в течение 15 минут.');

  var quickForm = document.getElementById('quickForm');
  if (quickForm) handleSubmit(quickForm, 'Спасибо! Перезвоним вам в ближайшее время.');

  /* ---------------------------------------------------------
     22. Плавная прокрутка с учётом высоты шапки
     --------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    if (link.hasAttribute('data-open-privacy')) return;   // эта ссылка открывает окно, а не листает
    link.addEventListener('click', function (e) {
      var id = link.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;

      e.preventDefault();
      var offset = header.offsetHeight + 16;
      var top = id === '#hero' ? 0 : target.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: Math.max(0, top), behavior: reduceMotion ? 'auto' : 'smooth' });

      // Переносим фокус в раздел: с клавиатуры следующий Tab пойдёт
      // по его содержимому, а не вернётся в меню. Так работает и «Перейти к содержанию».
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

});
