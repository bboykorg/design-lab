/* Точечные исправления поверх всех остальных слоёв:
   1) кнопка «Установить приложение» убрана — на телефоне она перекрывала интерфейс;
   2) в списке моделей вместо значка могло стоять слово undefined;
   3) после входа аккаунт в бургер-меню появлялся только после перезагрузки;
   4) в списке моделей не должно быть названий провайдеров — только FREE и PRO;
   5) на телефоне всплывающие окна (профиль, меню, листы) делаются непрозрачными.
      На компьютере оформление не меняется: там прозрачность читаемости не мешает. */
(function () {
  'use strict';
  if (window.__dlMobileFixes) return;
  window.__dlMobileFixes = true;

  var PHONE_MAX = 760;
  var INSTALL = ['установить приложение', 'install app', 'установить апп'];
  var REFRESH = [
    'refreshAuthUI', 'updateAuthUI', 'renderAuth', 'syncAuth', 'applyAuth',
    'renderProfile', 'refreshProfile', 'loadProfile', 'updateProfile', 'fetchProfile',
    'dlRefreshProfile', 'dlRenderProfile', 'buildMobileMenu', 'renderMobileMenu',
    'dlBuildMenu', 'renderMenu', 'renderAccount', 'updateAccount', 'renderHeader',
    'updateHeader', 'renderNav', 'initAuth'
  ];
  var MARK = 'data-dl-removed';
  var SOLID = 'data-dl-solid';
  var RELOADED = 'dl_auth_reloaded';
  var BASE = '#0b0b0b';

  /* Стили в медиазапросе: на пк они просто не применяются. */
  var style = document.createElement('style');
  style.textContent =
    '[' + MARK + ']{display:none!important}' +
    '@media (max-width:' + PHONE_MAX + 'px){' +
    '[' + SOLID + ']{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}' +
    '}';
  (document.head || document.documentElement).appendChild(style);

  function phone() {
    if (document.documentElement.classList.contains('dl-phone')) return true;
    return (window.innerWidth || 9999) <= PHONE_MAX;
  }
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

  /* На телефоне окно профиля занимает весь экран, и сквозь него видна страница:
     текст и поля читаются плохо. Делаем фон плотным и убираем размытие.
     Свой цвет панели сохраняем; если фона нет вовсе — подкладываем базовый тёмный. */
  var PANEL = '[role="dialog"],[class*="sheet"],[class*="modal"],[class*="menu"],' +
    '[class*="drawer"],[class*="popover"],[class*="dropdown"],[class*="account"],' +
    '[class*="profile"],[id*="menu"],[id*="modal"],[id*="sheet"],[id*="account"],[id*="profile"]';
  function solidify() {
    if (!phone()) return;
    var list;
    try { list = document.querySelectorAll(PANEL); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.hasAttribute(SOLID) || el === document.body) return;
      var box;
      try { box = el.getBoundingClientRect(); } catch (e) { return; }
      if (box.width < 40 || box.height < 40) return;
      var css = window.getComputedStyle(el);
      if (css.display === 'none' || css.visibility === 'hidden') return;
      /* Статичные блоки в потоке страницы не трогаем — только всплывающие. */
      var pos = css.position;
      if (pos !== 'fixed' && pos !== 'absolute' && pos !== 'sticky') return;

      var rgba = String(css.backgroundColor || '').match(/^rgba?\(([^)]+)\)$/);
      var alpha = 1;
      var tone = BASE;
      if (rgba) {
        var parts = rgba[1].split(',');
        alpha = parts.length > 3 ? parseFloat(parts[3]) : 1;
        if (alpha > 0) {
          tone = 'rgb(' + parts[0].trim() + ',' + parts[1].trim() + ',' + parts[2].trim() + ')';
        }
      }
      var blurred = /blur/.test(String(css.backdropFilter || css.webkitBackdropFilter || ''));
      if (alpha >= 1 && !blurred) return;

      el.setAttribute(SOLID, '1');
      el.style.setProperty('background-color', tone, 'important');
      el.style.setProperty('backdrop-filter', 'none', 'important');
      el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    });
  }
  /* При смене ширины (поворот, окно на пк) возвращаем исходное оформление. */
  function unsolidify() {
    if (phone()) return;
    var list;
    try { list = document.querySelectorAll('[' + SOLID + ']'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      el.removeAttribute(SOLID);
      el.style.removeProperty('background-color');
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-backdrop-filter');
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

    try {
      if (typeof window.fetch === 'function' && !window.fetch.__dlWrapped) {
        var base = window.fetch;
        var patched = function (input) {
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
    unsolidify();
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
    window.addEventListener('resize', function () { unsolidify(); solidify(); });
    setInterval(run, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
