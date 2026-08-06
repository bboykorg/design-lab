/* Кнопка палитры не должна перекрывать рабочий интерфейс.

   dl-palettes.js рисует кнопку fixed в правом нижнем углу с высоким z-index.
   Из-за этого она лежала поверх панели блоков, меню размеров устройства и
   мобильного чата. Этот слой ничего не двигает и не перехватывает: он только
   временно скрывает кнопку и закрывает окно палитры, пока место занято.

   Правила:
   - на телефоне кнопка скрыта, пока открыт редактор с закреплённым composer;
   - на любой ширине она скрыта при видимой панели блоков/кода/устройств;
   - дополнительно проверяется реальное пересечение с небольшими floating-
     панелями, поэтому новая панель тоже не окажется под кнопкой;
   - после закрытия панели кнопка возвращается автоматически. */
(function () {
  'use strict';
  if (window.__dlPaletteVisibilityGuard) return;
  window.__dlPaletteVisibilityGuard = true;

  var ATTR = 'data-dl-palette-suppressed';
  var CSS_ID = 'dl-palette-visibility-css';
  var PHONE = window.matchMedia ? window.matchMedia('(max-width:860px)') : null;
  var PANEL_SELECTORS = [
    '#sfPanel', '#codePanel', '#deviceMenu', '#devMenu', '#screenMenu',
    '#resolutionMenu', '#viewportMenu', '#emuMenu',
    '[data-device-menu]', '[data-resolution-menu]', '[data-viewport-menu]',
    '.device-menu', '.resolution-menu', '.viewport-menu', '.screen-menu',
    '.sf-panel', '.blocks-panel', '.block-panel'
  ];

  var scheduled = false;

  function style() {
    if (document.getElementById(CSS_ID)) return;
    var node = document.createElement('style');
    node.id = CSS_ID;
    node.textContent = '[' + ATTR + '="1"]{display:none!important}';
    (document.head || document.documentElement).appendChild(node);
  }
  function button() {
    return document.querySelector('[data-dl-palette-button]');
  }
  function isPhone() {
    return PHONE ? PHONE.matches : (window.innerWidth || 0) <= 860;
  }
  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (!cs || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    var r;
    try { r = el.getBoundingClientRect(); } catch (e) { return false; }
    if (r.width < 2 || r.height < 2) return false;
    return r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
  }
  function editorOpen() {
    var ed = document.querySelector('.editor');
    return !!(ed && ed.classList.contains('on'));
  }
  function mobileChatOpen() {
    if (!isPhone() || !editorOpen()) return false;
    var composer = document.querySelector('.editor .composer');
    return visible(composer);
  }
  function knownPanelOpen() {
    for (var i = 0; i < PANEL_SELECTORS.length; i++) {
      var nodes;
      try { nodes = document.querySelectorAll(PANEL_SELECTORS[i]); } catch (e) { nodes = []; }
      for (var j = 0; j < nodes.length; j++) if (visible(nodes[j])) return true;
    }
    return false;
  }
  function overlap(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  }
  function ignored(el, btn) {
    if (!el || el === btn || el.contains(btn) || btn.contains(el)) return true;
    if (el === document.body || el === document.documentElement) return true;
    if (el.closest && el.closest('[data-dl-palette-button]')) return true;
    if (el.id === 'pvFrame' || el.id === 'pvStage' || el.id === 'emuStage') return true;
    if (el.matches && el.matches('.editor,.pv,.pv-stage,.pv-fit,.pv-dev,.pv-scr,.emu')) return true;
    return false;
  }

  /* Ищем только небольшие absolute/fixed панели, реально попавшие под кнопку.
     Большие контейнеры редактора исключены, иначе кнопка была бы скрыта всегда. */
  function collision(btn) {
    var br;
    try { br = btn.getBoundingClientRect(); } catch (e) { return false; }
    if (!br.width || !br.height) {
      br = { left: innerWidth - 140, right: innerWidth - 12, top: innerHeight - 64, bottom: innerHeight - 8 };
    }
    var all = document.querySelectorAll('body *');
    var viewportArea = Math.max(1, innerWidth * innerHeight);
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (ignored(el, btn) || !visible(el)) continue;
      var cs;
      try { cs = getComputedStyle(el); } catch (e) { continue; }
      if (cs.position !== 'fixed' && cs.position !== 'absolute') continue;
      var r;
      try { r = el.getBoundingClientRect(); } catch (e) { continue; }
      if (r.width * r.height > viewportArea * 0.72) continue;
      if (overlap(br, r)) return true;
    }
    return false;
  }
  function palettePanel() {
    var nodes = document.querySelectorAll('body > div');
    for (var i = 0; i < nodes.length; i++) {
      var text = String(nodes[i].textContent || '');
      if (text.indexOf('Цветовая схема сайта') >= 0) return nodes[i];
    }
    return null;
  }
  function setHidden(btn, hide) {
    if (hide) {
      btn.setAttribute(ATTR, '1');
      btn.setAttribute('aria-hidden', 'true');
      var panel = palettePanel();
      if (panel) panel.style.display = 'none';
    } else {
      btn.removeAttribute(ATTR);
      btn.removeAttribute('aria-hidden');
    }
  }
  function sync() {
    scheduled = false;
    style();
    var btn = button();
    if (!btn) return;
    var hide = mobileChatOpen() || knownPanelOpen() || collision(btn);
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
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'aria-expanded', 'data-dlm']
    });
    addEventListener('resize', schedule, { passive: true });
    addEventListener('orientationchange', schedule, { passive: true });
    if (window.visualViewport) visualViewport.addEventListener('resize', schedule, { passive: true });
    if (PHONE && PHONE.addEventListener) PHONE.addEventListener('change', schedule);
    // Страховка для панелей, которые меняют геометрию без мутации атрибутов.
    setInterval(sync, 700);
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})();
