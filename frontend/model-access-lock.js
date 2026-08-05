/* Design Lab — доступность моделей для гостей и тарифа Free.

   Область действия — только списки моделей. Всё остаётся нажимаемым,
   недоступные модели просто выглядят серыми. Строки находятся двумя
   способами, чтобы был покрыт каждый экран:
     1. явная разметка (.mopt / onclick="pickModel('key')");
     2. любой контейнер, где перечислены три и более названия моделей.

   Почему после входа всё было серым и просило зарегистрироваться. Слой брал
   токен сам, в своём порядке ключей, и первым стоял dl_auth_token. Там могла
   лежать старая строка от прошлой сессии, хотя живой токен лежит в dl_token.
   Запрос тарифа получал отказ, а любой отказ считался «гость» — и гасились
   вообще все модели, включая бесплатные.

   Что изменилось:
     • токен берётся из единого источника (auth-token-normalize.js), dl_token первый;
     • если /api/plan отказал, спрашивается /api/profile, затем /api/auth/me;
     • сбой сети или ошибка сервера больше не делают человека гостем: берётся
       последний известный тариф, а если его нет — не блокируется ничего;
     • пока список бесплатных моделей не готов, на Free ничего не гасится;
     • состояние перечитывается после входа, выхода и возврата на вкладку. */
(function () {
  'use strict';
  if (window.__dlModelAccessLock) return;
  window.__dlModelAccessLock = true;

  var TOKEN_KEYS = ['dl_token', 'dl_auth_token', 'auth_token', 'token', 'dlToken'];
  var PLAN_CACHE = 'dl_plan_cache';
  var LOCK_ATTR = 'data-dl-model-locked';
  var PILL_ATTR = 'data-dl-model-pill-locked';
  var KEY_ATTR = 'data-dl-model-key';
  var PLANS = { free: 1, pro: 1, team: 1 };
  var RETRY_MS = 20000;   // повтор, пока тариф не выяснен
  var TICK_MS = 700;      // обычная перерисовка отметок
  var TOKEN_MS = 1200;    // слежение за появлением токена после входа

  /* ready — есть ли право гасить строки. Пока false, всё выглядит обычно. */
  var state = { ready: false, signedIn: false, plan: 'guest', rows: 0, locked: 0, source: 'boot' };
  window.dlModelLock = state;

  var lastToken = null;
  var busy = false;
  var retryTimer = 0;

  function style() {
    if (document.getElementById('dl-model-lock-css')) return;
    var css = document.createElement('style');
    css.id = 'dl-model-lock-css';
    css.textContent =
      '[' + LOCK_ATTR + '="1"]{filter:grayscale(1) !important;opacity:.42 !important;cursor:not-allowed !important;}' +
      '[' + LOCK_ATTR + '="1"]:hover{background:transparent !important;}' +
      '[' + PILL_ATTR + '="1"]{filter:grayscale(1) !important;opacity:.55 !important;}' +
      '.dl-plan-badge{margin-left:auto;font-size:10px;letter-spacing:.04em;padding:1px 6px;border-radius:999px;' +
      'border:1px solid rgba(255,255,255,.18);opacity:.75;text-transform:uppercase;}';
    (document.head || document.documentElement).appendChild(css);
  }

  function map() { try { return typeof MODELS !== 'undefined' ? MODELS : null; } catch (e) { return null; } }

  /* Единый живой токен: сначала нормализатор, потом хранилище. */
  function token() {
    try { if (typeof window.dlNormalizeTokens === 'function') window.dlNormalizeTokens(); } catch (e) {}
    try {
      if (window.__dlToken && String(window.__dlToken).length > 10) return String(window.__dlToken);
    } catch (e) {}
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        var value = localStorage.getItem(TOKEN_KEYS[i]);
        if (value && value.length > 10) return value;
      }
    } catch (e) {}
    return '';
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(PLAN_CACHE);
      if (!raw) return '';
      var data = JSON.parse(raw);
      var name = String((data && data.plan) || '').toLowerCase();
      return PLANS[name] ? name : '';
    } catch (e) { return ''; }
  }
  function writeCache(plan) {
    try { localStorage.setItem(PLAN_CACHE, JSON.stringify({ plan: plan, at: Date.now() })); } catch (e) {}
  }
  function dropCache() { try { localStorage.removeItem(PLAN_CACHE); } catch (e) {} }

  function norm(value) { return String(value == null ? '' : value).replace(/\s+/g, ' ').trim(); }

  /* Пока список бесплатных моделей не готов, модель считается доступной:
     иначе на Free гаснет весь список целиком. */
  function isFree(model) {
    if (typeof window.dlIsFreeModel !== 'function') return true;
    try { return !!window.dlIsFreeModel(model); } catch (e) { return true; }
  }
  function isAllowed(key) {
    var models = map(), model = models && models[key];
    if (!state.signedIn) return false;
    if (state.plan !== 'free') return true;
    return isFree(model);
  }
  function message() {
    return state.signedIn
      ? 'Эта модель доступна на тарифе Pro'
      : 'Зарегистрируйтесь, чтобы выбирать модели';
  }

  /* name -> model key, самые длинные названия впереди. */
  function names() {
    var models = map(), list = [];
    if (!models) return list;
    Object.keys(models).forEach(function (key) {
      var name = norm(models[key] && models[key].name);
      if (name) list.push({ key: key, name: name, lower: name.toLowerCase() });
    });
    list.sort(function (a, b) { return b.name.length - a.name.length; });
    return list;
  }
  function keyOfText(text, list) {
    var value = norm(text).toLowerCase();
    if (!value || value.length > 80) return '';
    for (var i = 0; i < list.length; i++) {
      if (value.indexOf(list[i].lower) === 0) return list[i].key;
    }
    return '';
  }
  function keyOfRow(row, list) {
    var attr = row.getAttribute('onclick') || '';
    var found = attr.match(/(?:pick|select|set|choose)Model\(\s*['"]([^'"]+)['"]/i);
    if (found) return found[1];
    var data = row.getAttribute('data-model') || row.getAttribute('data-model-id') || row.getAttribute('data-value');
    if (data && map() && map()[data]) return data;
    return keyOfText(row.textContent, list);
  }
  function explicitRows() {
    var out = [];
    ['.mopt', '[onclick*="pickModel"]'].forEach(function (selector) {
      var list;
      try { list = document.querySelectorAll(selector); } catch (e) { return; }
      Array.prototype.forEach.call(list, function (node) { if (out.indexOf(node) < 0) out.push(node); });
    });
    return out;
  }
  /* Любой список с тремя и более названиями моделей — это список моделей. */
  function listedRows(list) {
    var out = [];
    if (!list.length) return out;
    var all;
    try { all = document.body ? document.body.querySelectorAll('*') : []; } catch (e) { return out; }
    Array.prototype.forEach.call(all, function (node) {
      var count = node.childElementCount;
      if (count < 3 || count > 80) return;
      var hits = [];
      Array.prototype.forEach.call(node.children, function (child) {
        if (keyOfText(child.textContent, list)) hits.push(child);
      });
      if (hits.length < 3) return;
      hits.forEach(function (row) { if (out.indexOf(row) < 0) out.push(row); });
    });
    return out;
  }
  function currentKey() {
    try { if (typeof currentModel !== 'undefined' && currentModel) return currentModel; } catch (e) {}
    if (window.currentModel) return window.currentModel;
    try { return localStorage.getItem('dl_model') || ''; } catch (e) { return ''; }
  }
  function pills() {
    var out = [];
    ['#modelPill', '[onclick*="toggleModelMenu"]'].forEach(function (selector) {
      var found;
      try { found = document.querySelectorAll(selector); } catch (e) { return; }
      Array.prototype.forEach.call(found, function (node) { if (out.indexOf(node) < 0) out.push(node); });
    });
    return out;
  }
  function markPill() {
    var key = currentKey();
    var locked = state.ready && key && !isAllowed(key);
    pills().forEach(function (pill) {
      if (locked) {
        pill.setAttribute(PILL_ATTR, '1');
        pill.setAttribute('title', message());
      } else {
        pill.removeAttribute(PILL_ATTR);
        if (pill.getAttribute('title') === message()) pill.removeAttribute('title');
      }
    });
  }
  /* Страж висит на самой закрытой строке, никогда на документе. */
  function guardRow(row) {
    if (row.__dlGuarded) return;
    row.__dlGuarded = true;
    row.addEventListener('click', function (event) {
      if (row.getAttribute(LOCK_ATTR) !== '1') return;
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      notice(message());
    }, true);
  }
  function unlockAll() {
    var rows;
    try { rows = document.querySelectorAll('[' + LOCK_ATTR + '="1"]'); } catch (e) { return; }
    Array.prototype.forEach.call(rows, function (row) {
      row.removeAttribute(LOCK_ATTR);
      row.removeAttribute('title');
    });
    pills().forEach(function (pill) { pill.removeAttribute(PILL_ATTR); });
  }
  function mark() {
    if (!map()) return;
    if (!state.ready) { unlockAll(); return; }
    var list = names();
    var rows = explicitRows();
    listedRows(list).forEach(function (row) { if (rows.indexOf(row) < 0) rows.push(row); });
    var locked = 0, total = 0;
    rows.forEach(function (row) {
      var key = keyOfRow(row, list);
      if (!key) return;
      total++;
      row.setAttribute(KEY_ATTR, key);
      guardRow(row);
      if (isAllowed(key)) {
        row.removeAttribute(LOCK_ATTR);
        if (row.getAttribute('title') === message()) row.removeAttribute('title');
      } else {
        locked++;
        row.setAttribute(LOCK_ATTR, '1');
        row.setAttribute('title', message());
      }
    });
    state.rows = total;
    state.locked = locked;
    markPill();
    badge();
  }
  function badge() {
    var heads;
    try { heads = document.querySelectorAll('.mh'); } catch (e) { return; }
    Array.prototype.forEach.call(heads, function (head) {
      if (String(head.textContent || '').trim().toUpperCase().indexOf('PRO') !== 0) return;
      var tag = head.querySelector('.dl-plan-badge');
      var text = state.signedIn ? ('ваш тариф: ' + state.plan) : 'без входа';
      if (!tag) {
        tag = document.createElement('span');
        tag.className = 'dl-plan-badge';
        head.appendChild(tag);
      }
      if (tag.textContent !== text) tag.textContent = text;
    });
  }
  function notice(text) {
    if (typeof toast === 'function') { toast(text); return; }
    var box = document.querySelector('[data-dl-model-access-note]');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-dl-model-access-note', '1');
      box.style.cssText = 'position:fixed;left:50%;bottom:24px;z-index:100002;transform:translateX(-50%);padding:10px 14px;border-radius:10px;background:#191b22;color:#fff;border:1px solid rgba(255,255,255,.16);font:13px system-ui,sans-serif;box-shadow:0 12px 35px rgba(0,0,0,.35);';
      document.body.appendChild(box);
    }
    box.textContent = text;
    clearTimeout(notice.timer);
    notice.timer = setTimeout(function () { box.remove(); }, 2400);
  }
  function guardPick() {
    ['pickModel', 'selectModel', 'setModel', 'chooseModel'].forEach(function (name) {
      var fn = window[name];
      if (typeof fn !== 'function' || fn.__dlGuarded) return;
      window[name] = function (key) {
        if (state.ready && typeof key === 'string' && map() && map()[key] && !isAllowed(key)) {
          notice(message());
          mark();
          return;
        }
        var result = fn.apply(this, arguments);
        mark();
        return result;
      };
      window[name].__dlGuarded = true;
    });
  }

  /* ---------- выяснение тарифа ---------- */

  function planFrom(data) {
    if (!data || typeof data !== 'object') return '';
    var name = String(data.plan || data.tariff || (data.quota && data.quota.plan) || '').toLowerCase();
    return PLANS[name] ? name : '';
  }

  function ask(url, value) {
    return fetch(url, { headers: { Authorization: 'Bearer ' + value }, cache: 'no-store' })
      .then(function (response) {
        if (response.status === 401 || response.status === 403) return { denied: true };
        if (!response.ok) return { error: true };
        return response.json().then(function (data) {
          var plan = planFrom(data);
          return plan ? { plan: plan } : { signedIn: true };
        }, function () { return { error: true }; });
      }, function () { return { error: true }; });
  }

  function settle(next, source) {
    state.ready = next.ready;
    state.signedIn = next.signedIn;
    state.plan = next.plan;
    state.source = source;
    mark();
  }

  function guest() {
    dropCache();
    settle({ ready: true, signedIn: false, plan: 'guest' }, 'guest');
  }

  function known(plan, source) {
    writeCache(plan);
    settle({ ready: true, signedIn: true, plan: plan }, source);
  }

  /* Сервер недоступен: ничего не выдумываем. Есть прошлый тариф — берём его,
     нет — не блокируем ничего и пробуем ещё раз позже. */
  function unsure() {
    var cached = readCache();
    if (cached) { settle({ ready: true, signedIn: true, plan: cached }, 'cache'); }
    else { settle({ ready: false, signedIn: false, plan: 'unknown' }, 'offline'); }
    clearTimeout(retryTimer);
    retryTimer = setTimeout(loadState, RETRY_MS);
  }

  function loadState() {
    if (busy) return;
    var value = token();
    lastToken = value;
    if (!value) { guest(); return; }
    busy = true;
    ask('/api/plan', value)
      .then(function (result) {
        if (result.plan) { known(result.plan, 'plan'); return null; }
        if (result.signedIn) { known('free', 'plan'); return null; }
        // Отказ или ошибка — второй источник: профиль пользователя.
        return ask('/api/profile', value).then(function (profile) {
          if (profile.plan) { known(profile.plan, 'profile'); return null; }
          if (profile.signedIn) { known('free', 'profile'); return null; }
          if (profile.error && result.error) { unsure(); return null; }
          // Профиль тоже отказал — проверяем саму сессию.
          return ask('/api/auth/me', value).then(function (me) {
            if (me.plan) { known(me.plan, 'me'); return null; }
            if (me.signedIn) { known('free', 'me'); return null; }
            if (me.error) { unsure(); return null; }
            guest();
            return null;
          });
        });
      })
      .catch(function () { unsure(); })
      .then(function () { busy = false; });
  }
  window.dlRefreshModelLock = function () { clearTimeout(retryTimer); busy = false; loadState(); };

  /* Токен появился или пропал — перечитать тариф. */
  function watchToken() {
    var value = token();
    if (value === lastToken) return;
    lastToken = value;
    clearTimeout(retryTimer);
    busy = false;
    loadState();
  }

  function start() {
    style();
    guardPick();
    loadState();
    setInterval(function () { guardPick(); mark(); }, TICK_MS);
    setInterval(watchToken, TOKEN_MS);
    window.addEventListener('storage', watchToken);
    window.addEventListener('focus', function () { watchToken(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) watchToken();
    });
    new MutationObserver(function () {
      clearTimeout(start.timer);
      start.timer = setTimeout(function () { guardPick(); mark(); }, 60);
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
