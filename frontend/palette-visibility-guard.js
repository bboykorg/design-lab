/* Кнопка «Палитра» не должна накладываться ни на что.

   dl-palettes.js ставит её position:fixed в правом нижнем углу с z-index 99998,
   поэтому она оказывалась поверх панели блоков, меню разрешения экрана,
   панели кода и мобильного чата.

   Первая версия этого слоя прятала кнопку на телефоне всегда: условием был
   видимый composer, а он в редакторе виден постоянно. Теперь иначе:

     • на телефоне кнопка приподнимается над закреплённой строкой ввода
       и над экранной клавиатурой (--dlm-comp и --dlm-kb ведёт dl-mobile-chat.js);
     • кнопка скрывается, когда мобильный чат развёрнут (data-dlm = half|full);
     • кнопка скрывается при открытой панели блоков, меню тулбара,
       панели кода и любом модальном окне;
     • дополнительно считается реальное пересечение с небольшими плавающими
       панелями, поэтому новая панель тоже не окажется под кнопкой;
     • вместе с кнопкой закрывается и окно выбора схемы.

   Ничего не перехватывается и не затемняется: слой меняет только видимость
   и отступ самой кнопки палитры. */
(function () {
  'use strict';
  if (window.__dlPaletteVisibilityGuard) return;
  window.__dlPaletteVisibilityGuard = true;

  var BTN = '[data-dl-palette-button]';
  var PANEL_ATTR = 'data-dl-palette-panel';
  var HIDDEN = 'data-dl-palette-hidden';
  var CSS_ID = 'dl-palette-visibility-css';
  var PHONE = window.matchMedia ? window.matchMedia('(max-width:860px)') : null;
  var MIN_Z = 20;
  var BIG_SHARE = 0.72;

  /* Панели, которые занимают место кнопки или важнее неё. */
  var ALWAYS_HIDE = [
    '#sfPanel', '.sf-panel', '[data-sf-panel]',
    '.blocks-panel', '.block-panel',
    '#codePanel.on', '#dlIde.on'
  ];
  var IF_OVERLAP = [
    '.pv-head .tb-menu', '.pv-head [role="menu"]',
    '#deviceMenu', '#devMenu', '#screenMenu', '#resolutionMenu', '#viewportMenu', '#emuMenu',
    '[data-device-menu]', '[data-resolution-menu]', '[data-viewport-menu]',
    '.device-menu', '.resolution-menu', '.viewport-menu', '.screen-menu',
    '.modal.on', '#modal.on', '[role="dialog"]',
    '.drawer.on', '.drawer.open', '.sheet.on', '.sheet.open',
    '#modelMenu', '.model-menu'
  ];

  var scheduled = false;

  function style() {
    if (document.getElementById(CSS_ID)) return;
    var node = document.createElement('style');
    node.id = CSS_ID;
    node.textContent =
      '[' + HIDDEN + '="1"]{visibility:hidden!important;pointer-events:none!important}';
    (document.head || document.documentElement).appendChild(node);
  }
  function button() {
    return document.querySelector(BTN);
  }
  function phone() {
    return PHONE ? PHONE.matches : (window.innerWidth || 0) <= 860;
  }
  function shown(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (!cs) return false;
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    var box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return false;
    return box.right > 0 && box.bottom > 0 &&
      box.left < (window.innerWidth || 0) && box.top < (window.innerHeight || 0);
  }
  function hits(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  function boxOf(el) {
    try { return el.getBoundingClientRect(); } catch (e) { return null; }
  }
  function matchAny(list) {
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var nodes;
      try { nodes = document.querySelectorAll(list[i]); } catch (e) { nodes = []; }
      for (var j = 0; j < nodes.length; j++) out.push(nodes[j]);
    }
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
  function closePalette() {
    var panel = palettePanel();
    if (panel && panel.style.display !== 'none') panel.style.display = 'none';
  }

  /* Мобильный чат развёрнут: лента переписки занимает низ экрана. */
  function chatExpanded() {
    if (!phone()) return false;
    var editor = document.querySelector('.editor.on');
    if (!editor) return false;
    var state = editor.getAttribute('data-dlm') || '';
    return state === 'half' || state === 'full';
  }

  function blockingPanel(btnBox) {
    var always = matchAny(ALWAYS_HIDE);
    for (var i = 0; i < always.length; i++) {
      if (shown(always[i])) return true;
    }
    var maybe = matchAny(IF_OVERLAP);
    for (var j = 0; j < maybe.length; j++) {
      var node = maybe[j];
      if (!shown(node)) continue;
      var box = boxOf(node);
      if (box && hits(btnBox, box)) return true;
    }
    return false;
  }

  function skip(el, btn) {
    if (!el || el === btn) return true;
    if (el.contains(btn) || btn.contains(el)) return true;
    if (el === document.body || el === document.documentElement) return true;
    if (el.hasAttribute(PANEL_ATTR)) return true;
    if (el.id === 'pvFrame' || el.id === 'pvStage' || el.id === 'emuStage') return true;
    if (el.matches && el.matches('.editor,.preview,.pv,.pv-stage,.pv-fit,.pv-dev,.pv-scr,.emu,.chat')) return true;
    return false;
  }

  /* Запасной путь для панелей без известных селекторов: считаем геометрию.
     Большие контейнеры исключены, иначе кнопка пропадала бы навсегда. */
  function overlapsFloating(btn, btnBox) {
    var nodes = document.querySelectorAll('body *');
    var area = Math.max(1, (window.innerWidth || 1) * (window.innerHeight || 1));
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (skip(el, btn)) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      var z = parseInt(cs.zIndex, 10);
      if (isNaN(z) || z < MIN_Z) continue;
      var box = boxOf(el);
      if (!box || box.width < 80 || box.height < 40) continue;
      if (box.width * box.height > area * BIG_SHARE) continue;
      if (hits(btnBox, box)) return true;
    }
    return false;
  }

  /* На телефоне кнопка стоит НАД строкой ввода, а не поверх неё. */
  function place(btn) {
    if (phone()) {
      btn.style.setProperty('bottom',
        'calc(var(--dlm-comp, 92px) + var(--dlm-kb, 0px) + 14px)', 'important');
      btn.style.setProperty('right', '12px', 'important');
    } else {
      btn.style.removeProperty('bottom');
      btn.style.removeProperty('right');
    }
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

  function sync() {
    scheduled = false;
    style();
    var btn = button();
    if (!btn) return;

    place(btn);

    /* Геометрию берём до скрытия: у скрытой кнопки visibility:hidden,
       но коробка сохраняется — поэтому проверка остаётся честной
       и кнопка сама вернётся, когда панель закроют. */
    var btnBox = boxOf(btn);
    if (!btnBox || (!btnBox.width && !btnBox.height)) return;

    var hide = chatExpanded() || blockingPanel(btnBox) || overlapsFloating(btn, btnBox);
    setHidden(btn, hide);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(sync);
  }

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

    /* Страховка: часть панелей выезжает анимацией без мутаций атрибутов. */
    setInterval(sync, 600);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})();
