/* ============================================================================
   Design Lab — MOBILE FIX LAYER v5 (логика)
   Подключается ПОСЛЕ dl-mobile-chat.js.

   1. Превью занимает всю область между тулбаром и строкой ввода.
      Высоту считаем в JS и кладём в --dlm-stage-h: flex-растяжка тут не
      работает из-за абсолютного позиционирования тулбара и вложенности.
      Это и есть та самая чёрная пустота под свёрнутым чатом.
   2. Снимает инлайновые размеры эмулятора устройств с #pvFrame.
   3. Чинит режим «Код»: гарантированно открывает панель и дожимает
      загрузку текста кода.
   ========================================================================= */
(function () {
  'use strict';
  if (window.__dlMobileFix) return;
  window.__dlMobileFix = true;

  var MQ = window.matchMedia ? matchMedia('(max-width:860px)') : null;
  function isMobile() { return MQ ? MQ.matches : innerWidth <= 860; }

  function $(id) { return document.getElementById(id); }
  function editor() { return document.querySelector('.editor'); }
  function editorOpen() { var e = editor(); return !!(e && e.classList.contains('on')); }
  var docEl = document.documentElement;

  /* ═════ 1. Геометрия сцены превью ═════════════════════════ */

  var SIZED = ['width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight', 'transform', 'zoom'];

  function stash(el) {
    if (!el || el.__dlmStash) return;
    var s = {};
    for (var i = 0; i < SIZED.length; i++) s[SIZED[i]] = el.style[SIZED[i]] || '';
    el.__dlmStash = s;
  }
  function clearInline(el) {
    if (!el) return;
    stash(el);
    for (var i = 0; i < SIZED.length; i++) el.style[SIZED[i]] = '';
  }
  function restoreInline(el) {
    if (!el || !el.__dlmStash) return;
    var s = el.__dlmStash;
    for (var i = 0; i < SIZED.length; i++) el.style[SIZED[i]] = s[SIZED[i]];
    el.__dlmStash = null;
  }

  function stageParts() {
    var out = [], i, k;
    var ids = ['pvFrame', 'pvStage', 'emuStage'];
    for (i = 0; i < ids.length; i++) { var e = $(ids[i]); if (e) out.push(e); }
    var sel = ['.pv-stage', '.pv-fit', '.pv-dev', '.pv-scr', '.emu'];
    for (i = 0; i < sel.length; i++) {
      var list = document.querySelectorAll(sel[i]);
      for (k = 0; k < list.length; k++) if (out.indexOf(list[k]) < 0) out.push(list[k]);
    }
    return out;
  }

  function px(n) { return Math.max(0, Math.round(n)) + 'px'; }

  /* Считаем реальную высоту от низа тулбара до верха строки ввода. */
  function measureStage() {
    var stage = $('pvStage') || document.querySelector('.pv-stage');
    if (!stage) return;

    var comp = document.querySelector('.editor .composer');
    var vh = (window.visualViewport && window.visualViewport.height) || innerHeight;

    var top = stage.getBoundingClientRect().top;
    var bottom = comp ? comp.getBoundingClientRect().top : vh;
    if (!isFinite(top) || !isFinite(bottom)) return;

    var h = bottom - top;
    /* Защита от вырожденных замеров в момент анимации. */
    if (h < 80) h = Math.max(120, vh * 0.45);
    docEl.style.setProperty('--dlm-stage-h', px(h));
  }

  var fitScheduled = false;
  function fitStage() {
    if (fitScheduled) return;
    fitScheduled = true;
    requestAnimationFrame(function () {
      fitScheduled = false;
      var parts = stageParts(), i;
      if (isMobile()) {
        for (i = 0; i < parts.length; i++) clearInline(parts[i]);
        measureStage();
      } else {
        for (i = 0; i < parts.length; i++) restoreInline(parts[i]);
        docEl.style.removeProperty('--dlm-stage-h');
      }
    });
  }

  function watchStage() {
    var frame = $('pvFrame');
    if (frame && !frame.__dlmWatched) {
      frame.__dlmWatched = true;
      new MutationObserver(function () { if (isMobile()) fitStage(); })
        .observe(frame, { attributes: true, attributeFilter: ['style', 'width', 'height'] });
    }
    var stage = $('pvStage');
    if (stage && !stage.__dlmWatched) {
      stage.__dlmWatched = true;
      new MutationObserver(function () { if (isMobile()) fitStage(); })
        .observe(stage, { attributes: true, attributeFilter: ['style', 'class'] });
    }
    /* Строка ввода меняет высоту при многострочном тексте. */
    var comp = document.querySelector('.editor .composer');
    if (comp && !comp.__dlmRO && window.ResizeObserver) {
      comp.__dlmRO = new ResizeObserver(function () { if (isMobile()) measureStage(); });
      comp.__dlmRO.observe(comp);
    }
  }

  /* ═════ 2. Режим «Код» ═════════════════════════════════ */

  function collapseChat() {
    try {
      if (window.dlMobileChat && typeof window.dlMobileChat.setState === 'function') {
        window.dlMobileChat.setState('peek');
        return;
      }
    } catch (e) {}
    var ed = editor();
    if (ed) ed.dataset.dlm = 'peek';
    try { sessionStorage.setItem('dl_mchat_state', 'peek'); } catch (e) {}
    var chat = document.querySelector('.editor .chat');
    if (chat) chat.style.setProperty('--dlm-y', chat.offsetHeight + 'px');
  }

  function codeText() {
    var ta = $('codeTa');
    return ta ? (ta.value || '') : '';
  }

  function meaningfulCode() {
    return codeText().replace(/<!--[\s\S]*?-->/g, '').trim().length > 0;
  }

  /* Панель могла открыться раньше, чем в current появится html. Повторяем. */
  function ensureCodeFilled(tries) {
    tries = tries == null ? 14 : tries;
    var panel = $('codePanel');
    if (!panel || !panel.classList.contains('on')) return;
    try { if (typeof window.refreshCode === 'function') window.refreshCode(); } catch (e) {}
    try { if (typeof window.codeSync === 'function') window.codeSync(); } catch (e) {}
    if (meaningfulCode() || tries <= 0) return;
    setTimeout(function () { ensureCodeFilled(tries - 1); }, 240);
  }

  /* Главное лекарство от «код не открывается с телефона»: штатный armCode
     может тихо выйти из-за неготового фрейма. Если через мгновение панель
     так и не включилась — открываем её напрямую. */
  function forceCodeOpen(tries) {
    tries = tries == null ? 8 : tries;
    var panel = $('codePanel');
    if (!panel) return;
    if (!panel.classList.contains('on')) {
      var opened = false;
      try {
        if (typeof window.toggleCode === 'function') { window.toggleCode(true); opened = true; }
      } catch (e) {}
      if (!opened) panel.classList.add('on');
    }
    ensureCodeFilled();
    if (!panel.classList.contains('on') && tries > 0) {
      setTimeout(function () { forceCodeOpen(tries - 1); }, 200);
    }
  }

  function syncCodeOpen() {
    var ed = editor(), panel = $('codePanel');
    if (!ed) return;
    var on = !!(panel && panel.classList.contains('on'));
    ed.classList.toggle('dl-code-open', on && isMobile());
    if (on && isMobile()) { collapseChat(); ensureCodeFilled(); }
  }

  function watchCodePanel() {
    var panel = $('codePanel');
    if (!panel || panel.__dlmWatched) return;
    panel.__dlmWatched = true;
    new MutationObserver(syncCodeOpen).observe(panel, { attributes: true, attributeFilter: ['class'] });
    syncCodeOpen();
  }

  function wrapSetMode() {
    if (window.__dlmModeWrapped) return;
    var orig = window.setMode;
    if (typeof orig !== 'function') return;
    window.__dlmModeWrapped = true;
    window.setMode = function (m) {
      var r;
      try { r = orig.apply(this, arguments); } catch (e) { r = undefined; }
      if (isMobile()) {
        if (m === 'code') {
          collapseChat();
          setTimeout(function () { forceCodeOpen(); syncCodeOpen(); }, 60);
          setTimeout(function () { forceCodeOpen(); measureStage(); }, 400);
        } else {
          var ed = editor();
          if (ed) ed.classList.remove('dl-code-open');
          fitStage();
        }
      }
      return r;
    };
  }

  /* ═════ 3. Пересчёт при изменении вьюпорта ══════════════════ */

  var t = 0;
  function onResize() {
    clearTimeout(t);
    t = setTimeout(function () { fitStage(); syncCodeOpen(); }, 90);
  }

  function boot() {
    watchStage();
    watchCodePanel();
    wrapSetMode();
    fitStage();

    var ed = editor();
    if (ed) new MutationObserver(function () {
      if (editorOpen()) { watchStage(); watchCodePanel(); fitStage(); }
    }).observe(ed, { attributes: true, attributeFilter: ['class', 'data-dlm'] });

    addEventListener('resize', onResize, { passive: true });
    addEventListener('orientationchange', function () { setTimeout(onResize, 230); }, { passive: true });
    if (window.visualViewport) visualViewport.addEventListener('resize', onResize, { passive: true });
    if (MQ && MQ.addEventListener) MQ.addEventListener('change', onResize);

    /* setMode объявляется в инлайн-скриптах — дожимаем обёртку и геометрию. */
    var n = 0, iv = setInterval(function () {
      wrapSetMode(); watchStage(); watchCodePanel();
      if (isMobile() && editorOpen()) measureStage();
      if (++n > 30) clearInterval(iv);
    }, 300);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
