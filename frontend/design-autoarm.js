/* Design Lab — редактирование блоков включается сразу при входе в режим дизайна.

   Движок редактора (подсветка, рамки, перетаскивание) стартует в момент первого
   открытия панели с блоками, поэтому скрипт нажимает штатную кнопку за пользователя.

   Важно: нажатие ровно ОДНО и только если панель закрыта. Прошлая версия
   открывала и тут же закрывала панель, а проверка режима могла дёргаться — получалось
   мигание. Теперь панель просто остаётся открытой, а закрыть её можно вручную:
   повторно скрипт её не откроет до следующей загрузки сайта в кадре. */
(function () {
  'use strict';
  if (window.__dlDesignAutoArm) return;
  window.__dlDesignAutoArm = true;

  var PANEL = '#sfPanel,[id*="sfPanel"],[class*="sf-panel"],[id*="blocksPanel"],[class*="blocks-panel"]';
  var TOGGLE_SEL = [
    '#sfBtn', '#blocksBtn', '#addBlockBtn', '#sfToggle',
    '[onclick*="sfPanel"]', '[onclick*="toggleSf"]', '[onclick*="openSf"]',
    '[onclick*="blocksPanel"]', '[onclick*="toggleBlocks"]',
    '[data-panel="blocks"]', '[data-dl-blocks]'
  ].join(',');
  var TOGGLE_TEXT = /^(\+?\s*)?(блоки|блок|добавить блок|элементы|компоненты|blocks|elements|components)$/i;

  /* Одна попытка на загрузку сайта в кадре — без автоповторов. */
  var done = false;

  function inDesign() {
    try { if (typeof boardMode !== 'undefined' && boardMode === 'design') return true; } catch (e) {}
    if (window.boardMode === 'design') return true;
    var btn = document.getElementById('modeDesignBtn');
    if (btn) {
      var cls = ' ' + (btn.className || '') + ' ';
      if (/\s(on|active|sel|selected|is-active)\s/.test(cls)) return true;
      if (btn.getAttribute('aria-pressed') === 'true') return true;
    }
    return false;
  }
  function shown(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 40 && rect.height > 40 && el.offsetParent !== null;
  }
  function panel() {
    var list = document.querySelectorAll(PANEL);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id !== 'pvFrame') return list[i];
    }
    return null;
  }
  function text(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function toggle() {
    var direct = document.querySelector(TOGGLE_SEL);
    if (direct) return direct;
    var list = document.querySelectorAll('button,a,[role="button"],.btn,[class*="btn"]');
    for (var i = 0; i < list.length; i++) {
      if (TOGGLE_TEXT.test(text(list[i]))) return list[i];
    }
    return null;
  }
  function arm() {
    if (done || !inDesign()) return;
    var box = panel();
    if (box && shown(box)) { done = true; return; }
    var button = toggle();
    if (!button) return;
    done = true;
    try {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } catch (e) {
      try { button.click(); } catch (e2) {}
    }
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!target || !target.closest) return;
    /* Ручное закрытие панели уважаем: больше не открываем её сами. */
    if (target.closest('#modeDesignBtn')) {
      setTimeout(arm, 150);
      setTimeout(arm, 700);
    }
  }, true);

  var frame = null;
  function watchFrame() {
    var el = document.getElementById('pvFrame');
    if (!el || el === frame) return;
    frame = el;
    el.addEventListener('load', function () {
      done = false;
      setTimeout(arm, 350);
      setTimeout(arm, 1200);
    });
  }

  setInterval(function () { watchFrame(); arm(); }, 1000);
  watchFrame();
  setTimeout(arm, 400);
  document.addEventListener('DOMContentLoaded', function () { setTimeout(arm, 400); });
  window.addEventListener('load', function () { setTimeout(arm, 400); });
})();
