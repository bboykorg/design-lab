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
    'openai/gpt-oss-20b:free': true, 'cohere/north-mini-code:free': true, 'openrouter/free': true
  };

  function map() { try { return typeof MODELS !== 'undefined' ? MODELS : null; } catch (e) { return null; } }
  function normal(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function token() {
    try { for (var i = 0; i < TOKEN_KEYS.length; i++) { var value = localStorage.getItem(TOKEN_KEYS[i]); if (value && value.length > 10) return value; } } catch (e) {}
    return '';
  }
  function modelId(node) {
    var models = map(); if (!models) return '';
    var text = normal(node && node.textContent), ids = Object.keys(models);
    ids.sort(function (a, b) { return normal(models[b].name).length - normal(models[a].name).length; });
    for (var i = 0; i < ids.length; i++) if (normal(models[ids[i]].name) && text.indexOf(normal(models[ids[i]].name)) >= 0) return ids[i];
    return '';
  }
  function isAllowed(id) {
    var models = map(), model = models && models[id];
    if (!state.signedIn) return false;
    return state.plan !== 'free' || !!(model && FREE_MODEL_IDS[model.model || '']);
  }
  function message() { return state.signedIn ? 'Эта модель доступна на тарифе Pro' : 'Войдите или зарегистрируйтесь для выбора модели'; }

  /* Finds an item only when it belongs to a list containing several models.
     This deliberately excludes the single current-model button. */
  function menuItem(leaf) {
    var current = leaf;
    for (var depth = 0; current && depth < 6; depth++, current = current.parentElement) {
      var parent = current.parentElement;
      if (!parent) continue;
      var matches = 0, children = parent.children;
      for (var i = 0; i < children.length; i++) if (modelId(children[i])) matches++;
      if (matches >= 2 && modelId(current)) return current;
    }
    return null;
  }
  function style(item, id) {
    item.setAttribute('data-dl-model-id', id);
    if (isAllowed(id)) {
      item.removeAttribute('data-dl-model-locked');
      item.style.filter = item.style.opacity = item.style.cursor = '';
    } else {
      item.setAttribute('data-dl-model-locked', '1');
      item.setAttribute('title', message());
      item.style.filter = 'grayscale(1)'; item.style.opacity = '.42'; item.style.cursor = 'not-allowed';
    }
  }
  function mark() {
    if (!map()) return;
    var leaves = document.querySelectorAll('span,div,p,b,strong,button');
    for (var i = 0; i < leaves.length; i++) {
      if (leaves[i].children.length) continue;
      var id = modelId(leaves[i]);
      if (!id) continue;
      var item = menuItem(leaves[i]);
      if (item) style(item, id);
    }
  }
  function notice(text) {
    var box = document.querySelector('[data-dl-model-access-note]');
    if (!box) {
      box = document.createElement('div'); box.setAttribute('data-dl-model-access-note', '1');
      box.style.cssText = 'position:fixed;left:50%;bottom:24px;z-index:100002;transform:translateX(-50%);padding:10px 14px;border-radius:10px;background:#191b22;color:#fff;border:1px solid rgba(255,255,255,.16);font:13px system-ui,sans-serif;box-shadow:0 12px 35px rgba(0,0,0,.35);';
      document.body.appendChild(box);
    }
    box.textContent = text; clearTimeout(notice.timer); notice.timer = setTimeout(function () { box.remove(); }, 2400);
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
    var item = event.target.closest && event.target.closest('[data-dl-model-locked]');
    if (!item) return;
    event.preventDefault(); event.stopImmediatePropagation(); notice(message());
  }, true);
  function start() {
    loadState(); setTimeout(mark, 350); setTimeout(mark, 1200);
    new MutationObserver(function () { clearTimeout(start.timer); start.timer = setTimeout(mark, 80); })
      .observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
