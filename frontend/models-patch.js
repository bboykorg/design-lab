/* Патч Design Lab: списки моделей + OCR скриншотов.
 *
 * index.html — единый файл на ~700 КБ, поэтому правки живут здесь; backend
 * подставляет <script src="/models-patch.js"> перед </body>.
 *
 * Что делает:
 *  1) добавляет модели Vyce AI (claude-sonnet-5, deepseek-v4-flash,
 *     gemini-3.6-flash) — первыми в меню и в авто-переборе, claude-sonnet-5
 *     — модель по умолчанию;
 *  2) возвращает модели Cerebras;
 *  3) прогоняет любой скриншот через OCR.space (/api/ocr) и подставляет
 *     распознанный текст в запрос — так картинку "видит" любая модель,
 *     даже без vision.
 */
(function () {
  'use strict';

  // base_url провайдера: https://vyceai.com/v1 (без поддомена api.)
  var VYCE_URL = 'https://vyceai.com/v1/chat/completions';
  var VYCE_HOST = 'vyceai.com';
  var VY_GROUP = 'Vyce AI \u00b7 основные';
  var CB_GROUP = 'Сверхбыстрые \u00b7 Cerebras';
  var OCR_ENDPOINT = '/api/ocr';
  var OCR_HEAD = '\u0422\u0435\u043a\u0441\u0442 \u0441\u043e \u0441\u043a\u0440\u0438\u043d\u0448\u043e\u0442\u0430 (OCR)';

  /* provider: 'cerebras' у Vyce-моделей не опечатка: так берётся готовый
     OpenAI-совместимый путь запроса из index.html, а адрес провайдера
     подменяется ниже в patchFetch(). */
  var EXTRA = {
    'vy-sonnet5':  { name: 'Claude Sonnet 5',   desc: 'Anthropic \u00b7 лучший для кода (Vyce)', provider: 'cerebras', model: 'claude-sonnet-5',   brand: 'anthropic', group: VY_GROUP },
    'vy-deepseek': { name: 'DeepSeek V4 Flash', desc: 'DeepSeek \u00b7 быстрая (Vyce)',        provider: 'cerebras', model: 'deepseek-v4-flash', brand: 'deepseek',  group: VY_GROUP },
    'vy-gemini':   { name: 'Gemini 3.6 Flash',  desc: 'Google \u00b7 быстрая (Vyce)',          provider: 'cerebras', model: 'gemini-3.6-flash',  brand: 'gemini',    group: VY_GROUP },
    'cb-glm47':    { name: 'GLM 4.7',           desc: '355B \u00b7 лучший для кода',           provider: 'cerebras', model: 'zai-glm-4.7',      brand: 'glm',       group: CB_GROUP },
    'cb-gpt-oss':  { name: 'GPT-OSS 120B',      desc: 'OpenAI \u00b7 рассуждающая',             provider: 'cerebras', model: 'gpt-oss-120b',     brand: 'openai',    group: CB_GROUP },
    'cb-gemma4':   { name: 'Gemma 4 31B',       desc: 'Google \u00b7 самая быстрая (Cerebras)', provider: 'cerebras', model: 'gemma-4-31b',      brand: 'google',    group: CB_GROUP }
  };
  var VY_KEYS = ['vy-sonnet5', 'vy-deepseek', 'vy-gemini'];
  var CB_KEYS = ['cb-glm47', 'cb-gpt-oss', 'cb-gemma4'];
  var ORDER = VY_KEYS.concat(CB_KEYS);   // порядок в меню: Vyce выше всего
  var DEFAULT_MODEL = 'vy-sonnet5';
  var VYCE_MODEL_NAMES = VY_KEYS.map(function (k) { return EXTRA[k].model; });

  var origFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

  // ---------------------------------------------------------------- OCR ----

  var ocrCache = {};

  function cacheKey(s) { return s.length + ':' + s.slice(0, 96) + ':' + s.slice(-48); }

  /** Картинка (data URL или base64) -> текст. Ключ OCR живёт на сервере. */
  function ocrImage(dataUrl) {
    if (!origFetch || typeof dataUrl !== 'string' || !dataUrl) return Promise.resolve('');
    var k = cacheKey(dataUrl);
    if (ocrCache[k] !== undefined) return Promise.resolve(ocrCache[k]);
    return origFetch(OCR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    }).then(function (r) {
      return r.json().catch(function () { return {}; });
    }).then(function (j) {
      var t = (j && typeof j.text === 'string') ? j.text.trim() : '';
      ocrCache[k] = t;
      return t;
    }).catch(function () { return ''; });
  }
  window.dlOcr = ocrImage;   // можно дёрнуть вручную из консоли/кода сайта

  function ocrBlock(text) {
    return text ? ('[' + OCR_HEAD + ']\n' + text)
                : '[\u0421\u043a\u0440\u0438\u043d\u0448\u043e\u0442 \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d, \u043d\u043e \u0442\u0435\u043a\u0441\u0442 \u043d\u0435 \u0440\u0430\u0441\u043f\u043e\u0437\u043d\u0430\u043d]';
  }

  /** OpenAI-формат: messages[].content[] с частями image_url. */
  function ocrifyOpenAI(data) {
    if (!Array.isArray(data.messages)) return Promise.resolve(false);
    var jobs = [];
    data.messages.forEach(function (msg) {
      if (!msg || !Array.isArray(msg.content)) return;
      var texts = [], shots = [], hasImage = false;
      var parts = msg.content.map(function (part) {
        if (part && part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') {
          hasImage = true;
          var slot = { text: '' };
          shots.push(slot);
          jobs.push(ocrImage(part.image_url.url).then(function (t) { slot.text = t; }));
          return null;
        }
        if (part && part.type === 'text' && typeof part.text === 'string') texts.push(part.text);
        else if (typeof part === 'string') texts.push(part);
        return part;
      });
      if (!hasImage) return;
      jobs.push(Promise.resolve().then(function () {
        msg.__dlPending = { texts: texts, shots: shots, parts: parts };
      }));
    });
    if (!jobs.length) return Promise.resolve(false);
    return Promise.all(jobs).then(function () {
      var changed = false;
      data.messages.forEach(function (msg) {
        var p = msg && msg.__dlPending;
        if (!p) return;
        delete msg.__dlPending;
        var blocks = p.shots.map(function (s) { return ocrBlock(s.text); });
        // В модель уходит: текст со скрина + сам запрос пользователя.
        msg.content = blocks.concat(p.texts).join('\n\n');
        changed = true;
      });
      return changed;
    });
  }

  /** Родной формат Gemini: contents[].parts[] с inline_data / inlineData. */
  function ocrifyGemini(data) {
    if (!Array.isArray(data.contents)) return Promise.resolve(false);
    var jobs = [], changed = false;
    data.contents.forEach(function (c) {
      if (!c || !Array.isArray(c.parts)) return;
      c.parts.forEach(function (part, i) {
        var inline = part && (part.inline_data || part.inlineData);
        if (!inline || typeof inline.data !== 'string') return;
        var mime = inline.mime_type || inline.mimeType || 'image/png';
        changed = true;
        jobs.push(ocrImage('data:' + mime + ';base64,' + inline.data).then(function (t) {
          c.parts[i] = { text: ocrBlock(t) };
        }));
      });
    });
    if (!jobs.length) return Promise.resolve(false);
    return Promise.all(jobs).then(function () { return changed; });
  }

  /** Тело запроса -> то же тело, но со скринами, заменёнными на текст. */
  function ocrifyBody(bodyStr) {
    if (typeof bodyStr !== 'string' || bodyStr.indexOf('base64,') < 0) return Promise.resolve(null);
    var data;
    try { data = JSON.parse(bodyStr); } catch (e) { return Promise.resolve(null); }
    return ocrifyOpenAI(data).then(function (a) {
      return ocrifyGemini(data).then(function (b) {
        if (!a && !b) return null;
        try { return JSON.stringify(data); } catch (e) { return null; }
      });
    }).catch(function () { return null; });
  }

  // ------------------------------------------------------------- fetch ----

  function isVyceBody(body) {
    if (typeof body !== 'string' || !body) return false;
    for (var i = 0; i < VYCE_MODEL_NAMES.length; i++) {
      if (body.indexOf('"' + VYCE_MODEL_NAMES[i] + '"') >= 0) return true;
    }
    return false;
  }

  function retarget(url) {
    // /api/proxy?url=... -> тот же релей, но с адресом Vyce
    var i = url.indexOf('?');
    var base = i < 0 ? url : url.slice(0, i);
    return base + '?url=' + encodeURIComponent(VYCE_URL);
  }

  /* Запросы к моделям идут через /api/proxy?url=<адрес провайдера>.
     Перед отправкой: скрины -> OCR-текст; для Vyce-моделей подменяется
     адрес провайдера. Само тело и разбор SSE остаются штатными. */
  function patchFetch() {
    if (window.__dlFetchPatched || !origFetch) return;

    window.fetch = function (input, init) {
      var url, body;
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
        body = init && typeof init.body === 'string' ? init.body : null;
      } catch (e) { return origFetch(input, init); }

      if (!url || url.indexOf('/api/proxy') < 0 || !body) return origFetch(input, init);

      return ocrifyBody(body).then(function (newBody) {
        var nextInit = init;
        if (newBody) {
          nextInit = {};
          for (var k in init) { if (Object.prototype.hasOwnProperty.call(init, k)) nextInit[k] = init[k]; }
          nextInit.body = newBody;
        }
        var effective = newBody || body;
        var nextUrl = url;
        if (isVyceBody(effective) && url.indexOf(VYCE_HOST) < 0) nextUrl = retarget(url);
        if (nextUrl === url && nextInit === init) return origFetch(input, init);
        if (typeof input === 'string') return origFetch(nextUrl, nextInit);
        return origFetch(new Request(nextUrl, input), nextInit);
      }).catch(function () { return origFetch(input, init); });
    };
    window.__dlFetchPatched = true;
  }

  // ------------------------------------------------------------ модели ----

  // Аватары брендов, которых может не быть в AV-карте.
  function patchAvatars() {
    try {
      if (typeof AV === 'undefined' || !AV) return;
      if (!AV.anthropic) {
        AV.anthropic = {
          bg: '#d97757',
          svg: '<svg viewBox="0 0 24 24"><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="Arial,sans-serif">C</text></svg>'
        };
      }
      if (!AV.deepseek) {
        AV.deepseek = {
          bg: '#4d6bfe',
          svg: '<svg viewBox="0 0 24 24"><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="Arial,sans-serif">D</text></svg>'
        };
      }
    } catch (e) {}
  }

  function patchModels() {
    if (typeof MODELS === 'undefined' || !MODELS) return false;
    if (MODELS['vy-sonnet5'] && MODELS['cb-glm47']) return true;

    var old = {}, keys = Object.keys(MODELS);
    keys.forEach(function (k) { old[k] = MODELS[k]; delete MODELS[k]; });
    ORDER.forEach(function (k) { MODELS[k] = EXTRA[k]; });
    keys.forEach(function (k) { if (ORDER.indexOf(k) < 0) MODELS[k] = old[k]; });
    return true;
  }

  // Авто-перебор: Vyce первым, затем Cerebras, дальше как было.
  function patchFallback() {
    try {
      if (typeof FALLBACK_ORDER === 'undefined' || !FALLBACK_ORDER || !FALLBACK_ORDER.splice) return;
      var add = ORDER.filter(function (k) { return FALLBACK_ORDER.indexOf(k) < 0; });
      if (add.length) FALLBACK_ORDER.unshift.apply(FALLBACK_ORDER, add);
    } catch (e) {}
  }

  function selectModel(id) {
    try { if (typeof currentModel !== 'undefined') currentModel = id; } catch (e) {}
    var fns = ['pickModel', 'selectModel', 'setModel', 'chooseModel'];
    for (var i = 0; i < fns.length; i++) {
      if (typeof window[fns[i]] === 'function') { try { window[fns[i]](id); return; } catch (e) {} }
    }
    var lbl = document.getElementById('mpLabel');
    if (lbl && EXTRA[id]) lbl.textContent = EXTRA[id].name;
  }

  /* Модель по умолчанию — Claude Sonnet 5 через Vyce. Собственный выбор
     пользователя не перебиваем — кроме старого дефолта or-gemma4. */
  function applyDefault() {
    try {
      var saved = localStorage.getItem('dl_model');
      if (saved && saved !== 'or-gemma4' && typeof MODELS !== 'undefined' && MODELS[saved]) {
        if (EXTRA[saved]) selectModel(saved);
        return;
      }
      localStorage.setItem('dl_model', DEFAULT_MODEL);
      selectModel(DEFAULT_MODEL);
    } catch (e) {}
  }

  function refreshMenus() {
    ['buildModelMenu', 'renderModelMenu', 'renderModels', 'initModelMenu', 'fillModelMenu', 'updateModelPill', 'syncModelPill']
      .forEach(function (fn) {
        try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {}
      });
  }

  function apply() {
    patchFetch();
    patchAvatars();
    if (!patchModels()) return;
    patchFallback();
    applyDefault();
    refreshMenus();
  }

  apply();
  document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('load', apply);
})();
