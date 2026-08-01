/* Design Lab — show plans, not technical provider names, in the model menu. */
(function () {
  'use strict';
  var FREE = {
    'zai-glm-4.7': true, 'gpt-oss-120b': true, 'gemma-4-31b': true,
    'google/gemma-4-31b-it:free': true, 'nvidia/nemotron-3-ultra-550b-a55b:free': true,
    'openai/gpt-oss-20b:free': true, 'cohere/north-mini-code:free': true, 'openrouter/free': true
  };
  var PROVIDERS = /\b(GoRouter|KiwiLLM|Vyce(?:\s*AI)?|Cerebras|OpenRouter|Anthropic|OpenAI|Google|DeepSeek|Z\.ai|Xiaomi)\b\s*·?\s*/gi;

  function apply() {
    try {
      if (typeof MODELS === 'undefined' || !MODELS) return false;
      Object.keys(MODELS).forEach(function (id) {
        var model = MODELS[id];
        if (!model) return;
        model.group = FREE[model.model || ''] ? 'FREE' : 'PRO';
        if (typeof model.desc === 'string') {
          model.desc = model.desc.replace(PROVIDERS, '').replace(/^\s*·\s*/, '').replace(/\s{2,}/g, ' ').trim();
        }
      });
      ['buildModelMenu', 'renderModelMenu', 'renderModels', 'initModelMenu', 'fillModelMenu', 'updateModelPill', 'syncModelPill'].forEach(function (name) {
        try { if (typeof window[name] === 'function') window[name](); } catch (e) {}
      });
      return true;
    } catch (e) { return false; }
  }
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('load', apply);
})();
