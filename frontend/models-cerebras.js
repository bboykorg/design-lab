/* Возвращает модели Cerebras в списки моделей.
 *
 * Ключи снова заданы на сервере (CEREBRAS_API_KEYS в Render), запросы идут
 * через /api/proxy, который уже разрешает api.cerebras.ai. Патч вынесен в
 * отдельный файл, потому что index.html — единый файл на ~700 КБ; backend
 * подставляет <script src="/models-cerebras.js"> перед </body>.
 *
 * Новые модели OpenRouter не трогаются — они остаются в списке как есть.
 */
(function () {
  'use strict';

  var GROUP = 'Сверхбыстрые \u00b7 Cerebras';
  var CB = {
    'cb-glm47':   { name: 'GLM 4.7',       desc: '355B \u00b7 лучший для кода',            provider: 'cerebras', model: 'zai-glm-4.7', brand: 'glm',    group: GROUP },
    'cb-gpt-oss': { name: 'GPT-OSS 120B',  desc: 'OpenAI \u00b7 рассуждающая',              provider: 'cerebras', model: 'gpt-oss-120b', brand: 'openai', group: GROUP },
    'cb-gemma4':  { name: 'Gemma 4 31B',   desc: 'Google \u00b7 самая быстрая (Cerebras)',  provider: 'cerebras', model: 'gemma-4-31b', brand: 'google', group: GROUP }
  };
  var CB_KEYS = ['cb-glm47', 'cb-gpt-oss', 'cb-gemma4'];

  // Cerebras-модели встают в начало MODELS, порядок остальных сохраняется.
  function patchModels() {
    if (typeof MODELS === 'undefined' || !MODELS) return false;
    if (MODELS['cb-glm47']) return true;
    var old = {};
    var keys = Object.keys(MODELS);
    keys.forEach(function (k) { old[k] = MODELS[k]; delete MODELS[k]; });
    CB_KEYS.forEach(function (k) { MODELS[k] = CB[k]; });
    keys.forEach(function (k) { MODELS[k] = old[k]; });
    return true;
  }

  function patchFallback() {
    try {
      if (typeof FALLBACK_ORDER === 'undefined' || !FALLBACK_ORDER || !FALLBACK_ORDER.splice) return;
      var add = CB_KEYS.filter(function (k) { return FALLBACK_ORDER.indexOf(k) < 0; });
      if (add.length) FALLBACK_ORDER.unshift.apply(FALLBACK_ORDER, add);
    } catch (e) {}
  }

  // Если пользователь раньше выбрал модель Cerebras — вернуть его выбор.
  function restoreSaved() {
    try {
      var saved = localStorage.getItem('dl_model');
      if (!saved || CB_KEYS.indexOf(saved) < 0) return;
      try { if (typeof currentModel !== 'undefined') currentModel = saved; } catch (e) {}
      var fns = ['pickModel', 'selectModel', 'setModel', 'chooseModel'];
      for (var i = 0; i < fns.length; i++) {
        if (typeof window[fns[i]] === 'function') { window[fns[i]](saved); return; }
      }
      var lbl = document.getElementById('mpLabel');
      if (lbl) lbl.textContent = CB[saved].name;
    } catch (e) {}
  }

  // Перерисовать меню моделей, если оно уже было собрано.
  function refreshMenus() {
    ['buildModelMenu', 'renderModelMenu', 'renderModels', 'initModelMenu', 'fillModelMenu', 'updateModelPill', 'syncModelPill']
      .forEach(function (fn) {
        try { if (typeof window[fn] === 'function') window[fn](); } catch (e) {}
      });
  }

  function apply() {
    if (!patchModels()) return;
    patchFallback();
    restoreSaved();
    refreshMenus();
  }

  apply();
  document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('load', apply);
})();
