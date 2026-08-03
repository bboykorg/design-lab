/* Точечные исправления поверх всех остальных слоёв:
   1) кнопка «Установить приложение» убрана — на телефоне она перекрывала интерфейс;
   2) в списке моделей вместо значка могло стоять слово undefined;
   3) после входа аккаунт в бургер-меню появлялся только после перезагрузки;
   4) в списке моделей не должно быть названий провайдеров — только FREE и PRO. */
(function () {
  'use strict';
  if (window.__dlMobileFixes) return;
  window.__dlMobileFixes = true;

  var INSTALL = ['установить приложение', 'install app', 'установить апп'];
  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var REFRESH = [
    'refreshAuthUI', 'updateAuthUI', 'renderAuth', 'syncAuth', 'applyAuth',
    'renderProfile', 'refreshProfile', 'loadProfile', 'updateProfile',
    'dlRefreshProfile', 'dlRenderProfile', 'buildMobileMenu', 'renderMobileMenu',
    'dlBuildMenu', 'renderMenu'
  ];
  var MARK = 'data-dl-removed';
  var RELOADED = 'dl_auth_reloaded';

  var style = document.createElement('style');
  style.textContent = '[' + MARK + ']{display:none!important}';
  (document.head || document.documentElement).appendChild(style);

  function text(node) {
    return String(node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /* Убираем саму кнопку, а не её текст: ищем ближайший кликабельный узел. */
  function dropInstall() {
    var list;
    try { list = document.querySelectorAll('button,a,[role="button"],div,span'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.hasAttribute(MARK) || el.childElementCount > 3) return;
      var value = text(el);
      if (value.length > 40) return;
      if (INSTALL.indexOf(value) < 0) return;
      var target = el;
      for (var i = 0; i < 3; i++) {
        var up = target.parentElement;
        if (!up || text(up) !== value) break;
        target = up;
      }
      target.setAttribute(MARK, 'install');
      if (target.parentElement) target.parentElement.removeChild(target);
    });
  }

  /* Заголовки с названием провайдера в списке моделей не нужны:
     деление только по тарифам. Сами модели остаются на месте. */
  var VENDOR = [
    'seekai', 'seek ai', 'gorouter', 'kiwillm', 'kiwi', 'vyce', 'vyce ai',
    'cerebras', 'openrouter', 'bigmodel', 'z.ai'
  ];
  function dropVendorHeads() {
    var list;
    try {
      list = document.querySelectorAll('.mh,#modelMenu div,#modelMenu span');
    } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.hasAttribute(MARK)) return;
      var value = text(el).replace(/[·|•:—-]+$/, '').trim();
      if (VENDOR.indexOf(value) < 0) return;
      /* Не трогаем строки выбора модели — только подписи-разделители. */
      if (el.className && String(el.className).indexOf('mopt') >= 0) return;
      if (el.querySelector && el.querySelector('.mopt')) return;
      if (el.getAttribute && el.getAttribute('onclick')) return;
      el.setAttribute(MARK, 'vendor');
      if (el.parentElement) el.parentElement.removeChild(el);
    });
  }

  /* Значок модели не нашёлся — в разметку попало слово undefined. */
  var SYMBOL = [
    { mark: 'grok', sign: '✕' },
    { mark: 'gpt', sign: 'G' },
    { mark: 'claude', sign: 'C' },
    { mark: 'opus', sign: 'C' },
    { mark: 'fable', sign: 'C' },
    { mark: 'deepseek', sign: 'D' },
    { mark: 'qwen', sign: 'Q' },
    { mark: 'glm', sign: 'Z' },
    { mark: 'mistral', sign: 'M' },
    { mark: 'gemma', sign: 'G' }
  ];
  function signFor(row) {
    var value = text(row);
    for (var i = 0; i < SYMBOL.length; i++) {
      if (value.indexOf(SYMBOL[i].mark) >= 0) return SYMBOL[i].sign;
    }
    return '•';
  }
  function dropUndefined() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var hits = [];
    var node;
    while ((node = walker.nextNode())) {
      if (String(node.nodeValue).trim() === 'undefined') hits.push(node);
    }
    hits.forEach(function (hit) {
      var box = hit.parentElement;
      if (!box) return;
      var row = box;
      for (var i = 0; i < 4 && row.parentElement; i++) {
        if (text(row).length > 12) break;
        row = row.parentElement;
      }
      hit.nodeValue = signFor(row);
    });
  }

  /* Вход и выход должны сразу отражаться в меню, без ручной перезагрузки. */
  function token() {
    for (var i = 0; i < TOKEN_KEYS.length; i++) {
      try {
        var value = localStorage.getItem(TOKEN_KEYS[i]);
        if (value) return value;
      } catch (e) { return ''; }
    }
    return '';
  }
  function refresh() {
    var done = false;
    REFRESH.forEach(function (name) {
      if (typeof window[name] !== 'function') return;
      try { window[name](); done = true; } catch (e) {}
    });
    return done;
  }
  function watchAuth() {
    var seen = token();
    if (seen) { try { sessionStorage.removeItem(RELOADED); } catch (e) {} }
    setInterval(function () {
      var now = token();
      if (now === seen) return;
      seen = now;
      if (refresh()) return;
      /* У редактора нет подходящей функции — обновляем страницу один раз. */
      var once;
      try { once = sessionStorage.getItem(RELOADED); } catch (e) { once = '1'; }
      if (once) return;
      try { sessionStorage.setItem(RELOADED, '1'); } catch (e) {}
      setTimeout(function () { location.reload(); }, 350);
    }, 500);
    window.addEventListener('storage', function (event) {
      if (TOKEN_KEYS.indexOf(event.key) >= 0) refresh();
    });
  }

  function run() {
    dropInstall();
    dropVendorHeads();
    dropUndefined();
  }
  function start() {
    run();
    watchAuth();
    var pending = null;
    if (window.MutationObserver) {
      new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () { pending = null; run(); }, 150);
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
    setInterval(run, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
