/* Патч Design Lab: списки моделей + OCR скриншотов.
 *
 * index.html — единый файл на ~700 КБ, поэтому правки живут здесь; backend
 * подставляет <script src="/models-patch.js"> перед </body>.
 *
 * Что делает:
 *  1) добавляет модели AgentRouter и возвращает модели Cerebras;
 *  2) прогоняет любой скриншот через OCR.space (/api/ocr) и подставляет
 *     распознанный текст в запрос — так картинку «видит» любая модель;
 *  3) хранит готовые модели Vyce AI — сейчас отключены, см. VYCE_ENABLED.
 *
 * ПОЧЕМУ VYCE ОТКЛЮЧЁН: vyceai.com закрыт Cloudflare Managed Challenge —
 * все запросы к /v1/* с серверного IP получают 403 и HTML-страницу проверки
 * браузера вместо ответа API (см. GET /api/vyce/check). Ключи и адреса при
 * этом верные, поэтому код оставлен целиком: модели просто скрыты из
 * интерфейса. Включить обратно: VYCE_ENABLED = true ниже (или без деплоя —
 * window.DL_VYCE_ENABLED = true; location.reload();).
 */
(function () {
  'use strict';

  /* Выключатели провайдеров в интерфейсе. */
  function flag(name, def) {
    return (typeof window[name] === 'boolean') ? window[name] : def;
  }
  var AR_ENABLED = flag('DL_AGENTROUTER_ENABLED', true);
  var VYCE_ENABLED = flag('DL_VYCE_ENABLED', false);

  var AR_GROUP = 'AgentRouter \u00b7 топ';
  var VY_GROUP = 'Vyce AI \u00b7 основные';
  var CB_GROUP = 'Сверхбыстрые \u00b7 Cerebras';
  var OCR_ENDPOINT = '/api/ocr';
  var OCR_HEAD = '\u0422\u0435\u043a\u0441\u0442 \u0441\u043e \u0441\u043a\u0440\u0438\u043d\u0448\u043e\u0442\u0430 (OCR)';

  /* Куда на самом деле идут запросы. Та же маршрутизация по имени модели
     повторена на бэкенде (backend/proxy.py) — для путей, где запрос уходит
     мимо fetch. */
  var GATEWAYS = {
    ar:   { url: 'https://agentrouter.org/v1/chat/completions', host: 'agentrouter.org' },
    vyce: { url: 'https://vyceai.com/v1/chat/completions',      host: 'vyceai.com' }
  };

  /* provider: 'cerebras' у шлюзовых моделей не опечатка: берётся готовый
     OpenAI-совместимый путь запроса из index.html, а настоящий адрес и ключ
     подставляет бэкенд по имени модели. */
  var EXTRA = {
    'ar-opus46':    { name: 'Claude Opus 4.6',       desc: 'AgentRouter \u00b7 самая сильная',   provider: 'cerebras', model: 'claude-opus-4-6',       brand: 'anthropic', group: AR_GROUP, gw: 'ar' },
    'ar-gpt55':     { name: 'GPT-5.5',               desc: 'AgentRouter \u00b7 OpenAI',           provider: 'cerebras', model: 'gpt-5.5',               brand: 'openai',    group: AR_GROUP, gw: 'ar' },
    'ar-kimi':      { name: 'Kimi K3',               desc: 'AgentRouter \u00b7 длинный контекст', provider: 'cerebras', model: 'kimi-k3',               brand: 'kimi',      group: AR_GROUP, gw: 'ar' },
    'vy-sonnet5':   { name: 'Claude Sonnet 5',       desc: 'Anthropic \u00b7 лучший для кода',  provider: 'cerebras', model: 'claude-sonnet-5',       brand: 'anthropic', group: VY_GROUP, gw: 'vyce' },
    'vy-sonnet46':  { name: 'Claude Sonnet 4.6',     desc: 'Anthropic \u00b7 надёжная рабочая', provider: 'cerebras', model: 'claude-sonnet-4-6',     brand: 'anthropic', group: VY_GROUP, gw: 'vyce' },
    'vy-haiku45':   { name: 'Claude Haiku 4.5',      desc: 'Anthropic \u00b7 быстрая и дешёвая', provider: 'cerebras', model: 'claude-haiku-4-5',      brand: 'anthropic', group: VY_GROUP, gw: 'vyce' },
    'vy-deepseek':  { name: 'DeepSeek V4 Flash',     desc: 'DeepSeek \u00b7 код и математика',  provider: 'cerebras', model: 'deepseek-v4-flash',     brand: 'deepseek',  group: VY_GROUP, gw: 'vyce' },
    'vy-gemini':    { name: 'Gemini 3.6 Flash',      desc: 'Google \u00b7 с рассуждениями',    provider: 'cerebras', model: 'gemini-3.6-flash',      brand: 'gemini',    group: VY_GROUP, gw: 'vyce' },
    'vy-minimax':   { name: 'MiniMax M3',            desc: 'MiniMax \u00b7 с vision',            provider: 'cerebras', model: 'minimax-m3',            brand: 'minimax',   group: VY_GROUP, gw: 'vyce' },
    'vy-glm52':     { name: 'GLM 5.2',               desc: 'Z.ai \u00b7 бюджетная',             provider: 'cerebras', model: 'glm-5.2',               brand: 'glm',       group: VY_GROUP, gw: 'vyce' },
    'vy-mimo':      { name: 'MiMo v2.5 Pro',         desc: 'Xiaomi \u00b7 1M контекст',        provider: 'cerebras', model: 'mimo-v2.5-pro',         brand: 'mimo',      group: VY_GROUP, gw: 'vyce' },
    'vy-gem-lite':  { name: 'Gemini 3.1 Flash Lite', desc: 'Google \u00b7 самая дешёвая',     provider: 'cerebras', model: 'gemini-3.1-flash-lite', brand: 'gemini',    group: VY_GROUP, gw: 'vyce' },
    'cb-glm47':     { name: 'GLM 4.7',               desc: '355B \u00b7 лучший для кода',      provider: 'cerebras', model: 'zai-glm-4.7',           brand: 'glm',       group: CB_GROUP },
    'cb-gpt-oss':   { name: 'GPT-OSS 120B',          desc: 'OpenAI \u00b7 рассуждающая',        provider: 'cerebras', model: 'gpt-oss-120b',          brand: 'openai',    group: CB_GROUP },
    'cb-gemma4':    { name: 'Gemma 4 31B',           desc: 'Google \u00b7 самая быстрая',       provider: 'cerebras', model: 'gemma-4-31b',           brand: 'google',    group: CB_GROUP }
  };

  var AR_KEYS = ['ar-opus46', 'ar-gpt55', 'ar-kimi'];
  var VY_KEYS = ['vy-sonnet5', 'vy-sonnet46', 'vy-deepseek', 'vy-gemini', 'vy-minimax', 'vy-glm52', 'vy-mimo', 'vy-gem-lite', 'vy-haiku45'];
  var CB_KEYS = ['cb-glm47', 'cb-gpt-oss', 'cb-gemma4'];

  var OFF = [];                                    // что убрать из интерфейса
  if (!AR_ENABLED) OFF = OFF.concat(AR_KEYS);
  if (!VYCE_ENABLED) OFF = OFF.concat(VY_KEYS);

  var ORDER = (AR_ENABLED ? AR_KEYS : [])
    .concat(VYCE_ENABLED ? VY_KEYS : [])
    .concat(CB_KEYS);

  var LEGACY_DEFAULT = 'or-gemma4';                // исходный дефолт сайта
  var DEFAULT_MODEL = ORDER.length ? ORDER[0] : LEGACY_DEFAULT;

  // Имя модели -> шлюз, для подмены адреса в fetch.
  var MODEL_GW = {};
  Object.keys(EXTRA).forEach(function (k) {
    if (EXTRA[k].gw) MODEL_GW[EXTRA[k].model] = EXTRA[k].gw;
  });
  MODEL_GW['auto'] = 'vyce';

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
    var jobs = [], touched = [];
    data.messages.forEach(function (msg) {
      if (!msg || !Array.isArray(msg.content)) return;
      var texts = [], shots = [], hasImage = false;
      msg.content.forEach(function (part) {
        if (part && part.type === 'image_url' && part.image_url && typeof part.image_url.url === 'string') {
          hasImage = true;
          var slot = { text: '' };
          shots.push(slot);
          jobs.push(ocrImage(part.image_url.url).then(function (t) { slot.text = t; }));
        } else if (part && part.type === 'text' && typeof part.text === 'string') {
          texts.push(part.text);
        } else if (typeof part === 'string') {
          texts.push(part);
        }
      });
      if (hasImage) touched.push({ msg: msg, texts: texts, shots: shots });
    });
    if (!touched.length) return Promise.resolve(false);
    return Promise.all(jobs).then(function () {
      touched.forEach(function (t) {
        var blocks = t.shots.map(function (s) { return ocrBlock(s.text); });
        // В модель уходит: текст со скрина + сам запрос пользователя.
        t.msg.content = blocks.concat(t.texts).join('\n\n');
      });
      return true;
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

  /** По телу запроса понять, какому шлюзу принадлежит модель. */
  function gatewayOf(body) {
    if (typeof body !== 'string' || !body) return null;
    var names = Object.keys(MODEL_GW);
    for (var i = 0; i < names.length; i++) {
      if (body.indexOf('"' + names[i] + '"') >= 0) return MODEL_GW[names[i]];
    }
    return null;
  }

  function retarget(url, gwUrl) {
    var i = url.indexOf('?');
    var base = i < 0 ? url : url.slice(0, i);
    return base + '?url=' + encodeURIComponent(gwUrl);
  }

  /* Запросы к моделям идут через /api/proxy?url=<адрес провайдера>.
     Здесь: скрины -> OCR-текст и подмена адреса на нужный шлюз. */
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
        var gw = GATEWAYS[gatewayOf(newBody || body)];
        var nextUrl = (gw && url.indexOf(gw.host) < 0) ? retarget(url, gw.url) : url;
        if (nextUrl === url && nextInit === init) return origFetch(input, init);
        if (typeof input === 'string') return origFetch(nextUrl, nextInit);
        return origFetch(new Request(nextUrl, input), nextInit);
      }).catch(function () { return origFetch(input, init); });
    };
    window.__dlFetchPatched = true;
  }

  // ------------------------------------------------------------ модели ----

  function avatar(bg, letter) {
    return {
      bg: bg,
      svg: '<svg viewBox="0 0 24 24"><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="Arial,sans-serif">' + letter + '</text></svg>'
    };
  }

  // Аватары брендов, которых может не быть в AV-карте.
  function patchAvatars() {
    try {
      if (typeof AV === 'undefined' || !AV) return;
      if (!AV.anthropic) AV.anthropic = avatar('#d97757', 'C');
      if (!AV.deepseek) AV.deepseek = avatar('#4d6bfe', 'D');
      if (!AV.minimax) AV.minimax = avatar('#e8484a', 'M');
      if (!AV.mimo) AV.mimo = avatar('#ff6900', 'M');
      if (!AV.kimi) AV.kimi = avatar('#1f1f1f', 'K');
    } catch (e) {}
  }

  function patchModels() {
    if (typeof MODELS === 'undefined' || !MODELS) return false;

    // Вычищаем выключенные провайдеры (если успели добавиться раньше).
    OFF.forEach(function (k) { delete MODELS[k]; });
    if (window.__dlModelsPatched) return true;

    var old = {}, keys = Object.keys(MODELS);
    keys.forEach(function (k) { old[k] = MODELS[k]; delete MODELS[k]; });
    ORDER.forEach(function (k) { MODELS[k] = EXTRA[k]; });
    keys.forEach(function (k) { if (ORDER.indexOf(k) < 0) MODELS[k] = old[k]; });
    window.__dlModelsPatched = true;
    return true;
  }

  // Авто-перебор: сначала наши модели, дальше как было.
  function patchFallback() {
    try {
      if (typeof FALLBACK_ORDER === 'undefined' || !FALLBACK_ORDER || !FALLBACK_ORDER.splice) return;
      // Выключенные модели из цепочки убираем: иначе каждый запрос
      // будет тратить время на заведомо нерабочий провайдер.
      for (var i = FALLBACK_ORDER.length - 1; i >= 0; i--) {
        if (OFF.indexOf(FALLBACK_ORDER[i]) >= 0) FALLBACK_ORDER.splice(i, 1);
      }
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
    if (lbl && (EXTRA[id] || (typeof MODELS !== 'undefined' && MODELS[id]))) {
      lbl.textContent = (EXTRA[id] || MODELS[id]).name;
    }
  }

  /* Выбор модели: по умолчанию первая из включённых (сейчас Claude
     Opus 4.6). Осознанный выбор пользователя сохраняем, но если сохранённая
     модель выключена или исчезла — переключаем на рабочую. */
  function applyDefault() {
    try {
      var saved = localStorage.getItem('dl_model');
      var stale = saved && (OFF.indexOf(saved) >= 0 || (typeof MODELS !== 'undefined' && !MODELS[saved]));

      if (saved && !stale && saved !== LEGACY_DEFAULT) {
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
