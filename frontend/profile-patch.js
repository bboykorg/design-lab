/* Design Lab — экран профиля.
 * Это слой поверх главной страницы, а не отдельный документ, поэтому фон
 * остаётся родным: анимация и градиент главной видны сквозь панель.
 * Открыть: кнопка «Профиль», адрес с #profile или window.dlProfile().
 */
(function () {
  if (window.__dlProfilePatched) return;
  window.__dlProfilePatched = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var overlay = null;

  function readToken() {
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        var value = localStorage.getItem(TOKEN_KEYS[i]);
        if (value && value.length > 10) return value;
      }
    } catch (e) {}
    return '';
  }

  function headers() {
    var out = { 'Content-Type': 'application/json' };
    var token = readToken();
    if (token) out.Authorization = 'Bearer ' + token;
    return out;
  }

  function el(tag, css, text) {
    var node = document.createElement(tag);
    if (css) node.style.cssText = css;
    if (text != null) node.textContent = text;
    return node;
  }

  var FIELD = 'width:100%;box-sizing:border-box;margin-top:6px;padding:10px 12px;' +
    'border-radius:10px;border:1px solid rgba(255,255,255,.16);' +
    'background:rgba(255,255,255,.06);color:inherit;font:inherit;outline:none;';
  var LABEL = 'display:block;margin-top:14px;font-size:12px;opacity:.7;';
  var BUTTON = 'margin-top:16px;width:100%;padding:11px 14px;border-radius:10px;' +
    'border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.92);' +
    'color:#111;font:inherit;font-weight:600;cursor:pointer;';

  function field(parent, labelText, type, placeholder) {
    parent.appendChild(el('label', LABEL, labelText));
    var input = el('input', FIELD);
    input.type = type;
    input.autocomplete = type === 'password' ? 'off' : 'username';
    if (placeholder) input.placeholder = placeholder;
    parent.appendChild(input);
    return input;
  }

  function say(box, text, tone) {
    box.style.color = tone === 'error' ? '#ff8b8b' : '#8fe08f';
    box.textContent = text;
  }

  function send(path, body, box, done) {
    say(box, '\u0421\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u043c\u2026', 'ok');
    fetch(path, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { status: response.status, data: data };
        });
      })
      .then(function (result) {
        if (result.status >= 400) {
          var detail = result.data.detail;
          if (detail && typeof detail !== 'string') detail = JSON.stringify(detail);
          say(box, detail || ('\u041e\u0448\u0438\u0431\u043a\u0430 ' + result.status), 'error');
          return;
        }
        done(result.data, box);
      })
      .catch(function (error) {
        say(box, '\u0421\u0435\u0442\u044c \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430: ' + error, 'error');
      });
  }

  function logout() {
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) localStorage.removeItem(TOKEN_KEYS[i]);
    } catch (e) {}
    location.reload();
  }

  function build() {
    var back = el('div',
      'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;' +
      'justify-content:center;padding:24px;background:rgba(6,8,12,.55);' +
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);');

    var panel = el('div',
      'position:relative;width:100%;max-width:420px;max-height:86vh;overflow:auto;' +
      'padding:22px;border-radius:18px;border:1px solid rgba(255,255,255,.12);' +
      'background:rgba(18,20,26,.72);color:#fff;' +
      'font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
      'box-shadow:0 24px 70px rgba(0,0,0,.45);');

    var close = el('button',
      'position:absolute;top:12px;right:12px;width:30px;height:30px;border-radius:9px;' +
      'border:1px solid rgba(255,255,255,.16);background:transparent;color:#fff;' +
      'font-size:16px;line-height:1;cursor:pointer;', '\u00d7');
    close.addEventListener('click', hide);
    panel.appendChild(close);

    panel.appendChild(el('div', 'font-size:18px;font-weight:600;', '\u041f\u0440\u043e\u0444\u0438\u043b\u044c'));
    var who = el('div', 'margin-top:4px;font-size:12px;opacity:.65;', '\u0417\u0430\u0433\u0440\u0443\u0437\u043a\u0430\u2026');
    panel.appendChild(who);

    // --- Логин ---
    panel.appendChild(el('div',
      'margin-top:20px;padding-top:16px;border-top:1px solid rgba(255,255,255,.1);' +
      'font-weight:600;', '\u0421\u043c\u0435\u043d\u0438\u0442\u044c \u043b\u043e\u0433\u0438\u043d'));
    var newName = field(panel, '\u041d\u043e\u0432\u044b\u0439 \u043b\u043e\u0433\u0438\u043d', 'text', 'латиница, цифры, . _ -');
    var namePass = field(panel, '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'password', '');
    var nameNote = el('div', 'margin-top:10px;font-size:12px;min-height:16px;');
    var nameButton = el('button', BUTTON, '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043b\u043e\u0433\u0438\u043d');
    panel.appendChild(nameButton);
    panel.appendChild(nameNote);

    nameButton.addEventListener('click', function () {
      if (!newName.value.trim()) { say(nameNote, '\u0412\u0432\u0435\u0434\u0438 \u043d\u043e\u0432\u044b\u0439 \u043b\u043e\u0433\u0438\u043d', 'error'); return; }
      if (!namePass.value) { say(nameNote, '\u041d\u0443\u0436\u0435\u043d \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'error'); return; }
      send('/api/profile/username',
        { username: newName.value.trim().toLowerCase(), password: namePass.value },
        nameNote,
        function (data, box) {
          say(box, '\u041b\u043e\u0433\u0438\u043d \u0438\u0437\u043c\u0435\u043d\u0451\u043d: ' + data.username);
          namePass.value = '';
          who.textContent = '\u0410\u043a\u043a\u0430\u0443\u043d\u0442: ' + data.username;
        });
    });

    // --- Пароль ---
    panel.appendChild(el('div',
      'margin-top:22px;padding-top:16px;border-top:1px solid rgba(255,255,255,.1);' +
      'font-weight:600;', '\u0421\u043c\u0435\u043d\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c'));
    var oldPass = field(panel, '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'password', '');
    var pass1 = field(panel, '\u041d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'password', 'минимум 6 символов');
    var pass2 = field(panel, '\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u0435 \u043d\u043e\u0432\u044b\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'password', '');
    var passNote = el('div', 'margin-top:10px;font-size:12px;min-height:16px;');
    var passButton = el('button', BUTTON, '\u0421\u043e\u0445\u0440\u0430\u043d\u0438\u0442\u044c \u043f\u0430\u0440\u043e\u043b\u044c');
    panel.appendChild(passButton);
    panel.appendChild(passNote);

    passButton.addEventListener('click', function () {
      if (!oldPass.value) { say(passNote, '\u041d\u0443\u0436\u0435\u043d \u0442\u0435\u043a\u0443\u0449\u0438\u0439 \u043f\u0430\u0440\u043e\u043b\u044c', 'error'); return; }
      if (pass1.value.length < 6) { say(passNote, '\u041c\u0438\u043d\u0438\u043c\u0443\u043c 6 \u0441\u0438\u043c\u0432\u043e\u043b\u043e\u0432', 'error'); return; }
      if (pass1.value !== pass2.value) { say(passNote, '\u041f\u0430\u0440\u043e\u043b\u0438 \u043d\u0435 \u0441\u043e\u0432\u043f\u0430\u0434\u0430\u044e\u0442', 'error'); return; }
      send('/api/profile/password',
        { password: oldPass.value, new_password: pass1.value },
        passNote,
        function (data, box) {
          oldPass.value = pass1.value = pass2.value = '';
          say(box, '\u041f\u0430\u0440\u043e\u043b\u044c \u0438\u0437\u043c\u0435\u043d\u0451\u043d. \u041d\u0443\u0436\u0435\u043d \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u044b\u0439 \u0432\u0445\u043e\u0434\u2026');
          setTimeout(logout, 1500);
        });
    });

    back.appendChild(panel);
    back.addEventListener('click', function (event) {
      if (event.target === back) hide();
    });

    return { back: back, who: who };
  }

  function load(who) {
    fetch('/api/profile', { headers: headers() })
      .then(function (response) {
        if (response.status === 401) return null;
        return response.ok ? response.json() : null;
      })
      .then(function (data) {
        if (!data) {
          who.textContent = '\u0412\u043e\u0439\u0434\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442, \u0447\u0442\u043e\u0431\u044b \u043c\u0435\u043d\u044f\u0442\u044c \u0434\u0430\u043d\u043d\u044b\u0435';
          return;
        }
        who.textContent = '\u0410\u043a\u043a\u0430\u0443\u043d\u0442: ' + (data.username || '\u2014') +
          ' \u00b7 \u0442\u0430\u0440\u0438\u0444 ' + (data.plan || 'free');
      })
      .catch(function () {
        who.textContent = '\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0437\u0430\u0433\u0440\u0443\u0437\u0438\u0442\u044c \u043f\u0440\u043e\u0444\u0438\u043b\u044c';
      });
  }

  function show() {
    if (!overlay) overlay = build();
    if (!overlay.back.parentNode) document.body.appendChild(overlay.back);
    overlay.back.style.display = 'flex';
    load(overlay.who);
  }

  function hide() {
    if (overlay && overlay.back.parentNode) overlay.back.style.display = 'none';
    if (location.hash === '#profile') {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  window.dlProfile = show;

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') hide();
  });

  window.addEventListener('hashchange', function () {
    if (location.hash === '#profile') show();
  });

  function trigger() {
    if (document.getElementById('dlProfileButton')) return;
    if (!readToken()) return;
    var button = el('button',
      'position:fixed;top:14px;right:14px;z-index:9999;padding:7px 13px;border-radius:999px;' +
      'border:1px solid rgba(255,255,255,.18);background:rgba(20,22,28,.6);color:#fff;' +
      'backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);' +
      'font:12px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;cursor:pointer;',
      '\u041f\u0440\u043e\u0444\u0438\u043b\u044c');
    button.id = 'dlProfileButton';
    button.addEventListener('click', show);
    document.body.appendChild(button);
  }

  function start() {
    trigger();
    setInterval(trigger, 2000);
    if (location.hash === '#profile') show();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
