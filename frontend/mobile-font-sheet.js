/* Design Lab — мобильная панель выбора шрифта v3.

   v1/v2 пытались вычислить контейнер меню по тексту. В результате выбирался
   маленький внутренний блок списка: ему задавалась геометрия всей шторки,
   штатное меню закрывалось, строки исчезали, а оболочка оставалась.

   Здесь нет поиска и нет изменений внутри списка. Настоящее меню уже известно:
   `.editor.on .pv-head .tb-menu` (оно же используется в dl-mobile-chat.css).
   Мы только включаем body.dl-font-mode после клика «Шрифты»:
     • настоящий .tb-menu получает свободную область между шапкой и чатом;
     • отдельная кнопка × закрывает меню штатным повторным кликом;
     • палитра и её popup полностью скрываются, пока открыты шрифты;
     • нет backdrop, затемнения, перехвата страницы и принудительного display.

   Содержимое .tb-menu вообще не трогаем — выбор шрифтов остаётся штатным. */
(function () {
  'use strict';
  if (window.__dlMobileFontSheet) return;
  window.__dlMobileFontSheet = true;

  var MQ = window.matchMedia ? window.matchMedia('(max-width:860px)') : null;
  var MODE = 'dl-font-mode';
  var HEAD_ID = 'dl-font-head';
  var CSS_ID = 'dl-mobile-font-sheet-css';
  var MENU = '.editor.on .pv-head .tb-menu';
  var trigger = null;
  var closing = false;
  var checkTimer = 0;

  function phone() {
    return MQ ? MQ.matches : (window.innerWidth || 0) <= 860;
  }
  function norm(value) {
    return String(value || '').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
  }
  function style() {
    if (document.getElementById(CSS_ID)) return;
    var node = document.createElement('style');
    node.id = CSS_ID;
    node.textContent = [
      '@media(max-width:860px){',
      'body.'+MODE+' [data-dl-palette-button],body.'+MODE+' [data-dl-palette-panel]{display:none!important;visibility:hidden!important;pointer-events:none!important}',
      '#'+HEAD_ID+'{position:fixed;left:8px;right:8px;top:calc(var(--dlm-top,52px) + env(safe-area-inset-top,0px));z-index:9599;height:58px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 9px 7px 16px;background:#101114;border:1px solid rgba(255,255,255,.12);border-bottom-color:rgba(255,255,255,.08);border-radius:16px 16px 0 0;box-shadow:0 -8px 26px rgba(0,0,0,.25);font:700 16px/1.2 Inter,system-ui,sans-serif;color:#f4f4f5;pointer-events:auto}',
      '#'+HEAD_ID+' .dl-font-close{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;height:44px;min-width:44px;min-height:44px;margin:0;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#1a1c21;color:#fff;font:300 28px/1 system-ui,sans-serif;box-shadow:none;cursor:pointer;touch-action:manipulation}',
      '#'+HEAD_ID+' .dl-font-close:active{background:#292c33;transform:scale(.96)}',
      'body.'+MODE+' '+MENU+'{position:fixed!important;left:8px!important;right:8px!important;top:calc(var(--dlm-top,52px) + env(safe-area-inset-top,0px) + 57px)!important;bottom:calc(var(--dlm-comp,92px) + var(--dlm-kb,0px) + 8px)!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;max-height:none!important;margin:0!important;box-sizing:border-box!important;z-index:9598!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:contain!important;-webkit-overflow-scrolling:touch;background:#101114!important;border:1px solid rgba(255,255,255,.12)!important;border-top:0!important;border-radius:0 0 16px 16px!important;box-shadow:0 22px 58px rgba(0,0,0,.56)!important;transform:none!important;opacity:1!important;visibility:visible!important;touch-action:pan-y}',
      'body.'+MODE+' '+MENU+' button,body.'+MODE+' '+MENU+' [role="button"],body.'+MODE+' '+MENU+' li{min-height:48px;touch-action:manipulation}',
      '}',
      '@media(max-width:380px){#'+HEAD_ID+',body.'+MODE+' '+MENU+'{left:5px!important;right:5px!important}}'
    ].join('');
    (document.head || document.documentElement).appendChild(node);
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 100 && r.height > 20 && r.bottom > 0 && r.right > 0;
  }
  function menus() {
    try { return document.querySelectorAll(MENU); } catch (e) { return []; }
  }
  function menuOpen() {
    var list = menus();
    for (var i = 0; i < list.length; i++) if (visible(list[i])) return true;
    return false;
  }
  function fontButton(el) {
    if (!el || !el.closest) return null;
    var btn = el.closest('button,[role="button"],.tb-btn,.tool-btn,.seg');
    if (!btn) return null;
    var t = norm(btn.textContent || btn.getAttribute('aria-label') || btn.title);
    return t === 'шрифты' || t === 'шрифт' || t === 'fonts' || t === 'font' ? btn : null;
  }

  function closePalettePopup() {
    var marked = document.querySelector('[data-dl-palette-panel]');
    if (marked) marked.style.display = 'none';
    /* Старый popup мог ещё не получить маркер. */
    var nodes = document.querySelectorAll('body > div');
    for (var i = 0; i < nodes.length; i++) {
      if (String(nodes[i].textContent || '').indexOf('Цветовая схема сайта') >= 0) {
        nodes[i].style.display = 'none';
      }
    }
  }

  function makeHead() {
    var old = document.getElementById(HEAD_ID);
    if (old) return old;
    var head = document.createElement('div');
    head.id = HEAD_ID;
    head.setAttribute('role', 'toolbar');
    head.setAttribute('aria-label', 'Выбор шрифта');
    var title = document.createElement('span');
    title.textContent = 'Шрифты';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'dl-font-close';
    closeBtn.setAttribute('aria-label', 'Закрыть выбор шрифта');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    head.appendChild(title);
    head.appendChild(closeBtn);
    document.body.appendChild(head);
    return head;
  }

  function enter() {
    if (!phone()) return;
    closePalettePopup();
    document.body.classList.add(MODE);
    makeHead();
    scheduleCheck();
  }
  function leave() {
    clearTimeout(checkTimer);
    checkTimer = 0;
    document.body.classList.remove(MODE);
    var head = document.getElementById(HEAD_ID);
    if (head) head.remove();
  }
  function close() {
    if (closing) return;
    closing = true;
    leave();
    if (trigger && trigger.isConnected) {
      try { trigger.click(); } catch (e) {}
    }
    setTimeout(function () { closing = false; }, 120);
  }

  function scheduleCheck() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(function () {
      checkTimer = 0;
      if (!document.body.classList.contains(MODE)) return;
      /* Даём штатному обработчику и анимации 500 мс. После этого, если меню
         действительно закрылось (выбор шрифта или повторный клик), убираем шапку. */
      if (!menuOpen()) leave();
    }, 500);
  }

  function onClick(e) {
    var btn = fontButton(e.target);
    if (btn) {
      trigger = btn;
      if (document.body.classList.contains(MODE)) {
        setTimeout(scheduleCheck, 0);
      } else {
        /* click слушается в capture: штатное меню откроется сразу после нас. */
        enter();
      }
      return;
    }

    if (!document.body.classList.contains(MODE)) return;
    var menu = e.target.closest && e.target.closest(MENU);
    if (menu) {
      /* Выбор пункта обычно сам закрывает menu. Проверяем после обработчика. */
      setTimeout(scheduleCheck, 0);
    }
  }
  function onKey(e) {
    if (e.key === 'Escape' && document.body.classList.contains(MODE)) {
      e.preventDefault();
      close();
    }
  }

  function cleanOldVersions() {
    var back = document.getElementById('dl-font-backdrop');
    if (back) back.remove();
    document.body.classList.remove('dl-font-open');
    var marked = document.querySelectorAll('[data-dl-font-sheet]');
    for (var i = 0; i < marked.length; i++) marked[i].removeAttribute('data-dl-font-sheet');
  }

  function boot() {
    style();
    cleanOldVersions();
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', function () { if (!phone()) leave(); }, { passive: true });
    addEventListener('orientationchange', function () { setTimeout(scheduleCheck, 180); }, { passive: true });
    addEventListener('pageshow', cleanOldVersions);
    if (MQ && MQ.addEventListener) MQ.addEventListener('change', function () { if (!phone()) leave(); });
  }

  window.dlCloseFonts = close;
  window.dlFontSheetState = function () {
    return {
      phone: phone(),
      mode: document.body.classList.contains(MODE),
      menuFound: menus().length,
      menuVisible: menuOpen(),
      trigger: !!(trigger && trigger.isConnected),
      paletteVisible: !!document.querySelector('[data-dl-palette-button]:not([style*="display: none"])')
    };
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
