/* Design Lab — turn backend validation details into a readable registration error. */
(function () {
  'use strict';
  if (window.__dlAuthErrorPatched || !window.fetch) return;
  window.__dlAuthErrorPatched = true;
  var previous = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    return previous(input, init).then(function (response) {
      if (url.indexOf('/api/auth/register') < 0 || response.status !== 422) return response;
      return response.clone().json().then(function (data) {
        data.detail = 'Логин: только английские буквы, цифры, точка, дефис и подчёркивание. Длина — от 3 до 40 символов.';
        return new Response(JSON.stringify(data), { status: response.status, statusText: response.statusText, headers: { 'Content-Type': 'application/json' } });
      }).catch(function () { return response; });
    });
  };
})();
