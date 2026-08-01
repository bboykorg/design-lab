/* Design Lab — in Design mode the editor preview is a canvas, not a live site.
   Applies to the editor frame only (#pvFrame). Template cards, recent projects
   and every other preview on the site stay fully clickable.
   If the current mode cannot be determined, nothing is blocked. */
(function () {
  'use strict';
  if (window.__dlDesignInert) return;
  window.__dlDesignInert = true;

  var SAVED = 'data-dl-inert';
  var ATTRS = ['onclick', 'onsubmit', 'ontoggle', 'onchange'];

  function classesOf(id) {
    var el = document.getElementById(id);
    if (!el) return null;
    return String(el.className || '').split(/\s+/).filter(Boolean);
  }
  /* Markup-agnostic: the active mode button is the one carrying a class the
     other mode buttons do not have. */
  function activeByClass() {
    var design = classesOf('modeDesignBtn');
    var preview = classesOf('modePreviewBtn');
    var code = classesOf('modeCodeBtn');
    if (!design || (!preview && !code)) return null;
    var others = (preview || []).concat(code || []);
    var extra = design.filter(function (name) { return others.indexOf(name) < 0; });
    if (!extra.length) return false;
    var back = others.filter(function (name) { return design.indexOf(name) < 0; });
    /* Both sides differ in the same way — cannot tell which one is active. */
    return back.length && extra.length === back.length ? null : true;
  }
  function designMode() {
    try {
      if (typeof boardMode !== 'undefined' && boardMode) return String(boardMode) === 'design';
    } catch (e) {}
    if (window.boardMode) return String(window.boardMode) === 'design';
    try {
      if (window.current && window.current.sfMode) return String(window.current.sfMode) === 'design';
    } catch (e) {}
    var button = document.getElementById('modeDesignBtn');
    if (button) {
      var pressed = button.getAttribute('aria-pressed') || button.getAttribute('data-active');
      if (pressed === 'true' || pressed === '1') return true;
      if (pressed === 'false' || pressed === '0') return false;
    }
    var byClass = activeByClass();
    return byClass === null ? false : byClass;
  }

  function editorDoc() {
    var frame = document.getElementById('pvFrame');
    if (!frame) return null;
    try { return frame.contentDocument && frame.contentDocument.body ? frame.contentDocument : null; }
    catch (e) { return null; }
  }
  /* Inline handlers are stashed away, not lost: preview restores them. */
  function freeze(doc) {
    var list;
    try { list = doc.querySelectorAll('[' + ATTRS.join('],[') + ']'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      ATTRS.forEach(function (name) {
        var code = el.getAttribute(name);
        if (code === null) return;
        el.setAttribute(SAVED + '-' + name, code);
        el.removeAttribute(name);
      });
    });
  }
  function thaw(doc) {
    var list;
    try { list = doc.querySelectorAll('[' + SAVED + '-' + ATTRS.join('],[' + SAVED + '-') + ']'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      ATTRS.forEach(function (name) {
        var code = el.getAttribute(SAVED + '-' + name);
        if (code === null) return;
        el.setAttribute(name, code);
        el.removeAttribute(SAVED + '-' + name);
      });
    });
  }
  /* Navigation, form submits and handlers the template attached by script. */
  function guard(doc) {
    if (doc.__dlInertGuard) return;
    doc.__dlInertGuard = true;
    ['click', 'submit', 'auxclick'].forEach(function (name) {
      doc.addEventListener(name, function (event) {
        if (!designMode()) return;
        var el = event.target;
        if (el && el.closest && el.closest('[contenteditable="true"]')) return;
        event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        else event.stopPropagation();
      }, true);
    });
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
