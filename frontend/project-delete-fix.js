/* Удаление проекта с первой попытки.

   Сервер удаляет проект сразу: DELETE /api/projects/{id} возвращает 204 и запись
   исчезает. Проект возвращался на экран по двум причинам:

   1) открытый проект продолжал автосохраняться, и отложенный автосейв
      успевал уйти уже ПОСЛЕ удаления (POST без id делает новый проект);
   2) список недавних сайтов обновлялся из местного кэша, где запись лежала.

   Здесь после успешного удаления: запись вносится в стоп-лист, запросы на
   её пересоздание глохнут, локальные копии чистятся, а список перечитывается
   с сервера. Ответ 404 на DELETE тоже считается удалением: проекта уже нет.

   ВАЖНО про purge(). Раньше он сносил ЛЮБОЙ ключ dl_*, в тексте которого
   встречался удалённый id. А соседний слой project-dedupe.js как раз хранит
   список удалённых id в dl_dead_projects — то есть ключ, в котором этот id
   обязан лежать. Получалось самоуничтожение: только что поставленная
   могильная плита тут же стиралась, и после перезагрузки сайт возвращался.
   Теперь служебные ключи учёта в списке исключений.

   Общего окна тишины после удаления больше нет. Раньше любое создание
   проекта в течение 20 секунд после удаления глохло целиком — вместе с
   созданием нового сайта, если человек сразу начинал следующий. Защита
   от воскрешения живёт в project-dedupe.js и работает точно: по отпечатку
   содержимого удалённого сайта, а не по таймеру.

   Ничего не блокируется и не затемняется: все кнопки остаются рабочими. */
(function () {
  'use strict';
  if (window.__dlProjectDelete) return;
  window.__dlProjectDelete = true;

  var BLOCK_MS = 120000;   // сколько держим удалённый id в стоп-листе памяти

  // Собственные ключи учёта удалённых проектов. Их чистка равносильна
  // забыванию того, что проект вообще был удалён.
  var KEEP = [
    'dl_dead_projects', 'dl_dead_sigs', 'dl_proj_sigs',
    'dl_auto_projects', 'dl_live_project'
  ];

  var gone = {};

  window.__dlDeletedProjects = gone;

  function fresh(id) {
    var at = gone[id];
    return !!at && (Date.now() - at) < BLOCK_MS;
  }

  // Следы удалённого проекта в местном хранилище. Трогаем только наши ключи (dl_*),
  // только те, в которых встречается именно этот id, и никогда — списки учёта.
  function purge(id) {
    if (!id) return;
    var keys = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (!key || key.indexOf('dl_') !== 0) continue;
        if (KEEP.indexOf(key) >= 0) continue;
        keys.push(key);
      }
      keys.forEach(function (key) {
        var value = localStorage.getItem(key) || '';
        if (value.indexOf(id) >= 0) localStorage.removeItem(key);
      });
    } catch (e) { /* хранилище недоступно — не беда */ }
  }

  // Пересборка списка сайтов средствами самого приложения.
  var LOADERS = [
    'loadProjects', 'refreshProjects', 'renderProjects', 'listProjects',
    'loadRecent', 'renderRecent', 'loadSites', 'renderSites', 'refreshRecent'
  ];
  function refresh() {
    LOADERS.forEach(function (name) {
      var fn = window[name];
      if (typeof fn === 'function') {
        try { fn(); } catch (e) { /* чужая функция — просто пропускаем */ }
      }
    });
  }

  // Карточка удалённого проекта, если список не пересобрался сам.
  function dropCard(id) {
    if (!id) return;
    var nodes = document.querySelectorAll('[data-id],[data-pid],[data-project],[data-project-id]');
    Array.prototype.forEach.call(nodes, function (node) {
      var own = node.getAttribute('data-id') || node.getAttribute('data-pid') ||
        node.getAttribute('data-project') || node.getAttribute('data-project-id');
      if (own === id) node.remove();
    });
  }

  function done(id) {
    gone[id] = Date.now();
    purge(id);
    dropCard(id);
    refresh();
    setTimeout(function () { dropCard(id); refresh(); }, 300);
    setTimeout(function () { dropCard(id); refresh(); }, 1200);
    setTimeout(function () { dropCard(id); refresh(); }, 3000);
  }

  function blocked() {
    // Синтетический ответ вместо запроса: приложение увидит то же, что и от сервера
    // для несуществующего проекта, и не создаст копию.
    var payload = JSON.stringify({ detail: '\u041f\u0440\u043e\u0435\u043a\u0442 \u0443\u0434\u0430\u043b\u0451\u043d' });
    return Promise.resolve(new Response(payload, {
      status: 404, headers: { 'Content-Type': 'application/json' }
    }));
  }

  function bodyId(init, input) {
    var raw = init && typeof init.body === 'string' ? init.body : '';
    if (!raw && input && typeof input === 'object' && typeof input._bodyText === 'string') {
      raw = input._bodyText;
    }
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      return data && typeof data.id === 'string' ? data.id : '';
    } catch (e) { return null; }
  }

  var original = window.fetch;
  if (typeof original !== 'function' || original.__dlProjectGuard) return;

  var wrapped = function (input, init) {
    var url = '';
    var method = '';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    } catch (e) { url = ''; }

    var match = url.match(/\/api\/projects\/([A-Za-z0-9_-]{1,64})/);

    if (method === 'DELETE' && match) {
      var pid = match[1];
      var result = original.apply(this, arguments);
      if (result && result.then) {
        result.then(function (response) {
          // 404 — тоже результат: проекта больше нет.
          if (response && (response.ok || response.status === 404)) done(pid);
        }, function () { });
      }
      return result;
    }

    if (method === 'POST' && /\/api\/projects(\?|$)/.test(url)) {
      var id = bodyId(init, input);
      if (id && fresh(id)) return blocked();
    }

    return original.apply(this, arguments);
  };
  wrapped.__dlProjectGuard = true;
  window.fetch = wrapped;
})();
