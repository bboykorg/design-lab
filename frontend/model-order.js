/* Порядок моделей в списке: сначала компания, потом версия по возрастанию.

   Порядок компаний: DeepSeek → GLM → Anthropic → OpenAI → остальные.
   Внутри компании модели идут от младшей версии к старшей.

   Деление по тарифам не ломается: список режется на куски по заголовкам
   групп (FREE/PRO), и сортировка идёт внутри каждого куска отдельно.

   Название компании нигде не выводится — только порядок строк, как и
   договаривались раньше про убранные названия провайдеров.

   Разметку списка мы не знаем (index.html слишком большой, чтобы на неё
   опираться), поэтому ключ модели ищем несколькими способами: атрибуты,
   вызов pickModel в onclick, совпадение видимого названия с MODELS. */
(function () {
  'use strict';
  if (window.__dlModelOrder) return;
  window.__dlModelOrder = true;

  var ROW = '.mopt';
  var RANK = {
    deepseek: 1,
    glm: 2, zhipu: 2, zai: 2,
    anthropic: 3,
    openai: 4,
    google: 5,
    xai: 6,
    mistral: 7,
    qwen: 8,
    meta: 9,
    minimax: 10
  };
  var OTHER = 50;

  function modelsRef() {
    var models;
    try { models = MODELS; } catch (e) { models = window.MODELS; }
    return (models && typeof models === 'object') ? models : null;
  }

  function norm(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function nameIndex() {
    var models = modelsRef();
    var index = {};
    if (!models) return index;
    Object.keys(models).forEach(function (key) {
      var entry = models[key];
      if (entry && entry.name) index[norm(entry.name)] = key;
    });
    return index;
  }

  function keyOfRow(row, index) {
    var direct = row.getAttribute('data-key') || row.getAttribute('data-model') ||
      row.getAttribute('data-id') || row.getAttribute('data-value') || '';
    var models = modelsRef();
    if (direct && models && models[direct]) return direct;

    var handler = row.getAttribute('onclick') || '';
    var match = handler.match(/pickModel\(\s*['"]([^'"]+)['"]/);
    if (match && models && models[match[1]]) return match[1];

    var text = norm(row.textContent);
    if (index[text]) return index[text];
    var found = '';
    Object.keys(index).forEach(function (name) {
      if (!name) return;
      if (text.indexOf(name) === 0 && name.length > found.length) found = name;
    });
    return found ? index[found] : '';
  }

  function brandOf(key, row) {
    var models = modelsRef();
    var entry = (models && key) ? models[key] : null;
    var brand = norm(entry && (entry.brand || entry.vendor || entry.company));
    if (brand && RANK[brand]) return brand;

    var text = norm((entry && entry.name) || row.textContent) + ' ' +
      norm(entry && entry.model);
    if (text.indexOf('deepseek') >= 0) return 'deepseek';
    if (text.indexOf('glm') >= 0 || text.indexOf('zhipu') >= 0) return 'glm';
    if (text.indexOf('claude') >= 0 || text.indexOf('opus') >= 0 ||
      text.indexOf('sonnet') >= 0 || text.indexOf('haiku') >= 0 ||
      text.indexOf('fable') >= 0) return 'anthropic';
    if (text.indexOf('gpt') >= 0 || text.indexOf('o1') === 0) return 'openai';
    if (text.indexOf('gemini') >= 0 || text.indexOf('gemma') >= 0) return 'google';
    if (text.indexOf('grok') >= 0) return 'xai';
    if (text.indexOf('mistral') >= 0 || text.indexOf('magistral') >= 0) return 'mistral';
    if (text.indexOf('qwen') >= 0) return 'qwen';
    if (text.indexOf('llama') >= 0) return 'meta';
    if (text.indexOf('minimax') >= 0) return 'minimax';
    return brand || '';
  }

  // Версия из названия: «GPT-5.6 Terra» → 5.6, «Claude Opus 4.8» → 4.8.
  function versionOf(text) {
    var match = String(text || '').match(/(\d+(?:[.,]\d+)?)/);
    if (!match) return 0;
    var value = parseFloat(match[1].replace(',', '.'));
    return isNaN(value) ? 0 : value;
  }

  function weight(row, index) {
    var key = keyOfRow(row, index);
    var models = modelsRef();
    var entry = (models && key) ? models[key] : null;
    var label = (entry && entry.name) || row.textContent;
    var brand = brandOf(key, row);
    return {
      rank: RANK[brand] || OTHER,
      brand: brand,
      version: versionOf(label),
      label: norm(label)
    };
  }

  function compare(a, b) {
    if (a.w.rank !== b.w.rank) return a.w.rank - b.w.rank;
    if (a.w.brand !== b.w.brand) return a.w.brand < b.w.brand ? -1 : 1;
    if (a.w.version !== b.w.version) return a.w.version - b.w.version;
    if (a.w.label !== b.w.label) return a.w.label < b.w.label ? -1 : 1;
    return 0;
  }

  // Куски подряд идущих строк: заголовки групп остаются на своих местах.
  function runsOf(parent) {
    var runs = [];
    var current = [];
    Array.prototype.forEach.call(parent.children, function (child) {
      if (child.matches && child.matches(ROW)) {
        current.push(child);
        return;
      }
      if (current.length) runs.push(current);
      current = [];
    });
    if (current.length) runs.push(current);
    return runs;
  }

  function sortRun(rows, index) {
    if (rows.length < 2) return;
    var items = rows.map(function (row, at) {
      return { row: row, at: at, w: weight(row, index) };
    });
    var sorted = items.slice().sort(compare);
    var same = sorted.every(function (item, at) { return item.at === at; });
    if (same) return;

    var anchor = rows[rows.length - 1].nextSibling;
    var parent = rows[0].parentNode;
    if (!parent) return;
    sorted.forEach(function (item) {
      parent.insertBefore(item.row, anchor);
    });
  }

  function tick() {
    var models = modelsRef();
    if (!models) return;
    var rows = document.querySelectorAll(ROW);
    if (!rows.length) return;
    var index = nameIndex();
    var parents = [];
    Array.prototype.forEach.call(rows, function (row) {
      var parent = row.parentNode;
      if (parent && parents.indexOf(parent) < 0) parents.push(parent);
    });
    parents.forEach(function (parent) {
      runsOf(parent).forEach(function (run) { sortRun(run, index); });
    });
  }

  function run() {
    try { tick(); } catch (e) { /* список ещё не готов */ }
  }

  run();
  setTimeout(run, 400);
  setTimeout(run, 1200);
  setInterval(run, 700);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
