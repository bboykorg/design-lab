/* Кнопка «Палитра» не должна накладываться ни на что — и не должна теряться.

   Прошлые версии просто скрывали кнопку при любой открытой панели,
   и если панель блоков висит в редакторе постоянно, кнопка исчезала навсегда.
   Теперь логика другая: кнопка ищет свободное место и отъезжает туда —
   сначала вверх, потом влево. Прячется она только если свободного места
   нет вообще (развёрнутый мобильный чат, полноэкранная панель).

   Ничего не перехватывается и не затемняется: меняется только положение
   и видимость самой кнопки палитры.

   Диагностика в консоли: dlPaletteWhere() — показывает, найдена ли кнопка,
   где она стоит, скрыта ли и кто именно ей мешает. */
(function () {
  'use strict';
  if (window.__dlPaletteVisibilityGuard) return;
  window.__dlPaletteVisibilityGuard = true;

  var BTN = '[data-dl-palette-button]';
  var PANEL_ATTR = 'data-dl-palette-panel';
  var HIDDEN = 'data-dl-palette-hidden';
  var MOVED = 'data-dl-palette-moved';
  var CSS_ID = 'dl-palette-visibility-css';
  var PHONE = window.matchMedia ? window.matchMedia('(max-width:860px)') : null;

  var MIN_Z = 20;          /* ниже — это фон, а не панель */
  var BIG_SHARE = 0.72;    /* огромные контейнеры не считаются помехой */
  var MIN_W = 80;
  var MIN_H = 36;
  var GAP = 12;
  var MARGIN = 14;
  var UP_STEPS = 6;
  var LEFT_STEPS = 4;

  /* Панели, которые точно считаются помехой при пересечении (не безусловно). */
  var KNOWN = [
    '#sfPanel', '.sf-panel', '[data-sf-panel]', '.blocks-panel', '.block-panel',
    '#codePanel', '#dlIde',
    '.pv-head .tb-menu', '.pv-head [role="menu"]',
    '#deviceMenu', '#devMenu', '#screenMenu', '#resolutionMenu', '#viewportMenu', '#emuMenu',
    '[data-device-menu]', '[data-resolution-menu]', '[data-viewport-menu]',
    '.device-menu', '.resolution-menu', '.viewport-menu', '.screen-menu',
    '#modelMenu', '.model-menu',
    '.modal', '[role="dialog"]', '.drawer', '.sheet',
    '.editor.on .composer', '.editor.on .chat', '.dlm-top'
  ];

  var scheduled = false;
  var lastReport = { found: false };

  function style() {
    if (document.getElementById(CSS_ID)) return;
    var node = document.createElement('style');
    node.id = CSS_ID;
    node.textContent =
      '[' + HIDDEN + '="1"]{visibility:hidden!important;pointer-events:none!important}';
    (document.head || document.documentElement).appendChild(node);
  }
  function button() { return document.querySelector(BTN); }
  function phone() {
    return PHONE ? PHONE.matches : (window.innerWidth || 0) <= 860;
  }
  function boxOf(el) {
    try { return el.getBoundingClientRect(); } catch (e) { return null; }
  }
  function hits(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  function visible(el) {
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (!cs) return false;
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    if (Number(cs.opacity) === 0) return false;
    return true;
  }
  function cssVar(name, fallback) {
    var raw;
    try {
      raw = getComputedStyle(document.documentElement).getPropertyValue(name);
    } catch (e) { raw = ''; }
    var n = parseFloat(String(raw || '').replace('px', ''));
    return isNaN(n) ? fallback : n;
  }
  function label(el) {
    var out = el.tagName ? el.tagName.toLowerCase() : '?';
    if (el.id) out += '#' + el.id;
    var cls = typeof el.className === 'string' ? el.className.trim() : '';
    if (cls) out += '.' + cls.split(/\s+/).slice(0, 3).join('.');
    return out;
  }

  function palettePanel() {
    var marked = document.querySelector('[' + PANEL_ATTR + ']');
    if (marked) return marked;
    var nodes = document.querySelectorAll('body > div');
    for (var i = 0; i < nodes.length; i++) {
      if (String(nodes[i].textContent || '').indexOf('Цветовая схема сайта') < 0) continue;
      nodes[i].setAttribute(PANEL_ATTR, '1');
      return nodes[i];
    }
    return null;
  }
  function paletteOpen() {
    var panel = palettePanel();
    return !!(panel && visible(panel));
  }
  function closePalette() {
    var panel = palettePanel();
    if (panel && panel.style.display !== 'none') panel.style.display = 'none';
  }
  function movePanel(box) {
    var panel = palettePanel();
    if (!panel || !visible(panel)) return;
    var pb = boxOf(panel);
    if (!pb) return;
    var vw = window.innerWidth || 0;
    var left = Math.max(8, Math.min(box.left + box.width - pb.width, vw - pb.width - 8));
    var top = Math.max(8, box.top - pb.height - 8);
    panel.style.setProperty('left', left + 'px', 'important');
    panel.style.setProperty('top', top + 'px', 'important');
    panel.style.setProperty('right', 'auto', 'important');
    panel.style.setProperty('bottom', 'auto', 'important');
  }

  function skip(el, btn) {
    if (!el || el === btn) return true;
    if (el.contains(btn) || btn.contains(el)) return true;
    if (el === document.body || el === document.documentElement) return true;
    if (el.hasAttribute && el.hasAttribute(PANEL_ATTR)) return true;
    var id = el.id || '';
    if (id === 'pvFrame' || id === 'pvStage' || id === 'emuStage') return true;
    if (el.matches) {
      try {
        if (el.matches('.editor,.preview,.pv,.pv-stage,.pv-fit,.pv-dev,.pv-scr,.emu,.dlm-scrim')) return true;
      } catch (e) { /* неважно */ }
    }
    return false;
  }

  /* Собираем все реально видимые плавающие панели с их коробками. */
  function blockers(btn) {
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    var area = Math.max(1, vw * vh);
    var seen = [];
    var out = [];

    function consider(el, forced) {
      if (skip(el, btn)) return;
      if (seen.indexOf(el) >= 0) return;
      seen.push(el);
      if (!visible(el)) return;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { return; }
      if (!forced) {
        if (cs.position !== 'fixed' && cs.position !== 'absolute') return;
        var z = parseInt(cs.zIndex, 10);
        if (isNaN(z) || z < MIN_Z) return;
      }
      var box = boxOf(el);
      if (!box) return;
      if (box.width < MIN_W || box.height < MIN_H) return;
      if (box.right <= 0 || box.bottom <= 0 || box.left >= vw || box.top >= vh) return;
      if (box.width * box.height > area * BIG_SHARE) return;
      out.push({ el: el, box: box });
    }

    for (var i = 0; i < KNOWN.length; i++) {
      var nodes;
      try { nodes = document.querySelectorAll(KNOWN[i]); } catch (e) { nodes = []; }
      for (var j = 0; j < nodes.length; j++) consider(nodes[j], true);
    }
    var all = document.querySelectorAll('body *');
    for (var k = 0; k < all.length; k++) consider(all[k], false);
    return out;
  }

  function freeSpot(w, h, list) {
    var vw = window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    var baseBottom = MARGIN;
    if (phone()) baseBottom = cssVar('--dlm-comp', 92) + cssVar('--dlm-kb', 0) + MARGIN;

    for (var up = 0; up < UP_STEPS; up++) {
      for (var left = 0; left < LEFT_STEPS; left++) {
        var x = vw - MARGIN - w - left * (w + GAP);
        var y = vh - baseBottom - h - up * (h + GAP);
        if (x < 8 || y < 8) continue;
        var probe = { left: x, top: y, right: x + w, bottom: y + h };
        var clean = true;
        for (var i = 0; i < list.length; i++) {
          if (hits(probe, list[i].box)) { clean = false; break; }
        }
        if (clean) return probe;
      }
    }
    return null;
  }

  function setHidden(btn, hide) {
    if (hide) {
      if (btn.getAttribute(HIDDEN) !== '1') btn.setAttribute(HIDDEN, '1');
      btn.setAttribute('aria-hidden', 'true');
      closePalette();
    } else if (btn.hasAttribute(HIDDEN)) {
      btn.removeAttribute(HIDDEN);
      btn.removeAttribute('aria-hidden');
    }
  }

  function put(btn, spot) {
    btn.style.setProperty('left', Math.round(spot.left) + 'px', 'important');
    btn.style.setProperty('top', Math.round(spot.top) + 'px', 'important');
    btn.style.setProperty('right', 'auto', 'important');
    btn.style.setProperty('bottom', 'auto', 'important');
    btn.setAttribute(MOVED, '1');
  }

  function sync() {
    scheduled = false;
    style();
    var btn = button();
    if (!btn) { lastReport = { found: false }; return; }

    var box = boxOf(btn);
    var w = (box && box.width) || 44;
    var h = (box && box.height) || 44;

    var list = blockers(btn);
    var spot = freeSpot(w, h, list);

    if (spot) {
      setHidden(btn, false);
      put(btn, spot);
      if (paletteOpen()) movePanel(spot);
    } else {
      setHidden(btn, true);
    }

    lastReport = {
      found: true,
      hidden: btn.getAttribute(HIDDEN) === '1',
      phone: phone(),
      spot: spot ? { left: Math.round(spot.left), top: Math.round(spot.top) } : null,
      blockers: list.map(function (item) {
        return {
          node: label(item.el),
          rect: {
            left: Math.round(item.box.left), top: Math.round(item.box.top),
            width: Math.round(item.box.width), height: Math.round(item.box.height)
          }
        };
      })
    };
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

  window.dlPaletteWhere = function () { sync(); return lastReport; };

  function start() {
    style();
    sync();

    if (window.MutationObserver) {
      new MutationObserver(schedule).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'open', 'data-dlm', 'aria-expanded', 'aria-hidden']
      });
    }
    addEventListener('resize', schedule, { passive: true });
    addEventListener('orientationchange', schedule, { passive: true });
    addEventListener('scroll', schedule, { passive: true, capture: true });
    document.addEventListener('click', function () { setTimeout(schedule, 0); }, true);
    if (window.visualViewport) {
      visualViewport.addEventListener('resize', schedule, { passive: true });
      visualViewport.addEventListener('scroll', schedule, { passive: true });
    }
    if (PHONE && PHONE.addEventListener) PHONE.addEventListener('change', schedule);

    /* Часть панелей выезжает анимацией без мутаций атрибутов. */
    setInterval(sync, 600);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})();
