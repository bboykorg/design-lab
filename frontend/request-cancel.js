/* Отмена и ограничение одной попыткой выбранной модели.

   Запрос всегда относится только к модели, которую выбрал пользователь.
   Если она вернула HTTP-ошибку, fallback-цепочка больше не отправляет в сеть
   следующие Pro-модели: ставится тихий замок до следующей ручной отправки.
   Поэтому одна отправка на Free расходует максимум одну генерацию.

   Ручная остановка обрывает всю текущую генерацию, показывает квадратик
   на месте кнопки отправки и не выводит никаких сообщений об ошибке.
   События dl:ai-start / dl:ai-cancel позволяют журналу скрывать технические
   строки с моделями. Никаких оверлеев и перехвата остальных кнопок нет. */
(function () {
  'use strict';
  if (window.__dlRequestCancel) return;
  window.__dlRequestCancel = true;

  var BTN_ID = 'dl-cancel-btn';
  var TIMEOUT_MS = 60000;
  var LOCK_MS = 90000;
  var ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="display:block">' +
    '<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"></rect></svg>';

  var live = [];
  var lockedAt = 0;
  var hiddenSend = null;
  var prevDisplay = '';
  var started = false;

  function emit(name, detail) {
    try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e) {}
  }
  function locked() { return lockedAt > 0 && Date.now() - lockedAt < LOCK_MS; }
  function unlock() {
    lockedAt = 0;
    started = false;
  }
  window.dlAllowAI = unlock;

  function visible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    var box = el.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  }
  function inputs() {
    var out = [], list = document.querySelectorAll('textarea,input[type="text"]');
    for (var i = 0; i < list.length; i++) if (visible(list[i])) out.push(list[i]);
    return out;
  }
  function looksLikeSend(el) {
    if (!el || el.id === BTN_ID) return false;
    var text = (el.textContent || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' +
      (el.getAttribute('title') || '') + ' ' + String(el.id || '') + ' ' +
      (el.className && el.className.baseVal ? '' : String(el.className || ''));
    return /отправ|send|submit/i.test(text);
  }
  function sendButton() {
    var fields = inputs();
    for (var i = 0; i < fields.length; i++) {
      var node = fields[i];
      for (var up = 0; up < 4 && node; up++) {
        node = node.parentElement;
        if (!node) break;
        var buttons = node.querySelectorAll('button,[role="button"]');
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

  function button() {
    var el = document.getElementById(BTN_ID);
    if (el) return el;
    el = document.createElement('button');
    el.id = BTN_ID;
    el.type = 'button';
    el.innerHTML = ICON;
    el.title = 'Остановить';
    el.setAttribute('aria-label', 'Остановить генерацию');
    el.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      cancelAll(true);
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
    } catch (e) {}
    el.style.display = 'inline-flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.cursor = 'pointer';
  }
  function corner(el) {
    el.className = '';
    el.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:99998;width:40px;height:40px;' +
      'display:inline-flex;align-items:center;justify-content:center;border-radius:12px;' +
      'border:1px solid rgba(255,255,255,.16);background:#0f1116;color:#fff;cursor:pointer;';
  }
  function restoreSend() {
    if (!hiddenSend) return;
    hiddenSend.style.display = prevDisplay;
    hiddenSend = null;
    prevDisplay = '';
  }
  function show() {
    var el = button(), send = sendButton();
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
  function hide() {
    var el = document.getElementById(BTN_ID);
    if (el && el.parentNode) el.parentNode.removeChild(el);
    restoreSend();
  }
  function render() { if (live.length) show(); else hide(); }

  function forget(entry) {
    var i = live.indexOf(entry);
    if (i >= 0) live.splice(i, 1);
    render();
  }
  function track(controller) {
    var entry = { controller: controller, timer: 0 };
    entry.timer = setTimeout(function () {
      try { controller.abort(); } catch (e) {}
      forget(entry);
      quietLock('timeout');
    }, TIMEOUT_MS);
    live.push(entry);
    render();
    return entry;
  }
  function abortLive() {
    var pending = live.slice();
    live.length = 0;
    pending.forEach(function (entry) {
      if (entry.timer) clearTimeout(entry.timer);
      try { entry.controller.abort(); } catch (e) {}
    });
    render();
  }
  function quietLock(reason) {
    if (!locked()) lockedAt = Date.now();
    window.__dlCancelledAt = lockedAt;
    emit('dl:ai-cancel', { reason: reason || 'error' });
  }
  function cancelAll(manual) {
    lockedAt = Date.now();
    window.__dlCancelledAt = lockedAt;
    abortLive();
    emit('dl:ai-cancel', { reason: manual ? 'manual' : 'error' });
    // Намеренно без toast: после стопа должно быть тихо.
  }
  window.dlCancelAI = function () { cancelAll(true); };

  function aborted() {
    var error;
    try { error = new DOMException('Запрос отменён', 'AbortError'); }
    catch (e) { error = new Error('AbortError'); error.name = 'AbortError'; }
    return Promise.reject(error);
  }

  function begin() {
    if (started) return;
    started = true;
    emit('dl:ai-start', { at: Date.now() });
  }

  function wrapFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlCancelWrap) return;
    var wrapped = function (input, init) {
      var url = '', method = '';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
        method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      } catch (e) {}
      if (method !== 'POST' || url.indexOf('/api/proxy') < 0) return original.apply(this, arguments);

      // Технические fallback-вызовы после первой ошибки не уходят в сеть.
      if (locked()) return aborted();
      begin();

      var controller;
      try { controller = new AbortController(); } catch (e) { controller = null; }
      if (!controller) return original.apply(this, arguments);

      var nextInit = {};
      if (init) Object.keys(init).forEach(function (name) { nextInit[name] = init[name]; });
      var caller = nextInit.signal;
      nextInit.signal = controller.signal;
      if (caller) {
        if (caller.aborted) { try { controller.abort(); } catch (e) {} }
        else caller.addEventListener('abort', function () { try { controller.abort(); } catch (e) {} });
      }

      var entry = track(controller);
      var result = original.call(this, input, nextInit);
      var done = function () {
        if (entry.timer) clearTimeout(entry.timer);
        forget(entry);
      };
      if (result && result.then) {
        result.then(function (response) {
          done();
          // 401/403/429/5xx: пользователь сам выбирает другую модель.
          // Автоматическая цепочка на Pro-модели здесь заканчивается.
          if (response && !response.ok) quietLock('http-' + response.status);
        }, function (error) {
          done();
          if (!(error && error.name === 'AbortError')) quietLock('network');
        });
      } else done();
      return result;
    };
    wrapped.__dlCancelWrap = true;
    window.fetch = wrapped;
  }

  /* Замок снимается только новым осознанным запросом, а не любым кликом по странице. */
  document.addEventListener('input', function (event) {
    if (event.target && /^(TEXTAREA|INPUT)$/.test(event.target.tagName || '')) unlock();
  }, true);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && live.length) { cancelAll(true); return; }
    if (event.key === 'Enter' && event.target && /^(TEXTAREA|INPUT)$/.test(event.target.tagName || '')) unlock();
  }, true);
  document.addEventListener('pointerdown', function (event) {
    var el = event.target && event.target.closest ? event.target.closest('button,[role="button"]') : null;
    if (!el || el.id === BTN_ID) return;
    if (looksLikeSend(el)) unlock();
  }, true);

  function run() { wrapFetch(); render(); }
  run();
  setTimeout(run, 500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
