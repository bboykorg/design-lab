/* Design Lab — model availability for guests and Free users. */
(function () {
  'use strict';
  if (window.__dlModelAccessLock) return;
  window.__dlModelAccessLock = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var state = { signedIn: false, plan: 'guest' };
  var FREE_MODEL_IDS = {
    'zai-glm-4.7': true,
    'gpt-oss-120b': true,
    'gemma-4-31b': true,
    'google/gemma-4-31b-it:free': true,
    'nvidia/nemotron-3-ultra-550b-a55b:free': true,
    'openai/gpt-oss-20b:free': true,
    'cohere/north-mini-code:free': true,
    'openrouter/free': true
  };

  function token() {
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        var value = localStorage.getItem(TOKEN_KEYS[i]);
        if (value && value.length > 10) return value;
      }
    } catch (e) {}
    return '';
  }

  function message() {
    return state.signedIn ? 'Эта модель доступна на тарифе Pro' : 'Войдите или зарегистрируйтесь для выбора модели';
  }

  function allowed(id) {
    if (!state.signedIn) return false;
    if (state.plan !== 'free') return true;
    try {
      var model = window.MODELS && window.MODELS[id];
      return !!(model && FREE_MODEL_IDS[model.model || '']);
    } catch (e) { return false; }
  }

  function rowOf(node) {
    return node.closest('[data-model],[data-model-id],[data-id],[data-value],[role="option"],[role="menuitem"],li,.model-item,.model-option,.model-row,button') || node.parentElement;
  }

  function mark() {
    if (!window.MODELS) return;
    var ids = Object.keys(window.MODELS);
    var leaves = document.querySelectorAll('span,div,b,strong,p,button');
    for (var i = 0; i < ids.length; i++) {
      var model = window.MODELS[ids[i]] || {};
      var name = String(model.name || '').replace(/\s+/g, ' ').trim();
      if (!name) continue;
      for (var j = 0; j < leaves.length; j++) {
        var leaf = leaves[j];
        if (leaf.children.length || String(leaf.textContent || '').replace(/\s+/g, ' ').trim() !== name) continue;
        var row = rowOf(leaf);
        if (!row) continue;
        var locked = !allowed(ids[i]);
        row.setAttribute('data-dl-model-id', ids[i]);
        if (!locked) {
          row.removeAttribute('data-dl-model-locked');
          row.style.filter = '';
          row.style.opacity = '';
          continue;
        }
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
    notice.timer = setTimeout(function () { if (box) box.remove(); }, 2400);
  }

  function loadState() {
    var value = token();
    if (!value) { mark(); return; }
    var headers = { Authorization: 'Bearer ' + value };
    fetch('/api/plan', { headers: headers })
      .then(function (response) {
        if (!response.ok) throw new Error('not signed in');
        return response.json();
      })
      .then(function (data) {
        state.signedIn = true;
        state.plan = data.plan || 'free';
        mark();
      })
      .catch(function () { state = { signedIn: false, plan: 'guest' }; mark(); });
  }

  document.addEventListener('click', function (event) {
    var row = event.target.closest && event.target.closest('[data-dl-model-locked]');
    if (!row) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    notice(message());
  }, true);

  function start() {
    loadState();
    setTimeout(mark, 600);
    setTimeout(mark, 1800);
    new MutationObserver(function () { clearTimeout(start.timer); start.timer = setTimeout(mark, 180); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
