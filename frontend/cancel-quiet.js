/* Тишина после отмены запроса.

   Человек сам нажал квадратик — это не авария. Но обрыв соединения
   неотличим от отказа сети, поэтому цепочка честно рапортует «не смог
   связаться ни с одной моделью» и валится в демо-режим. Выглядит как поломка
   на ровном месте.

   После отмены открывается короткое окно тишины, в котором гасятся только
   служебные сообщения об ошибках связи и сама заметка об остановке.
   Окно закрывается сразу, как только уходит новый запрос — чтобы настоящая
   ошибка следующей попытки была видна.

   Ничего не удаляется навсегда: узел прячется через display, чтобы не ломать
   чужую разметку чата. */
(function () {
  'use strict';
  if (window.__dlCancelQuiet) return;
  window.__dlCancelQuiet = true;

  var QUIET_MS = 15000;
  var MARK = 'data-dl-quiet';

  // Служебные жалобы цепочки и собственная заметка об остановке.
  var RE = new RegExp(
    '\u043dе \u0441\u043c\u043e\u0433 \u0441\u0432\u044f\u0437\u0430\u0442\u044c\u0441\u044f|\u043d\u0438 \u0441 \u043e\u0434\u043d\u043e\u0439 \u043c\u043e\u0434\u0435\u043b|\u043c\u043e\u0434\u0435\u043b\u044c \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f|\u043c\u043e\u0434\u0435\u043b\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f|' +
    '\u0434\u0435\u043c\u043e-\u0440\u0435\u0436\u0438\u043c|\u0434\u0435\u043c\u043e\u0440\u0435\u0436\u0438\u043c|\u043a\u043b\u044e\u0447\u0438 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b|\u0441\u0435\u0442\u044c/\u043a\u043b\u044e\u0447\u0438|\u043f\u0440\u043e\u0432\u0435\u0440\u044c \u0441\u0435\u0442\u044c|' +
    '\u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u044f \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430|\u0437\u0430\u043f\u0440\u043e\u0441 \u043e\u0442\u043c\u0435\u043d|\u0437\u0430\u043f\u0440\u043e\u0441 \u043f\u0440\u0435\u0440\u0432\u0430\u043d|\u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430 \u0437\u0430|' +
    '\u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430 \u0442\u0435\u043a\u0441\u0442\u043e\u043c \u0432\u043c\u0435\u0441\u0442\u043e|aborterror|the user aborted', 'i');

  var quietUntil = 0;
  var seen = 0;

  function quiet() { return Date.now() < quietUntil; }

  function start() {
    quietUntil = Date.now() + QUIET_MS;
    sweep();
  }

  function stop() { quietUntil = 0; }

  window.dlQuietAfterCancel = start;

  function hide(node) {
    if (!node || node.nodeType !== 1 || node.hasAttribute(MARK)) return;
    node.setAttribute(MARK, '1');
    try { node.style.display = 'none'; } catch (e) { /* нет style — и ладно */ }
  }

  // Прячется самый мелкий узел, целиком состоящий из жалобы: так не уедет
  // весь чат вместе с оболочкой.
  function smallest(node) {
    var found = node;
    for (var guard = 0; guard < 8; guard++) {
      var next = null;
      var kids = found.children || [];
      for (var i = 0; i < kids.length; i++) {
        var text = (kids[i].textContent || '').trim();
        if (text && RE.test(text)) { next = kids[i]; break; }
      }
      if (!next) break;
      found = next;
    }
    return found;
  }

  function check(node) {
    if (!node || node.nodeType !== 1) return;
    var text = (node.textContent || '').trim();
    if (!text || text.length > 600 || !RE.test(text)) return;
    hide(smallest(node));
  }

  function sweep() {
    var body = document.body;
    if (!body) return;
    var all = body.querySelectorAll('div, p, li, span, section, article');
    for (var i = 0; i < all.length; i++) {
      var node = all[i];
      if (node.hasAttribute(MARK)) continue;
      var text = (node.textContent || '').trim();
      if (!text || text.length > 600 || !RE.test(text)) continue;
      if (node.querySelector && node.querySelector('[' + MARK + ']')) continue;
      hide(smallest(node));
    }
  }

  function watchDom() {
    if (!window.MutationObserver || !document.body) return;
    new MutationObserver(function (records) {
      if (!quiet()) return;
      for (var i = 0; i < records.length; i++) {
        var added = records[i].addedNodes || [];
        for (var j = 0; j < added.length; j++) check(added[j]);
        if (records[i].type === 'characterData') check(records[i].target.parentNode);
      }
    }).observe(document.body, {
      childList: true, subtree: true, characterData: true
    });
  }

  // Заметки собственных слоёв глушатся до того, как попадут в разметку.
  function muteNotes() {
    ['dlModelNote', 'toast'].forEach(function (name) {
      var original = window[name];
      if (typeof original !== 'function' || original.__dlQuiet) return;
      var wrapped = function (text) {
        if (quiet() && RE.test(String(text || ''))) return;
        return original.apply(this, arguments);
      };
      wrapped.__dlQuiet = true;
      window[name] = wrapped;
    });
  }

  // Новый запрос закрывает окно тишины.
  function watchFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlQuietWrap) return;
    var wrapped = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (method === 'POST' && url.indexOf('/api/proxy') >= 0) stop();
      } catch (e) { /* чужой вызов */ }
      return original.apply(this, arguments);
    };
    wrapped.__dlQuietWrap = true;
    window.fetch = wrapped;
  }

  function tick() {
    muteNotes();
    var at = window.__dlCancelledAt || 0;
    if (at && at !== seen) { seen = at; start(); }
    if (quiet()) sweep();
  }

  function boot() {
    watchDom();
    watchFetch();
    muteNotes();
    setInterval(tick, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
