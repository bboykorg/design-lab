/* Design Lab — следы выделения не попадают в сохранённый сайт.

   Если сохранить страницу с выделенным блоком, в HTML уезжали белые квадратики-
   ручки, обводка и служебные классы редактора. Перед каждым сохранением
   снимок сайта прогоняется через чистку: убираются пустые служебные узлы
   (ручки, рамки выделения), атрибуты режима правки и инлайновый outline.
   Сам контент, размеры и цвета остаются нетронутыми. */
(function () {
  'use strict';
  if (window.__dlCleanSave) return;
  window.__dlCleanSave = true;

  var JUNK = [
    '[class*="handle"]', '[class*="hndl"]', '[class*="grip"]',
    '[class*="resizer"]', '[class*="resize-"]', '[class*="-resize"]',
    '[class*="sel-box"]', '[class*="selbox"]', '[class*="selection"]',
    '[class*="sf-hd"]', '[class*="sf-box"]', '[class*="sf-frame"]',
    '[data-handle]', '[data-sf-handle]', '[data-dl-handle]',
    '[id*="sfHandles"]', '[id*="selBox"]', '[id*="selOverlay"]'
  ].join(',');
  var DROP_ATTRS = [
    'contenteditable', 'data-dl-direct-edit', 'data-sf-selected', 'data-selected',
    'data-sf-active', 'data-dl-selected', 'spellcheck'
  ];
  var DROP_CLASS = /^(sf-sel|sf-selected|sf-hover|sf-active|dl-sel|dl-selected|dl-hover|selected|is-selected|editing|is-editing)$/i;

  function scrub(root) {
    var junk;
    try { junk = root.querySelectorAll(JUNK); } catch (e) { junk = []; }
    Array.prototype.forEach.call(junk, function (el) {
      /* Удаляем только декоративные узлы без текста и без картинок. */
      if ((el.textContent || '').trim()) return;
      if (el.querySelector && el.querySelector('img,svg,video,input,textarea,button,a')) return;
      if (el.parentNode) el.parentNode.removeChild(el);
    });

    var all;
    try { all = root.querySelectorAll('*'); } catch (e) { return; }
    Array.prototype.forEach.call(all, function (el) {
      DROP_ATTRS.forEach(function (name) {
        if (el.hasAttribute && el.hasAttribute(name)) el.removeAttribute(name);
      });
      if (el.classList && el.classList.length) {
        Array.prototype.slice.call(el.classList).forEach(function (name) {
          if (DROP_CLASS.test(name)) el.classList.remove(name);
        });
        if (!el.classList.length && el.getAttribute('class') !== null) el.removeAttribute('class');
      }
      if (el.style) {
        if (el.style.outline) el.style.removeProperty('outline');
        if (el.style.outlineOffset) el.style.removeProperty('outline-offset');
        if (el.style.outlineColor) el.style.removeProperty('outline-color');
        if (el.style.outlineStyle) el.style.removeProperty('outline-style');
        if (el.style.outlineWidth) el.style.removeProperty('outline-width');
        if (el.getAttribute('style') === '') el.removeAttribute('style');
      }
    });
  }

  function cleanHtml(html) {
    if (typeof html !== 'string' || html.indexOf('<') < 0) return html;
    var doc;
    try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return html; }
    if (!doc || !doc.documentElement) return html;
    scrub(doc);
    var head = /^\s*<!DOCTYPE[^>]*>/i.test(html) ? '<!DOCTYPE html>\n' : '';
    return head + doc.documentElement.outerHTML;
  }
  window.dlCleanHtml = cleanHtml;

  function cleanCurrent() {
    try {
      if (typeof current !== 'undefined' && current && typeof current.html === 'string') {
        current.html = cleanHtml(current.html);
      }
    } catch (e) {}
  }

  var NAMES = [
    'codeSync', 'scheduleAutosave', 'autosave', 'saveProject', 'saveSite',
    'saveCurrent', 'doSave', 'exportHtml', 'downloadHtml', 'exportSite'
  ];
  function wrap(name) {
    var fn = window[name];
    if (typeof fn !== 'function' || fn.__dlCleanWrapped) return;
    var wrapped = function () {
      cleanCurrent();
      return fn.apply(this, arguments);
    };
    wrapped.__dlCleanWrapped = true;
    try { window[name] = wrapped; } catch (e) {}
  }
  function wrapAll() { NAMES.forEach(wrap); }

  wrapAll();
  setInterval(wrapAll, 1000);
  document.addEventListener('DOMContentLoaded', wrapAll);
  window.addEventListener('load', wrapAll);
})();
