/* Лишние копии проектов и возврат удалённых после перезагрузки.

   На сервере POST /api/projects работает так: есть id в теле — обновляет
   существующий проект, нет id — ВСЕГДА создаёт новый. Именно на этом
   строятся обе болезни: лишние копии и возврат удалённых сайтов.

   Почему удалённые сайты возвращались снова. Прежний запрет держался
   на имени сайта и только одну минуту. Удалённый проект оставался открыт
   в редакторе, и первый же автосейв после этой минуты (или после
   перезагрузки страницы, или при малейшей разнице в названии) уходил
   без id и создавал тот же сайт заново — уже с другим id, который ни в одном
   стоп-листе не числится.

   Теперь запрет держится на отпечатке самого сайта (короткая контрольная
   сумма его HTML), а не на имени и не на таймере:

     • при сохранении запоминается отпечаток каждого проекта;
     • при удалении отпечаток помечается как удалённый — на 30 дней,
       а не на минуту, и перезагрузка его не стирает;
     • любое создание без id с таким же отпечатком глохнет.

   Новый сайт с тем же названием при этом создаётся свободно: у него другое
   содержимое, а значит другой отпечаток. Никакие чужие сайты не
   удаляются: убираются только автокопии, которые этот же слой сам и
   записал как автосозданные.

   Ничего не затемняется и не блокируется в интерфейсе: все кнопки рабочие. */
(function () {
  'use strict';
  if (window.__dlProjectDedupe) return;
  window.__dlProjectDedupe = true;

  var AUTO_KEY = 'dl_auto_projects';    // что создал автосейв: id -> {name, at}
  var DEAD_KEY = 'dl_dead_projects';    // удалённые id -> метка времени
  var LIVE_KEY = 'dl_live_project';     // имя -> id открытого сейчас сайта
  var SIG_KEY = 'dl_proj_sigs';         // id -> отпечаток последнего сохранения
  var DEAD_SIG_KEY = 'dl_dead_sigs';    // отпечатки удалённых сайтов
  var OLD_NAME_KEY = 'dl_dead_names';   // наследие: запрет по имени, больше не нужен
  var DEAD_MS = 30 * 24 * 3600 * 1000;  // сколько помним удалённое

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

  function sweepOld(key) {
    var data = read(key);
    var now = Date.now();
    var changed = false;
    Object.keys(data).forEach(function (item) {
      if (now - (data[item] || 0) > DEAD_MS) { delete data[item]; changed = true; }
    });
    if (changed) write(key, data);
    return data;
  }

  function dead() { return sweepOld(DEAD_KEY); }
  function deadSigs() { return sweepOld(DEAD_SIG_KEY); }

  function isDead(id) {
    return !!id && Object.prototype.hasOwnProperty.call(dead(), id);
  }
  function isDeadSig(sig) {
    return !!sig && Object.prototype.hasOwnProperty.call(deadSigs(), sig);
  }

  /* Короткая контрольная сумма содержимого сайта. */
  function sigOf(body) {
    var html = body && typeof body.html === 'string' ? body.html : '';
    if (html.length < 200) return '';
    var hash = 5381;
    for (var i = 0; i < html.length; i++) {
      hash = ((hash * 33) ^ html.charCodeAt(i)) >>> 0;
    }
    return String(html.length) + '.' + hash.toString(36);
  }

  function rememberSig(id, sig) {
    if (!id || !sig) return;
    var data = read(SIG_KEY);
    data[id] = sig;
    write(SIG_KEY, data);
  }

  function markDeadSig(sig) {
    if (!sig) return;
    var data = deadSigs();
    data[sig] = Date.now();
    write(DEAD_SIG_KEY, data);
  }

  function markDead(id) {
    if (!id) return;
    var data = dead();
    data[id] = Date.now();
    write(DEAD_KEY, data);

    /* Отпечаток удалённого сайта — главная защита от воскрешения. */
    var sigs = read(SIG_KEY);
    if (sigs[id]) {
      markDeadSig(sigs[id]);
      delete sigs[id];
      write(SIG_KEY, sigs);
    }

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
  window.__dlDeadSigs = deadSigs;

  /* Старый запрет по имени больше не используется: он мешал создавать
     новый сайт с тем же названием и при этом не спасал от воскрешения. */
  try { localStorage.removeItem(OLD_NAME_KEY); } catch (e) { /* нет доступа */ }
  window.__dlDeadNames = function () { return {}; };

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

  function goneResponse() {
    return Promise.resolve(new Response(
      JSON.stringify({ detail: '\u041f\u0440\u043e\u0435\u043a\u0442 \u0443\u0434\u0430\u043b\u0451\u043d' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    ));
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

    /* Удаление: запоминаем надолго и чистим автокопии. */
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
        var sig = sigOf(body);

        if (id && isDead(id)) {
          // Отложенный автосейв уже удалённого сайта.
          return goneResponse();
        }

        if (!id && isDeadSig(sig)) {
          // Сайт только что удалили, но он остался открыт в редакторе и
          // продолжает автосохраняться. Пропустить — значит создать его
          // заново под новым id.
          return goneResponse();
        }

        if (!id && name) {
          var known = read(LIVE_KEY)[name];
          if (known && !isDead(known)) {
            // Второй и дальнейшие автосейвы того же сайта: обновляем, не плодим.
            rememberSig(known, sig);
            return original.call(this, input, withId(init, body, known));
          }
          var result = original.apply(this, arguments);
          if (result && result.then) {
            result.then(function (response) {
              if (!response || !response.ok) return;
              response.clone().json().then(function (data) {
                var freshId = data && typeof data.id === 'string' ? data.id : '';
                if (!freshId) return;
                var liveMap = read(LIVE_KEY);
                liveMap[name] = freshId;
                write(LIVE_KEY, liveMap);
                var made = read(AUTO_KEY);
                made[freshId] = { name: name, at: Date.now() };
                write(AUTO_KEY, made);
                rememberSig(freshId, sig);
              }, function () { });
            }, function () { });
          }
          return result;
        }

        if (id) {
          rememberSig(id, sig);
          if (name) {
            var live2 = read(LIVE_KEY);
            live2[name] = id;
            write(LIVE_KEY, live2);
          }
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
