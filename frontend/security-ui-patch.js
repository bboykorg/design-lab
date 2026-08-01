/* Authorization for every protected API + password-policy hints. */
(function () {
  if (window.__dlSecurityUiPatched) return;
  window.__dlSecurityUiPatched = true;

  var TOKEN_KEYS = [
    'dl_auth_token', 'dl_token', 'auth_token', 'authToken',
    'token', 'access_token', 'dlToken'
  ];
  var PROTECTED = [
    '/api/proxy', '/api/ai', '/api/ocr', '/api/audit',
    '/api/projects', '/api/plan', '/api/profile'
  ];

  function valid(value) {
    return typeof value === 'string' && value.length >= 16 &&
      value.length < 4096 && value.indexOf(' ') < 0;
  }

  function tokenFrom(value) {
    if (valid(value)) return value;
    if (!value || value.charAt(0) !== '{') return '';
    try {
      var data = JSON.parse(value);
      if (valid(data.token)) return data.token;
      if (valid(data.access_token)) return data.access_token;
    } catch (error) {}
    return '';
  }

  function token() {
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        var direct = tokenFrom(localStorage.getItem(TOKEN_KEYS[i]));
        if (direct) return direct;
      }
      // Старые версии сайта могли сохранить токен под другим именем.
      for (var j = 0; j < localStorage.length; j++) {
        var key = localStorage.key(j);
        if (!key) continue;
        var value = localStorage.getItem(key);
        var nested = tokenFrom(value);
        if (nested && (/token/i.test(key) || (value && value.charAt(0) === '{'))) {
          return nested;
        }
      }
    } catch (error) {}
    return '';
  }

  function isProtected(url) {
    for (var i = 0; i < PROTECTED.length; i++) {
      if (url.indexOf(PROTECTED[i]) >= 0) return true;
    }
    return false;
  }

  var previousFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : ((input && input.url) || '');
    if (!isProtected(url)) return previousFetch(input, init);

    var next = Object.assign({}, init || {});
    var inherited = input instanceof Request ? input.headers : undefined;
    var headers = new Headers(next.headers || inherited);
    var value = token();
    if (value && !headers.has('Authorization')) {
      headers.set('Authorization', 'Bearer ' + value);
    }
    next.headers = headers;

    if (typeof input === 'string') return previousFetch(input, next);
    return previousFetch(new Request(input, next));
  };

  function updateHints() {
    var inputs = document.querySelectorAll('input[type="password"]');
    for (var i = 0; i < inputs.length; i++) {
      var placeholder = inputs[i].getAttribute('placeholder') || '';
      if (/минимум\s+6\s+символ/i.test(placeholder)) {
        inputs[i].setAttribute('placeholder', placeholder.replace(/6/, '10'));
      }
    }
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('button');
    if (!button || (button.textContent || '').trim() !== 'Сохранить пароль') return;
    var root = button.parentElement;
    while (root && root.querySelectorAll('input[type="password"]').length < 3) {
      root = root.parentElement;
    }
    if (!root) return;
    var fields = root.querySelectorAll('input[type="password"]');
    var newPassword = fields[fields.length - 2];
    if (newPassword && newPassword.value.length < 10) {
      event.preventDefault();
      event.stopImmediatePropagation();
      newPassword.setCustomValidity('Пароль должен содержать минимум 10 символов');
      newPassword.reportValidity();
      newPassword.addEventListener('input', function clear() {
        newPassword.setCustomValidity('');
        newPassword.removeEventListener('input', clear);
      });
    }
  }, true);

  updateHints();
  if (window.MutationObserver) {
    new MutationObserver(updateHints).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
})();
