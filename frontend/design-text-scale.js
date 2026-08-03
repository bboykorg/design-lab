/* Design Lab — текст тянется вместе с блоком, который растягивают, и ОСТАЁТСЯ
   таким после отпускания мыши.

   Почему раньше буквы сбрасывались: размер шрифта писался только в inline-стиль
   элемента, а редактор при перетаскивании и в конце драга перезаписывает
   атрибут style целиком (там остаются только width/height), а при перерисовке
   из сохранённого HTML шрифт терялся совсем. Теперь каждый увеличенный
   элемент помечается data-dl-fs, размер хранится отдельно и дублируется
   таблицей стилей внутри кадра, а inline-значение восстанавливается, если его
   затёрли.

   Строгие правила, чтобы ничего лишнего не ехало:
     1. масштаб меняется только во время растяжки;
     2. только у самого блока и только если у него есть собственный текст;
     3. вложенные блоки, кнопки и ссылки никогда не масштабируются — контейнер
        без своего текста просто меняет рамку. */
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

  /* Живёт в верхнем окне, поэтому переживает полную перерисовку кадра. */
  var wanted = window.__dlFsWanted || (window.__dlFsWanted = {});
  var seq = 0;

  var dragUntil = 0;
  function dragging() { return Date.now() < dragUntil; }
  function watchDrag(target) {
    if (!target || target.__dlDragWatch) return;
    target.__dlDragWatch = true;
    ['pointerdown', 'mousedown', 'touchstart'].forEach(function (name) {
      target.addEventListener(name, function () { dragUntil = Date.now() + DRAG_MAX_MS; }, true);
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
  /* Только собственный текст. Обёртка вокруг других блоков его не имеет. */
  function ownText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var node = el.childNodes[i];
      if (node.nodeType === 3 && String(node.nodeValue).trim()) return true;
    }
    return false;
  }

  /* Таблица стилей внутри кадра: она переживает затирание style у элемента. */
  function css() {
    var out = [];
    for (var id in wanted) {
      if (Object.prototype.hasOwnProperty.call(wanted, id)) {
        out.push('[' + ATTR + '="' + id + '"]{font-size:' + wanted[id].toFixed(2) + 'px !important}');
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
    wanted[id] = px;
    el.style.fontSize = px.toFixed(2) + 'px';
    paintStyle(el.ownerDocument);
  }
  /* Возвращаем размер, если редактор перезаписал атрибут style. */
  function restore(doc) {
    var list;
    try { list = doc.querySelectorAll('[' + ATTR + ']'); } catch (e) { return; }
    var any = false;
    Array.prototype.forEach.call(list, function (el) {
      var px = wanted[el.getAttribute(ATTR)];
      if (!px) return;
      var now = num(el.style.fontSize);
      if (Math.abs(now - px) > 0.5) { el.style.fontSize = px.toFixed(2) + 'px'; any = true; }
    });
    if (any || !doc.getElementById(STYLE_ID)) paintStyle(doc);
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
    /* Отношение считаем только по закреплённым сторонам: закреплённая
       коробка не может вырасти из-за нового шрифта, петли не будет. */
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
          /* Перетекание вёрстки, ресайз окна и ответ ИИ шрифты не трогают.
             База берётся от текущего размера — уже увеличенного, если его
             тянули раньше, так что отката назад не происходит. */
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
    /* Страховка от перезаписей, которые проходят мимо наблюдателя. */
    doc.__dlFsTimer = win.setInterval(function () { restore(doc); }, 600);
  }

  function tick() {
    var frame = document.getElementById('pvFrame');
    if (!frame) return;
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
