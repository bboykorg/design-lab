/* Design Lab: KiwiLLM/Cerebras models, provider visibility flags and OCR.
 * Vyce remains hidden by default. Only the direct GOOGLE GEMINI section
 * (Gemini Pro + Gemini Flash) is additionally hidden by default.
 */
(function () {
  'use strict';

  function flag(name, def) {
    return typeof window[name] === 'boolean' ? window[name] : def;
  }

  var VYCE_ENABLED = flag('DL_VYCE_ENABLED', false);
  var GOOGLE_ENABLED = flag('DL_GOOGLE_ENABLED', false);
  var KIWI_GROUP = 'KiwiLLM · основные';
  var VY_GROUP = 'Vyce AI · основные';
  var CB_GROUP = 'Сверхбыстрые · Cerebras';
  var OCR_ENDPOINT = '/api/ocr';
  var OCR_HEAD = 'Текст со скриншота (OCR)';

  var GATEWAYS = {
    kiwi: { url: 'https://api.kiwillm.in/v1/chat/completions', host: 'api.kiwillm.in' },
    vyce: { url: 'https://vyceai.com/v1/chat/completions', host: 'vyceai.com' }
  };

  var EXTRA = {
    'vy-sonnet5':  { name: 'Claude Sonnet 5',       desc: 'Anthropic · лучший для кода',   provider: 'cerebras', model: 'claude-sonnet-5',       brand: 'anthropic', group: VY_GROUP, gw: 'vyce' },
    'vy-sonnet46': { name: 'Claude Sonnet 4.6',     desc: 'Anthropic · надёжная рабочая',  provider: 'cerebras', model: 'claude-sonnet-4-6',     brand: 'anthropic', group: VY_GROUP, gw: 'vyce' },
    'vy-haiku45':  { name: 'Claude Haiku 4.5',      desc: 'Anthropic · быстрая и дешёвая', provider: 'cerebras', model: 'claude-haiku-4-5',      brand: 'anthropic', group: VY_GROUP, gw: 'vyce' },
    'vy-deepseek': { name: 'DeepSeek V4 Flash',     desc: 'DeepSeek · код и математика',   provider: 'cerebras', model: 'deepseek-v4-flash',     brand: 'deepseek',  group: VY_GROUP, gw: 'vyce' },
    'vy-gemini':   { name: 'Gemini 3.6 Flash',      desc: 'Google · с рассуждениями',      provider: 'cerebras', model: 'gemini-3.6-flash',      brand: 'gemini',    group: VY_GROUP, gw: 'vyce' },
    'vy-minimax':  { name: 'MiniMax M3',            desc: 'MiniMax · с vision',             provider: 'cerebras', model: 'minimax-m3',            brand: 'minimax',   group: VY_GROUP, gw: 'vyce' },
    'vy-glm52':    { name: 'GLM 5.2',               desc: 'Z.ai · бюджетная',               provider: 'cerebras', model: 'glm-5.2',               brand: 'glm',       group: VY_GROUP, gw: 'vyce' },
    'vy-mimo':     { name: 'MiMo v2.5 Pro',         desc: 'Xiaomi · 1M контекст',          provider: 'cerebras', model: 'mimo-v2.5-pro',         brand: 'mimo',      group: VY_GROUP, gw: 'vyce' },
    'vy-gem-lite': { name: 'Gemini 3.1 Flash Lite', desc: 'Google · самая дешёвая',        provider: 'cerebras', model: 'gemini-3.1-flash-lite', brand: 'gemini',    group: VY_GROUP, gw: 'vyce' },

    'kiwi-deepseek': { name: 'DeepSeek V4 Flash', desc: 'KiwiLLM · код и рассуждения', provider: 'cerebras', model: 'DeepSeek-V4-Flash', brand: 'deepseek', group: KIWI_GROUP, gw: 'kiwi' },
    'kiwi-glm52':    { name: 'GLM 5.2',           desc: 'KiwiLLM · универсальная',      provider: 'cerebras', model: 'glm-5.2',           brand: 'glm',      group: KIWI_GROUP, gw: 'kiwi' },
    'kiwi-qwen36':   { name: 'Qwen 3.6 35B A3B', desc: 'KiwiLLM · быстрая MoE',        provider: 'cerebras', model: 'Qwen3.6-35B-A3B',   brand: 'qwen',     group: KIWI_GROUP, gw: 'kiwi' },

    'cb-glm47':   { name: 'GLM 4.7',      desc: '355B · лучший для кода', provider: 'cerebras', model: 'zai-glm-4.7',  brand: 'glm',    group: CB_GROUP },
    'cb-gpt-oss': { name: 'GPT-OSS 120B', desc: 'OpenAI · рассуждающая',  provider: 'cerebras', model: 'gpt-oss-120b', brand: 'openai', group: CB_GROUP },
    'cb-gemma4':  { name: 'Gemma 4 31B',  desc: 'Google · самая быстрая', provider: 'cerebras', model: 'gemma-4-31b',  brand: 'google', group: CB_GROUP }
  };

  var KIWI_KEYS = ['kiwi-deepseek', 'kiwi-glm52', 'kiwi-qwen36'];
  var VY_KEYS = ['vy-sonnet5', 'vy-sonnet46', 'vy-deepseek', 'vy-gemini', 'vy-minimax', 'vy-glm52', 'vy-mimo', 'vy-gem-lite', 'vy-haiku45'];
  var CB_KEYS = ['cb-glm47', 'cb-gpt-oss', 'cb-gemma4'];
  var DIRECT_GOOGLE_KEYS = ['gemini-pro', 'gemini-flash'];

  var OFF = [];
  if (!VYCE_ENABLED) OFF = OFF.concat(VY_KEYS);
  if (!GOOGLE_ENABLED) OFF = OFF.concat(DIRECT_GOOGLE_KEYS);

  var ORDER = KIWI_KEYS
    .concat(VYCE_ENABLED ? VY_KEYS : [])
    .concat(CB_KEYS)
    .filter(function (k) { return OFF.indexOf(k) < 0; });
  var DEFAULT_MODEL = ORDER[0] || 'or-nemotron';
  var LEGACY_DEFAULT = 'or-gemma4';

  var MODEL_GW = {};
  Object.keys(EXTRA).forEach(function (k) {
    var m = EXTRA[k];
    if (m.gw && OFF.indexOf(k) < 0) MODEL_GW[m.model] = m.gw;
  });

  var origFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  var ocrCache = {};

  function cacheKey(s) {
    return s.length + ':' + s.slice(0, 96) + ':' + s.slice(-48);
  }

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
      var text = j && typeof j.text === 'string' ? j.text.trim() : '';
      ocrCache[k] = text;
      return text;
    }).catch(function () { return ''; });
  }
  window.dlOcr = ocrImage;

  function ocrBlock(text) {
    return text ? '[' + OCR_HEAD + ']\n' + text : '[Скриншот приложен, но текст не распознан]';
  }

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
        t.msg.content = t.shots.map(function (s) { return ocrBlock(s.text); }).concat(t.texts).join('\n\n');
      });
      return true;
    });
  }

  function ocrifyGemini(data) {
    if (!Array.isArray(data.contents)) return Promise.resolve(false);
    var jobs = [];
    data.contents.forEach(function (item) {
      if (!item || !Array.isArray(item.parts)) return;
      item.parts.forEach(function (part, i) {
        var inline = part && (part.inline_data || part.inlineData);
        if (!inline || typeof inline.data !== 'string') return;
        var mime = inline.mime_type || inline.mimeType || 'image/png';
        jobs.push(ocrImage('data:' + mime + ';base64,' + inline.data).then(function (text) {
          item.parts[i] = { text: ocrBlock(text) };
        }));
      });
    });
    if (!jobs.length) return Promise.resolve(false);
    return Promise.all(jobs).then(function () { return true; });
  }

  function ocrifyBody(body) {
    if (typeof body !== 'string' || body.indexOf('base64,') < 0) return Promise.resolve(null);
    var data;
    try { data = JSON.parse(body); } catch (e) { return Promise.resolve(null); }
    return ocrifyOpenAI(data).then(function (openAIChanged) {
      return ocrifyGemini(data).then(function (geminiChanged) {
        return openAIChanged || geminiChanged ? JSON.stringify(data) : null;
      });
    }).catch(function () { return null; });
  }

  function gatewayOf(body) {
    if (typeof body !== 'string') return null;
    var names = Object.keys(MODEL_GW);
    for (var i = 0; i < names.length; i++) {
      if (body.indexOf('"' + names[i] + '"') >= 0) return MODEL_GW[names[i]];
    }
    return null;
  }

  function retarget(url, gatewayUrl) {
    var q = url.indexOf('?');
    return (q < 0 ? url : url.slice(0, q)) + '?url=' + encodeURIComponent(gatewayUrl);
  }

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
          Object.keys(init || {}).forEach(function (k) { nextInit[k] = init[k]; });
          nextInit.body = newBody;
        }
        var gateway = GATEWAYS[gatewayOf(newBody || body)];
        var nextUrl = gateway && url.indexOf(gateway.host) < 0 ? retarget(url, gateway.url) : url;
        if (typeof input === 'string') return origFetch(nextUrl, nextInit);
        return origFetch(new Request(nextUrl, input), nextInit);
      }).catch(function () { return origFetch(input, init); });
    };
    window.__dlFetchPatched = true;
  }

  function avatar(bg, letter) {
    return { bg: bg, svg: '<svg viewBox="0 0 24 24"><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="Arial,sans-serif">' + letter + '</text></svg>' };
  }

  function patchAvatars() {
    try {
      if (typeof AV === 'undefined' || !AV) return;
      if (!AV.anthropic) AV.anthropic = avatar('#d97757', 'C');
      if (!AV.deepseek) AV.deepseek = avatar('#4d6bfe', 'D');
      if (!AV.minimax) AV.minimax = avatar('#e8484a', 'M');
      if (!AV.mimo) AV.mimo = avatar('#ff6900', 'M');
      if (!AV.qwen) AV.qwen = avatar('#615ced', 'Q');
    } catch (e) {}
  }

  function patchModels() {
    if (typeof MODELS === 'undefined' || !MODELS) return false;
    OFF.forEach(function (k) { delete MODELS[k]; });
    if (window.__dlModelsPatched) return true;
    var old = {}, keys = Object.keys(MODELS);
    keys.forEach(function (k) { old[k] = MODELS[k]; delete MODELS[k]; });
    ORDER.forEach(function (k) { MODELS[k] = EXTRA[k]; });
    keys.forEach(function (k) {
      if (ORDER.indexOf(k) < 0 && OFF.indexOf(k) < 0) MODELS[k] = old[k];
    });
    window.__dlModelsPatched = true;
    return true;
  }

  function patchFallback() {
    try {
      if (typeof FALLBACK_ORDER === 'undefined' || !FALLBACK_ORDER || !FALLBACK_ORDER.splice) return;
      for (var i = FALLBACK_ORDER.length - 1; i >= 0; i--) {
        if (OFF.indexOf(FALLBACK_ORDER[i]) >= 0) FALLBACK_ORDER.splice(i, 1);
      }
      var add = ORDER.filter(function (k) { return FALLBACK_ORDER.indexOf(k) < 0; });
      if (add.length) FALLBACK_ORDER.unshift.apply(FALLBACK_ORDER, add);
    } catch (e) {}
  }

  function selectModel(id) {
    try { if (typeof currentModel !== 'undefined') currentModel = id; } catch (e) {}
    ['pickModel', 'selectModel', 'setModel', 'chooseModel'].some(function (name) {
      if (typeof window[name] !== 'function') return false;
      try { window[name](id); return true; } catch (e) { return false; }
    });
    var label = document.getElementById('mpLabel');
    if (label && EXTRA[id]) label.textContent = EXTRA[id].name;
  }

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
    ['buildModelMenu', 'renderModelMenu', 'renderModels', 'initModelMenu', 'fillModelMenu', 'updateModelPill', 'syncModelPill'].forEach(function (name) {
      try { if (typeof window[name] === 'function') window[name](); } catch (e) {}
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
