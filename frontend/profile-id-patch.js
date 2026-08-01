/* Design Lab — visible, copyable user ID in the profile panel. */
(function () {
  'use strict';
  if (window.__dlProfileIdPatched) return;
  window.__dlProfileIdPatched = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];

  function token() {
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        var value = localStorage.getItem(TOKEN_KEYS[i]);
        if (value && value.length > 10) return value;
      }
    } catch (e) {}
    return '';
  }

  function profile() {
    var value = token();
    if (!value) return Promise.resolve(null);
    return fetch('/api/profile', { headers: { Authorization: 'Bearer ' + value } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .catch(function () { return null; });
  }

  function fallbackCopy(text) {
    var input = document.createElement('textarea');
    input.value = text;
    input.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(input);
    input.select();
    try { document.execCommand('copy'); } catch (e) {}
    input.remove();
  }

  function addId(data) {
    if (!data || !data.id) return;
    var panel = document.querySelector('[data-dl-profile-panel] > div');
    if (!panel || panel.querySelector('[data-dl-user-id]')) return;
    var row = document.createElement('div');
    row.setAttribute('data-dl-user-id', '1');
    row.style.cssText = 'margin-top:12px;padding:10px 12px;border:1px solid rgba(255,255,255,.12);border-radius:10px;background:rgba(255,255,255,.04);font:12px/1.4 system-ui,sans-serif;';
    var label = document.createElement('div');
    label.textContent = 'ID пользователя';
    label.style.cssText = 'margin-bottom:5px;opacity:.65;';
    var line = document.createElement('div');
    line.style.cssText = 'display:flex;gap:8px;align-items:center;';
    var value = document.createElement('code');
    value.textContent = data.id;
    value.style.cssText = 'min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;font-size:11px;';
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Копировать';
    copy.style.cssText = 'border:1px solid rgba(255,255,255,.2);border-radius:7px;padding:5px 7px;background:transparent;color:#fff;cursor:pointer;font:inherit;';
    copy.addEventListener('click', function () {
      var done = function () { copy.textContent = 'Скопировано'; setTimeout(function () { copy.textContent = 'Копировать'; }, 1200); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(data.id).then(done).catch(function () { fallbackCopy(data.id); done(); });
      else { fallbackCopy(data.id); done(); }
    });
    line.appendChild(value);
    line.appendChild(copy);
    row.appendChild(label);
    row.appendChild(line);
    var who = panel.querySelector('div');
    if (who && who.nextSibling) panel.insertBefore(row, who.nextSibling);
    else panel.appendChild(row);
  }

  function watch() {
    setInterval(function () {
      var open = document.querySelector('[data-dl-profile-panel]');
      if (!open || open.style.display === 'none' || open.querySelector('[data-dl-user-id]')) return;
      profile().then(addId);
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch);
  else watch();
})();
