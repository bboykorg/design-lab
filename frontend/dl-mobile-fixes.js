/* Точечные исправления поверх всех остальных слоёв:
   1) кнопка «Установить приложение» убрана — на телефоне она перекрывала интерфейс;
   2) в списке моделей вместо значка могло стоять слово undefined;
   3) после входа аккаунт в бургер-меню появлялся только после перезагрузки;
   4) в списке моделей не должно быть названий провайдеров — только FREE и PRO;
   5) всплывающие панели (меню, карточка аккаунта) делаются непрозрачными. */
(function () {
  'use strict';
  if (window.__dlMobileFixes) return;
  window.__dlMobileFixes = true;

  var INSTALL = ['установить приложение', 'install app', 'установить апп'];
  var REFRESH = [
    'refreshAuthUI', 'updateAuthUI', 'renderAuth', 'syncAuth', 'applyAuth',
    'renderProfile', 'refreshProfile', 'loadProfile', 'updateProfile', 'fetchProfile',
    'dlRefreshProfile', 'dlRenderProfile', 'buildMobileMenu', 'renderMobileMenu',
    'dlBuildMenu', 'renderMenu', 'renderAccount', 'updateAccount', 'renderHeader',
    'updateHeader', 'renderNav', 'boot', 'initAuth'
  ];
  var MARK = 'data-dl-removed';
  var SOLID = 'data-dl-solid';
  var RELOADED = 'dl_auth_reloaded';

  var style = document.createElement('style');
  style.textContent =
    '[' + MARK + ']{display:none!important}' +
    '[' + SOLID + ']{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}';
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

  /* Заголовки с названием провайдера в списке моделей не нужны. */
  var VENDOR = [
    'seekai', 'seek ai', 'gorouter', 'kiwillm', 'kiwi', 'vyce', 'vyce ai',
    'cerebras', 'openrouter', 'bigmodel', 'z.ai'
  ];
  function dropVendorHeads() {
    var list;
    try { list = document.querySelectorAll('.mh,.mg,#modelMenu div,#modelMenu span'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.hasAttribute(MARK)) return;
      var value = text(el).replace(/[·|•:—-]+$/, '').trim();
      if (VENDOR.indexOf(value) < 0) return;
      if (el.className && String(el.className).indexOf('mopt') >= 0) return;
      if (el.querySelector && el.querySelector('.mopt')) return;
      if (el.getAttribute && el.getAttribute('onclick')) return;
      el.setAttribute(MARK, 'vendor');
      if (el.parentElement) el.parentElement.removeChild(el);
    });
  }

  /* Значок модели не нашёлся — в разметку попало слово undefined. */
  var SYMBOL = [
    { mark: 'grok', sign: '✕' }, { mark: 'gpt', sign: 'G' },
    { mark: 'claude', sign: 'C' }, { mark: 'opus', sign: 'C' },
    { mark: 'fable', sign: 'C' }, { mark: 'deepseek', sign: 'D' },
    { mark: 'qwen', sign: 'Q' }, { mark: 'glm', sign: 'Z' },
    { mark: 'mistral', sign: 'M' }, { mark: 'gemma', sign: 'G' }
  ];
  function signFor(row) {
    var value = text(row);
    for (var i = 0; i < SYMBOL.length; i++) {
      if (value.indexOf(SYMBOL[i].mark) >= 0) return SYMBOL[i].sign;
    }
    return '•';
  }
  function dropUndefined() {
    if (!document.body) return;
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

  /* Полупрозрачные панели нечитаемы на телефоне: сквозь карточку аккаунта
     просвечивает страница. Цвет сохраняем, убираем только прозрачность.
     Затемняющие подложки во весь экран не трогаем. */
  var PANEL = '[role="dialog"],[class*="sheet"],[class*="modal"],[class*="menu"],' +
    '[class*="drawer"],[class*="popover"],[class*="dropdown"],[class*="account"],' +
    '[class*="profile"],[id*="menu"],[id*="modal"],[id*="sheet"],[id*="account"],[id*="profile"]';
  function solidify() {
    var list;
    try { list = document.querySelectorAll(PANEL); } catch (e) { return; }
    var vw = window.innerWidth || 0;
    var vh = window.innerHeight || 0;
    Array.prototype.forEach.call(list, function (el) {
      if (el.hasAttribute(SOLID)) return;
      var box;
      try { box = el.getBoundingClientRect(); } catch (e) { return; }
      if (box.width < 40 || box.height < 40) return;
      /* Подложка на весь экран — ей прозрачность нужна. */
      if (vw && vh && box.width >= vw * .96 && box.height >= vh * .96) return;
      var css = window.getComputedStyle(el);
      if (css.display === 'none' || css.visibility === 'hidden') return;
      var bg = css.backgroundColor || '';
      var rgba = bg.match(/^rgba?\(([^)]+)\)$/);
      if (!rgba) return;
      var parts = rgba[1].split(',');
      if (parts.length < 4) return;
      var alpha = parseFloat(parts[3]);
      /* Полностью прозрачный — это оболочка без фона, её не трогаем. */
      if (!(alpha > 0 && alpha < 1)) return;
      el.setAttribute(SOLID, '1');
      el.style.setProperty('background-color',
        'rgb(' + parts[0].trim() + ',' + parts[1].trim() + ',' + parts[2].trim() + ')', 'important');
      el.style.setProperty('backdrop-filter', 'none', 'important');
      el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    });
  }

  /* Вход и выход должны сразу отражаться в меню.
     Ключ токена угадывать бессмысленно — смотрим на всё хранилище сразу. */
  var AUTHY = /(token|auth|user|profile|session|login|jwt|nick|account|plan)/i;
  function snapshot() {
    var parts = [];
    [localStorage, sessionStorage].forEach(function (store) {
      try {
        for (var i = 0; i < store.length; i++) {
          var key = store.key(i);
          if (!key || !AUTHY.test(key)) continue;
          parts.push(key + '=' + String(store.getItem(key) || '').slice(0, 64));
        }
      } catch (e) {}
    });
    return parts.sort().join('|');
  }
  function refresh() {
    var done = false;
    REFRESH.forEach(function (name) {
      if (typeof window[name] !== 'function') return;
      try { window[name](); done = true; } catch (e) {}
    });
    return done;
  }

  var seen = snapshot();
  var checking = null;
  function check() {
    var now = snapshot();
    if (now === seen) return;
    seen = now;
    run();
    if (refresh()) { setTimeout(run, 400); return; }
    /* Ни одной подходящей функции нет — обновляем страницу один раз за сеанс. */
    var once;
    try { once = sessionStorage.getItem(RELOADED); } catch (e) { once = '1'; }
    if (once) return;
    try { sessionStorage.setItem(RELOADED, '1'); } catch (e) {}
    setTimeout(function () { location.reload(); }, 400);
  }
  function soon() {
    if (checking) return;
    checking = setTimeout(function () { checking = null; check(); }, 120);
  }

  function watchAuth() {
    setInterval(check, 500);
    window.addEventListener('storage', soon);
    window.addEventListener('focus', soon);
    document.addEventListener('visibilitychange', soon);

    /* Запись токена — самый ранний признак успешного входа. */
    try {
      ['setItem', 'removeItem', 'clear'].forEach(function (name) {
        var base = Storage.prototype[name];
        if (typeof base !== 'function' || base.__dlWrapped) return;
        var wrapped = function () {
          var out = base.apply(this, arguments);
          soon();
          return out;
        };
        wrapped.__dlWrapped = true;
        Storage.prototype[name] = wrapped;
      });
    } catch (e) {}

    /* А если токен живёт только в памяти — ловим сам ответ на вход. */
    try {
      if (typeof window.fetch === 'function' && !window.fetch.__dlWrapped) {
        var base = window.fetch;
        var patched = function (input, init) {
          var url = '';
          try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) {}
          var auth = /(login|signin|sign-in|register|signup|auth|session|profile|me)\b/i.test(url);
          return base.apply(this, arguments).then(function (res) {
            if (auth && res && res.ok) {
              setTimeout(function () { refresh(); run(); }, 250);
              setTimeout(soon, 700);
            }
            return res;
          });
        };
        patched.__dlWrapped = true;
        window.fetch = patched;
      }
    } catch (e) {}
  }

  function run() {
    dropInstall();
    dropVendorHeads();
    dropUndefined();
    solidify();
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
