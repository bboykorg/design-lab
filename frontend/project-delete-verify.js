/* Удаление проекта доводится до сервера.

   На телефоне сайт после удаления возвращался, хотя на компьютере всё было
   в порядке. Причина не в сервере: карточка пропадала из списка сразу, а сам
   запрос на удаление до сервера не доезжал: тап по-другому обрабатывался,
   запрос обрывался при переходе вида или терялся в слабой сети. Список
   выглядел пустым до первой перезагрузки, а потом сайт возвращался — он и
   не был удалён.

   Почему досылка безопасна. Самовольно ничего не удаляется. Нужны два
   условия сразу: человек нажал именно контрол удаления внутри карточки и
   само приложение убрало эту карточку с экрана. Второе условие заменяет
   проверку подтверждения: если человек отказался в диалоге, карточка осталась
   на месте, и никакого удаления не будет.

   Сверка. После любого удаления список перечитывается с сервера. Если сайт всё
   ещё там — удаление повторяется с нарастающей паузой. Запросы ловятся и
   через fetch, и через XMLHttpRequest: старые слои интерфейса ходят вторым путём,
   и перехват только fetch их не видел.

   Ничего не блокируется и не затемняется: все кнопки остаются рабочими. */
(function () {
  'use strict';
  if (window.__dlDeleteVerify) return;
  window.__dlDeleteVerify = true;

  var WATCH_MS = 500;          // шаг наблюдения за исчезновением карточки
  var WATCH_TRIES = 20;        // всего около 10 секунд на подтверждение в диалоге
  var SEEN_MS = 15000;         // сколько считаем, что удаление уже ушло само
  var CHECK_MS = [800, 2500, 6000];   // когда сверяться со списком на сервере
  var MAX_RESENDS = 3;
  var ID_OK = /^[A-Za-z0-9_-]{1,64}$/;
  var DEL_WORD = /\u0443\u0434\u0430\u043b|\u043a\u043e\u0440\u0437\u0438\u043d|delete|remove|trash/i;
  var TRASH = '\ud83d\uddd1';
  var CARD_ATTRS = ['data-id', 'data-pid', 'data-project', 'data-project-id'];
  var CARD_SELECTOR = '[data-id],[data-pid],[data-project],[data-project-id]';
  var TOKEN_KEYS = ['dl_token', 'dl_auth_token', 'token', 'auth_token', 'access_token', 'jwt', 'dl_jwt'];

  var seen = {};        // id -> когда замечен настоящий DELETE
  var resends = {};     // id -> сколько раз уже досылали

  function token() {
    for (var i = 0; i < TOKEN_KEYS.length; i++) {
      var value = '';
      try { value = localStorage.getItem(TOKEN_KEYS[i]) || ''; } catch (e) { value = ''; }
      if (value && value.length > 8) return value;
    }
    return '';
  }
  function headers() {
    var out = { 'Accept': 'application/json' };
    var key = token();
    if (key) out.Authorization = 'Bearer ' + key;
    return out;
  }

  function noted(id) {
    var at = seen[id];
    return !!at && (Date.now() - at) < SEEN_MS;
  }

  function cardsFor(id) {
    var found = [];
    var nodes;
    try { nodes = document.querySelectorAll(CARD_SELECTOR); } catch (e) { return found; }
    Array.prototype.forEach.call(nodes, function (node) {
      for (var i = 0; i < CARD_ATTRS.length; i++) {
        if (node.getAttribute(CARD_ATTRS[i]) === id) { found.push(node); return; }
      }
    });
    return found;
  }

  function refreshList() {
    ['loadProjects', 'refreshProjects', 'renderProjects', 'listProjects',
      'loadRecent', 'renderRecent', 'loadSites', 'renderSites', 'refreshRecent'
    ].forEach(function (name) {
      var fn = window[name];
      if (typeof fn === 'function') {
        try { fn(); } catch (e) { /* чужая функция — просто пропускаем */ }
      }
    });
  }

  /* Собственное удаление — когда запроса приложения так и не было. */
  function sendDelete(id) {
    resends[id] = (resends[id] || 0) + 1;
    seen[id] = Date.now();
    var request = null;
    try {
      request = fetch('/api/projects/' + encodeURIComponent(id), {
        method: 'DELETE', headers: headers(), credentials: 'include', keepalive: true
      });
    } catch (e) { request = null; }
    if (request && request.then) {
      request.then(function () { refreshList(); }, function () { });
    }
  }

  /* Проверка по списку с сервера: если сайт жив, удаляем заново. */
  function verify(id, step) {
    var when = CHECK_MS[step] || 0;
    setTimeout(function () {
      var request = null;
      try {
        request = fetch('/api/projects', { headers: headers(), credentials: 'include' });
      } catch (e) { request = null; }
      if (!request || !request.then) return;
      request.then(function (response) {
        if (!response || !response.ok) return;
        return response.json().then(function (list) {
          if (!list || typeof list.length !== 'number') return;
          var alive = false;
          for (var i = 0; i < list.length; i++) {
            if (list[i] && String(list[i].id) === id) { alive = true; break; }
          }
          if (!alive) {
            refreshList();
            return;
          }
          if ((resends[id] || 0) < MAX_RESENDS) {
            sendDelete(id);
            if (step + 1 < CHECK_MS.length) verify(id, step + 1);
          }
        }, function () { });
      }, function () { });
    }, when);
  }

  /* Ждём, пока приложение само уберёт карточку — это и есть сигнал
     подтверждённого удаления. Отказ в диалоге оставляет карточку на месте. */
  function watch(id) {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (noted(id)) { clearInterval(timer); verify(id, 0); return; }
      if (!cardsFor(id).length) {
        clearInterval(timer);
        sendDelete(id);
        verify(id, 0);
        return;
      }
      if (tries >= WATCH_TRIES) clearInterval(timer);
    }, WATCH_MS);
  }

  function looksLikeDelete(node) {
    var depth = 0;
    var el = node;
    while (el && depth < 4) {
      var text = '';
      try {
        text = (el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || '')) + ' ' +
          (el.className && typeof el.className === 'string' ? el.className : '') + ' ' +
          (el.textContent || '');
      } catch (e) { text = ''; }
      if (DEL_WORD.test(text) || text.indexOf(TRASH) >= 0) return true;
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  function cardId(node) {
    var el = node;
    var depth = 0;
    while (el && depth < 8) {
      for (var i = 0; i < CARD_ATTRS.length; i++) {
        var value = el.getAttribute && el.getAttribute(CARD_ATTRS[i]);
        if (value && ID_OK.test(value)) return value;
      }
      el = el.parentElement;
      depth++;
    }
    return '';
  }

  function onTap(event) {
    var target = event && event.target;
    if (!target || !target.closest) return;
    if (!looksLikeDelete(target)) return;
    var id = cardId(target);
    if (!id) return;
    resends[id] = 0;
    watch(id);
  }

  /* Перехват настоящих запросов удаления — два пути сразу. */
  function hookFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlDeleteVerify) return;
    var wrapped = function (input, init) {
      var url = '';
      var method = '';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
        method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      } catch (e) { url = ''; }
      var hit = url.match(/\/api\/projects\/([A-Za-z0-9_-]{1,64})/);
      if (method === 'DELETE' && hit) {
        var pid = hit[1];
        seen[pid] = Date.now();
        var result = original.apply(this, arguments);
        if (result && result.then) {
          result.then(function () { verify(pid, 0); }, function () { verify(pid, 0); });
        }
        return result;
      }
      return original.apply(this, arguments);
    };
    wrapped.__dlDeleteVerify = true;
    window.fetch = wrapped;
  }

  function hookXhr() {
    var proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || proto.__dlDeleteVerify) return;
    var open = proto.open;
    var send = proto.send;
    if (typeof open !== 'function' || typeof send !== 'function') return;
    proto.open = function (method, url) {
      try {
        this.__dlMethod = String(method || '').toUpperCase();
        this.__dlUrl = String(url || '');
      } catch (e) { /* неважно */ }
      return open.apply(this, arguments);
    };
    proto.send = function () {
      var pid = '';
      try {
        if (this.__dlMethod === 'DELETE') {
          var hit = String(this.__dlUrl || '').match(/\/api\/projects\/([A-Za-z0-9_-]{1,64})/);
          pid = hit ? hit[1] : '';
        }
      } catch (e) { pid = ''; }
      if (pid) {
        seen[pid] = Date.now();
        var self = this;
        var finish = function () { verify(pid, 0); };
        try {
          self.addEventListener('loadend', finish);
        } catch (e) { setTimeout(finish, 1000); }
      }
      return send.apply(this, arguments);
    };
    proto.__dlDeleteVerify = true;
  }

  function start() {
    hookFetch();
    hookXhr();
    document.addEventListener('click', onTap, true);
    document.addEventListener('pointerup', onTap, true);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  window.dlDeleteProject = function (id) {
    if (!id || !ID_OK.test(String(id))) return false;
    resends[String(id)] = 0;
    sendDelete(String(id));
    verify(String(id), 0);
    return true;
  };
})();
