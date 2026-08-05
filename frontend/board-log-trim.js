/* Чистый журнал генерации и короткий заголовок главного экрана.

   Fallback-движок заранее пишет «Модель: ...» для каждого кандидата. Это
   выглядело как реальное переключение на Pro, даже когда запрос был прибит
   к выбранной Free-модели. В каждом списке оставляем только первую строку —
   исходный выбор. После ручного стопа скрываем все модельные строки текущей
   генерации и продолжаем скрывать запоздалые строки до нового запроса.

   Здесь же меняется только копирайт «Опиши сайт мечты» → «Опиши сайт».
   Структура страницы и остальные подписи не затрагиваются. */
(function () {
  'use strict';
  if (window.__dlBoardLogTrim) return;
  window.__dlBoardLogTrim = true;

  var MARK = 'data-dl-log-trim';
  var KEEP = 'data-dl-log-keep';
  var RE = /^Модель\s*[:—-]\s*\S/i;
  var canceled = false;
  var scheduled = false;

  function cleanText(value) { return String(value || '').replace(/\s+/g, ' ').trim(); }
  function isRow(el) {
    if (!el || el.childElementCount > 1) return false;
    var text = cleanText(el.textContent);
    return text.length <= 80 && RE.test(text);
  }
  function rows() {
    var found = [], all = document.querySelectorAll('li,div,p,span');
    for (var i = 0; i < all.length; i++) if (isRow(all[i])) found.push(all[i]);
    return found;
  }
  function groupOf(el) {
    var group = el.closest && el.closest('ul,ol,[role="list"]');
    return group || el.parentElement;
  }
  function hide(el) {
    if (!el) return;
    el.setAttribute(MARK, '1');
    el.style.setProperty('display', 'none', 'important');
  }
  function show(el) {
    if (!el) return;
    el.removeAttribute(MARK);
    el.style.removeProperty('display');
  }

  function trimRows() {
    var list = rows(), groups = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      // Не обрабатываем одновременно контейнер и его внутренний span.
      var nested = false;
      for (var n = 0; n < list.length; n++) {
        if (n !== i && list[n].contains(el)) { nested = true; break; }
      }
      if (nested) continue;
      if (canceled) { hide(el); continue; }
      var group = groupOf(el);
      var index = groups.indexOf(group);
      if (index < 0) {
        groups.push(group);
        el.setAttribute(KEEP, '1');
        show(el);
      } else hide(el);
    }
  }

  function replaceHeading() {
    var all = document.querySelectorAll('h1,h2,h3,h4,div,p,span');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.childElementCount) continue;
      if (cleanText(el.textContent).toLowerCase() === 'опиши сайт мечты') el.textContent = 'Опиши сайт';
    }
  }
  function run() {
    scheduled = false;
    try { replaceHeading(); trimRows(); } catch (e) {}
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(run, 40);
  }

  window.addEventListener('dl:ai-start', function () {
    canceled = false;
    // Новая генерация получает собственную первую строку.
    var old = document.querySelectorAll('[' + KEEP + ']');
    for (var i = 0; i < old.length; i++) old[i].removeAttribute(KEEP);
    schedule();
  });
  window.addEventListener('dl:ai-cancel', function () {
    canceled = true;
    var list = rows();
    for (var i = 0; i < list.length; i++) hide(list[i]);
  });

  run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
