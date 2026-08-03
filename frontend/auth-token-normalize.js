/* Один живой токен вместо пяти разных ключей.

   Разные слои ищут токен в одном и том же порядке и берут ПЕРВЫЙ найденный.
   Если в dl_auth_token лежит просроченная строка, а живая — в dl_token, то
   часть интерфейса получает 401 и считает человека гостем, а другая видит
   вошедшего. Состояние сайта распадается надвое.

   Здесь каждое различающееся значение проверяется запросом /api/auth/me.
   Живое кладётся в dl_token и остаётся в своём исходном ключе (его может
   читать сама страница), всё остальное удаляется. Если не работает ни одно —
   чистим всё: сессии нет, и интерфейс должен честно показать «Войти».

   После успешного входа или регистрации свежий токен тоже раскладывается
   сразу, а старые ключи сносятся — чтобы расхождение не появилось заново. */
(function () {
  'use strict';
  if (window.__dlTokenNormalize) return;
  window.__dlTokenNormalize = true;

  var MAIN = 'dl_token';
  var KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'authToken', 'access_token', 'token', 'dlToken'];
  var AUTH_URL = /\/api\/auth\/(login|register|github)/;

  function get(key) {
    try { return String(localStorage.getItem(key) || ''); } catch (e) { return ''; }
  }
  function set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* переполнено */ }
  }
  function drop(key) {
    try { localStorage.removeItem(key); } catch (e) { /* недоступно */ }
  }
  function usable(value) {
    return value.length >= 16 && value.length < 4096 && value.indexOf(' ') < 0 &&
      value !== 'null' && value !== 'undefined';
  }

  function values() {
    var out = [];
    KEYS.forEach(function (key) {
      var value = get(key);
      if (usable(value) && out.indexOf(value) < 0) out.push(value);
    });
    return out;
  }

  // Живое значение остаётся в dl_token и там, где лежало; всё остальное убираем.
  function keepOnly(good) {
    KEYS.forEach(function (key) {
      var value = get(key);
      if (!value) return;
      if (good && value === good) return;
      drop(key);
    });
    if (good) set(MAIN, good);
    window.__dlToken = good || '';
  }

  function ask(token) {
    try {
      return fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + token } })
        .then(function (response) { return !!(response && response.ok); })
        .catch(function () { return null; });   // null = непонятно, не трогаем
    } catch (e) {
      return Promise.resolve(null);
    }
  }

  function normalize() {
    var list = values();
    if (!list.length) { window.__dlToken = ''; return; }

    if (list.length === 1) {
      // Расхождения нет — просто сводим всё к одному ключу, без проверки по сети.
      keepOnly(list[0]);
      return;
    }

    var index = 0;
    var unknown = false;
    function step() {
      if (index >= list.length) {
        // Всё отклонено. Если хотя бы раз была сетевая ошибка — ничего не
        // удаляем: оборванная связь не повод выкидывать человека из аккаунта.
        if (!unknown) keepOnly('');
        return;
      }
      var token = list[index++];
      ask(token).then(function (ok) {
        if (ok === true) { keepOnly(token); return; }
        if (ok === null) unknown = true;
        step();
      });
    }
    step();
  }

  window.dlNormalizeTokens = normalize;

  /* Свежий токен из ответа на вход или регистрацию. */
  function watchFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlTokenWrap) return;
    var wrapped = function (input, init) {
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) { url = ''; }
      var out = original.apply(this, arguments);
      if (!AUTH_URL.test(url) || !out || !out.then) return out;
      return out.then(function (response) {
        if (!response || !response.ok) return response;
        try {
          response.clone().json().then(function (data) {
            var token = data && (data.token || data.access_token);
            if (typeof token === 'string' && usable(token)) keepOnly(token);
          }, function () { });
        } catch (e) { /* ответ не JSON */ }
        return response;
      });
    };
    wrapped.__dlTokenWrap = true;
    window.fetch = wrapped;
  }

  watchFetch();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', normalize);
  } else {
    normalize();
  }
})();
