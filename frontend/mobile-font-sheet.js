/* Design Lab — мобильная панель выбора шрифта v2.

   В v1 заголовок вставлялся внутрь штатного списка, фокус переводился на ×,
   а вокруг создавался backdrop. Штатное меню воспринимало потерю фокуса как
   клик снаружи, удаляло варианты — оставались пустая шапка и тёмный экран.

   v2 не меняет содержимое и фокус штатного меню вообще:
     • только добавляет атрибут для мобильной геометрии;
     • отдельная шапка с × живёт рядом в body, а не внутри списка;
     • глобального overlay/backdrop и затемнения нет;
     • закрытие идёт повторным кликом по исходной кнопке «Шрифты»;
     • Escape тоже закрывает список.

   Все элементы страницы остаются кликабельными. */
(function () {
  'use strict';
  if (window.__dlMobileFontSheet) return;
  window.__dlMobileFontSheet = true;

  var MQ = window.matchMedia ? window.matchMedia('(max-width:860px)') : null;
  var PANEL = 'data-dl-font-sheet';
  var HEAD_ID = 'dl-font-head';
  var CSS_ID = 'dl-mobile-font-sheet-css';
  var FONT_WORDS = [
    'inter', 'space grotesk', 'manrope', 'montserrat', 'roboto', 'open sans',
    'playfair display', 'poppins', 'oswald', 'raleway', 'lora', 'nunito',
    'pt sans', 'source sans', 'georgia', 'arial'
  ];

  var trigger = null;
  var panel = null;
  var scheduled = false;
  var closing = false;

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
      '#'+HEAD_ID+'{position:fixed;left:10px;right:10px;top:calc(var(--dlm-top,76px) + env(safe-area-inset-top,0px));z-index:9599;height:58px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 9px 7px 16px;box-sizing:border-box;background:#101114;border:1px solid rgba(255,255,255,.12);border-bottom-color:rgba(255,255,255,.08);border-radius:18px 18px 0 0;box-shadow:0 -8px 30px rgba(0,0,0,.28);font:700 16px/1.2 Inter,system-ui,sans-serif;color:#f4f4f5;pointer-events:auto}',
      '#'+HEAD_ID+' .dl-font-close{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;height:44px;min-width:44px;min-height:44px;margin:0;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:13px;background:#1a1c21;color:#fff;font:300 28px/1 system-ui,sans-serif;box-shadow:none;cursor:pointer;touch-action:manipulation}',
      '#'+HEAD_ID+' .dl-font-close:active{background:#292c33;transform:scale(.96)}',
      '['+PANEL+'="1"]{position:fixed!important;left:10px!important;right:10px!important;top:calc(var(--dlm-top,76px) + env(safe-area-inset-top,0px) + 57px)!important;bottom:calc(var(--dlm-comp,92px) + var(--dlm-kb,0px) + 10px)!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;max-height:none!important;margin:0!important;padding:8px 10px 12px!important;box-sizing:border-box!important;z-index:9598!important;display:block!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:contain!important;-webkit-overflow-scrolling:touch;background:#101114!important;border:1px solid rgba(255,255,255,.12)!important;border-top:0!important;border-radius:0 0 18px 18px!important;box-shadow:0 24px 60px rgba(0,0,0,.58)!important;transform:none!important;opacity:1!important;visibility:visible!important;color:#f4f4f5!important;touch-action:pan-y}',
      '['+PANEL+'="1"]>button,['+PANEL+'="1"]>[role="button"],['+PANEL+'="1"]>div{min-height:50px;max-width:100%;box-sizing:border-box}',
      '['+PANEL+'="1"] button,['+PANEL+'="1"] [role="button"]{touch-action:manipulation}',
      '}',
      '@media(max-width:380px){#'+HEAD_ID+',['+PANEL+'="1"]{left:6px!important;right:6px!important}}'
    ].join('');
    (document.head || document.documentElement).appendChild(node);
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 100 && r.height > 38 && r.bottom > 0 && r.right > 0;
  }
  function inPreview(el) {
    if (!el || !el.closest) return false;
    try { return !!el.closest('#pvFrame,#pvStage,iframe'); } catch (e) { return false; }
  }
  function isFontTrigger(el) {
    if (!el || !el.closest) return null;
    var button = el.closest('button,[role="button"],.tb-btn,.tool-btn,.seg');
    if (!button || inPreview(button)) return null;
    var t = norm(button.textContent || button.getAttribute('aria-label') || button.title);
    if (t === 'шрифты' || t === 'шрифт' || t === 'fonts' || t === 'font') return button;
    return null;
  }
  function fontScore(el) {
    var t = norm(el.textContent);
    if (!t || t.length > 4000) return 0;
    var score = 0;
    for (var i = 0; i < FONT_WORDS.length; i++) {
      if (t.indexOf(FONT_WORDS[i]) >= 0) score++;
    }
    var aa = (String(el.textContent || '').match(/\bAa\b/g) || []).length;
    if (aa > 1) score += Math.min(aa, 4);
    return score;
  }

  function findPanel() {
    var marked = document.querySelector('[' + PANEL + '="1"]');
    if (marked && visible(marked) && fontScore(marked) >= 2) return marked;

    var nodes = document.querySelectorAll('body *');
    var best = null;
    var bestArea = Infinity;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || inPreview(el)) continue;
      if (el.id === HEAD_ID || (el.closest && el.closest('#' + HEAD_ID))) continue;
      if (el === trigger || (trigger && el.contains(trigger))) continue;
      if (fontScore(el) < 3) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 150 || r.height < 70) continue;
      var area = r.width * r.height;
      if (area < bestArea) { best = el; bestArea = area; }
    }
    return best;
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
    closeBtn.addEventListener('pointerdown', function (e) {
      /* Не даём pointerdown увести фокус со штатного меню до click. */
      e.preventDefault();
    });
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

  function open(host) {
    if (!phone() || !host || !host.isConnected) return;
    style();
    if (panel && panel !== host) panel.removeAttribute(PANEL);
    panel = host;
    host.setAttribute(PANEL, '1');
    makeHead();
    /* Важно: не вызываем focus(). Именно это закрывало исходный список в v1. */
  }

  function cleanup() {
    var head = document.getElementById(HEAD_ID);
    if (head) head.remove();
    if (panel && panel.isConnected) panel.removeAttribute(PANEL);
    panel = null;
  }

  function close() {
    if (closing) return;
    closing = true;
    var oldTrigger = trigger;
    cleanup();
    /* Повторный штатный клик синхронно закрывает меню и сохраняет его
       внутреннее состояние. Никаких display:none вручную. */
    if (oldTrigger && oldTrigger.isConnected) {
      try { oldTrigger.click(); } catch (e) {}
    }
    setTimeout(function () { closing = false; }, 100);
  }

  function inspect() {
    scheduled = false;
    if (!phone()) { if (panel) cleanup(); return; }
    if (panel && (!visible(panel) || fontScore(panel) < 2)) {
      cleanup();
    }
    if (!trigger || closing) return;
    var found = findPanel();
    if (found) open(found);
  }
  function schedule(delay) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(inspect, delay == null ? 20 : delay);
  }

  function onClick(e) {
    var fontButton = isFontTrigger(e.target);
    if (fontButton) {
      trigger = fontButton;
      scheduled = false;
      setTimeout(inspect, 0);
      setTimeout(inspect, 80);
      setTimeout(inspect, 220);
      return;
    }
    if (panel && panel.contains(e.target)) {
      var choice = e.target.closest && e.target.closest('button,[role="button"],li,.option,.item');
      if (choice) setTimeout(function () {
        if (panel && (!visible(panel) || fontScore(panel) < 2)) cleanup();
      }, 120);
    }
  }
  function onKey(e) {
    if (e.key === 'Escape' && panel) {
      e.preventDefault();
      close();
    }
  }

  function boot() {
    style();
    /* Убираем остатки v1, если документ восстановлен браузером из bfcache. */
    var oldBackdrop = document.getElementById('dl-font-backdrop');
    if (oldBackdrop) oldBackdrop.remove();
    document.body.classList.remove('dl-font-open');

    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    if (window.MutationObserver) {
      new MutationObserver(function () { if (trigger || panel) schedule(30); })
        .observe(document.documentElement, {
          childList: true, subtree: true, attributes: true,
          attributeFilter: ['class', 'style', 'hidden', 'aria-expanded']
        });
    }
    addEventListener('resize', function () { schedule(0); }, { passive: true });
    addEventListener('orientationchange', function () { schedule(180); }, { passive: true });
    addEventListener('pageshow', function () {
      var back = document.getElementById('dl-font-backdrop');
      if (back) back.remove();
      document.body.classList.remove('dl-font-open');
      schedule(0);
    });
    if (MQ && MQ.addEventListener) MQ.addEventListener('change', function () { schedule(0); });
  }

  window.dlCloseFonts = close;
  window.dlFontSheetState = function () {
    return {
      phone: phone(),
      trigger: !!(trigger && trigger.isConnected),
      panel: !!(panel && panel.isConnected),
      open: !!(panel && visible(panel)),
      options: panel ? fontScore(panel) : 0
    };
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
