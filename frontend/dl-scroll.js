/* Design Lab — единый движок прокрутки к разделам.

   ПРОБЛЕМА (найдена тестом на 390x844, iOS-профиль):
   В index.html (строка 621) навигация сделана так:
     function scrollTo2(id){document.getElementById(id).scrollIntoView({behavior:'smooth'});}

   Это не работает на телефоне по трём причинам, которые накладываются друг на друга:

   1) Прокручивается НЕ документ, а <body>.
      Замер в браузере: html{overflow:clip; height:844px}, body{overflow-y:auto; height:844px},
      document.scrollingElement === html, но window.pageYOffset всегда 0,
      а реальная позиция живёт в document.body.scrollTop (замер: 32166).
      Любой код, который читает/пишет window.scrollY, работает вхолостую.

   2) Мобильное меню лочит прокрутку через document.body.style.overflow='hidden'.
      body здесь — сам скролл-контейнер. В iOS Safari установка overflow:hidden
      на скролл-контейнер сбрасывает и клампит его scrollTop, а восстановление
      происходит асинхронно, уже после снятия overflow. Плавная прокрутка,
      запущенная через 60 мс после закрытия меню, попадает ровно в это окно —
      браузер догоняет восстановлением позиции и возвращает страницу на 0.
      Снаружи это выглядит как «кнопка не работает».

   3) scrollIntoView не учитывает липкую шапку: заголовок раздела уезжает под неё.

   РЕШЕНИЕ: собственная прокрутка с явным контейнером, компенсацией шапки
   и предсказуемым таймингом. Никакого scrollIntoView.

   Файл подключается ДО dl-mobile.js, чтобы меню строилось уже поверх рабочего
   scrollTo2. */
(function () {
  'use strict';
  if (window.__dlScroll) return;
  window.__dlScroll = true;

  /* Длительность: 520 мс для дальних прыжков, меньше для близких.
     Ниже 260 мс глаз не успевает связать нажатие с результатом,
     выше 700 мс — интерфейс начинает казаться вялым. */
  var MIN_MS = 280;
  var MAX_MS = 620;
  var PX_PER_MS = 3.2;

  function reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /* --- Кто на самом деле прокручивается: body, html или свой контейнер. --- */
  function scroller() {
    var b = document.body;
    var h = document.documentElement;
    if (b && b.scrollHeight > b.clientHeight + 4) {
      var ov = getComputedStyle(b).overflowY;
      if (ov === 'auto' || ov === 'scroll' || b.scrollTop > 0) return b;
    }
    if (h && h.scrollHeight > h.clientHeight + 4) return h;
    return document.scrollingElement || h || b;
  }

  function getTop(el) {
    return el === document.documentElement && !el.scrollTop
      ? (window.pageYOffset || el.scrollTop || 0)
      : el.scrollTop;
  }

  function setTop(el, v) {
    el.scrollTop = v;
    // Когда прокручивается документ, часть браузеров слушает только window.
    if (el === document.documentElement || el === document.scrollingElement) {
      if (Math.abs((window.pageYOffset || 0) - v) > 1) window.scrollTo(0, v);
    }
  }

  /* --- Высота липкой шапки: заголовок не должен прятаться под неё. --- */
  function headerOffset() {
    var nav = document.querySelector('#landing .nav, nav.nav');
    if (!nav) return 12;
    var pos = getComputedStyle(nav).position;
    if (pos !== 'fixed' && pos !== 'sticky') return 12;
    var r = nav.getBoundingClientRect();
    if (r.height < 1) return 12;
    return Math.round(r.height + 10);
  }

  /* Плавность: cubic-bezier(.22,1,.36,1) — быстрый старт, длинный мягкий выход.
     Это тот же характер движения, что у выезжающих листов, поэтому переходы
     по сайту и открытие меню ощущаются как одна система, а не разные механики. */
  function ease(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  var running = null;

  // Короткий алиас: время нужно и анимации, и доводке после неё.
  function now() {
    return performance.now();
  }

  /* Жетон текущей прокрутки. Каждый новый вызов scrollToEl увеличивает его,
     и цикл доводки от предыдущей цели сам себя останавливает. Без этого два
     быстрых тапа по разным пунктам меню тянули страницу в разные стороны. */
  var settleToken = 0;

  function cancel() {
    if (running) {
      cancelAnimationFrame(running.raf);
      running = null;
    }
  }

  /* Живой человек всегда главнее анимации: коснулся экрана или крутанул
     колесо — прокрутка немедленно отдаёт управление. */
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, function (e) {
      if (!running) return;
      if (ev === 'keydown' && ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].indexOf(e.key) < 0) return;
      cancel();
    }, { passive: true, capture: true });
  });

  function animate(box, to, done) {
    cancel();
    var from = getTop(box);
    var dist = to - from;
    if (Math.abs(dist) < 2) { if (done) done(); return; }

    if (reduced()) { setTop(box, to); if (done) done(); return; }

    var dur = Math.max(MIN_MS, Math.min(MAX_MS, Math.abs(dist) / PX_PER_MS));
    var t0 = performance.now();
    var state = { raf: 0 };
    running = state;

    function frame(now) {
      if (running !== state) return;
      var p = Math.min(1, (now - t0) / dur);
      setTop(box, from + dist * ease(p));
      if (p < 1) state.raf = requestAnimationFrame(frame);
      else { running = null; if (done) done(); }
    }
    state.raf = requestAnimationFrame(frame);
  }

  /* --- Публичный API. --- */

  // Насколько пикселей цель сейчас не на месте.
  function offsetOf(box, el) {
    var top = el.getBoundingClientRect().top;
    if (box !== document.documentElement && box !== document.scrollingElement) {
      top -= box.getBoundingClientRect().top;
    }
    return top - headerOffset();
  }

  function targetFor(box, el) {
    var max = Math.max(0, box.scrollHeight - box.clientHeight);
    return Math.max(0, Math.min(max, getTop(box) + offsetOf(box, el)));
  }

  /* Доводка после остановки.

     Галерея — 98 карточек с ленивыми превью. Пока идёт анимация, картинки
     догружаются и высота документа растёт — точка, посчитанная на старте,
     к финишу уже неверна. Замер до доводки: «Как работает» останавливался
     в 2067px от верха экрана вместо ~75px.

     Поэтому после остановки перемеряем цель и доводим коротким движением.
     Максимум три доводки — защита от бесконечной гонки с бесконечной лентой. */
  var SETTLE_TOLERANCE = 8;

  /* Ограничиваем доводку ВРЕМЕНЕМ, а не числом попыток.

     Счётчик попыток не работал: на 430px галерея перестраивается в другое
     число колонок и догружает превью дольше — шесть быстрых доводок
     успевали закончиться РАНЬШЕ, чем высота страницы переставала меняться
     («Как работает» застревало в 469px от верха экрана вместо ~75px).

     Теперь держим цель в фокусе всё окно догрузки: как только раскладка
     съехала — подводим обратно. Окно закрывается раньше срока, если
     высота документа стабильна и цель на месте. Любой жест пользователя
     отменяет доводку через state.token — мы никогда не боремся с пальцем. */
  var SETTLE_WINDOW_MS = 2600;
  var SETTLE_QUIET_MS = 420;

  function scrollToEl(el, done) {
    if (!el) { if (done) done(); return false; }

    var deadline = now() + SETTLE_WINDOW_MS;
    var myToken = ++settleToken;
    var lastHeight = -1;
    var quietSince = 0;

    function finish() {
      if (done) done();
    }

    function watch() {
      // Пользователь вмешался или началась другая прокрутка — молча уходим.
      if (myToken !== settleToken) return;

      var box = scroller();
      var off = offsetOf(box, el);
      var h = box.scrollHeight;

      if (Math.abs(off) > SETTLE_TOLERANCE) {
        quietSince = 0;
        lastHeight = h;
        if (now() < deadline) {
          animate(box, targetFor(box, el), function () {
            if (myToken === settleToken) requestAnimationFrame(watch);
          });
          return;
        }
        finish();
        return;
      }

      // Цель на месте. Ждẹм, пока высота перестанет меняться.
      if (h !== lastHeight) {
        lastHeight = h;
        quietSince = now();
      }
      if (quietSince && now() - quietSince >= SETTLE_QUIET_MS) { finish(); return; }
      if (now() >= deadline) { finish(); return; }

      setTimeout(function () {
        if (myToken === settleToken) requestAnimationFrame(watch);
      }, 60);
    }

    var box0 = scroller();
    animate(box0, targetFor(box0, el), function () {
      if (myToken === settleToken) requestAnimationFrame(watch);
    });
    return true;
  }

  function scrollToId(id, done) {
    return scrollToEl(document.getElementById(id), done);
  }

  window.dlScrollToId = scrollToId;
  window.dlScrollToEl = scrollToEl;
  window.dlScroller = scroller;
  window.dlHeaderOffset = headerOffset;
  window.dlCancelScroll = cancel;

  /* Перекрываем штатный scrollTo2 — им пользуются и шапка, и мобильное меню,
     и кнопки CTA. Одна точка входа = одинаковое поведение везде. */
  window.scrollTo2 = function (id) { scrollToId(id); };

  /* --- Блокировка прокрутки для модалок и выдвижных панелей. ---
     Не трогаем overflow скролл-контейнера (см. причину 2 в шапке файла):
     фиксируем позицию и возвращаем её ровно там же. */
  var lockDepth = 0;
  var lockPos = 0;
  var lockBox = null;

  function onLockedWheel(e) { e.preventDefault(); }

  window.dlLockScroll = function () {
    lockDepth++;
    if (lockDepth > 1) return;
    lockBox = scroller();
    lockPos = getTop(lockBox);
    lockBox.classList.add('dl-scroll-locked');
    document.documentElement.classList.add('dl-scroll-locked-root');
    // touch-action в CSS гасит палец; колесо и клавиши гасим здесь.
    window.addEventListener('wheel', onLockedWheel, { passive: false });
  };

  window.dlUnlockScroll = function () {
    if (!lockDepth) return;
    lockDepth--;
    if (lockDepth) return;
    window.removeEventListener('wheel', onLockedWheel, { passive: false });
    if (lockBox) {
      lockBox.classList.remove('dl-scroll-locked');
      document.documentElement.classList.remove('dl-scroll-locked-root');
      // Позиция не должна «дрогнуть» ни на пиксель.
      if (Math.abs(getTop(lockBox) - lockPos) > 1) setTop(lockBox, lockPos);
    }
    lockBox = null;
  };

  /* --- Якорные ссылки внутри страницы тоже идут через движок. --- */
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
    if (!a) return;
    var id = a.getAttribute('href').slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    scrollToEl(el);
    if (history.replaceState) history.replaceState(null, '', '#' + id);
  });
})();
