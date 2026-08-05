/* Запрос всегда уходит только на модель, выбранную пользователем.

   FALLBACK_ORDER намеренно не сокращается и не очищается: движок использует
   его как внутренний список кандидатов и без него вообще не делает fetch.
   Вместо изменения цепочки модель и шлюз исправляются прямо перед отправкой.
   Автоматические вызовы pickModel не меняют выбор в интерфейсе.

   Технические подмены fallback-кандидатов больше не показываются человеку.
   В частности, сырой ответ 403 «модель доступна на Pro» не показывается,
   если реально выбранная модель входит в Free: это был ответ внутреннему
   кандидату, а не доказательство, что GPT-OSS или другая Free-модель платная.
   Диагностика остаётся в __dlModelForced и __dlLastModelError. */
(function () {
  'use strict';
  if (window.__dlNoAutoSwitch) return;
  window.__dlNoAutoSwitch = true;

  var GESTURE_MS = 2500;
  var BOOT_MS = 8000;
  var QUIET_MS = 16000;
  var bootAt = Date.now();
  var lastGesture = 0;
  var lastNote = 0;
  var restored = false;

  window.__dlModelForced = [];

  ['pointerdown', 'mousedown', 'click', 'touchstart', 'keydown'].forEach(function (type) {
    document.addEventListener(type, function () { lastGesture = Date.now(); }, true);
  });
  function byUser() { return Date.now() - lastGesture < GESTURE_MS; }
  function chainRef() {
    var chain;
    try { chain = FALLBACK_ORDER; } catch (e) { chain = window.FALLBACK_ORDER; }
    return chain && chain.splice ? chain : null;
  }
  function modelsRef() {
    var models;
    try { models = MODELS; } catch (e) { models = window.MODELS; }
    return models && typeof models === 'object' ? models : null;
  }
  function currentKey() {
    var key = '';
    try { key = currentModel || ''; } catch (e) {}
    if (!key) try { key = window.currentModel || ''; } catch (e) {}
    if (!key) try { key = localStorage.getItem('dl_model') || ''; } catch (e) {}
    return typeof key === 'string' ? key : '';
  }
  window.dlCurrentModelKey = currentKey;
  function entryOf(key) {
    var models = modelsRef();
    return models && key && models[key] ? models[key] : null;
  }
  function wantedModel(entry) {
    var name = entry && (entry.model || entry.id || entry.slug || '');
    return typeof name === 'string' ? name : '';
  }
  function wantedGateway(entry) {
    if (!entry) return '';
    var gw = entry.gw || entry.gateway || null;
    var url = (gw && gw.url) || entry.url || entry.endpoint || '';
    return typeof url === 'string' ? url : '';
  }
  function selectedIsFree() {
    var entry = entryOf(currentKey());
    if (typeof window.dlIsFreeModel !== 'function') return false;
    try { return !!window.dlIsFreeModel(entry); } catch (e) { return false; }
  }
  function recentlyCanceled() {
    var at = Number(window.__dlCancelledAt || 0);
    return at > 0 && Date.now() - at < QUIET_MS;
  }
  function note(text) {
    if (recentlyCanceled()) return;
    var now = Date.now();
    if (now - lastNote < 6000) return;
    lastNote = now;
    if (typeof window.toast === 'function') {
      try { window.toast(text); return; } catch (e) {}
    }
    var box = document.createElement('div');
    box.textContent = text;
    box.setAttribute('data-dl-model-note', '1');
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:99999;' +
      'max-width:min(460px,92vw);padding:12px 16px;border-radius:12px;background:#0f1116;color:#fff;' +
      'font:14px/1.4 Manrope,system-ui,sans-serif;border:1px solid rgba(255,255,255,.14);' +
      'box-shadow:0 10px 30px rgba(0,0,0,.35);pointer-events:none;';
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 5000);
  }
  window.dlModelNote = note;

  function restoreChain() {
    if (restored) return;
    var chain = chainRef(), saved = window.__dlFallbackOrder;
    if (!chain) return;
    if (saved && saved.length && chain.length < saved.length) {
      chain.splice.apply(chain, [0, chain.length].concat(saved));
    }
    restored = true;
  }
  function guardPick() {
    var pick = window.pickModel;
    if (typeof pick !== 'function' || pick.__dlGuardedAuto) return;
    var guarded = function () {
      var startup = Date.now() - bootAt < BOOT_MS;
      if (!byUser() && !startup && !window.__dlAllowAutoPick) return;
      return pick.apply(this, arguments);
    };
    guarded.__dlGuardedAuto = true;
    window.pickModel = guarded;
  }
  function enforce(url, rawBody) {
    var key = currentKey(), entry = entryOf(key), want = wantedModel(entry);
    if (!want) return null;
    var data;
    try { data = JSON.parse(rawBody); } catch (e) { return null; }
    if (!data || typeof data !== 'object' || typeof data.model !== 'string' || !data.model) return null;
    if (!data.messages || !data.messages.length || data.model === want) return null;
    var was = data.model;
    data.model = want;
    var nextUrl = url, gateway = wantedGateway(entry);
    if (gateway && /[?&]url=/.test(url)) {
      nextUrl = url.replace(/([?&]url=)[^&]*/, '$1' + encodeURIComponent(gateway));
    }
    window.__dlModelForced.push({ from: was, to: want, key: key, at: Date.now() });
    return { url: nextUrl, body: JSON.stringify(data) };
  }
  function rememberError(response) {
    if (!response || response.ok) return;
    var status = response.status, copy = null;
    try { copy = response.clone(); } catch (e) {}
    if (!copy) {
      window.__dlLastModelError = { status: status, text: '', at: Date.now() };
      if (!recentlyCanceled() && !(status === 403 && selectedIsFree())) {
        note('Выбранная модель сейчас не ответила. Выбери другую вручную.');
      }
      return;
    }
    copy.text().then(function (text) {
      var short = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      window.__dlLastModelError = { status: status, text: short, at: Date.now() };
      if (recentlyCanceled() || (status === 403 && selectedIsFree())) return;
      note('Выбранная модель сейчас не ответила. Выбери другую вручную.');
    }, function () {});
  }
  function watchFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlModelWatch) return;
    var wrapped = function (input, init) {
      var url = '', method = '';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
        method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      } catch (e) {}
      var watched = url.indexOf('/api/proxy') >= 0;
      var args = arguments;
      if (watched && method === 'POST' && init && typeof init.body === 'string') {
        var fixed = null;
        try { fixed = enforce(url, init.body); } catch (e) {}
        if (fixed) {
          var nextInit = {};
          Object.keys(init).forEach(function (name) { nextInit[name] = init[name]; });
          nextInit.body = fixed.body;
          args = [typeof input === 'string' ? fixed.url : input, nextInit];
        }
      }
      var result = original.apply(this, args);
      if (watched && result && result.then) result.then(rememberError, function () {});
      return result;
    };
    wrapped.__dlModelWatch = true;
    window.fetch = wrapped;
  }
  function watchXhr() {
    var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || proto.__dlModelWatch) return;
    var openOriginal = proto.open, sendOriginal = proto.send;
    proto.open = function (method, url) {
      try { this.__dlUrl = String(url || ''); this.__dlMethod = String(method || '').toUpperCase(); } catch (e) {}
      return openOriginal.apply(this, arguments);
    };
    proto.send = function (body) {
      try {
        var url = this.__dlUrl || '';
        if (this.__dlMethod === 'POST' && url.indexOf('/api/proxy') >= 0 && typeof body === 'string') {
          var fixed = enforce(url, body);
          if (fixed) return sendOriginal.call(this, fixed.body);
        }
      } catch (e) {}
      return sendOriginal.apply(this, arguments);
    };
    proto.__dlModelWatch = true;
  }
  function run() { restoreChain(); guardPick(); watchFetch(); watchXhr(); }
  run();
  setTimeout(run, 300);
  setTimeout(run, 1200);
  setInterval(run, 900);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
