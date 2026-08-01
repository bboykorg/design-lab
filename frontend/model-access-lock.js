/* Design Lab — model availability for guests and Free users.
   Scope: strictly the rows inside #modelMenu. Nothing else in the app is ever blocked. */
(function () {
  'use strict';
  if (window.__dlModelAccessLock) return;
  window.__dlModelAccessLock = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var state = { signedIn: false, plan: 'guest' };
  var FREE_MODEL_IDS = {
    'zai-glm-4.7': true, 'gpt-oss-120b': true, 'gemma-4-31b': true,
    'google/gemma-4-31b-it:free': true, 'nvidia/nemotron-3-ultra-550b-a55b:free': true,
    'openai/gpt-oss-20b:free': true, 'cohere/north-mini-code:free': true, 'openrouter/free': true
  };

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
  function isAllowed(key) {
    var models = map(), model = models && models[key];
    if (!state.signedIn) return false;
    if (state.plan !== 'free') return true;
    return !!(model && FREE_MODEL_IDS[model.model || '']);
  }
  function message() {
    return state.signedIn
      ? 'Эта модель доступна на тарифе Pro'
      : 'Зарегистрируйтесь, чтобы выбирать модели';
  }
  /* Row keys come from the menu markup itself: onclick="pickModel('key')". */
  function rowKey(row) {
    var attr = row.getAttribute('onclick') || '';
    var found = attr.match(/pickModel\(\s*['"]([^'"]+)['"]/);
    return found ? found[1] : '';
  }
  function mark() {
    var menu = document.getElementById('modelMenu');
    if (!menu || !map()) return;
    var rows = menu.querySelectorAll('.mopt');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i], key = rowKey(row);
      if (!key) continue;
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
    }
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
    setTimeout(function () { guardPick(); mark(); }, 400);
    setTimeout(function () { guardPick(); mark(); }, 1400);
    var menu = document.getElementById('modelMenu');
    if (menu) new MutationObserver(function () {
      clearTimeout(start.timer);
      start.timer = setTimeout(mark, 60);
    }).observe(menu, { childList: true, subtree: true });
    var pill = document.getElementById('modelPill');
    if (pill) pill.addEventListener('click', function () { setTimeout(mark, 30); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
