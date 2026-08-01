/* /api/proxy expects the Design Lab session token, never a provider key. */
(function () {
  if (window.__dlProxyAuthPatched || typeof window.fetch !== 'function') return;
  window.__dlProxyAuthPatched = true;

  var KEYS = [
    'dl_auth_token', 'dl_token', 'auth_token', 'authToken',
    'access_token', 'token', 'dlToken'
  ];

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
    } catch (error) {}
    return '';
  }

  function sessionToken() {
    try {
      for (var i = 0; i < KEYS.length; i++) {
        var value = unpack(localStorage.getItem(KEYS[i]));
        if (value) return value;
      }
      for (var j = 0; j < localStorage.length; j++) {
        var key = localStorage.key(j);
        if (!key || !/token/i.test(key)) continue;
        var fallback = unpack(localStorage.getItem(key));
        if (fallback) return fallback;
      }
    } catch (error) {}
    return '';
  }

  var previous = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : ((input && input.url) || '');
    if (url.indexOf('/api/proxy') < 0) return previous(input, init);

    var token = sessionToken();
    if (!token) return previous(input, init);

    var next = Object.assign({}, init || {});
    var inherited = input instanceof Request ? input.headers : undefined;
    var headers = new Headers(next.headers || inherited);

    // Important: overwrite a legacy provider Authorization header. The backend
    // supplies provider keys itself; this header is only for the user session.
    headers.set('Authorization', 'Bearer ' + token);
    next.headers = headers;

    if (typeof input === 'string') return previous(input, next);
    return previous(new Request(input, next));
  };
})();
