/* Старая кнопка «Цвета» больше не нужна: её роль выполняет палитра
   из dl-palettes.js. Разметка index.html огромная и править её точечно нельзя,
   поэтому кнопка убирается по тексту подписи.

   Аккуратность:
     • не трогаем саму кнопку палитры и её окно;
     • не трогаем элементы внутри превью (#pvFrame — это сайт пользователя);
     • совпадение только по точному слову и только у кнопочных элементов,
       чтобы не зацепить заголовки и подписи;
     • скрываем, а не удаляем узел, чтобы чужой код не упал на null. */
(function () {
  'use strict';
  if (window.__dlHideColorsButton) return;
  window.__dlHideColorsButton = true;

  var MARK = 'data-dl-colors-hidden';
  var CSS_ID = 'dl-hide-colors-css';
  var WORDS = ['цвета', 'цвет', 'colors', 'color'];
  var CLICKABLE = 'button,a,[role="button"],.btn,.tb-btn,.pv-btn,.chip,.tool,.icon-btn';
  var scheduled = false;

  function style() {
    if (document.getElementById(CSS_ID)) return;
    var node = document.createElement('style');
    node.id = CSS_ID;
    node.textContent = '[' + MARK + '="1"]{display:none!important}';
    (document.head || document.documentElement).appendChild(node);
  }

  function text(el) {
    return String(el.textContent || '')
      .replace(/[\s\u00a0]+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function protectedNode(el) {
    if (el.hasAttribute && el.hasAttribute('data-dl-palette-button')) return true;
    if (el.closest) {
      try {
        if (el.closest('[data-dl-palette-button],[data-dl-palette-panel]')) return true;
        if (el.closest('#pvFrame,#pvStage')) return true;
      } catch (e) { /* неважно */ }
    }
    return false;
  }

  function looksLikeColors(el) {
    var t = text(el);
    if (!t || t.length > 12) return false;
    for (var i = 0; i < WORDS.length; i++) {
      if (t === WORDS[i]) return true;
    }
    return false;
  }

  function run() {
    scheduled = false;
    style();
    var nodes;
    try { nodes = document.querySelectorAll(CLICKABLE); } catch (e) { return; }
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.getAttribute(MARK) === '1') continue;
      if (protectedNode(el)) continue;
      if (!looksLikeColors(el)) continue;
      /* Если у кнопки есть собственная оболочка-враппер с тем же текстом,
         скрываем враппер, иначе останется пустая рамка. */
      var target = el;
      var up = el.parentElement;
      var steps = 0;
      while (up && steps < 2 && !protectedNode(up) &&
             up.children.length === 1 && looksLikeColors(up)) {
        target = up;
        up = up.parentElement;
        steps++;
      }
      target.setAttribute(MARK, '1');
      target.setAttribute('aria-hidden', 'true');
    }
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(run);
  }

  window.dlHiddenColorsButtons = function () {
    return document.querySelectorAll('[' + MARK + '="1"]').length;
  };

  function start() {
    style();
    run();
    if (window.MutationObserver) {
      new MutationObserver(schedule).observe(document.documentElement, {
        childList: true, subtree: true, characterData: true
      });
    }
    addEventListener('resize', schedule, { passive: true });
    setInterval(run, 900);
  }

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})();
