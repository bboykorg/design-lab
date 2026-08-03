/* SeekAI (https://seekai.cc) — дополнительные модели.

   Логика разделена между фронтом и бэком:
   • Модели, которых на сайте ещё нет, добавляются здесь и ходят в SeekAI напрямую.
   • Модели-дубли не трогаем: backend/seekai.py сам переключает их на SeekAI,
     когда лимиты основного провайдера заканчиваются.

   Имена моделей здесь — наши внутренние. В каталожные имена SeekAI их переводит
   сервер (backend/seekai.py, FALLBACK_MODEL) — у провайдера часть моделей через точку,
   часть через дефис. Qwen 3 Max убран: его нет в каталоге SeekAI, выбор такой
   модели всегда заканчивался молчаливым переходом на другую модель.

   Группа в меню — всегда PRO: это платные модели. Группу ставим явно:
   model-plan-groups.js отрабатывает раньше, чем эти модели появляются в MODELS,
   и без явной метки они падали в список бесплатных. Названия провайдера
   в списке нет — только деление по тарифам.

   Важно: MODELS/AV/FALLBACK_ORDER объявлены через const в index.html, поэтому
   их нет в window — обращаемся к ним по имени, как это делает models-patch.js. */
(function () {
  'use strict';
  if (window.__dlSeekaiPatched) return;

  var GROUP = 'PRO';
  var GW = { url: 'https://seekai.cc/v1/chat/completions', host: 'seekai.cc' };

  var NEW = {
    'sk-gpt55': { name: 'GPT-5.5', desc: '\u0423\u043d\u0438\u0432\u0435\u0440\u0441\u0430\u043b\u044c\u043d\u0430\u044f, \u0431\u044b\u0441\u0442\u0440\u044b\u0439 \u043e\u0442\u0432\u0435\u0442', model: 'gpt-5-5', brand: 'openai' },
    'sk-gpt56': { name: 'GPT-5.6', desc: '\u0421\u0442\u0430\u0440\u0448\u0430\u044f \u043c\u043e\u0434\u0435\u043b\u044c OpenAI', model: 'gpt-5-6', brand: 'openai' },
    'sk-gpt56-terra': { name: 'GPT-5.6 Terra', desc: '\u0414\u043b\u0438\u043d\u043d\u044b\u0435 \u0437\u0430\u0434\u0430\u0447\u0438 \u0438 \u0430\u043d\u0430\u043b\u0438\u0437', model: 'gpt-5-6-terra', brand: 'openai' },
    'sk-gpt56-sol': { name: 'GPT-5.6 Sol', desc: '\u0411\u0430\u043b\u0430\u043d\u0441 \u0441\u043a\u043e\u0440\u043e\u0441\u0442\u0438 \u0438 \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0430', model: 'gpt-5-6-sol', brand: 'openai' },
    'sk-gpt56-luna': { name: 'GPT-5.6 Luna', desc: '\u0410\u043a\u043a\u0443\u0440\u0430\u0442\u043d\u044b\u0435 \u0442\u0435\u043a\u0441\u0442\u044b \u0438 \u0440\u0430\u0437\u043c\u0435\u0442\u043a\u0430', model: 'gpt-5-6-luna', brand: 'openai' },
    'sk-opus47': { name: 'Claude Opus 4.7', desc: '\u0410\u043a\u043a\u0443\u0440\u0430\u0442\u043d\u044b\u0439 \u043a\u043e\u0434 \u0438 \u0440\u0430\u0441\u0441\u0443\u0436\u0434\u0435\u043d\u0438\u044f', model: 'claude-opus-4-7', brand: 'anthropic' },
    'sk-fable5': { name: 'Claude Fable 5', desc: '\u0422\u0435\u043a\u0441\u0442\u044b \u0438 \u043a\u0440\u0435\u0430\u0442\u0438\u0432', model: 'claude-fable-5', brand: 'anthropic' },
    'sk-deepseek-pro': { name: 'DeepSeek V4 Pro', desc: '\u0421\u0438\u043b\u044c\u043d\u0430\u044f \u043b\u043e\u0433\u0438\u043a\u0430, \u043d\u0435\u0434\u043e\u0440\u043e\u0433\u043e', model: 'deepseek-v4-pro', brand: 'deepseek' },
    'sk-grok45': { name: 'Grok 4.5', desc: '\u0410\u043a\u0442\u0443\u0430\u043b\u044c\u043d\u044b\u0435 \u0434\u0430\u043d\u043d\u044b\u0435, \u0436\u0438\u0432\u043e\u0439 \u0442\u043e\u043d', model: 'grok-4-5', brand: 'xai' }
  };

  // С\u043d\u044f\u0442\u044b\u0435 модели: если они остались в MODELS от прошлых версий
  // или в выборе пользователя — убираем, чтобы не выбиралась нерабочая модель.
  var GONE = ['sk-qwen3max'];

  // Монохромные аватарки — без цветных логотипов, как и весь интерфейс.
  var LETTERS = { openai: 'G', anthropic: 'C', deepseek: 'D', xai: '\u2715', qwen: 'Q' };
  function avatar(letter) {
    return '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
      '<text x="12" y="17" text-anchor="middle" font-size="13" font-weight="700" ' +
      'font-family="Manrope,sans-serif" fill="#fff">' + letter + '</text></svg>';
  }

  function apply() {
    var models, avatars, fallback;
    try { models = MODELS; } catch (e) { return false; }
    if (!models || typeof models !== 'object') return false;

    try { avatars = AV; } catch (e) { avatars = null; }
    if (!avatars && window.AV) avatars = window.AV;
    if (avatars) {
      Object.keys(LETTERS).forEach(function (brand) {
        if (!avatars[brand]) avatars[brand] = avatar(LETTERS[brand]);
      });
    }

    Object.keys(NEW).forEach(function (id) {
      var m = NEW[id];
      // Значок кладём и рядом с моделью: если меню берёт его оттуда, а не из AV,
      // в списке не появится undefined вместо символа.
      var icon = avatar(LETTERS[m.brand] || '\u2022');
      models[id] = {
        name: m.name, desc: m.desc, provider: 'seekai',
        model: m.model, brand: m.brand, gw: GW, group: GROUP,
        pro: true, plan: 'pro',
        av: icon, icon: icon
      };
    });

    GONE.forEach(function (id) {
      try { delete models[id]; } catch (e) { }
      try {
        if (localStorage.getItem('dl_model') === id) localStorage.removeItem('dl_model');
      } catch (e) { }
    });

    // SeekAI встаёт в конец цепочки запасных моделей — как последний резерв.
    try { fallback = FALLBACK_ORDER; } catch (e) { fallback = null; }
    if (fallback && fallback.push) {
      GONE.forEach(function (id) {
        var at = fallback.indexOf(id);
        if (at >= 0) fallback.splice(at, 1);
      });
      ['sk-gpt55', 'sk-deepseek-pro', 'sk-gpt56'].forEach(function (id) {
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
