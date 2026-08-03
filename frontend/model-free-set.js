/* Design Lab — единый список бесплатных моделей.
   На него опираются и группы в меню, и блокировка выбора.
   Всё, чего здесь нет, считается платным (PRO) — включая модели SeekAI. */
(function () {
  'use strict';
  var IDS = [
    'google/gemma-4-31b-it:free', 'nvidia/nemotron-3-ultra-550b-a55b:free',
    'openai/gpt-oss-20b:free', 'cohere/north-mini-code:free', 'openrouter/free',
    'zai-glm-4.7', 'gpt-oss-120b', 'gemma-4-31b',
    'Qwen3.6-35B-A3B', 'glm-4.6', 'kiwi::glm-4.6',
    'mistral-large-latest', 'mistral-large',
    'glm-4.5v', 'GLM-4.5V', 'zai-glm-4.5v'
  ];
  var NAMES = [
    'qwen 3.6 35b a3b', 'glm-4.6', 'glm 4.6', 'mistral large', 'glm-4.5v', 'glm 4.5v'
  ];

  var ids = {};
  IDS.forEach(function (id) {
    ids[id] = true;
    ids[String(id).toLowerCase()] = true;
  });

  function norm(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  window.dlIsFreeModel = function (model) {
    if (!model) return false;
    if (typeof model === 'string') {
      return !!ids[model] || !!ids[model.toLowerCase()] || NAMES.indexOf(norm(model)) >= 0;
    }
    if (model.provider === 'seekai') return false;
    var id = model.model || model.id || '';
    if (ids[id] || ids[String(id).toLowerCase()]) return true;
    return NAMES.indexOf(norm(model.name)) >= 0;
  };
})();
