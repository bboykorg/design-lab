/* Design Lab — text scales together with the block that is being dragged.
   Rules that keep neighbours untouched:
     1. scaling happens only while a resize drag is in progress;
     2. only the dragged element and its inline text parts change;
        nested blocks (sections, cards, buttons, paragraphs) are never touched. */
(function () {
  'use strict';
  if (window.__dlTextScale) return;
  window.__dlTextScale = true;

  var MIN_PX = 5;
  var MAX_PX = 400;
  var MIN_STEP = 0.015;
  var DRAG_TAIL_MS = 400;
  /* Inline pieces of the same text — not neighbouring blocks. */
  var INLINE = { SPAN: 1, A: 1, B: 1, I: 1, EM: 1, STRONG: 1, SMALL: 1, U: 1, S: 1, MARK: 1, CODE: 1, SUB: 1, SUP: 1, LABEL: 1, TIME: 1 };

  var dragUntil = 0;
  function dragging() { return Date.now() < dragUntil; }
  function watchDrag(target) {
    if (!target || target.__dlDragWatch) return;
    target.__dlDragWatch = true;
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (name) {
      target.addEventListener(name, function () { dragUntil = Date.now() + 60000; }, true);
    });
    ['pointerup', 'mouseup', 'touchend', 'pointercancel', 'touchcancel'].forEach(function (name) {
      target.addEventListener(name, function () { dragUntil = Date.now() + DRAG_TAIL_MS; }, true);
    });
  }

  function num(value) { var out = parseFloat(value); return isFinite(out) ? out : 0; }
  function hasInline(el, prop) {
    var value = el.style && el.style[prop];
    return !!value && value !== 'auto' && value !== '100%';
  }
  function parts(el) {
    var win = el.ownerDocument.defaultView;
    var items = [];
    function record(node) {
      var size = num(win.getComputedStyle(node).fontSize);
      if (size) items.push({ node: node, size: size });
    }
    record(el);
    Array.prototype.forEach.call(el.querySelectorAll('*'), function (child) {
      if (INLINE[child.tagName]) record(child);
    });
    return items;
  }
  function baseline(el) {
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      w: rect.width, h: rect.height, items: parts(el),
      lockW: hasInline(el, 'width'), lockH: hasInline(el, 'height'), last: 1
    };
  }
  function scale(el, base) {
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    /* Only pinned dimensions drive the ratio: a pinned box cannot grow because
       of the new font size, so there is no feedback loop. */
    var ratioW = base.lockW ? rect.width / base.w : 0;
    var ratioH = base.lockH ? rect.height / base.h : 0;
    var ratio = ratioW && ratioH ? Math.sqrt(ratioW * ratioH) : (ratioW || ratioH);
    if (!ratio || !isFinite(ratio) || ratio <= 0) return;
    if (Math.abs(ratio - base.last) < MIN_STEP) return;
    base.last = ratio;
    base.items.forEach(function (item) {
      var size = Math.min(MAX_PX, Math.max(MIN_PX, item.size * ratio));
      item.node.style.fontSize = size.toFixed(2) + 'px';
    });
  }
  function attach(doc) {
    if (!doc || !doc.body || doc.__dlTextScale) return;
    var win = doc.defaultView;
    if (!win || typeof win.ResizeObserver !== 'function') return;
    doc.__dlTextScale = true;
    watchDrag(doc);

    var bases = new WeakMap();
    var observer = new win.ResizeObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        var base = bases.get(el);
        if (!base) {
          base = baseline(el);
          if (base) bases.set(el, base);
          return;
        }
        /* Layout reflow, window resize and AI re-render must not touch fonts. */
        if (!dragging()) {
          var fresh = baseline(el);
          if (fresh) bases.set(el, fresh);
          return;
        }
        base.lockW = hasInline(el, 'width');
        base.lockH = hasInline(el, 'height');
        if (!base.lockW && !base.lockH) return;
        scale(el, base);
      });
    });

    function watch(el) {
      if (el.__dlWatched) return;
      el.__dlWatched = true;
      var base = baseline(el);
      if (base) bases.set(el, base);
      observer.observe(el);
    }
    function scan() {
      var list;
      try { list = doc.querySelectorAll('[style*="width"],[style*="height"]'); } catch (e) { return; }
      Array.prototype.forEach.call(list, function (el) {
        if (hasInline(el, 'width') || hasInline(el, 'height')) watch(el);
      });
    }
    scan();
    new win.MutationObserver(function () {
      clearTimeout(doc.__dlScanTimer);
      doc.__dlScanTimer = setTimeout(scan, 120);
    }).observe(doc.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['style']
    });
  }
  function tick() {
    Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
      var doc = null;
      try { doc = frame.contentDocument; } catch (e) { doc = null; }
      if (doc) attach(doc);
    });
  }
  watchDrag(document);
  tick();
  setInterval(tick, 500);
  document.addEventListener('DOMContentLoaded', tick);
  window.addEventListener('load', tick);
})();
