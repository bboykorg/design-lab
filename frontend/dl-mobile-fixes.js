/* Точечные исправления поверх всех остальных слоёв:
   1) кнопка «Установить приложение» убрана;
   2) в списке моделей вместо значка могло стоять слово undefined;
   3) у вошедшего пользователя в шапке и меню стоит ровно одна кнопка «Профиль»;
   4) в списке моделей нет названий провайдеров — только FREE и PRO;
   5) на телефоне всплывающие окна делаются непрозрачными; на компьютере оформление не меняется.

   СОСТОЯНИЕ ВХОДА — три значения, а не два.
   Прошлая версия считала человека вошедшим ТОЛЬКО после успешного
   /api/auth/me. Пока ответ шёл (или если сервис ответил 500/502/503),
   кнопка «Войти» уже убиралась, а «Профиль» ещё не рисовался — в шапке
   не оставалось ничего. Теперь:
     • есть токен и сервер не сказал 401 — человек считается вошедшим;
     • 401/403 — сессия закончилась, кэш ника чистится;
     • 500/502/503 или обрыв сети — состояние НЕ меняется.
   И если на странице вообще нет ни кнопки входа, ни выхода, кнопка
   «Профиль» добавляется сама — в шапку или в открытое меню.

   Нет постоянного скана страницы: прежние setInterval(run,1500) и
   setInterval(check,500) обходили весь DOM вместе с текстовыми узлами.
   Работа идёт по событиям: вход, выход, клик, новые узлы, поворот. */
(function () {
  'use strict';
  if (window.__dlMobileFixes) return;
  window.__dlMobileFixes = true;

  var PHONE_MAX = 760;
  var INSTALL = ['\u0443\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0435', 'install app', '\u0443\u0441\u0442\u0430\u043d\u043e\u0432\u0438\u0442\u044c \u0430\u043f\u043f'];
  var REFRESH = [
    'refreshAuthUI', 'updateAuthUI', 'renderAuth', 'syncAuth', 'applyAuth',
    'renderProfile', 'refreshProfile', 'loadProfile', 'updateProfile', 'fetchProfile',
    'dlRefreshProfile', 'dlRenderProfile', 'buildMobileMenu', 'renderMobileMenu',
    'dlBuildMenu', 'renderMenu', 'renderAccount', 'updateAccount', 'renderHeader',
    'updateHeader', 'renderNav', 'initAuth'
  ];
  var MARK = 'data-dl-removed';
  var SOLID = 'data-dl-solid';
  var ACCT = 'data-dl-account';
  var RELOADED = 'dl_auth_reloaded';
  var NICK_CACHE = 'dl_nick_cache';
  var BASE = '#0f1116';

  var style = document.createElement('style');
  style.textContent =
    '[' + MARK + ']{display:none!important}' +
    '[' + ACCT + '="made"]{display:inline-flex;align-items:center;justify-content:center;' +
    'padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,.18);' +
    'background:rgba(255,255,255,.08);color:inherit;font:inherit;cursor:pointer}' +
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
  function raw(node) {
    return String(node.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function inProfilePanel(el) {
    try { return !!el.closest('[data-dl-profile-panel]'); } catch (e) { return false; }
  }

  /* --- Кнопка установки приложения ------------------------------------ */
  function dropInstall() {
    var list;
    try { list = document.querySelectorAll('button,a,[role="button"]'); } catch (e) { return; }
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

  /* --- Заголовки провайдеров в списке моделей --------------------- */
  var VENDOR = [
    'seekai', 'seek ai', 'gorouter', 'kiwillm', 'kiwi', 'vyce', 'vyce ai',
    'cerebras', 'openrouter', 'bigmodel', 'z.ai'
  ];
  function dropVendorHeads() {
    var list;
    try { list = document.querySelectorAll('.mh,.mg,#modelMenu div,#modelMenu span'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.hasAttribute(MARK)) return;
      var value = text(el).replace(/[\u00b7|\u2022:\u2014-]+$/, '').trim();
      if (VENDOR.indexOf(value) < 0) return;
      if (el.className && String(el.className).indexOf('mopt') >= 0) return;
      if (el.querySelector && el.querySelector('.mopt')) return;
      if (el.getAttribute && el.getAttribute('onclick')) return;
      el.setAttribute(MARK, 'vendor');
      if (el.parentElement) el.parentElement.removeChild(el);
    });
  }

  /* --- undefined вместо значка модели (только в списках моделей) --- */
  var SYMBOL = [
    { mark: 'grok', sign: '\u2715' }, { mark: 'gpt', sign: 'G' },
    { mark: 'claude', sign: 'C' }, { mark: 'opus', sign: 'C' },
    { mark: 'fable', sign: 'C' }, { mark: 'deepseek', sign: 'D' },
    { mark: 'qwen', sign: 'Q' }, { mark: 'glm', sign: 'Z' },
    { mark: 'mistral', sign: 'M' }, { mark: 'gemma', sign: 'G' }
  ];
  var MODEL_HOSTS = '#modelMenu,#heroModelMenu,.mopt,[class*="model"],[id*="model"]';
  function signFor(row) {
    var value = text(row);
    for (var i = 0; i < SYMBOL.length; i++) {
      if (value.indexOf(SYMBOL[i].mark) >= 0) return SYMBOL[i].sign;
    }
    return '\u2022';
  }
  function dropUndefined() {
    var hosts;
    try { hosts = document.querySelectorAll(MODEL_HOSTS); } catch (e) { return; }
    if (!hosts.length) return;
    Array.prototype.forEach.call(hosts, function (host) {
      var walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT, null);
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
    });
  }

  /* --- Состояние входа ------------------------------------------- */
  var TOKEN_KEYS = ['dl_token', 'dl_auth_token', 'auth_token', 'authToken', 'access_token', 'token', 'dlToken'];
  var nick = '';
  try { nick = String(localStorage.getItem(NICK_CACHE) || ''); } catch (e) { nick = ''; }
  var confirmed = null;   // true — сервер подтвердил, false — 401, null — неизвестно
  var asking = false;

  function setNick(value) {
    value = String(value || '').trim();
    if (!value || value.length > 32 || value === nick) return;
    nick = value;
    try { localStorage.setItem(NICK_CACHE, value); } catch (e) {}
  }
  function forgetNick() {
    nick = '';
    try { localStorage.removeItem(NICK_CACHE); } catch (e) {}
  }
  function token() {
    for (var i = 0; i < TOKEN_KEYS.length; i++) {
      try {
        var value = localStorage.getItem(TOKEN_KEYS[i]) || sessionStorage.getItem(TOKEN_KEYS[i]);
        if (value && value.length >= 16) return value;
      } catch (e) {}
    }
    return '';
  }

  /* Токен есть и сервер не сказал 401 — показываем профиль. Временная
     ошибка сервиса не должна выкидывать человека из интерфейса. */
  function signedIn() {
    if (confirmed === false) return false;
    return confirmed === true || !!token();
  }

  function verify(then) {
    if (asking) return;
    var key = token();
    if (!key) {
      if (confirmed !== false) { confirmed = false; forgetNick(); run(); }
      if (then) then(false);
      return;
    }
    asking = true;
    try {
      fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + key } })
        .then(function (res) {
          asking = false;
          if (!res) return;
          if (res.status === 401 || res.status === 403) {
            confirmed = false;
            forgetNick();
            run();
            if (then) then(false);
            return;
          }
          if (!res.ok) {
            // 500/502/503 — сервис временно недоступен, состояние не трогаем.
            run();
            if (then) then(signedIn());
            return;
          }
          return res.json().then(function (data) {
            confirmed = true;
            if (data) setNick(data.username || data.login || data.nickname || data.name || '');
            run();
            if (then) then(true);
          }, function () {
            confirmed = true;
            run();
            if (then) then(true);
          });
        })
        .catch(function () {
          asking = false;
          run();
        });
    } catch (e) { asking = false; }
  }

  /* --- Кнопка профиля ---------------------------------------------- */
  var LOGOUT = /^\u0432\u044b\u0439\u0442\u0438(\s*[\u2014\u2013-]\s*(.+))?$/i;

  function openProfile(event) {
    if (event) { event.preventDefault(); event.stopPropagation(); }
    if (typeof window.dlProfile === 'function') { window.dlProfile(); return; }
    location.hash = '#profile';
  }
  function replaceWithProfile(el) {
    var host = el.parentElement;
    if (!host) return;
    host.setAttribute(ACCT, 'host');
    if (host.querySelector('[' + ACCT + '="open"]')) return;
    var tag = el.tagName === 'A' ? 'button' : el.tagName.toLowerCase();
    var button = document.createElement(tag);
    button.className = el.className || '';
    var css = el.getAttribute('style');
    if (css) button.setAttribute('style', css);
    button.setAttribute(ACCT, 'open');
    button.setAttribute('type', 'button');
    button.textContent = '\u041f\u0440\u043e\u0444\u0438\u043b\u044c';
    button.addEventListener('click', openProfile);
    host.insertBefore(button, el);
  }
  function accountButton() {
    var list;
    try { list = document.querySelectorAll('button,a,[role="button"]'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.getAttribute(ACCT) === 'open' || el.hasAttribute(MARK)) return;
      if (inProfilePanel(el)) return;
      var hit = LOGOUT.exec(raw(el));
      if (!hit) return;
      if (hit[2]) setNick(hit[2]);
      replaceWithProfile(el);
      el.setAttribute(MARK, 'logout');
      if (el.parentElement) el.parentElement.removeChild(el);
    });
  }

  /* Страховка: если после всех замен ни одной кнопки аккаунта не
     осталось — ставим свою в шапку или в открытое меню. */
  function visible(el) {
    try {
      var box = el.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    } catch (e) { return false; }
  }
  function accountHost() {
    var spots = document.querySelectorAll(
      '[' + ACCT + '="host"],header nav,header,nav,[class*="drawer"],[class*="burger"],' +
      '[class*="menu"],[id*="menu"],[class*="topbar"]'
    );
    for (var i = 0; i < spots.length; i++) {
      if (visible(spots[i])) return spots[i];
    }
    return null;
  }
  function ensureProfileButton() {
    if (!signedIn()) {
      var made = document.querySelectorAll('[' + ACCT + '="made"]');
      Array.prototype.forEach.call(made, function (el) {
        if (el.parentElement) el.parentElement.removeChild(el);
      });
      return;
    }
    var exists = document.querySelector('[' + ACCT + '="open"],[' + ACCT + '="made"]');
    if (exists && visible(exists)) return;
    if (exists && exists.parentElement) exists.parentElement.removeChild(exists);
    var host = accountHost();
    if (!host) return;
    var button = document.createElement('button');
    button.type = 'button';
    button.setAttribute(ACCT, 'made');
    button.textContent = '\u041f\u0440\u043e\u0444\u0438\u043b\u044c';
    button.addEventListener('click', openProfile);
    host.appendChild(button);
  }

  /* --- Кнопки входа у вошедшего пользователя ----------------------- */
  var SIGNIN = [
    '\u0432\u043e\u0439\u0442\u0438', '\u0432\u0445\u043e\u0434', '\u0432\u043e\u0439\u0442\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442', '\u0432\u043e\u0439\u0442\u0438 \u0432 \u043f\u0440\u043e\u0444\u0438\u043b\u044c',
    '\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0430\u0446\u0438\u044f', '\u0437\u0430\u0440\u0435\u0433\u0438\u0441\u0442\u0440\u0438\u0440\u043e\u0432\u0430\u0442\u044c\u0441\u044f', '\u0441\u043e\u0437\u0434\u0430\u0442\u044c \u0430\u043a\u043a\u0430\u0443\u043d\u0442',
    'sign in', 'sign up', 'log in', 'login'
  ];
  var BARS = 'header,nav,[' + ACCT + '="host"],' +
    '[class*="menu"],[class*="nav"],[class*="header"],[class*="drawer"],' +
    '[class*="burger"],[class*="sheet"],[class*="topbar"],[class*="toolbar"],' +
    '[id*="menu"],[id*="nav"],[id*="header"],[id*="drawer"],[id*="burger"]';
  function inBar(el) {
    try { return !!el.closest(BARS); } catch (e) { return false; }
  }
  function dropSignIn() {
    if (!signedIn()) return;
    var list;
    try { list = document.querySelectorAll('button,a,[role="button"]'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.getAttribute(ACCT) === 'open' || el.getAttribute(ACCT) === 'made') return;
      if (el.hasAttribute(MARK) || inProfilePanel(el)) return;
      var value = text(el).replace(/\s*[\u2192>\u203a]+$/, '').trim();
      if (SIGNIN.indexOf(value) < 0) return;
      if (!inBar(el)) return;
      replaceWithProfile(el);
      el.setAttribute(MARK, 'signin');
      if (el.parentElement) el.parentElement.removeChild(el);
    });
  }

  /* --- Строка списка с логином («05 korg») --------------------------- */
  function escape(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  function dropNickRow() {
    if (!nick || !signedIn()) return;
    var low = escape(nick.toLowerCase());
    var plain = new RegExp('^' + low + '$', 'i');
    var numbered = new RegExp('^\\d{1,2}\\s*[.)\u00b7-]?\\s*' + low + '$', 'i');

    var list;
    try { list = document.querySelectorAll('a,button,li,[role="button"],[role="menuitem"]'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      if (el.hasAttribute(MARK)) return;
      if (el.getAttribute(ACCT) === 'open' || el.getAttribute(ACCT) === 'made') return;
      if (inProfilePanel(el)) return;
      var value = text(el);
      if (value.length > 40) return;
      if (!plain.test(value) && !numbered.test(value)) return;

      var target = el;
      for (var i = 0; i < 3; i++) {
        var up = target.parentElement;
        if (!up) break;
        var upper = text(up);
        if (upper.length > 40) break;
        if (!plain.test(upper) && !numbered.test(upper)) break;
        target = up;
      }
      target.setAttribute(MARK, 'nick');
      if (target.parentElement) target.parentElement.removeChild(target);
    });
  }

  /* --- Непрозрачные всплывающие окна на телефоне ------------------ */
  var PANEL = '[data-dl-profile-panel],[data-dl-profile-panel] > div,' +
    '[role="dialog"],[class*="sheet"],[class*="modal"],[class*="menu"],' +
    '[class*="drawer"],[class*="popover"],[class*="dropdown"],[class*="account"],' +
    '[class*="profile"],[id*="menu"],[id*="modal"],[id*="sheet"],[id*="account"],[id*="profile"]';
  function floating(el, css) {
    var pos = css.position;
    if (pos === 'fixed' || pos === 'absolute' || pos === 'sticky') return true;
    try {
      return !!el.closest('[data-dl-profile-panel],[role="dialog"]');
    } catch (e) { return false; }
  }
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
      if (!floating(el, css)) return;

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
      var blur = String(css.backdropFilter || css.webkitBackdropFilter || '');
      if (alpha >= 1 && !/blur/.test(blur)) return;

      el.setAttribute(SOLID, '1');
      el.style.setProperty('background-color', tone, 'important');
      el.style.setProperty('background-image', 'none', 'important');
      el.style.setProperty('backdrop-filter', 'none', 'important');
      el.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
    });
  }
  function unsolidify() {
    if (phone()) return;
    var list;
    try { list = document.querySelectorAll('[' + SOLID + ']'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      el.removeAttribute(SOLID);
      el.style.removeProperty('background-color');
      el.style.removeProperty('background-image');
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-backdrop-filter');
    });
  }

  /* --- Вход и выход сразу отражаются в меню ---------------------- */
  function refresh() {
    var done = false;
    REFRESH.forEach(function (name) {
      if (typeof window[name] !== 'function') return;
      try { window[name](); done = true; } catch (e) {}
    });
    return done;
  }

  var lastToken = token();
  var checking = null;

  function check() {
    var now = token();
    if (now === lastToken) return;
    lastToken = now;
    if (!now) {
      confirmed = false;
      forgetNick();
      run();
    } else {
      confirmed = null;
      run();
    }
    verify(function () {
      if (refresh()) { setTimeout(run, 400); return; }
      var once;
      try { once = sessionStorage.getItem(RELOADED); } catch (e) { once = '1'; }
      if (once) return;
      try { sessionStorage.setItem(RELOADED, '1'); } catch (e) {}
      setTimeout(function () { location.reload(); }, 400);
    });
  }
  function soon() {
    if (checking) return;
    checking = setTimeout(function () { checking = null; check(); }, 150);
  }

  function watchAuth() {
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
          var auth = /(login|signin|sign-in|register|signup|auth|session|logout|profile|me)\b/i.test(url);
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

  var running = null;
  function runNow() {
    dropInstall();
    dropVendorHeads();
    dropUndefined();
    accountButton();
    dropSignIn();
    dropNickRow();
    ensureProfileButton();
    unsolidify();
    solidify();
  }
  function run() {
    if (running) return;
    running = setTimeout(function () { running = null; runNow(); }, 200);
  }

  function start() {
    runNow();
    verify();
    watchAuth();

    if (window.MutationObserver) {
      var pending = null;
      new MutationObserver(function (records) {
        if (pending) return;
        var worth = false;
        for (var i = 0; i < records.length; i++) {
          var added = records[i].addedNodes;
          if (added && added.length) { worth = true; break; }
        }
        if (!worth) return;
        pending = setTimeout(function () { pending = null; runNow(); }, 300);
      }).observe(document.documentElement, { childList: true, subtree: true });
    }

    document.addEventListener('click', run, true);
    window.addEventListener('hashchange', run);
    window.addEventListener('resize', function () { unsolidify(); solidify(); });
    window.addEventListener('orientationchange', run);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
