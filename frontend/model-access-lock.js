/* Design Lab — model availability for guests and Free users. */
(function () {
  'use strict';
  if (window.__dlModelAccessLock) return;
  window.__dlModelAccessLock = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var state = { signedIn: false, plan: 'guest' };
  var FREE_MODEL_IDS = {
    'zai-glm-4.7': true, 'gpt-oss-120b': true, 'gemma-4-31b': true,
    'google/gemma-4-31b-it:free': true, 'nvidia/nemotron-3-ultra-550b-a55b:free': true,
    'openai/gpt-oss-20b:free': true, 'cohere/north-mini-code:free': true,
    'openrouter/free': true
  };

  function modelMap() { try { return typeof MODELS !== 'undefined' ? MODELS : null; } catch (e) { return null; } }
  function token() {
    try { for (var i = 0; i < TOKEN_KEYS.length; i++) { var v = localStorage.getItem(TOKEN_KEYS[i]); if (v && v.length > 10) return v; } } catch (e) {}
    return '';
  }
  function message() { return state.signedIn ? 'Эта модель доступна на тарифе Pro' : 'Войдите или зарегистрируйтесь для выбора модели'; }
  function allowed(id) {
    var map = modelMap(), model = map && map[id];
    if (!state.signedIn) return false;
    return state.plan !== 'free' || !!(model && FREE_MODEL_IDS[model.model || '']);
  }
  function idFromText(node) {
    var map = modelMap();
    if (!map) return '';
    var text = String((node && node.textContent) || '').replace(/\s+/g, ' ').trim();
    var ids = Object.keys(map).sort(function (a, b) { return String(map[b].name || '').length - String(map[a].name || '').length; });
    for (var i = 0; i < ids.length; i++) {
      var name = String(map[ids[i]].name || '').replace(/\s+/g, ' ').trim();
      if (name && text.indexOf(name) >= 0) return ids[i];
    }
    return '';
  }
  function mark() {
    var map = modelMap();
    if (!map) return;
    /* Only actual menu rows are styled. The current-model button remains clickable. */
    var rows = document.querySelectorAll('[role="option"],[role="menuitem"],li,.model-item,.model-option,.model-row,[data-model],[data-model-id]');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i], id = idFromText(row);
      if (!id) continue;
      row.setAttribute('data-dl-model-id', id);
      if (allowed(id)) {
        row.removeAttribute('data-dl-model-locked');
        row.style.filter = row.style.opacity = row.style.cursor = '';
      } else {
        row.setAttribute('data-dl-model-locked', '1');
        row.setAttribute('title', message());
        row.style.filter = 'grayscale(1)';
        row.style.opacity = '.42';
        row.style.cursor = 'not-allowed';
      }
    }
  }
  function notice(text) {
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
  function loadState() {
    var value = token();
    if (!value) { mark(); return; }
    fetch('/api/plan', { headers: { Authorization: 'Bearer ' + value } })
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (data) { state = { signedIn: true, plan: data.plan || 'free' }; mark(); })
      .catch(function () { state = { signedIn: false, plan: 'guest' }; mark(); });
  }
  document.addEventListener('click', function (event) {
    var row = event.target.closest && event.target.closest('[data-dl-model-locked]');
    if (!row) return;
    event.preventDefault(); event.stopImmediatePropagation(); notice(message());
  }, true);
  function start() {
    loadState();
    setTimeout(mark, 500);
    setTimeout(mark, 1600);
    new MutationObserver(function () { clearTimeout(start.timer); start.timer = setTimeout(mark, 120); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
