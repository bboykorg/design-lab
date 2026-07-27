/* Патч списков моделей Design Lab.
 *
 * index.html — единый файл на ~700 КБ, поэтому правки списка моделей живут
 * здесь; backend подставляет <script src="/models-patch.js"> перед </body>.
 *
 * Что делает:
 *  1) добавляет модели Vyce AI (claude-sonnet-5, deepseek-v4-flash,
 *     gemini-3.6-flash) — первыми в меню, первыми в авто-переборе,
 *     claude-sonnet-5 — модель по умолчанию;
 *  2) возвращает модели Cerebras.
 *
 * Vyce говорит на OpenAI-совместимом /v1/chat/completions, поэтому его модели
 * используют тот же код запроса, а обёртка fetch подменяет адрес провайдера
 * в /api/proxy?url=... на api.vyceai.com. Ключ (VYCE_API_KEYS) живёт на сервере.
 */
(function () {
  'use strict';

  var VYCE_URL = 'https://api.vyceai.com/v1/chat/completions';
  var VY_GROUP = 'Vyce AI \u00b7 основные';
  var CB_GROUP = 'Сверхбыстрые \u00b7 Cerebras';

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

  /* Запросы идут через /api/proxy?url=<адрес провайдера>. Если в теле стоит
     одна из Vyce-моделей — подменяем адрес на api.vyceai.com. Тело и разбор
     SSE остаются теми же — API OpenAI-совместимое. */
  function patchFetch() {
    if (window.__dlVycePatched || typeof window.fetch !== 'function') return;
    var orig = window.fetch.bind(window);

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

    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf('/api/proxy') >= 0) {
          var body = init && typeof init.body === 'string' ? init.body : null;
          if (isVyceBody(body) && url.indexOf('api.vyceai.com') < 0) {
            var next = retarget(url);
            if (typeof input === 'string') return orig(next, init);
            return orig(new Request(next, input), init);
          }
        }
      } catch (e) {}
      return orig(input, init);
    };
    window.__dlVycePatched = true;
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
