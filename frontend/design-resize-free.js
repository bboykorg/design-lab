/* Design Lab — блок растягивается до края экрана.

   Растяжка раньше упиралась в невидимый потолок: у самого блока или у его
   родителей в сгенерированном сайте прописаны max-width контейнера
   (типично 1100—1280px), flex-shrink или колонка сетки. Ширина в inline-стиле
   росла, а картинка оставалась прежней.

   Здесь во время перетаскивания рамки снимаются только ограничения ширины
   и высоты — у самого блока и только у тех родителей, которые реально
   его зажимают. Цвета, отступы и порядок блоков не трогаются, соседние
   блоки свой размер сохраняют. */
(function () {
  'use strict';
  if (window.__dlResizeFree) return;
  window.__dlResizeFree = true;

  var FREED = 'data-dl-free';
  var DRAG_MAX_MS = 15000;
  var DRAG_TAIL_MS = 400;
  var MAX_UP = 8;

  var dragUntil = 0;
  function dragging() { return Date.now() < dragUntil; }
  function watchDrag(target) {
    if (!target || target.__dlFreeWatch) return;
    target.__dlFreeWatch = true;
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (name) {
      target.addEventListener(name, function () { dragUntil = Date.now() + DRAG_MAX_MS; }, true);
    });
    ['pointerup', 'mouseup', 'touchend', 'pointercancel', 'touchcancel'].forEach(function (name) {
      target.addEventListener(name, function () { dragUntil = Date.now() + DRAG_TAIL_MS; }, true);
    });
  }

  function num(value) { var out = parseFloat(value); return isFinite(out) ? out : 0; }
  function sized(el) {
    var css = el.style;
    if (!css) return false;
    var w = css.width, h = css.height;
    return (!!w && w !== 'auto') || (!!h && h !== 'auto');
  }

  /* С самого блока снимаем потолок и запрещаем сжимать его в строке flex. */
  function freeSelf(el) {
    if (el.getAttribute(FREED) === 'self') return;
    el.setAttribute(FREED, 'self');
    var css = el.style;
    css.setProperty('max-width', 'none', 'important');
    css.setProperty('min-width', '0', 'important');
    css.setProperty('max-height', 'none', 'important');
    css.setProperty('flex-shrink', '0', 'important');
    css.setProperty('flex-grow', '0', 'important');
    css.setProperty('flex-basis', 'auto', 'important');
    css.setProperty('box-sizing', 'border-box', 'important');
  }

  /* Родителя освобождаем только если блок уже шире его внутренней области. */
  function freeParents(el, want) {
    var doc = el.ownerDocument;
    var win = doc.defaultView;
    var up = el.parentElement;
    for (var i = 0; i < MAX_UP && up && up !== doc.documentElement; i++) {
      var cs = win.getComputedStyle(up);
      var inner = up.clientWidth - num(cs.paddingLeft) - num(cs.paddingRight);
      if (inner >= want - 1) break;
      if (up.getAttribute(FREED) !== 'up') {
        up.setAttribute(FREED, 'up');
        up.style.setProperty('max-width', 'none', 'important');
        up.style.setProperty('width', '100%', 'important');
        if (cs.overflowX === 'hidden') up.style.setProperty('overflow-x', 'visible', 'important');
        if (cs.display === 'grid') up.style.setProperty('grid-template-columns', 'none', 'important');
      }
      up = up.parentElement;
    }
    if (doc.body && doc.body.getAttribute(FREED) !== 'up') {
      doc.body.setAttribute(FREED, 'up');
      doc.body.style.setProperty('max-width', 'none', 'important');
    }
  }

  function handle(el) {
    if (!el || el.nodeType !== 1 || !sized(el)) return;
    var want = num(el.style.width);
    freeSelf(el);
    if (want > 0) freeParents(el, want);
  }

  function attach(doc) {
    if (!doc || !doc.body || doc.__dlResizeFree) return;
    var win = doc.defaultView;
    if (!win || typeof win.MutationObserver !== 'function') return;
    doc.__dlResizeFree = true;
    watchDrag(doc);

    new win.MutationObserver(function (records) {
      if (!dragging()) return;
      for (var i = 0; i < records.length; i++) {
        handle(records[i].target);
      }
    }).observe(doc.documentElement, {
      subtree: true, attributes: true, attributeFilter: ['style']
    });
  }

  function tick() {
    var frame = document.getElementById('pvFrame');
    if (!frame) return;
    var doc = null;
    try { doc = frame.contentDocument; } catch (e) { doc = null; }
    if (doc) attach(doc);
  }
  watchDrag(document);
  tick();
  setInterval(tick, 500);
  document.addEventListener('DOMContentLoaded', tick);
  window.addEventListener('load', tick);
})();
