/* Без автоподмены модели.

   Задача: если выбранная модель не ответила, сайт не подставляет другую
   тихонько — решение остаётся за человеком.

   Четыре слоя, потому что подмена происходила в разных местах:

   1) ЦЕПОЧКА. В FALLBACK_ORDER держим ровно одну запись — выбранную модель.
      Обнулять список нельзя: часть кода (доска) берёт кандидатов только оттуда
      и при пустом списке уходит в демо-режим, не отправив ни одного запроса.

   2) ВЫЗОВ pickModel без живого клика игнорируется.

   3) ТЕЛО ЗАПРОСА fetch. Перед отправкой в /api/proxy имя модели сверяется
      с выбором пользователя и при расхождении возвращается обратно.

   4) ТЕЛО ЗАПРОСА XHR. То же самое для запросов через XMLHttpRequest.

   Отдельно про выбор модели: currentModel объявлен через let в index.html,
   поэтому в window его НЕТ. Обращение к window.currentModel всегда давало
   undefined, сверка молча отключалась, и запросы продолжали уходить на Opus.
   Читаем по имени, как MODELS и FALLBACK_ORDER.

   При ошибке видна причина: код и текст ответа провайдера, полный текст —
   в window.__dlLastModelError. Факты перехвата копятся в window.__dlModelForced.

   Ничего не блокируется и не затемняется. Серверный резерв (другой ключ для
   ТОЙ ЖЕ модели) не трогаем: он выбор пользователя не меняет. */
(function () {
  'use strict';
  if (window.__dlNoAutoSwitch) return;
  window.__dlNoAutoSwitch = true;

  var GESTURE_MS = 2500;
  var BOOT_MS = 8000;
  var NOTE_MS = 6000;

  var bootAt = Date.now();
  var lastGesture = 0;
  var lastNote = 0;
  var toldAboutForce = false;

  window.__dlModelForced = [];

  ['pointerdown', 'mousedown', 'click', 'touchstart', 'keydown'].forEach(function (type) {
    document.addEventListener(type, function () { lastGesture = Date.now(); }, true);
  });

  function byUser() {
    return (Date.now() - lastGesture) < GESTURE_MS;
  }

  function note(text) {
    var now = Date.now();
    if (now - lastNote < NOTE_MS) return;
    lastNote = now;
    if (typeof window.toast === 'function') {
      try { window.toast(text); return; } catch (e) { /* своё окно ниже */ }
    }
    var box = document.createElement('div');
    box.textContent = text;
    box.setAttribute('data-dl-model-note', '1');
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
      'z-index:99999;max-width:min(460px,92vw);padding:12px 16px;border-radius:12px;' +
      'background:#0f1116;color:#fff;font:14px/1.4 Manrope,system-ui,sans-serif;' +
      'border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 30px rgba(0,0,0,.35);' +
      'pointer-events:none;';
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 5500);
  }
  window.dlModelNote = note;

  // MODELS / FALLBACK_ORDER / currentModel объявлены через const и let в
  // index.html — в window их нет, обращаемся по имени.
  function chainRef() {
    var chain;
    try { chain = FALLBACK_ORDER; } catch (e) { chain = window.FALLBACK_ORDER; }
    return (chain && chain.splice) ? chain : null;
  }

  function modelsRef() {
    var models;
    try { models = MODELS; } catch (e) { models = window.MODELS; }
    return (models && typeof models === 'object') ? models : null;
  }

  function currentKey() {
    var key = '';
    try { key = currentModel || ''; } catch (e) { key = ''; }
    if (!key) { try { key = window.currentModel || ''; } catch (e) { key = ''; } }
    if (!key) {
      try { key = localStorage.getItem('dl_model') || ''; } catch (e) { key = ''; }
    }
    return typeof key === 'string' ? key : '';
  }
  window.dlCurrentModelKey = currentKey;

  function entryOf(key) {
    var models = modelsRef();
    return (models && key && models[key]) ? models[key] : null;
  }

  function wantedModel(entry) {
    if (!entry) return '';
    var name = entry.model || entry.id || entry.slug || '';
    return typeof name === 'string' ? name : '';
  }

  function wantedGateway(entry) {
    if (!entry) return '';
    var gw = entry.gw || entry.gateway || null;
    var url = (gw && gw.url) || entry.url || entry.endpoint || '';
    return typeof url === 'string' ? url : '';
  }

  // 1. В цепочке всегда ровно одна запись — выбранная модель.
  function pinChain() {
    var chain = chainRef();
    if (!chain) return;
    if (!window.__dlFallbackOrder && chain.length > 1) {
      window.__dlFallbackOrder = chain.slice();
    }
    var key = currentKey();
    if (!key) {
      if (chain.length > 1) chain.splice(1, chain.length - 1);
      return;
    }
    if (chain.length === 1 && chain[0] === key) return;
    chain.splice(0, chain.length, key);
  }

  // 2. Заслон на машинный вызов pickModel.
  function guardPick() {
    var pick = window.pickModel;
    if (typeof pick !== 'function' || pick.__dlGuardedAuto) return;
    var guarded = function () {
      var startup = (Date.now() - bootAt) < BOOT_MS;
      if (!byUser() && !startup) {
        note('Модель не ответила. Выбери другую модель вручную.');
        return;
      }
      return pick.apply(this, arguments);
    };
    guarded.__dlGuardedAuto = true;
    window.pickModel = guarded;
  }

  function shorten(text) {
    var out = String(text || '').replace(/\s+/g, ' ').trim();
    try {
      var data = JSON.parse(out);
      var message = (data && data.error && (data.error.message || data.error)) ||
        (data && data.detail) || (data && data.message) || '';
      if (message) out = String(message);
    } catch (e) { /* не JSON — оставляем как есть */ }
    return out.length > 160 ? out.slice(0, 160) + '…' : out;
  }

  // 3/4. Сверка тела запроса с выбором пользователя.
  function enforce(url, rawBody) {
    var key = currentKey();
    var entry = entryOf(key);
    var want = wantedModel(entry);
    if (!want) return null;

    var data;
    try { data = JSON.parse(rawBody); } catch (e) { return null; }
    if (!data || typeof data !== 'object') return null;
    if (typeof data.model !== 'string' || !data.model) return null;
    if (!data.messages || !data.messages.length) return null;
    if (data.model === want) return null;

    var was = data.model;
    data.model = want;

    var nextUrl = url;
    var gateway = wantedGateway(entry);
    if (gateway && /[?&]url=/.test(url)) {
      nextUrl = url.replace(/([?&]url=)[^&]*/, '$1' + encodeURIComponent(gateway));
    }

    window.__dlModelForced.push({ from: was, to: want, key: key, at: Date.now() });
    if (!toldAboutForce) {
      toldAboutForce = true;
      note('Запрос уходил на другую модель (' + was + ') — вернул твой выбор: ' + want + '.');
    }
    return { url: nextUrl, body: JSON.stringify(data) };
  }

  function watchFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlModelWatch) return;
    var wrapped = function (input, init) {
      var url = '';
      var method = '';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
        method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      } catch (e) { url = ''; }
      var watched = url.indexOf('/api/proxy') >= 0;

      var args = arguments;
      if (watched && method === 'POST' && init && typeof init.body === 'string') {
        var fixed = null;
        try { fixed = enforce(url, init.body); } catch (e) { fixed = null; }
        if (fixed) {
          var nextInit = {};
          Object.keys(init).forEach(function (name) { nextInit[name] = init[name]; });
          nextInit.body = fixed.body;
          args = [typeof input === 'string' ? fixed.url : input, nextInit];
          url = fixed.url;
        }
      }

      var result = original.apply(this, args);
      if (watched && result && result.then) {
        result.then(function (response) {
          if (!response || response.ok) return;
          var status = response.status;
          var copy = null;
          try { copy = response.clone(); } catch (e) { copy = null; }
          if (!copy) {
            window.__dlLastModelError = { status: status, text: '', at: Date.now() };
            note('Модель не ответила (код ' + status + '). Выбери другую модель вручную.');
            return;
          }
          copy.text().then(function (text) {
            var reason = shorten(text);
            window.__dlLastModelError = { status: status, text: reason, at: Date.now() };
            note('Модель не ответила (код ' + status + ')' + (reason ? ': ' + reason : '') +
              '. Выбери другую модель вручную.');
          }, function () { });
        }, function () { });
      }
      return result;
    };
    wrapped.__dlModelWatch = true;
    window.fetch = wrapped;
  }

  // Часть кода ходит мимо fetch — через XMLHttpRequest. Там та же сверка.
  function watchXhr() {
    var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || proto.__dlModelWatch) return;
    var openOriginal = proto.open;
    var sendOriginal = proto.send;

    proto.open = function (method, url) {
      try {
        this.__dlUrl = String(url || '');
        this.__dlMethod = String(method || '').toUpperCase();
      } catch (e) { /* ничего */ }
      return openOriginal.apply(this, arguments);
    };

    proto.send = function (body) {
      try {
        var url = this.__dlUrl || '';
        if (this.__dlMethod === 'POST' && url.indexOf('/api/proxy') >= 0 &&
          typeof body === 'string') {
          var fixed = enforce(url, body);
          if (fixed) return sendOriginal.call(this, fixed.body);
        }
      } catch (e) { /* отправляем как есть */ }
      return sendOriginal.apply(this, arguments);
    };

    proto.__dlModelWatch = true;
  }

  function run() {
    pinChain();
    guardPick();
    watchFetch();
    watchXhr();
  }

  run();
  setTimeout(run, 300);
  setTimeout(run, 1200);
  setInterval(run, 900);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
