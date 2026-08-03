/* Design Lab — текст тянется вместе с блоком и ОСТАЁТСЯ таким после драга.

   Почему буквы сбрасывались. Причин было две:
     1. редактор перезаписывает атрибут style целиком (в нём остаются только
        width/height), и размер шрифта исчезал;
     2. после драга кадр перерисовывается из сохранённого current.html, а там лежал
        снимок, сделанный ДО увеличения шрифта.

   Решение: размер хранится в верхнем окне сразу двумя ключами — по метке
   data-dl-fs и по позиции элемента в дереве (путь вида "2/0/3"), так что он
   восстанавливается даже после перерисовки из старого HTML. Кроме того, по
   окончании драга снимок сайта пересобирается из живого документа, чтобы
   новый размер попал в код и в автосохранение.

   Правила аккуратности прежние: масштаб меняется только во время растяжки,
   только у блока с его собственным текстом, вложенные блоки не трогаются. */
(function () {
  'use strict';
  if (window.__dlTextScale) return;
  window.__dlTextScale = true;

  var MIN_PX = 5;
  var MAX_PX = 2000;
  var MIN_STEP = 0.02;
  var DRAG_MAX_MS = 15000;
  var DRAG_TAIL_MS = 300;
  var ATTR = 'data-dl-fs';
  var STYLE_ID = 'dl-fs-style';

  var store = window.__dlFs || (window.__dlFs = { byId: {}, byPath: {} });
  var seq = 0;

  var dragUntil = 0;
  var commitTimer = 0;
  function dragging() { return Date.now() < dragUntil; }
  function watchDrag(target) {
    if (!target || target.__dlDragWatch) return;
    target.__dlDragWatch = true;
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (name) {
      target.addEventListener(name, function () { dragUntil = Date.now() + DRAG_MAX_MS; }, true);
    });
    ['pointerup', 'mouseup', 'touchend', 'pointercancel', 'touchcancel'].forEach(function (name) {
      dragUntil = Date.now() + DRAG_TAIL_MS;
      target.addEventListener(name, function () {
        dragUntil = Date.now() + DRAG_TAIL_MS;
        clearTimeout(commitTimer);
        commitTimer = setTimeout(commit, 450);
      }, true);
    });
  }

  function num(value) { var out = parseFloat(value); return isFinite(out) ? out : 0; }
  function hasInline(el, prop) {
    var value = el.style && el.style[prop];
    return !!value && value !== 'auto' && value !== '100%';
  }
  function ownText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType === 3 && String(node.nodeValue).trim()) return true;
    }
    return false;
  }

  /* Позиция элемента в дереве — ключ, переживающий потерю атрибутов. */
  function pathOf(el) {
    var doc = el.ownerDocument;
    var parts = [];
    var node = el;
    while (node && node !== doc.body && node.parentElement) {
      var parent = node.parentElement;
      parts.push(Array.prototype.indexOf.call(parent.children, node));
      node = parent;
    }
    if (node !== doc.body) return '';
    return parts.reverse().join('/');
  }
  function byPath(doc, path) {
    if (!path || !doc.body) return null;
    var node = doc.body;
    var parts = path.split('/');
    for (var i = 0; i < parts.length; i++) {
      node = node.children[parseInt(parts[i], 10)];
      if (!node) return null;
    }
    return node;
  }

  function css() {
    var out = [];
    for (var id in store.byId) {
      if (Object.prototype.hasOwnProperty.call(store.byId, id)) {
        out.push('[' + ATTR + '="' + id + '"]{font-size:' + store.byId[id].toFixed(2) + 'px !important}');
      }
    }
    return out.join('\n');
  }
  function paintStyle(doc) {
    if (!doc || !doc.head) return;
    var tag = doc.getElementById(STYLE_ID);
    if (!tag) {
      tag = doc.createElement('style');
      tag.id = STYLE_ID;
      doc.head.appendChild(tag);
    }
    var text = css();
    if (tag.textContent !== text) tag.textContent = text;
  }
  function setFont(el, px) {
    var id = el.getAttribute(ATTR);
    if (!id) {
      id = 'f' + Date.now().toString(36) + (++seq);
      el.setAttribute(ATTR, id);
    }
    store.byId[id] = px;
    var path = pathOf(el);
    if (path) store.byPath[path] = px;
    el.style.setProperty('font-size', px.toFixed(2) + 'px', 'important');
    paintStyle(el.ownerDocument);
  }

  /* Возврат размеров: сначала по меткам, потом по позициям в дереве. */
  function restore(doc) {
    if (!doc || !doc.body) return;
    var list;
    try { list = doc.querySelectorAll('[' + ATTR + ']'); } catch (e) { list = []; }
    Array.prototype.forEach.call(list, function (el) {
      var px = store.byId[el.getAttribute(ATTR)];
      if (!px) return;
      if (Math.abs(num(el.style.fontSize) - px) > 0.5) {
        el.style.setProperty('font-size', px.toFixed(2) + 'px', 'important');
      }
    });
    for (var path in store.byPath) {
      if (!Object.prototype.hasOwnProperty.call(store.byPath, path)) continue;
      var target = byPath(doc, path);
      if (!target) continue;
      var want = store.byPath[path];
      if (Math.abs(num(target.style.fontSize) - want) > 0.5) {
        if (!target.getAttribute(ATTR)) {
          var id = 'f' + Date.now().toString(36) + (++seq);
          target.setAttribute(ATTR, id);
          store.byId[id] = want;
        }
        target.style.setProperty('font-size', want.toFixed(2) + 'px', 'important');
      }
    }
    paintStyle(doc);
  }

  /* Снимок сайта после драга: без этого редактор вернёт старые буквы. */
  function commit() {
    var frame = document.getElementById('pvFrame');
    if (!frame) return;
    var doc = null;
    try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc || !doc.documentElement) return;
    restore(doc);
    try {
      if (typeof current !== 'undefined' && current) {
        current.html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        if (typeof codeSync === 'function') codeSync();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      }
    } catch (e) {}
  }

  function baseline(el) {
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    var win = el.ownerDocument.defaultView;
    return {
      w: rect.width, h: rect.height,
      font: num(win.getComputedStyle(el).fontSize),
      lockW: hasInline(el, 'width'), lockH: hasInline(el, 'height'), last: 1
    };
  }
  function scale(el, base) {
    if (!base.font || !ownText(el)) return;
    var rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    var ratioW = base.lockW ? rect.width / base.w : 0;
    var ratioH = base.lockH ? rect.height / base.h : 0;
    var ratio = ratioW && ratioH ? Math.sqrt(ratioW * ratioH) : (ratioW || ratioH);
    if (!ratio || !isFinite(ratio) || ratio <= 0) return;
    if (Math.abs(ratio - base.last) < MIN_STEP) return;
    base.last = ratio;
    setFont(el, Math.min(MAX_PX, Math.max(MIN_PX, base.font * ratio)));
  }

  function attach(doc) {
    if (!doc || !doc.body || doc.__dlTextScale) return;
    var win = doc.defaultView;
    if (!win || typeof win.ResizeObserver !== 'function') return;
    doc.__dlTextScale = true;
    watchDrag(doc);
    paintStyle(doc);
    restore(doc);

    var bases = new WeakMap();
    var observer = new win.ResizeObserver(function (entries) {
      entries.forEach(function (entry) {
        var el = entry.target;
        var base = bases.get(el);
        if (!base || !dragging()) {
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
      doc.__dlScanTimer = setTimeout(function () { scan(); restore(doc); }, 120);
    }).observe(doc.documentElement, {
      childList: true, subtree: true, attributes: true, attributeFilter: ['style']
    });
    doc.__dlFsTimer = win.setInterval(function () { if (!dragging()) restore(doc); }, 600);
  }

  function tick() {
    var frame = document.getElementById('pvFrame');
    if (!frame) return;
    if (!frame.__dlFsLoad) {
      frame.__dlFsLoad = true;
      frame.addEventListener('load', function () {
        setTimeout(tick, 60);
        setTimeout(function () {
          var d = null;
          try { d = frame.contentDocument; } catch (e) { d = null; }
          if (d) restore(d);
        }, 250);
      });
    }
    var doc = null;
    try { doc = frame.contentDocument; } catch (e) { doc = null; }
    if (doc) { attach(doc); if (doc.__dlTextScale) restore(doc); }
  }
  watchDrag(document);
  tick();
  setInterval(tick, 500);
  document.addEventListener('DOMContentLoaded', tick);
  window.addEventListener('load', tick);
})();
