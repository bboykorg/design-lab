/* Design Lab — reliable direct text editing in Design mode. */
(function () {
  'use strict';
  if (window.__dlDesignEditFix) return;
  window.__dlDesignEditFix = true;
  var frame = null, doc = null, saveTimer = 0;

  function inDesign() {
    try { return typeof boardMode !== 'undefined' && boardMode === 'design'; } catch (e) { return false; }
  }
  function editableTarget(node) {
    if (!node || node.nodeType !== 1) return null;
    var el = node.closest('h1,h2,h3,h4,h5,h6,p,span,a,button,label,li,blockquote,figcaption,td,th');
    if (!el || el.closest('script,style,svg,canvas')) return null;
    return el;
  }
  function sync() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        if (!doc || !doc.documentElement || typeof current === 'undefined' || !current) return;
        current.html = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        if (typeof codeSync === 'function') codeSync();
        if (typeof scheduleAutosave === 'function') scheduleAutosave();
      } catch (e) {}
    }, 250);
  }
  function placeCaret(el) {
    try {
      var range = doc.createRange(), sel = doc.getSelection();
      range.selectNodeContents(el); range.collapse(false);
      sel.removeAllRanges(); sel.addRange(range);
    } catch (e) {}
  }
  function bind() {
    frame = document.getElementById('pvFrame');
    if (!frame) return;
    try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc || doc.__dlDirectTextBound) return;
    doc.__dlDirectTextBound = true;
    doc.addEventListener('dblclick', function (event) {
      if (!inDesign()) return;
      var el = editableTarget(event.target); if (!el) return;
      event.preventDefault(); event.stopPropagation();
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('data-dl-direct-edit', '1');
      el.style.cursor = 'text';
      el.focus(); placeCaret(el);
    }, true);
    doc.addEventListener('keydown', function (event) {
      if (!inDesign()) return;
      var el = editableTarget(event.target); if (!el) return;
      if (!el.isContentEditable) {
        el.setAttribute('contenteditable', 'true');
        el.setAttribute('data-dl-direct-edit', '1');
      }
      if (event.key === 'Escape') { el.blur(); event.preventDefault(); }
    }, true);
    doc.addEventListener('input', sync, true);
    doc.addEventListener('blur', sync, true);
  }
  function arm() {
    setTimeout(bind, 30); setTimeout(bind, 180); setTimeout(bind, 600);
    var f = document.getElementById('pvFrame');
    if (f && !f.__dlDirectLoad) { f.__dlDirectLoad = true; f.addEventListener('load', function () { setTimeout(bind, 50); }); }
  }
  document.addEventListener('click', function (event) {
    if (event.target && event.target.id === 'modeDesignBtn') arm();
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      var modal = document.getElementById('modal');
      if (modal && modal.classList.contains('on') && typeof closeModal === 'function') closeModal();
    }
  });
  /* A backdrop without visible modal content must never block the whole app. */
  document.addEventListener('click', function (event) {
    var modal = document.getElementById('modal');
    if (modal && event.target === modal && typeof closeModal === 'function') closeModal();
  });
  arm();
})();
