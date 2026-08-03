/* Модель по умолчанию.

   На платном тарифе — DeepSeek, на бесплатном — GPT-OSS 120B.
   Ключи моделей не зашиты: ищем по идентификатору в MODELS, иначе любое
   переименование снова ломало бы выбор.

   Выбор ставится только в двух случаях:
   • пользователь ещё ничего не выбирал;
   • сохранённая модель исчезла из списка или закрыта тарифом.
   Ручной выбор никогда не перебивается — это было бы той же автоподменой. */
(function () {
  'use strict';
  if (window.__dlModelDefault) return;
  window.__dlModelDefault = true;

  var KEY = 'dl_model';
  var PRO_WANT = ['deepseek-v4-pro', 'deepseek'];
  var FREE_WANT = ['gpt-oss-120b', 'gpt-oss'];

  var plan = '';
  var planAsked = false;
  var done = false;

  function modelsRef() {
    var models;
    try { models = MODELS; } catch (e) { models = window.MODELS; }
    return (models && typeof models === 'object') ? models : null;
  }

  function stored() {
    try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; }
  }

  function askPlan() {
    if (planAsked) return;
    planAsked = true;
    try {
      fetch('/api/plan', { credentials: 'include' }).then(function (response) {
        return response.ok ? response.text() : '';
      }).then(function (text) {
        var low = String(text || '').toLowerCase();
        if (low.indexOf('"pro"') >= 0 || low.indexOf('"team"') >= 0) plan = 'pro';
        else if (low.indexOf('"free"') >= 0) plan = 'free';
      }, function () { });
    } catch (e) { /* тариф узнаем позже */ }
  }

  // Подбор ключа по идентификатору модели или по видимому названию.
  function findKey(wants, freeOnly) {
    var models = modelsRef();
    if (!models) return '';
    var keys = Object.keys(models);
    for (var w = 0; w < wants.length; w++) {
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        var entry = models[key] || {};
        var hay = String(entry.model || '') + ' ' + String(entry.name || '');
        if (hay.toLowerCase().indexOf(wants[w]) < 0) continue;
        if (freeOnly && typeof window.dlIsFreeModel === 'function') {
          try { if (!window.dlIsFreeModel(key)) continue; } catch (e) { /* берём как есть */ }
        }
        return key;
      }
    }
    return '';
  }

  function allowed(key) {
    if (!key) return false;
    var models = modelsRef();
    if (!models || !models[key]) return false;
    if (plan === 'free' && typeof window.dlIsFreeModel === 'function') {
      try { return !!window.dlIsFreeModel(key); } catch (e) { return true; }
    }
    return true;
  }

  function select(key) {
    if (!key) return false;
    try { localStorage.setItem(KEY, key); } catch (e) { /* память недоступна */ }
    // Пропуск через заслон автоподмены: это первичная установка, а не побег с модели.
    window.__dlAllowAutoPick = true;
    try {
      if (typeof window.pickModel === 'function') window.pickModel(key);
    } catch (e) { /* ниже есть запасной путь */ }
    window.__dlAllowAutoPick = false;

    try { currentModel = key; } catch (e) { window.currentModel = key; }
    try {
      if (typeof window.buildModelMenu === 'function') window.buildModelMenu();
    } catch (e) { /* меню ещё не готово */ }
    return true;
  }

  function tick() {
    if (done) return;
    var models = modelsRef();
    if (!models || !Object.keys(models).length) return;
    askPlan();

    var free = plan === 'free';
    var wanted = free ? findKey(FREE_WANT, true) : findKey(PRO_WANT, false);
    if (!wanted) wanted = findKey(FREE_WANT, false);
    if (!wanted) return;

    var now = stored();
    if (now && allowed(now)) { done = true; return; }

    if (select(wanted)) done = true;
  }

  function run() {
    try { tick(); } catch (e) { /* список ещё не готов */ }
  }

  run();
  setTimeout(run, 400);
  setTimeout(run, 1200);
  setTimeout(run, 2500);
  var timer = setInterval(function () {
    run();
    if (done) clearInterval(timer);
  }, 800);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
