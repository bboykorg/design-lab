/* Чужие ключи не должны уходить из браузера.

   index.html писался до появления /api/proxy, когда страница ходила к шлюзам
   напрямую и ключ обязан был лежать в самой разметке. Сейчас ключи
   подставляет сервер из переменных окружения, а старые строки в разметке
   остались и по-прежнему уезжают в заголовках — их видно в F12 любому
   посетителю сайта.

   Соседний proxy-auth-patch.js уже перезаписывает заголовок, но только когда
   нашёл сессионный токен. Без входа в аккаунт старый ключ уходит как есть.
   Здесь дыра закрывается: если токена нет, заголовок просто удаляется.

   Файл proxy-auth-patch.js не трогается и со своего места не двигается. Этот
   слой идёт сразу за ним и работает снаружи: сначала чистим чужое, потом
   старый патч ставит сессионный токен.

   Важно: это не замена отзыву ключа. Строка остаётся в исходнике страницы
   и читается глазами; слой лишь перестаёт гонять её по сети. */
(function () {
  'use strict';
  if (window.__dlProxyKeyStrip) return;
  window.__dlProxyKeyStrip = true;

  var TOKEN_KEYS = [
    'dl_auth_token', 'dl_token', 'auth_token', 'authToken',
    'access_token', 'token', 'dlToken'
  ];

  // Заголовки ключей разных провайдеров: в браузере не нужен ни один.
  var DROP = ['x-api-key', 'api-key', 'x-goog-api-key', 'x-goog-api-client'];

  window.__dlStrippedKeys = [];

  function valid(value) {
    return typeof value === 'string' && value.length >= 16 &&
      value.length < 4096 && value.indexOf(' ') < 0;
  }

  function unpack(value) {
    if (valid(value)) return value;
    if (!value || value.charAt(0) !== '{') return '';
    try {
      var data = JSON.parse(value);
      if (valid(data.token)) return data.token;
      if (valid(data.access_token)) return data.access_token;
    } catch (e) { /* не JSON */ }
    return '';
  }

  function sessionToken() {
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        var value = unpack(localStorage.getItem(TOKEN_KEYS[i]));
        if (value) return value;
      }
      for (var j = 0; j < localStorage.length; j++) {
        var name = localStorage.key(j);
        if (!name || !/token/i.test(name)) continue;
        var spare = unpack(localStorage.getItem(name));
        if (spare) return spare;
      }
    } catch (e) { /* localStorage закрыт */ }
    return '';
  }

  // В журнал попадает только начало строки и её длина — сам ключ нигде
  // не повторяется, иначе слой сам стал бы утечкой.
  function remember(where, value) {
    var text = String(value || '').replace(/^Bearer\s+/i, '');
    if (!text) return;
    if (window.__dlStrippedKeys.length > 20) return;
    window.__dlStrippedKeys.push({
      where: where, head: text.slice(0, 6), length: text.length, at: Date.now()
    });
  }

  function proxyUrl(url) {
    return String(url || '').indexOf('/api/proxy') >= 0;
  }

  function clean(headers, token) {
    var current = '';
    try { current = headers.get('Authorization') || ''; } catch (e) { return; }
    var bare = current.replace(/^Bearer\s+/i, '');

    if (current && (!token || bare !== token)) {
      remember('authorization', current);
      if (token) headers.set('Authorization', 'Bearer ' + token);
      else headers.delete('Authorization');
    }

    for (var i = 0; i < DROP.length; i++) {
      var name = DROP[i];
      var value = '';
      try { value = headers.get(name) || ''; } catch (e) { continue; }
      if (!value) continue;
      remember(name, value);
      headers.delete(name);
    }
  }

  function wrapFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlKeyStrip) return;

    var wrapped = function (input, init) {
      var url = '';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
      } catch (e) { url = ''; }
      if (!proxyUrl(url)) return original.apply(this, arguments);

      var next = {};
      var source = init || {};
      Object.keys(source).forEach(function (name) { next[name] = source[name]; });

      var inherited;
      try {
        inherited = (typeof Request === 'function' && input instanceof Request)
          ? input.headers : undefined;
      } catch (e) { inherited = undefined; }

      var headers;
      try {
        headers = new Headers(next.headers || inherited || {});
      } catch (e) { return original.apply(this, arguments); }

      clean(headers, sessionToken());
      next.headers = headers;

      if (typeof input === 'string') return original.call(this, input, next);
      try {
        return original.call(this, new Request(input, next));
      } catch (e) {
        return original.apply(this, arguments);
      }
    };
    wrapped.__dlKeyStrip = true;
    window.fetch = wrapped;
  }

  // Старый код может ходить через XMLHttpRequest — там та же чистка.
  function wrapXhr() {
    if (typeof XMLHttpRequest !== 'function') return;
    var proto = XMLHttpRequest.prototype;
    if (!proto || proto.__dlKeyStrip) return;
    proto.__dlKeyStrip = true;

    var open = proto.open;
    var setHeader = proto.setRequestHeader;

    proto.open = function (method, url) {
      this.__dlProxyCall = proxyUrl(url);
      return open.apply(this, arguments);
    };

    proto.setRequestHeader = function (name, value) {
      if (!this.__dlProxyCall) return setHeader.apply(this, arguments);
      var lower = String(name || '').toLowerCase();

      if (lower === 'authorization') {
        var token = sessionToken();
        var bare = String(value || '').replace(/^Bearer\s+/i, '');
        if (token && bare === token) return setHeader.apply(this, arguments);
        remember('xhr:authorization', value);
        if (!token) return undefined;
        return setHeader.call(this, name, 'Bearer ' + token);
      }

      if (DROP.indexOf(lower) >= 0) {
        remember('xhr:' + lower, value);
        return undefined;
      }
      return setHeader.apply(this, arguments);
    };
  }

  wrapFetch();
  wrapXhr();
})();
