/* Отмена запроса к модели.

   Три вещи, которые были сделаны неправильно в первой версии:

   1. Кнопка висела отдельным окошком посередине экрана. Теперь она встаёт
      НА МЕСТО кнопки отправки и копирует её классы и размер, а после
      окончания генерации кнопка отправки возвращается на место.
      Кнопка отправки ищется от поля ввода, а не по жёсткому селектору:
      вёрстка композера разная на главной, в редакторе и на телефоне.

   2. Отмена рвала только текущую попытку, а цепочка тут же шла к следующей
      модели — со стороны это выглядело как «не остановилось, а переключилось».
      Теперь после отмены ставится замок: любой следующий запрос к модели
      обрывается сразу, пока человек сам не нажмёт отправку заново.
      Замок снимается любым вводом в поле или кликом по кнопке отправки.

   3. Запрос мог висеть бесконечно: у шлюза нет своего таймаута, а браузер
      ждёт ответа минутами. Каждой попытке даётся предел ожидания.

   Никакого затемнения и перехвата кликов по странице здесь нет. */
(function () {
  'use strict';
  if (window.__dlRequestCancel) return;
  window.__dlRequestCancel = true;

  var BTN_ID = 'dl-cancel-btn';
  var LABEL = '\u0421\u0442\u043e\u043f';
  var TIMEOUT_MS = 150000;   // предел ожидания одной попытки
  var LOCK_MS = 90000;       // срок жизни замка после отмены

  var live = [];             // активные запросы
  var lockedAt = 0;          // когда нажали «Стоп»
  var hiddenSend = null;     // спрятанная кнопка отправки
  var prevDisplay = '';

  /* ------------------------------------------------------------- замок */

  function locked() {
    return lockedAt > 0 && (Date.now() - lockedAt) < LOCK_MS;
  }

  function unlock() {
    lockedAt = 0;
  }
  window.dlAllowAI = unlock;

  /* --------------------------------------------- поиск кнопки отправки */
  /* Ищем от видимого поля ввода: в композере кнопка всегда рядом, а вот
     классы и идентификаторы у неё разные на главной, в редакторе и на телефоне. */

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }

  function inputs() {
    var found = [];
    var list = document.querySelectorAll('textarea, input[type="text"]');
    for (var i = 0; i < list.length; i++) {
      if (visible(list[i])) found.push(list[i]);
    }
    return found;
  }

  function looksLikeSend(el) {
    if (!el || el.id === BTN_ID) return false;
    var text = (el.textContent || '') + ' ' +
      (el.getAttribute('aria-label') || '') + ' ' +
      (el.getAttribute('title') || '') + ' ' +
      (el.className && el.className.baseVal ? '' : String(el.className || '')) + ' ' +
      (el.id || '');
    return /\u043e\u0442\u043f\u0440\u0430\u0432|send|submit/i.test(text);
  }

  function sendButton() {
    var fields = inputs();
    for (var i = 0; i < fields.length; i++) {
      var node = fields[i];
      for (var up = 0; up < 4 && node; up++) {
        node = node.parentElement;
        if (!node) break;
        var buttons = node.querySelectorAll('button, [role="button"]');
        var fallback = null;
        for (var b = 0; b < buttons.length; b++) {
          var candidate = buttons[b];
          if (!visible(candidate) || candidate.id === BTN_ID) continue;
          if (looksLikeSend(candidate)) return candidate;
          fallback = candidate;
        }
        if (fallback && up >= 1) return fallback;
      }
    }
    return null;
  }

  /* ------------------------------------------------------------- кнопка */

  function button() {
    var el = document.getElementById(BTN_ID);
    if (el) return el;
    el = document.createElement('button');
    el.id = BTN_ID;
    el.type = 'button';
    el.textContent = LABEL;
    el.setAttribute('aria-label', '\u041e\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u044e');
    el.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      cancelAll();
    });
    return el;
  }

  function dressLike(el, send) {
    if (!send) return;
    try {
      el.className = send.className || '';
      var box = send.getBoundingClientRect();
      el.style.minWidth = Math.round(box.width) + 'px';
      el.style.height = Math.round(box.height) + 'px';
    } catch (e) { /* стиль ниже */ }
    el.style.cursor = 'pointer';
    el.style.display = '';
  }

  function corner(el) {
    el.className = '';
    el.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:99998;' +
      'padding:10px 18px;border-radius:12px;border:1px solid rgba(255,255,255,.16);' +
      'background:#0f1116;color:#fff;font:14px/1 Manrope,system-ui,sans-serif;cursor:pointer;';
  }

  function show() {
    var el = button();
    var send = sendButton();
    if (send && send !== hiddenSend) {
      if (hiddenSend) restoreSend();
      hiddenSend = send;
      prevDisplay = send.style.display;
      send.style.display = 'none';
      if (send.parentNode) send.parentNode.insertBefore(el, send);
      dressLike(el, send);
      return;
    }
    if (!send && !hiddenSend) {
      if (!el.parentNode) document.body.appendChild(el);
      corner(el);
    }
  }

  function restoreSend() {
    if (!hiddenSend) return;
    hiddenSend.style.display = prevDisplay;
    hiddenSend = null;
    prevDisplay = '';
  }

  function hide() {
    var el = document.getElementById(BTN_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    restoreSend();
  }

  function render() {
    if (live.length) show();
    else hide();
  }

  /* -------------------------------------------------------------- отмена */

  function forget(entry) {
    var i = live.indexOf(entry);
    if (i >= 0) live.splice(i, 1);
    render();
  }

  function track(controller) {
    var entry = { controller: controller, timer: 0 };
    entry.timer = setTimeout(function () {
      try { controller.abort(); } catch (e) { /* уже завершён */ }
      forget(entry);
      if (typeof window.dlModelNote === 'function') {
        window.dlModelNote('\u041c\u043e\u0434\u0435\u043b\u044c \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430 \u0437\u0430 2,5 \u043c\u0438\u043d\u0443\u0442\u044b \u2014 \u0437\u0430\u043f\u0440\u043e\u0441 \u043f\u0440\u0435\u0440\u0432\u0430\u043d. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u0435\u0449\u0451 \u0440\u0430\u0437 \u0438\u043b\u0438 \u0432\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c.');
      }
    }, TIMEOUT_MS);
    live.push(entry);
    render();
    return entry;
  }

  function cancelAll() {
    lockedAt = Date.now();
    window.__dlCancelledAt = lockedAt;
    var pending = live.slice();
    live.length = 0;
    pending.forEach(function (entry) {
      if (entry.timer) clearTimeout(entry.timer);
      try { entry.controller.abort(); } catch (e) { /* уже завершён */ }
    });
    render();
    if (typeof window.dlModelNote === 'function') {
      window.dlModelNote('\u0413\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u044f \u043e\u0441\u0442\u0430\u043d\u043e\u0432\u043b\u0435\u043d\u0430.');
    }
  }
  window.dlCancelAI = cancelAll;

  /* ------------------------------------------------------- перехват fetch */

  function aborted() {
    var error;
    try {
      error = new DOMException('\u0417\u0430\u043f\u0440\u043e\u0441 \u043e\u0442\u043c\u0435\u043d\u0451\u043d', 'AbortError');
    } catch (e) {
      error = new Error('AbortError');
      error.name = 'AbortError';
    }
    return Promise.reject(error);
  }

  function wrapFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlCancelWrap) return;
    var wrapped = function (input, init) {
      var url = '';
      var method = '';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
        method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      } catch (e) { url = ''; }

      if (method !== 'POST' || url.indexOf('/api/proxy') < 0) {
        return original.apply(this, arguments);
      }

      // После «Стоп» цепочка не должна уйти на следующую модель.
      if (locked()) return aborted();

      var controller;
      try { controller = new AbortController(); } catch (e) { controller = null; }
      if (!controller) return original.apply(this, arguments);

      var nextInit = {};
      if (init) Object.keys(init).forEach(function (name) { nextInit[name] = init[name]; });
      var caller = nextInit.signal;
      nextInit.signal = controller.signal;
      if (caller) {
        if (caller.aborted) { try { controller.abort(); } catch (e) { } }
        else caller.addEventListener('abort', function () {
          try { controller.abort(); } catch (e) { }
        });
      }

      var entry = track(controller);
      var done = function () {
        if (entry.timer) clearTimeout(entry.timer);
        forget(entry);
      };

      var result = original.call(this, input, nextInit);
      if (result && result.then) result.then(done, done);
      else done();
      return result;
    };
    wrapped.__dlCancelWrap = true;
    window.fetch = wrapped;
  }

  /* -------------------------------------------------------------- события */

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && live.length) cancelAll();
    else unlock();
  }, true);

  // Любой клик по кнопке отправки снимает замок: человек сам начал заново.
  document.addEventListener('pointerdown', function (event) {
    var el = event.target;
    if (el && el.closest && el.closest('#' + BTN_ID)) return;
    unlock();
  }, true);

  function run() {
    wrapFetch();
    render();
  }

  run();
  setTimeout(run, 500);
  setInterval(run, 1000);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
