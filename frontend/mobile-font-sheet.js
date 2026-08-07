/* Design Lab — мобильная панель выбора шрифта.

   Исходное меню шрифтов рассчитано на ПК: на телефоне оно раскрывается узкой
   полосой под верхним тулбаром, обрезается и не имеет кнопки выхода.

   Этот слой не заменяет штатный выбор шрифта и не перехватывает его обработчики.
   Он только находит уже открытое меню, оформляет его как мобильную шторку и
   добавляет безопасные способы закрытия: кнопка ×, тап по фону и Escape.
   После выбора шрифта шторка закрывается штатным кликом по исходной кнопке. */
(function () {
  'use strict';
  if (window.__dlMobileFontSheet) return;
  window.__dlMobileFontSheet = true;

  var MQ = window.matchMedia ? window.matchMedia('(max-width:860px)') : null;
  var PANEL = 'data-dl-font-sheet';
  var HEADER = 'data-dl-font-head';
  var BACKDROP_ID = 'dl-font-backdrop';
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
  var previousFocus = null;

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
      'body.dl-font-open{overflow:hidden!important;touch-action:none}',
      '#'+BACKDROP_ID+'{position:fixed;inset:0;z-index:9598;background:rgba(0,0,0,.62);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}',
      '['+PANEL+'="1"]{position:fixed!important;left:10px!important;right:10px!important;top:calc(var(--dlm-top,88px) + env(safe-area-inset-top,0px))!important;bottom:calc(var(--dlm-comp,92px) + var(--dlm-kb,0px) + 10px)!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;max-height:none!important;margin:0!important;padding:0 10px 12px!important;z-index:9599!important;display:flex!important;flex-direction:column!important;gap:4px!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:contain!important;-webkit-overflow-scrolling:touch;background:#101114!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:18px!important;box-shadow:0 24px 70px rgba(0,0,0,.72)!important;transform:none!important;opacity:1!important;visibility:visible!important;color:#f4f4f5!important;touch-action:pan-y}',
      '['+PANEL+'="1"] ['+HEADER+'="1"]{position:sticky!important;top:0!important;z-index:3!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;flex:0 0 auto!important;min-height:58px!important;margin:0 -10px 6px!important;padding:8px 10px 8px 16px!important;background:rgba(16,17,20,.98)!important;border-bottom:1px solid rgba(255,255,255,.09)!important;border-radius:18px 18px 0 0!important;font:700 16px/1.2 Inter,system-ui,sans-serif!important;color:#f4f4f5!important}',
      '['+PANEL+'="1"] .dl-font-close{appearance:none!important;-webkit-appearance:none!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 44px!important;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;margin:0!important;padding:0!important;border:1px solid rgba(255,255,255,.14)!important;border-radius:13px!important;background:#1a1c21!important;color:#fff!important;font:300 28px/1 system-ui,sans-serif!important;box-shadow:none!important;cursor:pointer!important}',
      '['+PANEL+'="1"] .dl-font-close:active{background:#292c33!important;transform:scale(.96)!important}',
      '['+PANEL+'="1"]>button,['+PANEL+'="1"]>[role="button"],['+PANEL+'="1"]>div:not(['+HEADER+']){flex:0 0 auto!important;min-height:50px!important;max-width:100%!important}',
      '['+PANEL+'="1"] button,['+PANEL+'="1"] [role="button"]{touch-action:manipulation}',
      '}',
      '@media(max-width:380px){['+PANEL+'="1"]{left:6px!important;right:6px!important;border-radius:15px!important}}'
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
    /* В меню каждая строка обычно имеет образец Aa. */
    var aa = (String(el.textContent || '').match(/\bAa\b/g) || []).length;
    if (aa > 1) score += Math.min(aa, 4);
    return score;
  }

  function findPanel() {
    var marked = document.querySelector('[' + PANEL + '="1"]');
    if (marked && visible(marked)) return marked;

    var nodes = document.querySelectorAll('body *');
    var best = null;
    var bestArea = Infinity;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!visible(el) || inPreview(el)) continue;
      if (el === trigger || (trigger && el.contains(trigger))) continue;
      if (fontScore(el) < 3) continue;
      var r = el.getBoundingClientRect();
      if (r.width < 150 || r.height < 70) continue;
      var area = r.width * r.height;
      /* Берём самый маленький контейнер, содержащий весь список. Так body,
         editor и preview не смогут стать шторкой. */
      if (area < bestArea) { best = el; bestArea = area; }
    }
    return best;
  }

  function backdrop() {
    var back = document.getElementById(BACKDROP_ID);
    if (back) return back;
    back = document.createElement('div');
    back.id = BACKDROP_ID;
    back.setAttribute('aria-hidden', 'true');
    back.addEventListener('click', close);
    document.body.appendChild(back);
    return back;
  }

  function makeHeader(host) {
    var old = host.querySelector(':scope > [' + HEADER + '="1"]');
    if (old) return old;
    var head = document.createElement('div');
    head.setAttribute(HEADER, '1');
    head.innerHTML = '<span>Шрифты</span>';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'dl-font-close';
    closeBtn.setAttribute('aria-label', 'Закрыть выбор шрифта');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    head.appendChild(closeBtn);
    host.insertBefore(head, host.firstChild);
    return head;
  }

  function open(host) {
    if (!phone() || !host || !host.isConnected) return;
    style();
    panel = host;
    previousFocus = trigger || document.activeElement;
    host.setAttribute(PANEL, '1');
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'Выбор шрифта');
    makeHeader(host);
    backdrop();
    document.body.classList.add('dl-font-open');
    var closeBtn = host.querySelector('.dl-font-close');
    if (closeBtn) setTimeout(function () { try { closeBtn.focus({ preventScroll: true }); } catch (e) { closeBtn.focus(); } }, 0);
  }

  function cleanup() {
    var back = document.getElementById(BACKDROP_ID);
    if (back) back.remove();
    document.body.classList.remove('dl-font-open');
    if (panel && panel.isConnected) {
      panel.removeAttribute(PANEL);
      panel.removeAttribute('role');
      panel.removeAttribute('aria-modal');
      panel.removeAttribute('aria-label');
      var head = panel.querySelector(':scope > [' + HEADER + '="1"]');
      if (head) head.remove();
    }
    panel = null;
    var focus = previousFocus;
    previousFocus = null;
    if (focus && focus.isConnected) setTimeout(function () { try { focus.focus({ preventScroll: true }); } catch (e) {} }, 0);
  }

  function close() {
    if (closing) return;
    closing = true;
    var oldPanel = panel;
    var oldTrigger = trigger;

    /* Штатный повторный клик сохраняет внутреннее состояние меню корректным. */
    if (oldTrigger && oldTrigger.isConnected) {
      try { oldTrigger.click(); } catch (e) {}
    }

    setTimeout(function () {
      /* Если приложение не умеет закрывать повторным кликом, скрываем только
         визуальное оформление. При следующем клике исходный код снова построит
         или покажет меню, и наблюдатель оформит его заново. */
      cleanup();
      if (oldPanel && visible(oldPanel) && oldTrigger) {
        try { oldTrigger.click(); } catch (e) {}
      }
      closing = false;
    }, 80);
  }

  function inspect() {
    scheduled = false;
    if (!phone()) { if (panel) cleanup(); return; }
    if (panel && !visible(panel)) { cleanup(); return; }
    if (!trigger) return;
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
      /* Меню строится после штатного click-обработчика. */
      scheduled = false;
      setTimeout(inspect, 0);
      setTimeout(inspect, 80);
      setTimeout(inspect, 240);
      return;
    }
    if (panel && panel.contains(e.target)) {
      if (e.target.closest && e.target.closest('.dl-font-close')) return;
      var choice = e.target.closest && e.target.closest('button,[role="button"],li,.option,.item');
      if (choice && !choice.hasAttribute(HEADER)) setTimeout(function () {
        if (panel && !visible(panel)) cleanup();
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
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    if (window.MutationObserver) {
      new MutationObserver(function () { if (trigger || panel) schedule(30); })
        .observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-expanded'] });
    }
    addEventListener('resize', function () { schedule(0); }, { passive: true });
    addEventListener('orientationchange', function () { schedule(180); }, { passive: true });
    if (MQ && MQ.addEventListener) MQ.addEventListener('change', function () { schedule(0); });
  }

  window.dlCloseFonts = close;
  window.dlFontSheetState = function () {
    return { phone: phone(), trigger: !!trigger, panel: !!panel, open: !!(panel && visible(panel)) };
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
