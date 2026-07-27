/* Патч списков моделей Design Lab.
 *
 * index.html — единый файл на ~700 КБ, поэтому правки списка моделей живут
 * здесь; backend подставляет <script src="/models-patch.js"> перед </body>.
 *
 * Что делает:
 *  1) возвращает модели Cerebras (ключи CEREBRAS_API_KEYS снова живые);
 *  2) добавляет Claude Sonnet 5 — прямой ключ Anthropic (ANTHROPIC_API_KEYS)
 *     и вариант через OpenRouter.
 * Всё идёт через /api/proxy, ключи остаются на сервере.
 * Новые модели OpenRouter из основного списка не трогаются.
 */
(function () {
  'use strict';

  var CB_GROUP = 'Сверхбыстрые \u00b7 Cerebras';
  var CL_GROUP = 'Claude \u00b7 Anthropic';
  var ANTHROPIC_URL = 'https://api.anthropic.com/v1/chat/completions';

  var EXTRA = {
    'an-sonnet5':  { name: 'Claude Sonnet 5',      desc: 'Anthropic \u00b7 прямой ключ',        provider: 'anthropic',  model: 'claude-sonnet-5',           brand: 'anthropic', group: CL_GROUP },
    'or-sonnet5':  { name: 'Claude Sonnet 5 (OR)', desc: 'Anthropic \u00b7 через OpenRouter',    provider: 'openrouter', model: 'anthropic/claude-sonnet-5', brand: 'anthropic', group: CL_GROUP },
    'cb-glm47':    { name: 'GLM 4.7',              desc: '355B \u00b7 лучший для кода',           provider: 'cerebras',   model: 'zai-glm-4.7',              brand: 'glm',       group: CB_GROUP },
    'cb-gpt-oss':  { name: 'GPT-OSS 120B',         desc: 'OpenAI \u00b7 рассуждающая',             provider: 'cerebras',   model: 'gpt-oss-120b',             brand: 'openai',    group: CB_GROUP },
    'cb-gemma4':   { name: 'Gemma 4 31B',          desc: 'Google \u00b7 самая быстрая (Cerebras)', provider: 'cerebras',   model: 'gemma-4-31b',              brand: 'google',    group: CB_GROUP }
  };
  // Порядок в меню: Claude и Cerebras встают перед остальными.
  var ORDER = ['an-sonnet5', 'or-sonnet5', 'cb-glm47', 'cb-gpt-oss', 'cb-gemma4'];
  var CB_KEYS = ['cb-glm47', 'cb-gpt-oss', 'cb-gemma4'];

  // Аватар бренда Claude в AV-карте.
  function patchAvatars() {
    try {
      if (typeof AV === 'undefined' || !AV || AV.anthropic) return;
      AV.anthropic = {
        bg: '#d97757',
        svg: '<svg viewBox="0 0 24 24"><text x="12" y="16.5" text-anchor="middle" font-size="12" font-weight="800" fill="#fff" font-family="Arial,sans-serif">C</text></svg>'
      };
    } catch (e) {}
  }

  /* Для прямого Anthropic нужен endpoint в карте провайдеров index.html. Имя
     карты неизвестно, поэтому ищем объект, у которого есть ключ cerebras с
     адресом api.cerebras.ai, и клонируем его запись под anthropic. */
  function registerAnthropicEndpoint() {
    var found = false;

    function tryMap(map) {
      if (!map || typeof map !== 'object') return;
      var cer;
      try { cer = map.cerebras; } catch (e) { return; }
      if (cer === undefined || cer === null) return;
      try {
        if (typeof cer === 'string') {
          if (cer.indexOf('cerebras') < 0) return;
          if (!map.anthropic) map.anthropic = ANTHROPIC_URL;
          found = true;
        } else if (typeof cer === 'object') {
          var clone = {}, hit = false;
          Object.keys(cer).forEach(function (k) {
            var v = cer[k];
            if (typeof v === 'string' && v.indexOf('cerebras') >= 0) { clone[k] = ANTHROPIC_URL; hit = true; }
            else clone[k] = v;
          });
          if (!hit) return;
          if (!map.anthropic) map.anthropic = clone;
          found = true;
        }
      } catch (e) {}
    }

    // 1) обычные глобалы
    try {
      Object.keys(window).forEach(function (n) {
        var v; try { v = window[n]; } catch (e) { return; }
        if (v && typeof v === 'object' && v !== window) tryMap(v);
      });
    } catch (e) {}

    // 2) const/let на верхнем уровне (в window их нет) — пробуем известные имена
    ['PROV', 'PROVS', 'PROVIDER', 'PROVIDERS', 'PROVIDER_URLS', 'PROVIDER_MAP', 'PROVIDER_CFG',
     'ENDPOINT', 'ENDPOINTS', 'API', 'APIS', 'API_URLS', 'URLS', 'HOSTS', 'BASE_URLS', 'EP']
      .forEach(function (n) {
        var v;
        try { v = eval(n); } catch (e) { return; }  // eslint-disable-line no-eval
        if (v && typeof v === 'object') tryMap(v);
      });

    return found;
  }

  function patchModels(anthropicReady) {
    if (typeof MODELS === 'undefined' || !MODELS) return false;
    if (MODELS['cb-glm47'] && (MODELS['an-sonnet5'] || !anthropicReady)) return true;

    var add = ORDER.filter(function (k) {
      return k !== 'an-sonnet5' || anthropicReady;  // не показываем нерабочий пункт
    });
    var old = {}, keys = Object.keys(MODELS);
    keys.forEach(function (k) { old[k] = MODELS[k]; delete MODELS[k]; });
    add.forEach(function (k) { MODELS[k] = EXTRA[k]; });
    keys.forEach(function (k) { if (add.indexOf(k) < 0) MODELS[k] = old[k]; });
    return true;
  }

  // Авто-перебор — только Cerebras: Claude платный, его выбирают вручную.
  function patchFallback() {
    try {
      if (typeof FALLBACK_ORDER === 'undefined' || !FALLBACK_ORDER || !FALLBACK_ORDER.splice) return;
      var add = CB_KEYS.filter(function (k) { return FALLBACK_ORDER.indexOf(k) < 0; });
      if (add.length) FALLBACK_ORDER.unshift.apply(FALLBACK_ORDER, add);
    } catch (e) {}
  }

  // Если выбранная раньше модель из наших — вернуть её выбор.
  function restoreSaved() {
    try {
      var saved = localStorage.getItem('dl_model');
      if (!saved || !EXTRA[saved] || typeof MODELS === 'undefined' || !MODELS[saved]) return;
      try { if (typeof currentModel !== 'undefined') currentModel = saved; } catch (e) {}
      var fns = ['pickModel', 'selectModel', 'setModel', 'chooseModel'];
      for (var i = 0; i < fns.length; i++) {
        if (typeof window[fns[i]] === 'function') { window[fns[i]](saved); return; }
      }
      var lbl = document.getElementById('mpLabel');
      if (lbl) lbl.textContent = EXTRA[saved].name;
    } catch (e) {}
  }

  function refreshMenus() {
    ['buildModelMenu', 'renderModelMenu', 'renderModels', 'initModelMenu', 'fillModelMenu', 'updateModelPill', 'syncModelPill']
      .forEach(function (fn) {
        try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {}
      });
  }

  function apply() {
    patchAvatars();
    if (!patchModels(registerAnthropicEndpoint())) return;
    patchFallback();
    restoreSaved();
    refreshMenus();
  }

  apply();
  document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('load', apply);
})();
