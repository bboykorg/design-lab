/* Журнал показывает только реально выбранную модель.

   Движок заранее добавляет строки всех fallback-кандидатов. Фильтрация по
   общему DOM-родителю оказалась ненадёжной: вложенные div получали разных
   родителей, поэтому рядом с GPT-OSS оставались Claude. Теперь имя каждой
   строки сравнивается с текущей моделью. Все несовпадающие строки скрываются.
   После стопа скрываются вообще все строки текущей генерации.

   Здесь же «Опиши сайт мечты» заменяется на «Опиши сайт». */
(function () {
  'use strict';
  if (window.__dlBoardLogTrim) return;
  window.__dlBoardLogTrim = true;

  var MARK = 'data-dl-log-trim';
  var RE = /^Модель\s*[:—-]\s*(.+)$/i;
  var canceled = false;
  var scheduled = false;

  function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }
  function currentKey() {
    try { if (typeof window.dlCurrentModelKey === 'function') return window.dlCurrentModelKey() || ''; } catch (e) {}
    try { return localStorage.getItem('dl_model') || ''; } catch (e) { return ''; }
  }
  function selectedNames() {
    var key = currentKey(), out = [];
    if (key) out.push(clean(key));
    var models = null;
    try { models = typeof MODELS !== 'undefined' ? MODELS : window.MODELS; } catch (e) {}
    var model = models && models[key];
    if (model) {
      [model.name, model.model, model.id, model.slug].forEach(function (value) {
        value = clean(value);
        if (value && out.indexOf(value) < 0) out.push(value);
      });
    }
    return out;
  }
  function rowInfo(el) {
    if (!el || el.childElementCount > 1) return null;
    var text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length > 100) return null;
    var match = text.match(RE);
    return match ? { el: el, name: clean(match[1]) } : null;
  }
  function rows() {
    var out = [], all = document.querySelectorAll('li,div,p,span');
    for (var i = 0; i < all.length; i++) {
      var info = rowInfo(all[i]);
      if (info) out.push(info);
    }
    return out;
  }
  function hide(el) {
    el.setAttribute(MARK, '1');
    el.style.setProperty('display', 'none', 'important');
  }
  function show(el) {
    el.removeAttribute(MARK);
    el.style.removeProperty('display');
  }
  function matchesSelected(name, names) {
    if (!name || !names.length) return false;
    for (var i = 0; i < names.length; i++) {
      if (name === names[i] || name.indexOf(names[i]) >= 0 || names[i].indexOf(name) >= 0) return true;
    }
    return false;
  }
  function trimRows() {
    var list = rows(), names = selectedNames(), kept = false;
    for (var i = 0; i < list.length; i++) {
      var info = list[i];
      if (canceled) { hide(info.el); continue; }
      // Оставляем ровно одну строку выбранной модели, всё остальное — техника fallback.
      if (!kept && matchesSelected(info.name, names)) {
        kept = true;
        show(info.el);
      } else hide(info.el);
    }
  }
  function replaceHeading() {
    var all = document.querySelectorAll('h1,h2,h3,h4,div,p,span');
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el.childElementCount && clean(el.textContent) === 'опиши сайт мечты') el.textContent = 'Опиши сайт';
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

  window.addEventListener('dl:ai-start', function () { canceled = false; schedule(); });
  window.addEventListener('dl:ai-cancel', function () {
    canceled = true;
    var list = rows();
    for (var i = 0; i < list.length; i++) hide(list[i].el);
  });

  run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
