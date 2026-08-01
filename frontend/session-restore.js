/* Design Lab — keep the edited site through a page reload.
   The current HTML is mirrored into local storage and put back only when the
   editor opens empty, so templates, saved projects and a deliberate "new site"
   are never overwritten. */
(function () {
  'use strict';
  if (window.__dlSessionRestore) return;
  window.__dlSessionRestore = true;

  var KEY = 'dl_session_v1';
  var MAX_BYTES = 3000000;
  var SAVE_MS = 1500;
  var WAIT_MS = 1400;

  var canSave = false;
  var lastSaved = null;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) {}
  }
  function htmlNow() {
    try {
      if (window.current && typeof window.current.html === 'string') return window.current.html;
    } catch (e) {}
    var area = document.getElementById('codeTa');
    return area && typeof area.value === 'string' ? area.value : '';
  }
  function frame() { return document.getElementById('pvFrame'); }
  function editorVisible() {
    var el = frame();
    if (!el) return false;
    if (!el.offsetParent && el.style.display === 'none') return false;
    var rect = el.getBoundingClientRect();
    return rect.width > 100 && rect.height > 100;
  }

  function save() {
    if (!canSave) return;
    var html = htmlNow();
    if (html === lastSaved) return;
    if (html && html.length > MAX_BYTES) return;
    lastSaved = html;
    var id = null;
    try { id = window.current ? window.current.id : null; } catch (e) {}
    write({ html: html, id: id, at: Date.now() });
  }
  function render(html) {
    try {
      if (window.current) {
        window.current.html = html;
        if (typeof window.current.scratch === 'boolean') window.current.scratch = true;
      }
    } catch (e) {}
    var area = document.getElementById('codeTa');
    if (area) area.value = html;
    var done = ['renderHtml', 'renderHtmlLive'].some(function (name) {
      if (typeof window[name] !== 'function') return false;
      try { window[name](html); return true; } catch (e) { return false; }
    });
    if (!done) {
      var el = frame();
      if (!el) return false;
      try { el.srcdoc = html; done = true; } catch (e) { done = false; }
    }
    return done;
  }
  function restore() {
    var saved = read();
    if (!saved || !saved.html) { canSave = true; return; }
    /* Something is already open: keep it and start mirroring that instead. */
    if (htmlNow()) { canSave = true; return; }
    if (!editorVisible()) return;
    if (render(saved.html)) {
      lastSaved = saved.html;
      if (typeof window.toast === 'function') {
        try { window.toast('Восстановлен последний сайт'); } catch (e) {}
      }
    }
    canSave = true;
  }

  function start() {
    setTimeout(restore, WAIT_MS);
    /* The editor may open later, after a template or project is picked. */
    var tries = 0;
    var wait = setInterval(function () {
      tries++;
      if (canSave || tries > 40) { clearInterval(wait); return; }
      restore();
    }, 600);
    setInterval(save, SAVE_MS);
    window.addEventListener('beforeunload', save);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') save();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
