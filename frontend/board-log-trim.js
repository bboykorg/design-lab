/* Журнал доски: только изначальная модель.

   В плашке отчёта («Без изменений», «Меняю схему сайта») копился список
   из всех моделей, которые перебирала цепочка. Выглядело это так, будто
   сайт собирали десять моделей сразу. Оставляем первую запись — ту, что
   была выбрана изначально, — а повторы убираем.

   Сама маркупа плашки не зашита: ищем листья с текстом «Модель: …» и
   группируем их по общему родителю. Текст самого ответа не трогаем. */
(function () {
  'use strict';
  if (window.__dlBoardLogTrim) return;
  window.__dlBoardLogTrim = true;

  var MARK = 'data-dl-log-trim';
  var RE = /^\u041c\u043e\u0434\u0435\u043b\u044c\s*[:\u2014-]\s*\S/;

  function rows() {
    var found = [];
    var all = document.querySelectorAll('li, div, p, span');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (el.childElementCount > 1) continue;
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (text.length > 60 || !RE.test(text)) continue;
      found.push(el);
    }
    return found;
  }

  function tick() {
    var list = rows();
    if (list.length < 2) return;

    var seen = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var parent = el.parentElement;
      if (!parent) continue;
      // Вложенные совпадения (строка и её же внутренний span) считаем одним.
      var nested = false;
      for (var s = 0; s < list.length; s++) {
        if (s !== i && list[s].contains(el)) { nested = true; break; }
      }
      if (nested) continue;

      if (seen.indexOf(parent) < 0) { seen.push(parent); continue; }
      if (el.getAttribute(MARK)) continue;
      el.setAttribute(MARK, '1');
      el.style.display = 'none';
    }
  }

  function run() {
    try { tick(); } catch (e) { /* плашка ещё не готова */ }
  }

  run();
  setInterval(run, 600);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
