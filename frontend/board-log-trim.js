/* Журнал показывает только реально выбранную модель.

   Движок заранее добавляет строки всех fallback-кандидатов. Имя каждой строки
   сравнивается с текущей моделью, несовпадающие строки скрываются. После стопа
   скрываются все строки текущей генерации.

   Важно: строка модели часто находится внутри <li>. Если спрятать только span
   или div, маркер списка остаётся на экране пустой точкой. Поэтому hideRow()
   всегда скрывает ближайший <li>, а когда скрыты все пункты — ещё и весь ul/ol.

   Здесь же «Опиши сайт мечты» заменяется на «Опиши сайт». */
(function () {
  'use strict';
  if (window.__dlBoardLogTrim) return;
  window.__dlBoardLogTrim = true;

  var MARK = 'data-dl-log-trim';
  var EMPTY = 'data-dl-log-empty';
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
  function rowBox(el) {
    if (!el) return null;
    var li = el.closest && el.closest('li');
    return li || el;
  }
  function hideRow(el) {
    var box = rowBox(el);
    if (!box) return;
    box.setAttribute(MARK, '1');
    box.style.setProperty('display', 'none', 'important');
    // Вложенный узел тоже помечаем для поиска его списка.
    if (box !== el) el.setAttribute(MARK, '1');
  }
  function showRow(el) {
    var box = rowBox(el);
    if (!box) return;
    box.removeAttribute(MARK);
    box.style.removeProperty('display');
    if (box !== el) el.removeAttribute(MARK);
    var list = box.closest && box.closest('ul,ol');
    if (list) {
      list.removeAttribute(EMPTY);
      list.style.removeProperty('display');
    }
  }
  function matchesSelected(name, names) {
    if (!name || !names.length) return false;
    for (var i = 0; i < names.length; i++) {
      if (name === names[i] || name.indexOf(names[i]) >= 0 || names[i].indexOf(name) >= 0) return true;
    }
    return false;
  }

  /* Если в списке не осталось ни одного видимого пункта, убираем сам список:
     так маркеры не могут остаться даже при необычной CSS-разметке. */
  function collapseEmptyLists() {
    var lists = document.querySelectorAll('ul,ol');
    for (var i = 0; i < lists.length; i++) {
      var list = lists[i];
      if (!list.querySelector('[' + MARK + ']')) continue;
      var children = list.children;
      if (!children.length) continue;
      var visible = false;
      for (var j = 0; j < children.length; j++) {
        var child = children[j];
        if (!child.hasAttribute(MARK) && child.style.display !== 'none') {
          visible = true;
          break;
        }
      }
      if (!visible) {
        list.setAttribute(EMPTY, '1');
        list.style.setProperty('display', 'none', 'important');
      }
    }
  }

  function trimRows() {
    var list = rows(), names = selectedNames(), kept = false;
    for (var i = 0; i < list.length; i++) {
      var info = list[i];
      if (canceled) { hideRow(info.el); continue; }
      // Оставляем ровно одну строку выбранной модели, остальное — техника fallback.
      if (!kept && matchesSelected(info.name, names)) {
        kept = true;
        showRow(info.el);
      } else hideRow(info.el);
    }
    collapseEmptyLists();
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

  window.addEventListener('dl:ai-start', function () {
    canceled = false;
    schedule();
  });
  window.addEventListener('dl:ai-cancel', function () {
    canceled = true;
    var list = rows();
    for (var i = 0; i < list.length; i++) hideRow(list[i].el);
    collapseEmptyLists();
  });

  run();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
})();
