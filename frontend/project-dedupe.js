/* Лишние копии проектов и возврат удалённых после перезагрузки.

   На сервере POST /api/projects работает так: есть id в теле — обновляет
   существующий проект, нет id — ВСЕГДА создаёт новый. Автосейв нового
   сайта шлёт запрос без id, потому каждое срабатывание таймера до первого
   ручного сохранения оставляло в базе ещё один проект с тем же именем.
   Удаляешь один — остальные всплывают после перезагрузки.

   Что делает этот слой:

   1. Первый запрос без id пропускается, а id из ответа запоминается. Все
      следующие автосейвы того же сайта получают этот id в тело запроса и
      обновляют запись вместо создания копии.

   2. Удалённые id хранятся в localStorage, а не только в памяти вкладки.
      Раньше стоп-лист умирал вместе со страницей, и перезагрузка снова
      показывала всё, что успел насоздавать автосейв.

   3. При удалении проекта убираются и его автокопии — НО только те, что этот
      же слой сам и записал как автосозданные с тем же именем. Чужие сайты с
      похожими названиями не трогаются: удалять лишнее опаснее, чем оставить.

   4. Список с сервера чистится от удалённых id, если запрос на удаление
      не дошёл, и удаление повторяется тихо в фоне. */
(function () {
  'use strict';
  if (window.__dlProjectDedupe) return;
  window.__dlProjectDedupe = true;

  var AUTO_KEY = 'dl_auto_projects';    // что создал автосейв: id -> {name, at}
  var DEAD_KEY = 'dl_dead_projects';    // удалённые id -> метка времени
  var LIVE_KEY = 'dl_live_project';     // имя -> id открытого сейчас сайта
  var DEAD_MS = 30 * 24 * 3600 * 1000;  // сколько помним удалённые

  /* ------------------------------------------------------------ хранение */

  function read(key) {
    try {
      var raw = localStorage.getItem(key);
      var data = raw ? JSON.parse(raw) : null;
      return (data && typeof data === 'object') ? data : {};
    } catch (e) { return {}; }
  }

  function write(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* переполнено */ }
  }

  function dead() {
    var data = read(DEAD_KEY);
    var now = Date.now();
    var changed = false;
    Object.keys(data).forEach(function (id) {
      if (now - (data[id] || 0) > DEAD_MS) { delete data[id]; changed = true; }
    });
    if (changed) write(DEAD_KEY, data);
    return data;
  }

  function isDead(id) {
    return !!id && Object.prototype.hasOwnProperty.call(dead(), id);
  }

  function markDead(id) {
    if (!id) return;
    var data = dead();
    data[id] = Date.now();
    write(DEAD_KEY, data);

    var auto = read(AUTO_KEY);
    delete auto[id];
    write(AUTO_KEY, auto);

    var live = read(LIVE_KEY);
    Object.keys(live).forEach(function (name) {
      if (live[name] === id) delete live[name];
    });
    write(LIVE_KEY, live);
  }

  window.__dlDeadProjects = dead;

  /* ----------------------------------------------------------- тело запроса */

  function parseBody(init) {
    var raw = init && typeof init.body === 'string' ? init.body : '';
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      return (data && typeof data === 'object') ? data : null;
    } catch (e) { return null; }
  }

  function withId(init, body, id) {
    var next = {};
    Object.keys(init || {}).forEach(function (name) { next[name] = init[name]; });
    body.id = id;
    next.body = JSON.stringify(body);
    return next;
  }

  function nameOf(body) {
    var name = body && typeof body.name === 'string' ? body.name : '';
    return name.replace(/\s+/g, ' ').trim().toLowerCase();
  }

  /* ------------------------------------------------------- уборка автокопий */

  var base = window.fetch;

  function removeCopies(name) {
    if (!name) return;
    var auto = read(AUTO_KEY);
    Object.keys(auto).forEach(function (id) {
      var item = auto[id] || {};
      if (item.name !== name || isDead(id)) return;
      markDead(id);
      try {
        base.call(window, '/api/projects/' + id, {
          method: 'DELETE', credentials: 'include'
        }).catch(function () { /* уже нет — и хорошо */ });
      } catch (e) { /* сеть недоступна */ }
    });
  }

  function sweep(list) {
    // Если сервер всё ещё отдаёт удалённое — добиваем тихо в фоне.
    list.forEach(function (item) {
      var id = item && item.id;
      if (!id || !isDead(id)) return;
      try {
        base.call(window, '/api/projects/' + id, {
          method: 'DELETE', credentials: 'include'
        }).catch(function () { });
      } catch (e) { }
    });
  }

  /* --------------------------------------------------------- перехват fetch */

  var original = window.fetch;
  if (typeof original !== 'function' || original.__dlDedupe) return;

  var wrapped = function (input, init) {
    var url = '';
    var method = '';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    } catch (e) { url = ''; }

    var one = url.match(/\/api\/projects\/([A-Za-z0-9_-]{1,64})/);
    var many = /\/api\/projects(\?|$)/.test(url);

    /* Удаление: запоминаем навсегда и чистим автокопии. */
    if (method === 'DELETE' && one) {
      var pid = one[1];
      var auto = read(AUTO_KEY);
      var copyName = (auto[pid] && auto[pid].name) || '';
      if (!copyName) {
        var live = read(LIVE_KEY);
        Object.keys(live).forEach(function (name) {
          if (live[name] === pid) copyName = name;
        });
      }
      var out = original.apply(this, arguments);
      if (out && out.then) {
        out.then(function (response) {
          if (response && (response.ok || response.status === 404)) {
            markDead(pid);
            removeCopies(copyName);
          }
        }, function () { });
      }
      return out;
    }

    /* Сохранение: без id сервер создаст новый проект. */
    if (method === 'POST' && many) {
      var body = parseBody(init);
      if (body) {
        var id = typeof body.id === 'string' ? body.id : '';
        var name = nameOf(body);

        if (id && isDead(id)) {
          // Отложенный автосейв уже удалённого сайта.
          return Promise.resolve(new Response(
            JSON.stringify({ detail: '\u041f\u0440\u043e\u0435\u043a\u0442 \u0443\u0434\u0430\u043b\u0451\u043d' }),
            { status: 404, headers: { 'Content-Type': 'application/json' } }
          ));
        }

        if (!id && name) {
          var known = read(LIVE_KEY)[name];
          if (known && !isDead(known)) {
            // Второй и дальнейшие автосейвы того же сайта: обновляем, не плодим.
            return original.call(this, input, withId(init, body, known));
          }
          var result = original.apply(this, arguments);
          if (result && result.then) {
            result.then(function (response) {
              if (!response || !response.ok) return;
              response.clone().json().then(function (data) {
                var fresh = data && typeof data.id === 'string' ? data.id : '';
                if (!fresh) return;
                var live = read(LIVE_KEY);
                live[name] = fresh;
                write(LIVE_KEY, live);
                var made = read(AUTO_KEY);
                made[fresh] = { name: name, at: Date.now() };
                write(AUTO_KEY, made);
              }, function () { });
            }, function () { });
          }
          return result;
        }

        if (id && name) {
          var live2 = read(LIVE_KEY);
          live2[name] = id;
          write(LIVE_KEY, live2);
        }
      }
    }

    /* Список: удалённого в нём быть не должно. */
    if (method === 'GET' && many && !one) {
      var listed = original.apply(this, arguments);
      if (!listed || !listed.then) return listed;
      return listed.then(function (response) {
        if (!response || !response.ok) return response;
        return response.clone().json().then(function (data) {
          if (!Array.isArray(data)) return response;
          var alive = data.filter(function (item) {
            return !(item && isDead(item.id));
          });
          if (alive.length === data.length) return response;
          sweep(data);
          return new Response(JSON.stringify(alive), {
            status: 200, headers: { 'Content-Type': 'application/json' }
          });
        }, function () { return response; });
      });
    }

    return original.apply(this, arguments);
  };
  wrapped.__dlDedupe = true;
  window.fetch = wrapped;
})();
