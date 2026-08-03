/* Честная ошибка при регистрации и входе.

   Раньше ЛЮБАЯ ошибка 422 подменялась текстом про логин. Если на самом
   деле был короткий пароль, человек правил логин, снова получал то же самое
   и уходил. Теперь разбирается detail[].loc из ответа FastAPI: ошибка в поле
   username даёт текст про логин, в поле password — про длину пароля, всё
   остальное показывается так, как его написал сервер.

   Заодно короткий пароль и неверный логин ловятся ДО запроса: ответ с
   понятным текстом возвращается сразу, без похода на сервер. */
(function () {
  'use strict';
  if (window.__dlAuthErrorPatched || typeof window.fetch !== 'function') return;
  window.__dlAuthErrorPatched = true;

  var USER_MSG = '\u041b\u043e\u0433\u0438\u043d: \u0442\u043e\u043b\u044c\u043a\u043e \u0430\u043d\u0433\u043b\u0438\u0439\u0441\u043a\u0438\u0435 \u0431\u0443\u043a\u0432\u044b, \u0446\u0438\u0444\u0440\u044b, \u0442\u043e\u0447\u043a\u0430, \u0434\u0435\u0444\u0438\u0441 \u0438 \u043f\u043e\u0434\u0447\u0451\u0440\u043a\u0438\u0432\u0430\u043d\u0438\u0435. \u0414\u043b\u0438\u043d\u0430 \u2014 \u043e\u0442 3 \u0434\u043e 40 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432.';
  var PASS_MSG = '\u041f\u0430\u0440\u043e\u043b\u044c: \u043c\u0438\u043d\u0438\u043c\u0443\u043c 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432.';

  var AUTH_URL = /\/api\/auth\/(register|login)/;
  var NAME_OK = /^[a-z0-9_.-]{3,40}$/;

  function toast(text) {
    try {
      if (typeof window.toast === 'function') window.toast(text);
    } catch (e) { /* чужая функция */ }
  }

  function answer(text) {
    toast(text);
    return Promise.resolve(new Response(JSON.stringify({ detail: text }), {
      status: 422, headers: { 'Content-Type': 'application/json' }
    }));
  }

  // detail от FastAPI — массив вида [{loc:['body','password'], msg:'...'}].
  function fromDetail(detail) {
    if (typeof detail === 'string') return detail;
    if (!detail || !detail.length) return '';

    var wantsUser = false;
    var wantsPass = false;
    var other = '';

    for (var i = 0; i < detail.length; i++) {
      var item = detail[i] || {};
      var loc = item.loc || [];
      var field = String(loc.length ? loc[loc.length - 1] : '').toLowerCase();
      if (field.indexOf('user') >= 0 || field.indexOf('login') >= 0) wantsUser = true;
      else if (field.indexOf('pass') >= 0) wantsPass = true;
      else if (!other) other = String(item.msg || '');
    }

    var parts = [];
    if (wantsUser) parts.push(USER_MSG);
    if (wantsPass) parts.push(PASS_MSG);
    if (!parts.length && other) parts.push(other);
    return parts.join(' ');
  }

  function bodyOf(init) {
    var raw = init && typeof init.body === 'string' ? init.body : '';
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      return (data && typeof data === 'object') ? data : null;
    } catch (e) { return null; }
  }

  var previous = window.fetch.bind(window);

  window.fetch = function (input, init) {
    var url = '';
    try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) { url = ''; }
    if (!AUTH_URL.test(url)) return previous(input, init);

    var register = url.indexOf('/register') >= 0;
    var body = bodyOf(init);

    // Проверка до запроса — только для регистрации. На входе требования могут
    // отличаться от текущих, и старый аккаунт блокировать нельзя.
    if (register && body) {
      var name = String(body.username || '').trim().toLowerCase();
      var pass = String(body.password || '');
      if (name && !NAME_OK.test(name)) return answer(USER_MSG);
      if (pass.length < 6) return answer(PASS_MSG);
    }

    return previous(input, init).then(function (response) {
      if (!response || response.status !== 422) return response;
      return response.clone().json().then(function (data) {
        var text = fromDetail(data && data.detail);
        if (!text) return response;
        return new Response(JSON.stringify({ detail: text }), {
          status: response.status,
          statusText: response.statusText,
          headers: { 'Content-Type': 'application/json' }
        });
      }).catch(function () { return response; });
    });
  };
})();
