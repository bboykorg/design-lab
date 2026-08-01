/* Design Lab — show plans, not technical provider names, in the model menu. */
(function () {
  'use strict';
  var PROVIDERS = /\b(GoRouter|KiwiLLM|Vyce(?:\s*AI)?|Cerebras|OpenRouter|Anthropic|OpenAI|Google|DeepSeek|Z\.ai|Xiaomi|BigModel|NVIDIA|Cohere|MiniMax|Qwen|Mistral)\b\s*·?\s*/gi;
  var rebuilt = false;

  function isFree(model) {
    return typeof window.dlIsFreeModel === 'function' ? window.dlIsFreeModel(model) : false;
  }
  function apply() {
    try {
      if (typeof MODELS === 'undefined' || !MODELS) return;
      Object.keys(MODELS).forEach(function (id) {
        var model = MODELS[id];
        if (!model) return;
        model.group = isFree(model) ? 'FREE' : 'PRO';
        if (typeof model.desc === 'string') {
          model.desc = model.desc.replace(PROVIDERS, '').replace(/^\s*·\s*/, '').replace(/\s{2,}/g, ' ').trim();
        }
      });
      /* Rebuild only the model list. Calling every menu initializer caused a stuck full-screen backdrop. */
      if (!rebuilt && typeof window.buildModelMenu === 'function') {
        rebuilt = true;
        var menu = document.getElementById('modelMenu');
        var wasOpen = !!(menu && menu.classList.contains('on'));
        window.buildModelMenu();
        if (menu) menu.classList.toggle('on', wasOpen);
      }
    } catch (e) {}
  }
  apply();
  document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('load', apply);
})();
