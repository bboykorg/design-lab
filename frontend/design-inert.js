/* Design Lab — in Design mode the editor preview is a canvas, not a live site.
   Applies to the editor frame only (#pvFrame): template cards, recent projects
   and every other preview stay fully clickable.

   Почему раньше приходилось тыкать по краю блока по многу раз: защита гасила
   событие click целиком (stopImmediatePropagation), и вместе с кнопками сайта
   гаслся собственный клик редактора, которым выбирается блок. Теперь клик
   только теряет действие по умолчанию (переходы и отправка форм), а до выбора
   блока доходит с первого раза. Ссылки и inline-обработчики сайта всё равно
   обезврежены: атрибуты href/onclick снимаются и возвращаются в превью.

   Mode detection does not depend on class names. The three mode switches are
   found by their labels and the highlighted one is detected by comparing their
   background colors, which is exactly what the user sees. */
(function () {
  'use strict';
  if (window.__dlDesignInert) return;
  window.__dlDesignInert = true;

  var SAVED = 'data-dl-inert';
  var ATTRS = ['onclick', 'onsubmit', 'ontoggle', 'onchange', 'href', 'target'];
  var LABELS = {
    design: ['дизайн', 'design'],
    preview: ['превью', 'предпросмотр', 'preview'],
    code: ['код', 'code']
  };

  function norm(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase(); }
  function switches() {
    var found = { design: null, preview: null, code: null };
    var list;
    try { list = document.querySelectorAll('button,a,[role="button"],.seg,.tab,.mode,div,span'); } catch (e) { return found; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.childElementCount > 1) return;
      var text = norm(el.textContent);
      if (!text || text.length > 14) return;
      Object.keys(LABELS).forEach(function (mode) {
        if (found[mode]) return;
        if (LABELS[mode].indexOf(text) >= 0) found[mode] = el;
      });
    });
    return found;
  }
  function paint(el) {
    if (!el) return '';
    var css = getComputedStyle(el);
    return css.backgroundColor + '|' + css.color + '|' + css.borderColor;
  }
  /* The highlighted switch looks different from the other two. */
  function activeMode() {
    var found = switches();
    if (!found.design || (!found.preview && !found.code)) return null;
    var design = paint(found.design);
    var preview = found.preview ? paint(found.preview) : null;
    var code = found.code ? paint(found.code) : null;
    if (preview && code) {
      if (preview !== code) return null;
      return design !== preview;
    }
    var other = preview || code;
    return design !== other;
  }
  function known(value) {
    value = norm(value);
    return value === 'design' || value === 'preview' || value === 'code';
  }
  function designMode() {
    var byPaint = activeMode();
    if (byPaint !== null) return byPaint;
    try {
      if (typeof boardMode !== 'undefined' && known(boardMode)) return norm(boardMode) === 'design';
    } catch (e) {}
    if (known(window.boardMode)) return norm(window.boardMode) === 'design';
    try {
      if (window.current && known(window.current.sfMode)) return norm(window.current.sfMode) === 'design';
    } catch (e) {}
    return false;
  }

  function frame() { return document.getElementById('pvFrame'); }
  function editorDoc() {
    var el = frame();
    if (!el) return null;
    try { return el.contentDocument && el.contentDocument.body ? el.contentDocument : null; }
    catch (e) { return null; }
  }
  /* Attributes are stashed away, not lost: preview restores them. */
  function freeze(doc) {
    var list;
    try { list = doc.querySelectorAll('[' + ATTRS.join('],[') + ']'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      ATTRS.forEach(function (name) {
        var value = el.getAttribute(name);
        if (value === null) return;
        el.setAttribute(SAVED + '-' + name, value);
        el.removeAttribute(name);
      });
    });
  }
  function thaw(doc) {
    var list;
    try { list = doc.querySelectorAll('[' + SAVED + '-' + ATTRS.join('],[' + SAVED + '-') + ']'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      ATTRS.forEach(function (name) {
        var value = el.getAttribute(SAVED + '-' + name);
        if (value === null) return;
        el.setAttribute(name, value);
        el.removeAttribute(SAVED + '-' + name);
      });
    });
  }
  /* Клик теряет действие, но продолжает всплывать — редактор видит выбор блока. */
  function soften(event) {
    if (!designMode()) return;
    var el = event.target;
    if (el && el.closest && el.closest('[contenteditable="true"]')) return;
    event.preventDefault();
  }
  /* Отправка формы в режиме дизайна гасится полностью: она уводит со страницы. */
  function hard(event) {
    if (!designMode()) return;
    event.preventDefault();
    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    else event.stopPropagation();
  }
  /* Window capture runs before any handler the template registered. */
  function guard(doc) {
    if (doc.__dlInertGuard2) return;
    doc.__dlInertGuard2 = true;
    var win = doc.defaultView;
    ['click', 'auxclick'].forEach(function (name) {
      if (win) win.addEventListener(name, soften, true);
      doc.addEventListener(name, soften, true);
    });
    if (win) win.addEventListener('submit', hard, true);
    doc.addEventListener('submit', hard, true);
    /* Hash routers navigate without a click event of their own. */
    if (win) {
      win.addEventListener('hashchange', function (event) {
        if (!designMode()) return;
        event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      }, true);
    }
  }
  function tick() {
    var doc = editorDoc();
    if (!doc) return;
    guard(doc);
    if (designMode()) freeze(doc);
    else thaw(doc);
  }
  tick();
  setInterval(tick, 400);
  document.addEventListener('DOMContentLoaded', tick);
  window.addEventListener('load', tick);
})();
