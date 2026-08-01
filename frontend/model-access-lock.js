/* Design Lab — model availability for guests and Free users.
   Scope: only rows that actually select a model. Nothing else in the app is ever blocked. */
(function () {
  'use strict';
  if (window.__dlModelAccessLock) return;
  window.__dlModelAccessLock = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var state = { signedIn: false, plan: 'guest' };

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
    var found = attr.match(/pickModel\(\s*['\"]([^'\"]+)['\"]/);
    if (found) return found[1];
    return row.getAttribute('data-model') || row.getAttribute('data-model-id') || '';
  }
  function rows() {
    var found = [], seen = [];
    var lists = [document.querySelectorAll('.mopt'), document.querySelectorAll('[onclick*="pickModel"]')];
    lists.forEach(function (list) {
      Array.prototype.forEach.call(list, function (node) {
        if (seen.indexOf(node) < 0) { seen.push(node); found.push(node); }
      });
    });
    return found;
  }
  function mark() {
    if (!map()) return;
    rows().forEach(function (row) {
      var key = rowKey(row);
      if (!key) return;
      row.setAttribute('data-dl-model-key', key);
      if (isAllowed(key)) {
        row.removeAttribute('data-dl-model-locked');
        row.removeAttribute('title');
        row.style.filter = row.style.opacity = row.style.cursor = '';
      } else {
        row.setAttribute('data-dl-model-locked', '1');
        row.setAttribute('title', message());
        row.style.filter = 'grayscale(1)';
        row.style.opacity = '.45';
        row.style.cursor = 'not-allowed';
      }
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
      if (!isAllowed(key)) { notice(message()); mark(); return; }
      return original.apply(this, arguments);
    };
    window.pickModel.__dlGuarded = true;
  }
  function loadState() {
    var value = token();
    if (!value) { mark(); return; }
    fetch('/api/plan', { headers: { Authorization: 'Bearer ' + value } })
      .then(function (r) { if (!r.ok) throw new Error('plan'); return r.json(); })
      .then(function (data) { state = { signedIn: true, plan: data.plan || 'free' }; mark(); })
      .catch(function () { state = { signedIn: false, plan: 'guest' }; mark(); });
  }
  function start() {
    guardPick();
    loadState();
    [400, 1200, 2500].forEach(function (delay) {
      setTimeout(function () { guardPick(); mark(); }, delay);
    });
    new MutationObserver(function () {
      clearTimeout(start.timer);
      start.timer = setTimeout(function () { guardPick(); mark(); }, 80);
    }).observe(document.documentElement, { childList: true, subtree: true });
    document.addEventListener('click', function () { setTimeout(mark, 40); }, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
