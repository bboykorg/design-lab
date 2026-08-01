/* Design Lab — model availability for guests and Free users.
   Scope: only model pickers. Everything stays clickable; unavailable models just look gray.
   Rows are found two ways, so every screen is covered:
     1. explicit markup (.mopt / onclick="pickModel('key')");
     2. any container that lists three or more model names (the hero picker on the main page). */
(function () {
  'use strict';
  if (window.__dlModelAccessLock) return;
  window.__dlModelAccessLock = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var LOCK_ATTR = 'data-dl-model-locked';
  var PILL_ATTR = 'data-dl-model-pill-locked';
  var KEY_ATTR = 'data-dl-model-key';
  var state = { ready: false, signedIn: false, plan: 'guest', rows: 0, locked: 0 };
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
  function norm(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }
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

  /* name -> model key, longest names first so "Claude Opus 4.8 Thinking" wins over "Claude Opus 4.8". */
  function names() {
    var models = map(), list = [];
    if (!models) return list;
    Object.keys(models).forEach(function (key) {
      var name = norm(models[key] && models[key].name);
      if (name) list.push({ key: key, name: name, lower: name.toLowerCase() });
    });
    list.sort(function (a, b) { return b.name.length - a.name.length; });
    return list;
  }
  function keyOfText(text, list) {
    var value = norm(text).toLowerCase();
    if (!value || value.length > 80) return '';
    for (var i = 0; i < list.length; i++) {
      if (value.indexOf(list[i].lower) === 0) return list[i].key;
    }
    return '';
  }
  function keyOfRow(row, list) {
    var attr = row.getAttribute('onclick') || '';
    var found = attr.match(/(?:pick|select|set|choose)Model\(\s*['"]([^'"]+)['"]/i);
    if (found) return found[1];
    var data = row.getAttribute('data-model') || row.getAttribute('data-model-id') || row.getAttribute('data-value');
    if (data && map() && map()[data]) return data;
    return keyOfText(row.textContent, list);
  }
  function explicitRows() {
    var out = [];
    ['.mopt', '[onclick*="pickModel"]'].forEach(function (selector) {
      var list;
      try { list = document.querySelectorAll(selector); } catch (e) { return; }
      Array.prototype.forEach.call(list, function (node) { if (out.indexOf(node) < 0) out.push(node); });
    });
    return out;
  }
  /* Any list that shows three or more model names is a model picker, whatever its markup is. */
  function listedRows(list) {
    var out = [];
    if (!list.length) return out;
    var all;
    try { all = document.body ? document.body.querySelectorAll('*') : []; } catch (e) { return out; }
    Array.prototype.forEach.call(all, function (node) {
      var count = node.childElementCount;
      if (count < 3 || count > 80) return;
      var hits = [];
      Array.prototype.forEach.call(node.children, function (child) {
        if (keyOfText(child.textContent, list)) hits.push(child);
      });
      if (hits.length < 3) return;
      hits.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
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
      var found;
      try { found = document.querySelectorAll(selector); } catch (e) { return; }
      Array.prototype.forEach.call(found, function (node) { if (out.indexOf(node) < 0) out.push(node); });
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
  /* Guard is attached to the locked row itself, never to the document. */
  function guardRow(row) {
    if (row.__dlGuarded) return;
    row.__dlGuarded = true;
    row.addEventListener('click', function (event) {
      if (row.getAttribute(LOCK_ATTR) !== '1') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      notice(message());
    }, true);
  }
  function mark() {
    if (!state.ready || !map()) return;
    var list = names();
    var rows = explicitRows();
    listedRows(list).forEach(function (row) { if (rows.indexOf(row) < 0) rows.push(row); });
    var locked = 0, total = 0;
    rows.forEach(function (row) {
      var key = keyOfRow(row, list);
      if (!key) return;
      total++;
      row.setAttribute(KEY_ATTR, key);
      guardRow(row);
      if (isAllowed(key)) {
        row.removeAttribute(LOCK_ATTR);
        if (row.getAttribute('title') === message()) row.removeAttribute('title');
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
  function guardPick() {
    ['pickModel', 'selectModel', 'setModel', 'chooseModel'].forEach(function (name) {
      var fn = window[name];
      if (typeof fn !== 'function' || fn.__dlGuarded) return;
      window[name] = function (key) {
        if (state.ready && typeof key === 'string' && map() && map()[key] && !isAllowed(key)) {
          notice(message());
          mark();
          return;
        }
        var result = fn.apply(this, arguments);
        mark();
        return result;
      };
      window[name].__dlGuarded = true;
    });
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
