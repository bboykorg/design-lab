/* Без автоподмены модели.

   Задача: если выбранная модель не ответила, сайт не подставляет другую
   тихонько — решение остаётся за человеком.

   Три слоя защиты, потому что подмена происходила в разных местах:

   1) ЦЕПОЧКА. В FALLBACK_ORDER держим ровно одну запись — выбранную модель.
      Обнулять список нельзя: часть кода (доска) берёт кандидатов только оттуда
      и при пустом списке уходит в демо-режим, не отправив ни одного запроса.

   2) ВЫЗОВ pickModel без живого клика игнорируется.

   3) САМ ЗАПРОС. Главное место. Какая бы часть кода ни собирала тело запроса,
      перед отправкой в /api/proxy имя модели сверяется с выбором пользователя
      и при расхождении возвращается обратно. Адрес шлюза правится заодно.
      Именно так ловится случай «выбран GPT-5.6, отвечает Opus»: там подмена
      шла мимо цепочки и мимо pickModel.

   При ошибке видна причина: код и текст ответа провайдера, полный текст —
   в window.__dlLastModelError. Факты перехвата копятся в window.__dlModelForced.

   Ничего не блокируется и не затемняется. Серверный резерв (другой шлюз для
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

  // MODELS / FALLBACK_ORDER объявлены через const в index.html — в window их нет,
  // обращаемся по имени, как это делают models-patch.js и seekai-models.js.
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
    try { key = window.currentModel || ''; } catch (e) { key = ''; }
    if (!key) {
      try { key = localStorage.getItem('dl_model') || ''; } catch (e) { key = ''; }
    }
    return key;
  }

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
    var guarded = function (key) {
      var startup = (Date.now() - bootAt) < BOOT_MS;
      if (!byUser() && !startup) {
        note('\u041c\u043e\u0434\u0435\u043b\u044c \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430. \u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c \u0432\u0440\u0443\u0447\u043d\u0443\u044e.');
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
    return out.length > 160 ? out.slice(0, 160) + '\u2026' : out;
  }

  // 3. Сверка тела запроса с выбором пользователя.
  function enforce(url, rawBody) {
    var key = currentKey();
    var entry = entryOf(key);
    var want = wantedModel(entry);
    if (!want) return null;

    var data;
    try { data = JSON.parse(rawBody); } catch (e) { return null; }
    if (!data || typeof data !== 'object') return null;
    // Только обычный чат-запрос с именем модели.
    if (typeof data.model !== 'string' || !data.model) return null;
    if (!data.messages || !data.messages.length) return null;
    if (data.model === want) return null;

    var was = data.model;
    data.model = want;

    var nextUrl = url;
    var gateway = wantedGateway(entry);
    if (gateway) {
      nextUrl = url.replace(/([?&]url=)[^&]*/, '$1' + encodeURIComponent(gateway));
    }

    window.__dlModelForced.push({ from: was, to: want, key: key, at: Date.now() });
    if (!toldAboutForce) {
      toldAboutForce = true;
      note('\u0417\u0430\u043f\u0440\u043e\u0441 \u0443\u0445\u043e\u0434\u0438\u043b \u043d\u0430 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c (' + was +
        ') \u2014 \u0432\u0435\u0440\u043d\u0443\u043b \u0442\u0432\u043e\u0439 \u0432\u044b\u0431\u043e\u0440: ' + want + '.');
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
      if (watched && method === 'POST' && typeof input === 'string' &&
        init && typeof init.body === 'string') {
        var fixed = null;
        try { fixed = enforce(url, init.body); } catch (e) { fixed = null; }
        if (fixed) {
          var nextInit = {};
          Object.keys(init).forEach(function (name) { nextInit[name] = init[name]; });
          nextInit.body = fixed.body;
          args = [fixed.url, nextInit];
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
            note('\u041c\u043e\u0434\u0435\u043b\u044c \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430 (\u043a\u043e\u0434 ' + status +
              '). \u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c \u0432\u0440\u0443\u0447\u043d\u0443\u044e.');
            return;
          }
          copy.text().then(function (text) {
            var reason = shorten(text);
            window.__dlLastModelError = { status: status, text: reason, at: Date.now() };
            note('\u041c\u043e\u0434\u0435\u043b\u044c \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430 (\u043a\u043e\u0434 ' + status + ')' +
              (reason ? ': ' + reason : '') +
              '. \u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c \u0432\u0440\u0443\u0447\u043d\u0443\u044e.');
          }, function () { });
        }, function () { });
      }
      return result;
    };
    wrapped.__dlModelWatch = true;
    window.fetch = wrapped;
  }

  function run() {
    pinChain();
    guardPick();
    watchFetch();
  }

  run();
  setTimeout(run, 300);
  setTimeout(run, 1200);
  setInterval(run, 900);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
