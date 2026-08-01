/* Design Lab — in Design mode the page is a canvas, not a live site.
   Buttons, links and forms inside the preview must not run their own behaviour
   while the user is arranging blocks. Preview mode keeps working as before. */
(function () {
  'use strict';
  if (window.__dlDesignInert) return;
  window.__dlDesignInert = true;

  var SAVED = 'data-dl-inert-onclick';

  function designMode() {
    try {
      if (typeof boardMode !== 'undefined' && boardMode) return String(boardMode) === 'design';
    } catch (e) {}
    if (window.boardMode) return String(window.boardMode) === 'design';
    var button = document.getElementById('modeDesignBtn');
    if (button) return /(^|\s)(on|active|sel|selected|is-active)(\s|$)/.test(button.className || '');
    return false;
  }

  function docs() {
    var out = [];
    Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
      var doc = null;
      try { doc = frame.contentDocument; } catch (e) { doc = null; }
      if (doc && doc.body) out.push(doc);
    });
    return out;
  }
  /* Inline handlers are stashed away, not lost: preview restores them. */
  function freeze(doc) {
    var list;
    try { list = doc.querySelectorAll('[onclick],[onsubmit],[ontoggle],[onchange]'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      ['onclick', 'onsubmit', 'ontoggle', 'onchange'].forEach(function (name) {
        var code = el.getAttribute(name);
        if (!code) return;
        el.setAttribute(SAVED + '-' + name, code);
        el.removeAttribute(name);
      });
    });
  }
  function thaw(doc) {
    var list;
    try { list = doc.querySelectorAll('[' + SAVED + '-onclick],[' + SAVED + '-onsubmit],[' + SAVED + '-ontoggle],[' + SAVED + '-onchange]'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      ['onclick', 'onsubmit', 'ontoggle', 'onchange'].forEach(function (name) {
        var code = el.getAttribute(SAVED + '-' + name);
        if (code === null) return;
        el.setAttribute(name, code);
        el.removeAttribute(SAVED + '-' + name);
      });
    });
  }
  /* Navigation, form submits and scripted handlers added by the template. */
  function guard(doc) {
    if (doc.__dlInertGuard) return;
    doc.__dlInertGuard = true;
    ['click', 'submit', 'auxclick'].forEach(function (name) {
      doc.addEventListener(name, function (event) {
        if (!designMode()) return;
        var el = event.target;
        /* Direct text editing must keep working. */
        if (el && el.closest && el.closest('[contenteditable="true"]')) return;
        event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        else event.stopPropagation();
      }, true);
    });
  }
  function tick() {
    var design = designMode();
    docs().forEach(function (doc) {
      guard(doc);
      if (design) freeze(doc);
      else thaw(doc);
    });
  }
  tick();
  setInterval(tick, 400);
  document.addEventListener('DOMContentLoaded', tick);
  window.addEventListener('load', tick);
})();
