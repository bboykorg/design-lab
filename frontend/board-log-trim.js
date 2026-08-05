/* В журнале генерации всегда ровно одна модель — выбранная пользователем.

   Встроенный fallback заранее создаёт пункты для всех кандидатов. Простое
   скрытие вложенного текста оставляло пустые маркеры списка. Теперь список
   попыток пересобирается: первый <li> получает текст выбранной модели, все
   остальные пункты скрываются целиком. После стопа скрывается весь список.

   Здесь же «Опиши сайт мечты» заменяется на «Опиши сайт». */
(function () {
  'use strict';
  if (window.__dlBoardLogTrim) return;
  window.__dlBoardLogTrim = true;

  var MARK = 'data-dl-model-list';
  var ITEM = 'data-dl-model-item';
  var RE = /^Модель\s*[:—-]\s*(.+)$/i;
  var canceled = false;
  var scheduled = false;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }
  function currentKey() {
    try {
      if (typeof window.dlCurrentModelKey === 'function') return window.dlCurrentModelKey() || '';
    } catch (e) {}
    try { return localStorage.getItem('dl_model') || ''; } catch (e) { return ''; }
  }
  function selectedName() {
    var key = currentKey(), models = null;
    try { models = typeof MODELS !== 'undefined' ? MODELS : window.MODELS; } catch (e) {}
    var model = models && models[key];
    return clean((model && (model.name || model.label || model.model || model.id)) || key || 'Выбранная модель');
  }
  function modelText(node) {
    var text = clean(node && node.textContent);
    return text.length <= 120 && RE.test(text);
  }
  function candidateLists() {
    var out = [], lists = document.querySelectorAll('ul,ol');
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i];
      var marked = list.hasAttribute(MARK) || !!list.querySelector('[' + ITEM + ']');
      var found = false;
      var nodes = list.querySelectorAll('li,div,p,span');
      for (var j = 0; j < nodes.length && !found; j++) {
        if (modelText(nodes[j])) found = true;
      }
      if (marked || found) out.push(list);
    }
    return out;
  }
  function hideList(list) {
    if (!list) return;
    list.setAttribute(MARK, '1');
    list.style.setProperty('display', 'none', 'important');
  }
  function rebuildList(list) {
    if (!list) return;
    list.setAttribute(MARK, '1');
    if (canceled) { hideList(list); return; }

    list.style.removeProperty('display');
    var items = list.querySelectorAll(':scope > li');
    var first = items[0];
    if (!first) {
      first = document.createElement('li');
      list.appendChild(first);
      items = list.querySelectorAll(':scope > li');
    }

    // Полностью заменяем содержимое технического пункта, чтобы внутри не
    // осталось скрытых span/div и пустых маркеров.
    var wanted = 'Модель: ' + selectedName();
    if (clean(first.textContent) !== wanted) first.textContent = wanted;
    first.setAttribute(ITEM, '1');
    first.style.removeProperty('display');

    for (var i = 1; i < items.length; i++) {
      items[i].setAttribute(ITEM, '0');
      items[i].style.setProperty('display', 'none', 'important');
    }
  }
  function rebuildAll() {
    var lists = candidateLists();
    for (var i = 0; i < lists.length; i++) rebuildList(lists[i]);
  }
  function replaceHeading() {
    var all = document.querySelectorAll('h1,h2,h3,h4,div,p,span');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el.childElementCount && clean(el.textContent).toLowerCase() === 'опиши сайт мечты') {
        el.textContent = 'Опиши сайт';
      }
    }
  }
  function run() {
    scheduled = false;
    try { replaceHeading(); rebuildAll(); } catch (e) {}
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(run, 40);
  }

  window.addEventListener('dl:ai-start', function () {
    canceled = false;
    schedule();
  });
  window.addEventListener('dl:ai-cancel', function () {
    canceled = true;
    var lists = candidateLists();
    for (var i = 0; i < lists.length; i++) hideList(lists[i]);
  });

  run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true, subtree: true, characterData: true
  });
})();
