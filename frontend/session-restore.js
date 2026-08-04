/* Design Lab — сайт в редакторе переживает перезагрузку страницы.
   HTML берётся прямо из кадра предпросмотра и туда же возвращается, поэтому
   ничего не зависит от внутренних переменных редактора. Пустой холст не
   сохраняется, открытый проект не перезаписывается.

   Почему раньше появлялись копии и возвращались удалённые проекты:
   слепок хранил только HTML, без привязки к проекту, и при восстановлении
   ставился признак черновика — автосохранение создавало НОВЫЙ проект,
   даже если исходный только что удалили. Теперь:
     • вместе с HTML запоминается id проекта;
     • если проект удалён, слепок выбрасывается и ничего не восстанавливается;
     • восстановление не трогает признак черновика и не запускает автосохранение —
       проект запишется только после реальной правки;
     • всплывающего «Восстановлен последний сайт» больше нет. */
(function () {
  'use strict';
  if (window.__dlSessionRestore) return;
  window.__dlSessionRestore = true;

  var KEY = 'dl_session_v3';
  var OLD_KEYS = ['dl_session_v2', 'dl_session'];
  var DEAD_KEY = 'dl_dead_projects';
  var MAX_CHARS = 2000000;
  var MIN_CHARS = 400;
  var SAVE_MS = 2500;
  var FIRST_MS = 1500;
  var WATCH_MS = 900;
  var WATCH_TRIES = 20;
  var INERT = 'data-dl-inert-';
  var BLANK = ['\u0447\u0438\u0441\u0442\u044b\u0439 \u0445\u043e\u043b\u0441\u0442', '\u043e\u043f\u0438\u0448\u0438 \u0441\u0430\u0439\u0442 \u0432 \u0447\u0430\u0442\u0435', '\u043d\u0430\u0447\u043d\u0451\u043c \u0441 \u0447\u0438\u0441\u0442\u043e\u0433\u043e \u043b\u0438\u0441\u0442\u0430'];

  var lastSaved = null;
  var restored = false;

  /* Старые слепки без id — именно они плодили копии. Убираем. */
  OLD_KEYS.forEach(function (name) {
    try { localStorage.removeItem(name); } catch (e) {}
  });

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; }
  }
  function write(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function forget() {
    lastSaved = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
  }

  /* Список удалённых проектов ведёт project-dedupe.js. */
  function deadIds() {
    var out = {};
    var data = null;
    try { data = JSON.parse(localStorage.getItem(DEAD_KEY) || 'null'); } catch (e) { data = null; }
    if (data && typeof data === 'object') {
      if (Object.prototype.toString.call(data) === '[object Array]') {
        data.forEach(function (id) { if (id) out[String(id)] = 1; });
      } else {
        Object.keys(data).forEach(function (id) { if (id) out[String(id)] = 1; });
      }
    }
    try {
      if (typeof window.__dlDeletedProjects === 'object' && window.__dlDeletedProjects) {
        Object.keys(window.__dlDeletedProjects).forEach(function (id) { out[String(id)] = 1; });
      }
    } catch (e) {}
    return out;
  }
  function isDead(id) {
    if (!id) return false;
    return !!deadIds()[String(id)];
  }

  function projectId() {
    try {
      if (window.current && typeof window.current === 'object' && window.current.id) {
        return String(window.current.id);
      }
    } catch (e) {}
    return '';
  }

  function frame() { return document.getElementById('pvFrame'); }
  function frameDoc() {
    var el = frame();
    if (!el) return null;
    try {
      var doc = el.contentDocument;
      return doc && doc.body ? doc : null;
    } catch (e) { return null; }
  }
  function isBlank(doc) {
    var text = String(doc.body.innerText || doc.body.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (text.length < 40) return true;
    return BLANK.some(function (mark) { return text.indexOf(mark) >= 0; });
  }
  /* Режим дизайна прячет обработчики и ссылки; в слепке они возвращаются. */
  function clean(doc) {
    var clone = doc.documentElement.cloneNode(true);
    var list;
    try { list = clone.querySelectorAll('*'); } catch (e) { return clone; }
    Array.prototype.forEach.call(list, function (el) {
      var names = [];
      for (var i = 0; i < el.attributes.length; i++) {
        var attr = el.attributes[i];
        if (attr.name.indexOf(INERT) === 0) names.push(attr.name);
      }
      names.forEach(function (name) {
        var value = el.getAttribute(name);
        el.removeAttribute(name);
        el.setAttribute(name.slice(INERT.length), value);
      });
      if (el.hasAttribute('data-dl-editable')) el.removeAttribute('data-dl-editable');
      if (el.getAttribute('contenteditable') === 'true') el.removeAttribute('contenteditable');
      if (el.hasAttribute('data-dl-selected')) el.removeAttribute('data-dl-selected');
    });
    return clone;
  }
  function grab() {
    var doc = frameDoc();
    if (!doc || isBlank(doc)) return null;
    var html;
    try { html = '<!DOCTYPE html>' + clean(doc).outerHTML; } catch (e) { return null; }
    if (html.length < MIN_CHARS || html.length > MAX_CHARS) return null;
    return html;
  }

  function save() {
    var id = projectId();
    if (isDead(id)) { forget(); return; }
    var html = grab();
    if (!html) return;
    var previous = read();
    if (html === lastSaved && previous && previous.id === id) return;
    if (write({ html: html, id: id, at: Date.now() })) lastSaved = html;
  }

  /* При восстановлении НЕ выставляем scratch и не зовём автосохранение:
     иначе редактор считает сайт новым и создаёт лишний проект. */
  function tellApp(html, id) {
    try {
      if (window.current && typeof window.current === 'object') {
        window.current.html = html;
        if (id && !window.current.id) window.current.id = id;
      }
    } catch (e) {}
    var area = document.getElementById('codeTa');
    if (area && !area.value) area.value = html;
  }
  function put(html, id) {
    var el = frame();
    if (!el) return false;
    var done = ['renderHtml', 'renderHtmlLive'].some(function (name) {
      if (typeof window[name] !== 'function') return false;
      try { window[name](html); return true; } catch (e) { return false; }
    });
    if (!done) {
      try { el.removeAttribute('src'); el.srcdoc = html; done = true; } catch (e) { return false; }
    }
    tellApp(html, id);
    return done;
  }
  function tryRestore(saved) {
    var doc = frameDoc();
    if (!doc) return false;
    /* Шаблон или сохранённый проект уже открыт — не трогаем. */
    if (!isBlank(doc)) { restored = true; return true; }
    var here = projectId();
    /* Слепок от другого проекта, чем открытый сейчас — не подменяем. */
    if (here && saved.id && here !== saved.id) { restored = true; return true; }
    if (!put(saved.html, saved.id)) return false;
    lastSaved = saved.html;
    restored = true;
    return true;
  }

  function start() {
    var saved = read();
    if (saved && saved.html && isDead(saved.id)) { forget(); saved = null; }
    if (saved && saved.html) {
      setTimeout(function () {
        if (tryRestore(saved)) return;
        /* Редактор может ещё грузиться или кадр один раз перезагружается. */
        var tries = 0;
        var wait = setInterval(function () {
          tries++;
          if (restored || tries > WATCH_TRIES) { clearInterval(wait); return; }
          tryRestore(saved);
        }, WATCH_MS);
      }, FIRST_MS);
    } else {
      restored = true;
    }
    setInterval(save, SAVE_MS);
    window.addEventListener('beforeunload', save);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') save();
    });
    /* Проект удалили в этой же вкладке — слепок больше не нужен. */
    window.addEventListener('storage', function (event) {
      if (event && event.key && event.key !== DEAD_KEY) return;
      var now = read();
      if (now && isDead(now.id)) forget();
    });
    window.dlForgetSession = forget;
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
