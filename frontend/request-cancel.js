/* Отмена запроса к модели.

   Пока идёт генерация, внизу экрана висит кнопка «Остановить». Нажатие —
   или клавиша Escape — прерывает все текущие запросы к /api/proxy через
   AbortController. Сеть закрывается сразу, ждать таймаута не нужно.

   Кнопка появляется только на время запроса и не перехватывает клики по
   остальной странице: никакой подложки, только сам элемент.

   Если вызывающий код передал свой signal, он остаётся рабочим: наш
   контроллер слушает чужой сигнал и обрывается вместе с ним. */
(function () {
  'use strict';
  if (window.__dlRequestCancel) return;
  window.__dlRequestCancel = true;

  var BTN_ID = 'dl-cancel-btn';
  var active = [];

  function alive() {
    return active.filter(function (item) { return !item.done; });
  }

  function button() {
    var el = document.getElementById(BTN_ID);
    if (el) return el;
    el = document.createElement('button');
    el.id = BTN_ID;
    el.type = 'button';
    el.textContent = 'Остановить';
    el.setAttribute('aria-label', 'Отменить запрос к модели');
    el.style.cssText = 'position:fixed;left:50%;bottom:88px;transform:translateX(-50%);' +
      'z-index:99998;padding:10px 18px;border-radius:999px;cursor:pointer;' +
      'background:#0f1116;color:#fff;font:600 14px/1 Manrope,system-ui,sans-serif;' +
      'border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 30px rgba(0,0,0,.35);' +
      'display:none;';
    el.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      cancelAll();
    });
    document.body.appendChild(el);
    return el;
  }

  function render() {
    if (!document.body) return;
    var el = button();
    el.style.display = alive().length ? 'inline-block' : 'none';
  }

  function cancelAll() {
    var list = alive();
    if (!list.length) return;
    window.__dlCancelledAt = Date.now();
    list.forEach(function (item) {
      item.done = true;
      try { item.controller.abort(); } catch (e) { /* уже закрыт */ }
    });
    active = [];
    render();
    if (typeof window.dlModelNote === 'function') {
      try { window.dlModelNote('Запрос отменён.'); } catch (e) { /* ничего */ }
    }
  }
  window.dlCancelAI = cancelAll;

  function track(controller) {
    var item = { controller: controller, done: false };
    active.push(item);
    render();
    return function finish() {
      item.done = true;
      active = alive();
      render();
    };
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

      if (url.indexOf('/api/proxy') < 0 || method !== 'POST' ||
        typeof window.AbortController !== 'function') {
        return original.apply(this, arguments);
      }

      var controller = new window.AbortController();
      var nextInit = {};
      if (init) Object.keys(init).forEach(function (name) { nextInit[name] = init[name]; });
      var outer = nextInit.signal || (typeof input !== 'string' && input && input.signal) || null;
      if (outer) {
        if (outer.aborted) {
          try { controller.abort(); } catch (e) { /* ничего */ }
        } else if (outer.addEventListener) {
          outer.addEventListener('abort', function () {
            try { controller.abort(); } catch (e) { /* ничего */ }
          });
        }
      }
      nextInit.signal = controller.signal;

      var finish = track(controller);
      var result;
      try {
        result = original.call(this, input, nextInit);
      } catch (e) {
        finish();
        throw e;
      }
      if (result && result.then) {
        result.then(finish, finish);
      } else {
        finish();
      }
      return result;
    };
    wrapped.__dlCancelWrap = true;
    window.fetch = wrapped;
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && alive().length) cancelAll();
  });

  function run() {
    wrapFetch();
    render();
  }

  run();
  setTimeout(run, 400);
  setInterval(run, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
