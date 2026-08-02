/* ============================================================================
   Design Lab - FIX LAYER v4 (runtime)
   Подключается ПОСЛЕДНИМ.

   1. Убирает layout thrashing: в index.html три обработчика mousemove висят на
      document с capture:true и дёргают getBoundingClientRect() на каждое движение
      мыши (magnetic pull по CTA, 3D tilt карточек, parallax фона).
   2. Снимает инлайновые transform, которые эти обработчики успели проставить.
   3. Ленивая загрузка iframe/img в галерее и карточках проектов.
   4. Автодетект слабого устройства -> класс html.dl-lowfx.
   5. Страж горизонтального overflow на узких экранах.
   ========================================================================= */
(function () {
  'use strict';

  if (window.__dlFixV4) return;
  window.__dlFixV4 = true;

  var docEl = document.documentElement;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
  var coarse = window.matchMedia && matchMedia('(pointer:coarse)').matches;

  /* ------------------------------------------------------------------ *
   * 1. Определяем слабое устройство
   * ------------------------------------------------------------------ */
  var cores = navigator.hardwareConcurrency || 4;
  var mem = navigator.deviceMemory || 4;
  var lowFx = reduce || cores <= 4 || mem <= 4 || (coarse && innerWidth < 900);
  if (lowFx) docEl.classList.add('dl-lowfx');

  /* ------------------------------------------------------------------ *
   * 2. Глушим тяжёлые mousemove-эффекты
   *
   *    Обработчики в index.html снять нельзя (анонимные функции),
   *    поэтому перехватываем событие раньше них и останавливаем
   *    распространение на фазе захвата. Обработчики, добавленные
   *    на window (parallax), останавливаются тем же приёмом.
   * ------------------------------------------------------------------ */
  var MAG = '.btn-solid,.btn-grad,.btn-line,.plan .pick';

  function killInlineTransforms(root) {
    var nodes = (root || document).querySelectorAll(
      '.btn-solid,.btn-grad,.btn-line,.btn-ghost,.plan .pick,.card[data-n],' +
      '.send,#heroSendBtn,.di-btn,.di-act,.tool-btn,.icon-btn,.hero-icon-btn'
    );
    for (var i = 0; i < nodes.length; i++) {
      var s = nodes[i].style;
      if (s && s.transform) s.transform = '';
    }
  }

  /* Кнопки больше не должны "притягиваться" к курсору:
     это и есть главный источник рывков на главной. */
  document.addEventListener('mousemove', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(MAG)) e.stopPropagation();
  }, true);

  /* 3D-tilt карточек — оставляем только на мощных десктопах,
     и всё равно дросселируем через requestAnimationFrame. */
  if (lowFx || coarse) {
    document.addEventListener('mousemove', function (e) {
      var t = e.target;
      if (t && t.closest && t.closest('.card[data-n]')) e.stopPropagation();
    }, true);
  } else {
    var rafPending = false;
    document.addEventListener('mousemove', function (e) {
      var t = e.target;
      if (!t || !t.closest || !t.closest('.card[data-n]')) return;
      /* пропускаем кадры: родной обработчик считает rect на КАЖДОЕ событие */
      if (rafPending) { e.stopPropagation(); return; }
      rafPending = true;
      requestAnimationFrame(function () { rafPending = false; });
    }, true);
  }

  /* Parallax фона — самый дорогой эффект (перерисовка blur-блобов). */
  if (lowFx) {
    window.addEventListener('mousemove', function (e) { e.stopImmediatePropagation(); }, true);
    var fx = document.querySelector('.bg-fx');
    if (fx) { fx.style.setProperty('--mx', '0'); fx.style.setProperty('--my', '0'); }
  }

  killInlineTransforms();
  window.addEventListener('load', function () { killInlineTransforms(); });
  /* После любого ухода курсора чистим остатки. */
  document.addEventListener('mouseleave', function () { killInlineTransforms(); }, true);

  /* ------------------------------------------------------------------ *
   * 3. Ленивая загрузка тяжёлых медиа
   * ------------------------------------------------------------------ */
  function lazify(root) {
    var imgs = (root || document).querySelectorAll('img:not([loading])');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].loading = 'lazy';
      imgs[i].decoding = 'async';
    }
    var frames = (root || document).querySelectorAll('iframe:not([loading])');
    for (var j = 0; j < frames.length; j++) {
      /* редактор и живой превью не трогаем — они нужны сразу */
      if (frames[j].closest('.di-wrap,#diBoard,.emu,#emuStage')) continue;
      frames[j].setAttribute('loading', 'lazy');
    }
  }
  lazify();

  /* Новые карточки рисуются динамически — наблюдаем, но пачками. */
  var moTimer = 0;
  var mo = new MutationObserver(function () {
    if (moTimer) return;
    moTimer = setTimeout(function () {
      moTimer = 0;
      lazify();
      killInlineTransforms();
    }, 250);
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /* ------------------------------------------------------------------ *
   * 4. Кнопка "Отправить": гарантируем корректную геометрию
   *    даже если её пересоберёт другой патч.
   * ------------------------------------------------------------------ */
  function normalizeSend() {
    var send = document.getElementById('heroSendBtn');
    if (!send) return;
    /* класс btn-grad тянет за собой padding/min-height текстовой кнопки,
       а это иконочная кнопка — ей нужен свой модификатор */
    send.classList.remove('btn-grad');
    send.classList.add('send', 'hero-send');
    send.setAttribute('aria-label', 'Отправить');
    send.style.transform = '';
  }
  normalizeSend();
  document.addEventListener('DOMContentLoaded', normalizeSend);
  window.addEventListener('load', normalizeSend);

  /* ------------------------------------------------------------------ *
   * 5. Страж горизонтального overflow на узких экранах.
   *
   *    Если какой-то блок всё же вылез за вьюпорт (динамический
   *    контент, длинные имена файлов, вставленный код) — поджимаем его.
   * ------------------------------------------------------------------ */
  var fixTimer = 0;
  function guardOverflow() {
    if (innerWidth > 900) return;
    var vw = docEl.clientWidth;
    var nodes = document.body.querySelectorAll('body *');
    var fixed = 0;
    for (var i = 0; i < nodes.length && fixed < 40; i++) {
      var el = nodes[i];
      if (el.dataset && el.dataset.dlOfFixed) continue;
      var cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.display === 'none') continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        el.style.maxWidth = '100%';
        el.style.boxSizing = 'border-box';
        if (cs.whiteSpace === 'nowrap' && cs.overflow === 'visible') {
          el.style.overflow = 'hidden';
          el.style.textOverflow = 'ellipsis';
        }
        if (el.dataset) el.dataset.dlOfFixed = '1';
        fixed++;
      }
    }
  }
  function scheduleGuard() {
    if (fixTimer) clearTimeout(fixTimer);
    fixTimer = setTimeout(guardOverflow, 300);
  }
  window.addEventListener('load', scheduleGuard);
  window.addEventListener('resize', scheduleGuard, { passive: true });
  window.addEventListener('orientationchange', scheduleGuard, { passive: true });

  /* ------------------------------------------------------------------ *
   * 6. Диагностика для автотестов
   * ------------------------------------------------------------------ */
  window.__dlFixReport = function () {
    var out = { lowFx: lowFx, overflow: [], ledges: 0, monoUi: 0, sizes: {} };
    var vw = docEl.clientWidth;
    var all = document.body.querySelectorAll('body *');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      var cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      var r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > vw + 1) {
        out.overflow.push({
          tag: el.tagName.toLowerCase(),
          cls: (el.className || '').toString().slice(0, 60),
          right: Math.round(r.right)
        });
      }
      var pb = getComputedStyle(el, '::before');
      if (pb && pb.content !== 'none' && /matrix3d/.test(pb.transform || '')) out.ledges++;
      if (/mono|JetBrains/i.test(cs.fontFamily) &&
          !el.closest('.di-code,.di-gut,.di-term-log,.di-term-in,.code-ed,#epLogs,pre,.dl-dl')) {
        out.monoUi++;
      }
    }
    ['.btn-grad', '.di-btn', '.di-btn-chrome', '#heroSendBtn'].forEach(function (sel) {
      var e = document.querySelector(sel);
      if (!e) return;
      var r = e.getBoundingClientRect();
      out.sizes[sel] = { w: Math.round(r.width), h: Math.round(r.height) };
    });
    return out;
  };
})();
