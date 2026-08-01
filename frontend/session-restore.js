/* Design Lab — keep the edited site through a page reload.
   The HTML is read straight out of the preview frame and written back into it,
   so nothing depends on the editor's internal variables. The blank starter
   canvas is never saved, and an already opened project is never overwritten. */
(function () {
  'use strict';
  if (window.__dlSessionRestore) return;
  window.__dlSessionRestore = true;

  var KEY = 'dl_session_v2';
  var MAX_CHARS = 2000000;
  var MIN_CHARS = 400;
  var SAVE_MS = 2500;
  var FIRST_MS = 1500;
  var WATCH_MS = 900;
  var WATCH_TRIES = 20;
  var INERT = 'data-dl-inert-';
  var BLANK = ['чистый холст', 'опиши сайт в чате', 'начнём с чистого листа'];

  var lastSaved = null;
  var restored = false;

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function frame() { return document.getElementById('pvFrame'); }
  function frameDoc() {
    var el = frame();
    if (!el) return null;
    try {
      var doc = el.contentDocument;
      return doc && doc.body ? doc : null;
    } catch (e) { return null; }
  }
  function isBlank(doc) {
    var text = String(doc.body.innerText || doc.body.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.length < 40) return true;
    return BLANK.some(function (mark) { return text.indexOf(mark) >= 0; });
  }
  /* Design mode stashes handlers and links away; the saved copy keeps them. */
  function clean(doc) {
    var clone = doc.documentElement.cloneNode(true);
    var list;
    try { list = clone.querySelectorAll('*'); } catch (e) { return clone; }
    Array.prototype.forEach.call(list, function (el) {
      var names = [];
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (attr.name.indexOf(INERT) === 0) names.push(attr.name);
      }
      names.forEach(function (name) {
        var value = el.getAttribute(name);
        el.removeAttribute(name);
        el.setAttribute(name.slice(INERT.length), value);
      });
      if (el.hasAttribute('data-dl-editable')) el.removeAttribute('data-dl-editable');
      if (el.getAttribute('contenteditable') === 'true') el.removeAttribute('contenteditable');
    });
    return clone;
  }
  function grab() {
    var doc = frameDoc();
    if (!doc || isBlank(doc)) return null;
    var html;
    try { html = '<!DOCTYPE html>' + clean(doc).outerHTML; } catch (e) { return null; }
    if (html.length < MIN_CHARS || html.length > MAX_CHARS) return null;
    return html;
  }

  function save() {
    var html = grab();
    if (!html || html === lastSaved) return;
    if (write({ html: html, at: Date.now() })) lastSaved = html;
  }
  function tellApp(html) {
    try {
      if (window.current && typeof window.current === 'object') {
        window.current.html = html;
        if (typeof window.current.scratch === 'boolean') window.current.scratch = true;
      }
    } catch (e) {}
    var area = document.getElementById('codeTa');
    if (area && !area.value) area.value = html;
  }
  function put(html) {
    var el = frame();
    if (!el) return false;
    var done = ['renderHtml', 'renderHtmlLive'].some(function (name) {
      if (typeof window[name] !== 'function') return false;
      try { window[name](html); return true; } catch (e) { return false; }
    });
    if (!done) {
      try { el.removeAttribute('src'); el.srcdoc = html; done = true; } catch (e) { return false; }
    }
    tellApp(html);
    return done;
  }
  function tryRestore(saved) {
    var doc = frameDoc();
    if (!doc) return false;
    /* A template or saved project is already open: leave it alone. */
    if (!isBlank(doc)) { restored = true; return true; }
    if (!put(saved.html)) return false;
    lastSaved = saved.html;
    restored = true;
    if (typeof window.toast === 'function') {
      try { window.toast('Восстановлен последний сайт'); } catch (e) {}
    }
    return true;
  }

  function start() {
    var saved = read();
    if (saved && saved.html) {
      setTimeout(function () {
        if (tryRestore(saved)) return;
        /* The editor may still be booting or the frame may reload once. */
        var tries = 0;
        var wait = setInterval(function () {
          tries++;
          if (restored || tries > WATCH_TRIES) { clearInterval(wait); return; }
          tryRestore(saved);
        }, WATCH_MS);
      }, FIRST_MS);
    } else {
      restored = true;
    }
    setInterval(save, SAVE_MS);
    window.addEventListener('beforeunload', save);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') save();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
