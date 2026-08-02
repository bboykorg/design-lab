/* SeekAI (https://seekai.cc) — новый шлюз.

   Логика разделена между фронтом и бэком:
   • Модели, которых на сайте ещё нет, добавляются здесь и ходят в SeekAI напрямую.
   • Модели-дубли (claude-opus-4-8, claude-opus-5, claude-sonnet-5, deepseek-v4-flash)
     не трогаем: они работают через свой шлюз, а backend/seekai.py сам
     переключает их на ключи SeekAI, как только лимиты основного провайдера
     заканчиваются. Пользователь этого не замечает.

   Важно: MODELS/AV/FALLBACK_ORDER объявлены через const в index.html, поэтому
   их нет в window — обращаемся к ним по имени, как это делает models-patch.js. */
(function () {
  'use strict';
  if (window.__dlSeekaiPatched) return;

  var GROUP = 'SeekAI';
  var GW = { url: 'https://seekai.cc/v1/chat/completions', host: 'seekai.cc' };

  var NEW = {
    'sk-gpt55': { name: 'GPT-5.5', desc: 'Универсальная, быстрый ответ', model: 'gpt-5-5', brand: 'openai' },
    'sk-gpt56': { name: 'GPT-5.6', desc: 'Старшая модель OpenAI', model: 'gpt-5-6', brand: 'openai' },
    'sk-gpt56-terra': { name: 'GPT-5.6 Terra', desc: 'Длинные задачи и анализ', model: 'gpt-5-6-terra', brand: 'openai' },
    'sk-gpt56-sol': { name: 'GPT-5.6 Sol', desc: 'Баланс скорости и качества', model: 'gpt-5-6-sol', brand: 'openai' },
    'sk-opus47': { name: 'Claude Opus 4.7', desc: 'Аккуратный код и рассуждения', model: 'claude-opus-4-7', brand: 'anthropic' },
    'sk-fable5': { name: 'Claude Fable 5', desc: 'Тексты и креатив', model: 'claude-fable-5', brand: 'anthropic' },
    'sk-deepseek-pro': { name: 'DeepSeek V4 Pro', desc: 'Сильная логика, недорого', model: 'deepseek-v4-pro', brand: 'deepseek' },
    'sk-grok45': { name: 'Grok 4.5', desc: 'Актуальные данные, живой тон', model: 'grok-4-5', brand: 'xai' },
    'sk-qwen3max': { name: 'Qwen 3 Max', desc: 'Многоязычная, большой контекст', model: 'qwen-3-max', brand: 'qwen' }
  };

  // Монохромные аватарки — без цветных логотипов, как и весь интерфейс.
  var LETTERS = { openai: 'G', anthropic: 'C', deepseek: 'D', xai: 'X', qwen: 'Q' };
  function avatar(letter) {
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
      '<text x="12" y="17" text-anchor="middle" font-size="14" font-weight="700" ' +
      'font-family="Manrope,sans-serif" fill="#fff">' + letter + '</text></svg>';
  }

  function apply() {
    var models, avatars, fallback;
    try { models = MODELS; } catch (e) { return false; }
    if (!models || typeof models !== 'object') return false;

    try { avatars = AV; } catch (e) { avatars = null; }
    if (avatars) {
      Object.keys(LETTERS).forEach(function (brand) {
        if (!avatars[brand]) avatars[brand] = avatar(LETTERS[brand]);
      });
    }

    Object.keys(NEW).forEach(function (id) {
      var m = NEW[id];
      models[id] = {
        name: m.name, desc: m.desc, provider: 'seekai',
        model: m.model, brand: m.brand, group: GROUP, gw: GW
      };
    });

    // SeekAI встаёт в конец цепочки запасных моделей — как последний резерв.
    try { fallback = FALLBACK_ORDER; } catch (e) { fallback = null; }
    if (fallback && fallback.push) {
      ['sk-gpt55', 'sk-deepseek-pro', 'sk-qwen3max'].forEach(function (id) {
        if (fallback.indexOf(id) === -1) fallback.push(id);
      });
    }

    window.__dlSeekaiPatched = true;
    window.dlSeekaiModels = Object.keys(NEW);

    if (typeof window.buildModelMenu === 'function') {
      try { window.buildModelMenu(); } catch (e) { /* меню ещё не готово */ }
    }
    return true;
  }

  // Ждём, пока models-patch.js пересоберёт MODELS, чтобы наши ключи не стёрлись.
  function boot() {
    var tries = 0;
    var timer = setInterval(function () {
      var ready = window.__dlModelsPatched || tries > 12;
      if (ready && apply()) { clearInterval(timer); return; }
      if (++tries > 80) clearInterval(timer);
    }, 100);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
