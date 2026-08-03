/* Design Lab — редактирование блоков включается сразу при входе в режим дизайна.

   Движок редактора (подсветка при наведении, рамки, перетаскивание) запускается
   в момент первого открытия панели с блоками, поэтому до этого сайт выглядел
   мёртвым. Здесь панель открывается автоматически один раз — тот же самый клик,
   который раньше делал пользователь. Если после её закрытия редактирование
   остаётся живым, панель снова прячется, чтобы не занимать место; если движок
   завязан на видимость панели — она остаётся открытой.

   Ничего не блокируется и не затемняется: скрипт только жмёт на штатную кнопку. */
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
  var MARKS = '[data-dl-editable],[data-sf-id],[data-sf],[contenteditable="true"],[class*="sf-sel"],[class*="sf-hover"]';

  var armed = false;
  var busy = false;

  function inDesign() {
    try { if (typeof boardMode !== 'undefined' && boardMode === 'design') return true; } catch (e) {}
    var btn = document.getElementById('modeDesignBtn');
    if (btn) {
      var cls = ' ' + (btn.className || '') + ' ';
      if (/\s(on|active|sel|selected|is-active)\s/.test(cls)) return true;
      if (btn.getAttribute('aria-pressed') === 'true') return true;
    }
    return false;
  }
  function visible(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 40 && rect.height > 40 && el.offsetParent !== null;
  }
  function panel() {
    var list = document.querySelectorAll(PANEL);
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === 'pvFrame') continue;
      return list[i];
    }
    return null;
  }
  function text(el) { return (el.textContent || '').replace(/\s+/g, ' ').trim(); }
  function toggle() {
    var direct = document.querySelector(TOGGLE_SEL);
    if (direct) return direct;
    var list = document.querySelectorAll('button,a,[role="button"],.btn,[class*="btn"]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (!visible(el) && el.offsetParent === null) continue;
      if (TOGGLE_TEXT.test(text(el))) return el;
    }
    return null;
  }
  function frameDoc() {
    var frame = document.getElementById('pvFrame');
    if (!frame) return null;
    try { return frame.contentDocument; } catch (e) { return null; }
  }
  /* Живой ли редактор: если движок запущен, он размечает блоки своими атрибутами. */
  function marks() {
    var doc = frameDoc();
    if (!doc || !doc.body) return 0;
    try { return doc.body.querySelectorAll(MARKS).length; } catch (e) { return 0; }
  }

  function click(el) {
    if (!el) return;
    try {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    } catch (e) {
      try { el.click(); } catch (e2) {}
    }
  }

  function arm() {
    if (busy || armed) return;
    var box = panel();
    if (box && visible(box)) { armed = true; return; }
    var button = toggle();
    if (!button) return;
    busy = true;
    click(button);
    setTimeout(function () {
      var opened = panel();
      if (!opened || !visible(opened)) { busy = false; return; }
      var before = marks();
      /* Прячем панель обратно и проверяем, осталось ли редактирование живым. */
      click(button);
      setTimeout(function () {
        var after = marks();
        if (before > 0 && after === 0) click(button);
        armed = true;
        busy = false;
      }, 220);
    }, 260);
  }

  function tick() {
    if (inDesign()) arm();
    else armed = false;
  }

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (target && (target.id === 'modeDesignBtn' || (target.closest && target.closest('#modeDesignBtn')))) {
      armed = false;
      setTimeout(tick, 120);
      setTimeout(tick, 600);
    }
  }, true);

  var frame = null;
  function watchFrame() {
    var el = document.getElementById('pvFrame');
    if (!el || el === frame) return;
    frame = el;
    el.addEventListener('load', function () { armed = false; setTimeout(tick, 300); });
  }

  setInterval(function () { watchFrame(); tick(); }, 500);
  watchFrame();
  tick();
  document.addEventListener('DOMContentLoaded', tick);
  window.addEventListener('load', tick);
})();
