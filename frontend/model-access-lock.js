/* Design Lab — model availability for guests and Free users.
   Scope: only the model picker. Everything stays clickable; unavailable models just look gray. */
(function () {
  'use strict';
  if (window.__dlModelAccessLock) return;
  window.__dlModelAccessLock = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var LOCK_ATTR = 'data-dl-model-locked';
  var PILL_ATTR = 'data-dl-model-pill-locked';
  var state = { ready: false, signedIn: false, plan: 'guest' };
  window.dlModelLock = state;

  function style() {
    if (document.getElementById('dl-model-lock-css')) return;
    var css = document.createElement('style');
    css.id = 'dl-model-lock-css';
    css.textContent =
      '[' + LOCK_ATTR + '="1"]{filter:grayscale(1) !important;opacity:.42 !important;cursor:not-allowed !important;}' +
      '[' + LOCK_ATTR + '="1"]:hover{background:transparent !important;}' +
      /* The pill stays fully clickable: only its colors are muted. */
      '[' + PILL_ATTR + '="1"]{filter:grayscale(1) !important;opacity:.55 !important;}' +
      '.dl-plan-badge{margin-left:auto;font-size:10px;letter-spacing:.04em;padding:1px 6px;border-radius:999px;' +
      'border:1px solid rgba(255,255,255,.18);opacity:.75;text-transform:uppercase;}';
    (document.head || document.documentElement).appendChild(css);
  }

  function map() { try { return typeof MODELS !== 'undefined' ? MODELS : null; } catch (e) { return null; } }
  function token() {
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        var value = localStorage.getItem(TOKEN_KEYS[i]);
        if (value && value.length > 10) return value;
      }
    } catch (e) {}
    return '';
  }
  function isFree(model) {
    return typeof window.dlIsFreeModel === 'function' ? window.dlIsFreeModel(model) : false;
  }
  function isAllowed(key) {
    var models = map(), model = models && models[key];
    if (!state.signedIn) return false;
    if (state.plan !== 'free') return true;
    return isFree(model);
  }
  function message() {
    return state.signedIn
      ? 'Эта модель доступна на тарифе Pro'
      : 'Зарегистрируйтесь, чтобы выбирать модели';
  }
  /* Row keys come from the markup itself: onclick="pickModel('key')". */
  function rowKey(row) {
    var attr = row.getAttribute('onclick') || '';
    var found = attr.match(/pickModel\(\s*['"]([^'"]+)['"]/);
    if (found) return found[1];
    return row.getAttribute('data-model') || row.getAttribute('data-model-id') || '';
  }
  function rows() {
    var out = [];
    ['.mopt', '[onclick*="pickModel"]'].forEach(function (selector) {
      var list;
      try { list = document.querySelectorAll(selector); } catch (e) { return; }
      Array.prototype.forEach.call(list, function (node) { if (out.indexOf(node) < 0) out.push(node); });
    });
    return out;
  }
  function currentKey() {
    try { if (typeof currentModel !== 'undefined' && currentModel) return currentModel; } catch (e) {}
    if (window.currentModel) return window.currentModel;
    try { return localStorage.getItem('dl_model') || ''; } catch (e) { return ''; }
  }
  /* The composer button that shows the selected model. */
  function pills() {
    var out = [];
    ['#modelPill', '[onclick*="toggleModelMenu"]'].forEach(function (selector) {
      var list;
      try { list = document.querySelectorAll(selector); } catch (e) { return; }
      Array.prototype.forEach.call(list, function (node) { if (out.indexOf(node) < 0) out.push(node); });
    });
    return out;
  }
  function markPill() {
    var key = currentKey();
    var locked = state.ready && key && !isAllowed(key);
    pills().forEach(function (pill) {
      if (locked) {
        pill.setAttribute(PILL_ATTR, '1');
        pill.setAttribute('title', message());
      } else {
        pill.removeAttribute(PILL_ATTR);
        if (pill.getAttribute('title') === message()) pill.removeAttribute('title');
      }
    });
  }
  function mark() {
    if (!state.ready || !map()) return;
    var locked = 0, total = 0;
    rows().forEach(function (row) {
      var key = rowKey(row);
      if (!key) return;
      total++;
      row.setAttribute('data-dl-model-key', key);
      if (isAllowed(key)) {
        row.removeAttribute(LOCK_ATTR);
        row.removeAttribute('title');
      } else {
        locked++;
        row.setAttribute(LOCK_ATTR, '1');
        row.setAttribute('title', message());
      }
    });
    state.rows = total;
    state.locked = locked;
    markPill();
    badge();
  }
  function badge() {
    var heads = document.querySelectorAll('.mh');
    Array.prototype.forEach.call(heads, function (head) {
      if (head.querySelector('.dl-plan-badge')) return;
      if (String(head.textContent || '').trim().toUpperCase().indexOf('PRO') !== 0) return;
      var tag = document.createElement('span');
      tag.className = 'dl-plan-badge';
      tag.textContent = state.signedIn ? ('ваш тариф: ' + state.plan) : 'без входа';
      head.appendChild(tag);
    });
  }
  function notice(text) {
    if (typeof toast === 'function') { toast(text); return; }
    var box = document.querySelector('[data-dl-model-access-note]');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-dl-model-access-note', '1');
      box.style.cssText = 'position:fixed;left:50%;bottom:24px;z-index:100002;transform:translateX(-50%);padding:10px 14px;border-radius:10px;background:#191b22;color:#fff;border:1px solid rgba(255,255,255,.16);font:13px system-ui,sans-serif;box-shadow:0 12px 35px rgba(0,0,0,.35);';
      document.body.appendChild(box);
    }
    box.textContent = text;
    clearTimeout(notice.timer);
    notice.timer = setTimeout(function () { box.remove(); }, 2400);
  }
  /* Guard the selection itself instead of intercepting clicks across the page. */
  function guardPick() {
    if (typeof window.pickModel !== 'function' || window.pickModel.__dlGuarded) return;
    var original = window.pickModel;
    window.pickModel = function (key) {
      if (state.ready && !isAllowed(key)) { notice(message()); mark(); return; }
      var result = original.apply(this, arguments);
      mark();
      return result;
    };
    window.pickModel.__dlGuarded = true;
  }
  function loadState() {
    var value = token();
    if (!value) { state.ready = true; state.signedIn = false; state.plan = 'guest'; mark(); return; }
    fetch('/api/plan', { headers: { Authorization: 'Bearer ' + value } })
      .then(function (r) { if (!r.ok) throw new Error('plan ' + r.status); return r.json(); })
      .then(function (data) {
        state.ready = true;
        state.signedIn = true;
        state.plan = String(data.plan || 'free').toLowerCase();
        mark();
      })
      .catch(function () { state.ready = true; state.signedIn = false; state.plan = 'guest'; mark(); });
  }
  function start() {
    style();
    guardPick();
    loadState();
    setInterval(function () { guardPick(); mark(); }, 700);
    new MutationObserver(function () {
      clearTimeout(start.timer);
      start.timer = setTimeout(function () { guardPick(); mark(); }, 60);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
