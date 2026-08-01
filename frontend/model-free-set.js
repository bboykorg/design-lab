/* Design Lab — single source of truth for which models the Free plan includes. */
(function () {
  'use strict';
  var FREE_MODEL_IDS = {
    /* Cerebras */
    'zai-glm-4.7': true, 'gpt-oss-120b': true, 'gemma-4-31b': true,
    /* OpenRouter free tier */
    'google/gemma-4-31b-it:free': true, 'nvidia/nemotron-3-ultra-550b-a55b:free': true,
    'openai/gpt-oss-20b:free': true, 'cohere/north-mini-code:free': true, 'openrouter/free': true,
    /* Added to Free by request */
    'Qwen3.6-35B-A3B': true, 'qwen3.6-35b-a3b': true,
    'glm-4.6': true, 'kiwi::glm-4.6': true,
    'mistral-large-latest': true, 'mistral-large': true,
    'glm-4.5v': true, 'GLM-4.5V': true, 'zai-glm-4.5v': true, 'glm-4.5-v': true
  };
  var FREE_NAMES = {
    'qwen 3.6 35b a3b': true, 'glm-4.6': true, 'glm 4.6': true,
    'mistral large': true, 'glm-4.5v': true, 'glm 4.5v': true
  };
  function norm(value) { return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  window.dlIsFreeModel = function (model) {
    if (!model) return false;
    if (FREE_MODEL_IDS[model.model || '']) return true;
    if (FREE_MODEL_IDS[norm(model.model)]) return true;
    return !!FREE_NAMES[norm(model.name)];
  };
})();
