/* ============================================================================
   Design Lab — подключение моделей к доске (SF-конструктору).
   Подключается ПОСЛЕ index.html, где объявлены SF, SFAI и DLSkills.

   ЧТО БЫЛО СЛОМАНО (воспроизводимый сценарий «напиши сайт кофейню»):

   1. Промпт схемы включал JSON.stringify(schema) целиком. На стартовой
      заглушке VarCorp это десятки тысяч символов плюс эталонный пример ответа.
      Средняя модель либо упирается в лимит ответа, либо теряет формат.
   2. Если JSON не разобрался — никакого ремонта не было, сразу следующая
      модель, а потом demoOps().
   3. demoOps() на любой неузнанный запрос вставлял САМ ТЕКСТ ЗАПРОСА
      заголовком 40px вниз страницы. Именно это видно на скрине:
      под шаблоном VarCorp появилась строка «напиши сайт кофейню».
      Счётчик «Применено операций: 1» — тоже оттуда.
   4. База дизайн-скиллов (dl-design-kb.json / DLSkills) работала только для
      HTML-режима через перехват fetch. В режиме доски скилл не попадал
      в промпт вообще — модель сама выдумывала палитру и типографику.

   ЧТО ДЕЛАЕТ ЭТОТ ФАЙЛ:

   A. compactSchema() — модель видит карту сайта (id, type, короткий текст),
      а не всю портянку свойств. Точечные правки по id при этом работают.
   B. Скилл из базы подмешивается в промпт доски: конкретная палитра, шрифты,
      настроение и план секций — то, что вытягивает слабые модели.
   C. Два круга ремонта ответа: локальная чинка JSON (обрезанные скобки,
      хвостовые запятые, ``` внутри) → если не помогло, повторный запрос
      к той же модели с требованием вернуть только JSON.
   D. Фолбэк больше не кладёт запрос на страницу. Если просили собрать сайт —
      локальный генератор собирает настоящий двухстраничный сайт по теме и по
      скиллу из базы. Если запрос непонятен — мы честно говорим об этом
      и НИЧЕГО не меняем. Молча портить холст нельзя.
   ========================================================================= */
(function () {
  'use strict';
  if (window.__dlBoardAI) return;

  function ready() {
    return typeof window.SF !== 'undefined' && typeof window.SFAI !== 'undefined';
  }

  /* ---------------------------------------------------------------- utils */

  function txt(v, n) {
    var s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1) + '\u2026' : s;
  }

  function lower(s) {
    return ' ' + String(s || '').toLowerCase().replace(/\u0451/g, '\u0435') + ' ';
  }

  /* ------------------------------------------------- A. компактная схема */
  /* Модели нужна карта сайта, а не его полный дамп. Сохраняем id (по ним
     адресуются updateProps/removeNode), тип и короткую подпись. На стартовой
     заглушке это срезает промпт примерно в 10 раз. */
  function compactNode(n, depth) {
    if (!n || depth > 6) return null;
    var p = n.props || {};
    var out = { id: n.id, type: n.type };
    var label = p.text || p.label || p.title || p.alt || '';
    if (label) out.t = txt(label, 70);
    if (p.anchor) out.anchor = p.anchor;
    if (p.href) out.href = p.href;
    if (Array.isArray(p.links) && p.links.length) {
      out.links = p.links.slice(0, 8).map(function (l) {
        return txt(l && l.label, 24) + '\u2192' + txt(l && l.href, 24);
      });
    }
    var kids = (n.children || []).map(function (c) { return compactNode(c, depth + 1); }).filter(Boolean);
    if (kids.length) out.children = kids;
    return out;
  }

  function compactSchema(schema) {
    var s = schema || {};
    return {
      name: s.name,
      theme: s.theme,
      activePageId: s.activePageId,
      pages: (s.pages || []).map(function (pg) {
        return {
          id: pg.id,
          name: pg.name,
          path: pg.path,
          root: compactNode(pg.root, 0)
        };
      })
    };
  }

  /* --------------------------------------------------- B. дизайн-скиллы */
  /* База скиллов асинхронная (fetch по dl-design-kb.json). Греем её заранее и
     держим последний скилл в памяти: промпт строится синхронно. */
  var lastSkill = null;

  function skillApi() {
    var S = window.DLSkills;
    if (!S) return null;
    return S;
  }

  function warmSkills() {
    var S = skillApi();
    if (!S) return;
    try {
      if (typeof S.load === 'function') S.load();
      else if (typeof S.preload === 'function') S.preload();
    } catch (e) { }
  }

  /* Берём скилл любым доступным способом — API базы отличается между версиями. */
  function skillFor(message, mode) {
    var S = skillApi();
    if (!S) return null;
    var names = ['buildSkill', 'skillFor', 'build', 'pick'];
    for (var i = 0; i < names.length; i++) {
      var fn = S[names[i]];
      if (typeof fn !== 'function') continue;
      try {
        var r = fn.call(S, message || '', { mode: mode || 'scratch', variant: 0 });
        if (r && typeof r.then !== 'function') return r;
      } catch (e) { }
    }
    return null;
  }

  function skillBrief(message, mode) {
    var S = skillApi();
    var sk = skillFor(message, mode);
    if (sk) lastSkill = sk;
    if (!sk) return '';

    /* Если база умеет сама рендерить бриф — берём её текст, он богаче. */
    if (S && typeof S.renderBrief === 'function') {
      try {
        var b = S.renderBrief(sk);
        if (b && typeof b === 'string') return b;
      } catch (e) { }
    }

    /* Иначе собираем короткий бриф из полей скилла. */
    var lines = [];
    var dir = sk.direction || sk.dir;
    var pal = sk.palette;
    var font = sk.font || sk.fonts;
    if (dir) lines.push('\u041d\u0430\u043f\u0440\u0430\u0432\u043b\u0435\u043d\u0438\u0435: ' + (dir.name || dir.id) + (dir.summary ? ' \u2014 ' + dir.summary : ''));
    if (pal) {
      var cols = [];
      ['bg', 'surface', 'text', 'muted', 'accent'].forEach(function (k) {
        if (pal[k]) cols.push(k + ' ' + pal[k]);
      });
      if (cols.length) lines.push('\u041f\u0430\u043b\u0438\u0442\u0440\u0430: ' + cols.join(', '));
    }
    if (font) {
      var fd = font.display || font.heading, fb = font.body || font.text;
      if (fd || fb) lines.push('\u0428\u0440\u0438\u0444\u0442\u044b: \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0438 ' + (fd || '\u2014') + ', \u0442\u0435\u043a\u0441\u0442 ' + (fb || '\u2014'));
    }
    if (Array.isArray(sk.sections) && sk.sections.length) {
      lines.push('\u041f\u043b\u0430\u043d \u0441\u0435\u043a\u0446\u0438\u0439: ' + sk.sections.slice(0, 8).join(' \u2192 '));
    }
    if (sk.mood) lines.push('\u041d\u0430\u0441\u0442\u0440\u043e\u0435\u043d\u0438\u0435: ' + sk.mood);
    return lines.length ? lines.join('\n') : '';
  }

  /* Скилл говорит цветами, а доска — темами. Переводим одно в другое,
     чтобы скилл действительно влиял на вид сайта, а не только на текст. */
  function themeFromSkill(sk) {
    if (!sk) return null;
    var pal = sk.palette || {};
    var font = sk.font || sk.fonts || {};
    var theme = {};
    ['bg', 'surface', 'text', 'muted', 'accent', 'border', 'onAccent'].forEach(function (k) {
      if (pal[k]) theme[k] = pal[k];
    });
    var fd = font.display || font.heading;
    var fb = font.body || font.text;
    if (fd) theme.displayFont = fd;
    if (fb) theme.bodyFont = fb;
    return Object.keys(theme).length ? theme : null;
  }

  /* ------------------------------------------------------- C. ремонт JSON */
  /* Модели постоянно обрывают ответ по лимиту токенов и ставят хвостовые
     запятые. Выбрасывать такой ответ целиком — расточительство: чаще всего
     там уже лежит готовый сайт, не хватает только закрывающих скобок. */
  function repairJson(raw) {
    var t = String(raw || '').trim();
    if (!t) return null;

    var fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) t = fence[1].trim();
    else t = t.replace(/```(?:json)?/g, '').trim();

    var start = t.indexOf('{');
    if (start < 0) return null;
    t = t.slice(start);

    /* Идём по строке и запоминаем стек открытых скобок. */
    var stack = [], inStr = false, esc = false, lastSafe = -1, i, c;
    for (i = 0; i < t.length; i++) {
      c = t[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') { stack.push(c); continue; }
      if (c === '}' || c === ']') {
        stack.pop();
        if (!stack.length) { lastSafe = i; break; }
        continue;
      }
      /* Граница, на которой безопасно обрезать оборванный ответ. */
      if ((c === '}' || c === ']' || c === ',') && stack.length) lastSafe = i;
    }

    var candidates = [];
    if (lastSafe > -1 && !stack.length) candidates.push(t.slice(0, lastSafe + 1));

    if (stack.length) {
      /* Ответ оборван: закрываем стек в обратном порядке. */
      var body = t;
      if (inStr) body += '"';
      body = body.replace(/,\s*$/, '');
      var tail = stack.slice().reverse().map(function (b) { return b === '{' ? '}' : ']'; }).join('');
      candidates.push(body + tail);

      /* И более агрессивный вариант: обрезаем до последней целой записи. */
      if (lastSafe > -1) {
        var cut = t.slice(0, lastSafe).replace(/,\s*$/, '');
        candidates.push(cut + tail);
      }
    }

    candidates.push(t);

    for (i = 0; i < candidates.length; i++) {
      var s = candidates[i]
        .replace(/,\s*([}\]])/g, '$1')     /* хвостовые запятые */
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ');
      try {
        var obj = JSON.parse(s);
        if (obj && typeof obj === 'object') {
          if (!Array.isArray(obj.ops)) obj.ops = [];
          obj.say = typeof obj.say === 'string' ? obj.say : '';
          return obj;
        }
      } catch (e) { }
    }
    return null;
  }

  /* ----------------------------------------- D. локальный генератор сайта */
  /* Срабатывает, когда все модели недоступны. Собирает настоящий сайт по
     той же дизайн-системе, что требуется от модели: шкала шрифтов, полосы,
     якоря, две страницы, рабочие ссылки. Это не «демо», а запасной дизайнер. */

  var TOPICS = [
    {
      k: ['\u043a\u043e\u0444\u0435\u0439\u043d', '\u043a\u043e\u0444\u0435', '\u043a\u0430\u0444\u0435', '\u0431\u0430\u0440\u0438\u0441\u0442', 'coffee'],
      preset: 'editorial',
      name: '\u041a\u043e\u0444\u0435\u0439\u043d\u044f \u00ab\u0417\u0451\u0440\u043d\u0430\u00bb',
      hero: '\u041a\u043e\u0444\u0435, \u0440\u0430\u0434\u0438 \u043a\u043e\u0442\u043e\u0440\u043e\u0433\u043e \u0432\u0441\u0442\u0430\u044e\u0442 \u0440\u0430\u043d\u044c\u0448\u0435',
      sub: '\u041e\u0431\u0436\u0430\u0440\u0438\u0432\u0430\u0435\u043c \u043a\u0430\u0436\u0434\u044b\u0439 \u0447\u0435\u0442\u0432\u0435\u0440\u0433, \u0432\u0430\u0440\u0438\u043c \u043d\u0430 \u0434\u0432\u0443\u0445 \u043a\u043e\u0440\u0437\u0438\u043d\u0430\u0445 \u0438 \u043d\u0438\u043a\u043e\u0433\u0434\u0430 \u043d\u0435 \u0433\u0440\u0435\u0435\u043c \u043c\u043e\u043b\u043e\u043a\u043e \u0434\u0432\u0430\u0436\u0434\u044b. \u0421\u0430\u0434\u043e\u0432\u0430\u044f 14, \u043a\u0430\u0436\u0434\u044b\u0439 \u0434\u0435\u043d\u044c \u0441 7:30.',
      cta: '\u0417\u0430\u0431\u0440\u043e\u043d\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u0441\u0442\u043e\u043b',
      alt: '\u041f\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u0442\u044c \u043c\u0435\u043d\u044e',
      secTitle: '\u0427\u0442\u043e \u0443 \u043d\u0430\u0441 \u0432 \u0447\u0430\u0448\u043a\u0435',
      eyebrow: '\u041e\u0431\u0436\u0430\u0440\u043a\u0430 \u0438 \u0432\u0430\u0440\u043a\u0430',
      cards: [
        ['14 \u0434\u043d\u0435\u0439', '\u043c\u0430\u043a\u0441\u0438\u043c\u0430\u043b\u044c\u043d\u044b\u0439 \u0432\u043e\u0437\u0440\u0430\u0441\u0442 \u0437\u0435\u0440\u043d\u0430 \u043d\u0430 \u043d\u0430\u0448\u0435\u0439 \u043a\u043e\u0444\u0435\u043c\u043e\u043b\u043a\u0435'],
        ['92 \u0431\u0430\u043b\u043b\u0430', '\u043e\u0446\u0435\u043d\u043a\u0430 \u044d\u0444\u0438\u043e\u043f\u0441\u043a\u043e\u0433\u043e \u043b\u043e\u0442\u0430 \u0413\u0435\u0434\u0435\u043e \u043f\u043e \u0448\u043a\u0430\u043b\u0435 SCA'],
        ['7:30', '\u043e\u0442\u043a\u0440\u044b\u0432\u0430\u0435\u043c\u0441\u044f \u0440\u0430\u043d\u044c\u0448\u0435 \u0441\u043e\u0441\u0435\u0434\u043d\u0435\u0439 \u043f\u0435\u043a\u0430\u0440\u043d\u0438'],
        ['3 \u043c\u0438\u043d\u0443\u0442\u044b', '\u0441\u0440\u0435\u0434\u043d\u0435\u0435 \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u0437\u0430\u043a\u0430\u0437\u0430 \u0432 \u0443\u0442\u0440\u0435\u043d\u043d\u0438\u0439 \u043f\u0438\u043a']
      ],
      page2: { path: '/booking', name: '\u0411\u0440\u043e\u043d\u044c', title: '\u0411\u0440\u043e\u043d\u044c \u0441\u0442\u043e\u043b\u0430', steps: '1. \u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0435\u043d\u044c \u0438 \u0432\u0440\u0435\u043c\u044f. 2. \u041d\u0430\u043f\u0438\u0448\u0438 \u043d\u0430\u043c \u0432 Telegram. 3. \u041f\u0440\u0438\u0445\u043e\u0434\u0438 \u2014 \u0421\u0430\u0434\u043e\u0432\u0430\u044f 14, \u0441\u0442\u043e\u043b \u0434\u0435\u0440\u0436\u0438\u043c 20 \u043c\u0438\u043d\u0443\u0442.' }
    },
    {
      k: ['\u0431\u0430\u0440\u0431\u0435\u0440', '\u0441\u0442\u0440\u0438\u0436\u043a', '\u043f\u0430\u0440\u0438\u043a\u043c\u0430\u0445\u0435\u0440', 'barber'],
      preset: 'noir',
      name: '\u0411\u0430\u0440\u0431\u0435\u0440\u0448\u043e\u043f \u00ab\u041b\u0435\u0437\u0432\u0438\u0435\u00bb',
      hero: '\u0421\u0442\u0440\u0438\u0436\u043a\u0430, \u043a\u043e\u0442\u043e\u0440\u0430\u044f \u0434\u0435\u0440\u0436\u0438\u0442 \u0444\u043e\u0440\u043c\u0443 \u043c\u0435\u0441\u044f\u0446',
      sub: '\u0427\u0435\u0442\u044b\u0440\u0435 \u043c\u0430\u0441\u0442\u0435\u0440\u0430, \u043e\u0434\u043d\u043e \u043a\u0440\u0435\u0441\u043b\u043e \u043d\u0430 \u0447\u0435\u043b\u043e\u0432\u0435\u043a\u0430 \u0438 \u0447\u0435\u0441\u0442\u043d\u044b\u0435 45 \u043c\u0438\u043d\u0443\u0442 \u0431\u0435\u0437 \u0441\u043f\u0435\u0448\u043a\u0438.',
      cta: '\u0417\u0430\u043f\u0438\u0441\u0430\u0442\u044c\u0441\u044f',
      alt: '\u0426\u0435\u043d\u044b \u0438 \u0443\u0441\u043b\u0443\u0433\u0438',
      secTitle: '\u041f\u043e\u0447\u0435\u043c\u0443 \u043a \u043d\u0430\u043c \u0432\u043e\u0437\u0432\u0440\u0430\u0449\u0430\u044e\u0442\u0441\u044f',
      eyebrow: '\u0420\u0435\u043c\u0435\u0441\u043b\u043e',
      cards: [
        ['45 \u043c\u0438\u043d\u0443\u0442', '\u0441\u0442\u0430\u043d\u0434\u0430\u0440\u0442\u043d\u044b\u0439 \u0441\u043b\u043e\u0442 \u2014 \u0431\u0435\u0437 \u043e\u0447\u0435\u0440\u0435\u0434\u0438 \u0441\u043b\u0435\u0434\u043e\u043c'],
        ['4 \u043c\u0430\u0441\u0442\u0435\u0440\u0430', '\u043a\u0430\u0436\u0434\u044b\u0439 \u0441\u043e \u0441\u0432\u043e\u0438\u043c \u043f\u043e\u0447\u0435\u0440\u043a\u043e\u043c \u0438 \u0437\u0430\u043f\u0438\u0441\u044c\u044e'],
        ['\u0421 2016', '\u0440\u0430\u0431\u043e\u0442\u0430\u0435\u043c \u043d\u0430 \u043e\u0434\u043d\u043e\u043c \u043c\u0435\u0441\u0442\u0435'],
        ['0 \u0440\u0443\u0431\u043b\u0435\u0439', '\u043f\u0440\u0430\u0432\u043a\u0430 \u0432 \u0442\u0435\u0447\u0435\u043d\u0438\u0435 \u043d\u0435\u0434\u0435\u043b\u0438 \u043f\u043e\u0441\u043b\u0435 \u0441\u0442\u0440\u0438\u0436\u043a\u0438']
      ],
      page2: { path: '/booking', name: '\u0417\u0430\u043f\u0438\u0441\u044c', title: '\u0417\u0430\u043f\u0438\u0441\u044c \u043a \u043c\u0430\u0441\u0442\u0435\u0440\u0443', steps: '1. \u0412\u044b\u0431\u0435\u0440\u0438 \u043c\u0430\u0441\u0442\u0435\u0440\u0430. 2. \u041d\u0430\u043f\u0438\u0448\u0438 \u0443\u0434\u043e\u0431\u043d\u044b\u0439 \u0434\u0435\u043d\u044c. 3. \u041f\u0440\u0438\u0445\u043e\u0434\u0438 \u0437\u0430 5 \u043c\u0438\u043d\u0443\u0442 \u0434\u043e \u0441\u043b\u043e\u0442\u0430.' }
    },
    {
      k: ['\u043c\u0430\u0433\u0430\u0437\u0438\u043d', '\u043c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441', '\u0434\u043e\u0441\u0442\u0430\u0432\u043a', '\u0442\u043e\u0432\u0430\u0440', 'shop', 'store'],
      preset: 'studio',
      name: '\u041c\u0430\u0433\u0430\u0437\u0438\u043d \u00ab\u041f\u043e\u043b\u043a\u0430\u00bb',
      hero: '\u0421\u0432\u043e\u0439 \u043c\u0430\u0433\u0430\u0437\u0438\u043d \u0432\u043c\u0435\u0441\u0442\u043e \u043a\u043e\u043c\u0438\u0441\u0441\u0438\u0438 \u043c\u0430\u0440\u043a\u0435\u0442\u043f\u043b\u0435\u0439\u0441\u0430',
      sub: '\u041a\u0430\u0442\u0430\u043b\u043e\u0433, \u043e\u043f\u043b\u0430\u0442\u0430 \u0438 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0430 \u043d\u0430 \u043e\u0434\u043d\u043e\u0439 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435. \u0417\u0430\u043f\u0443\u0441\u043a \u0437\u0430 \u0432\u044b\u0445\u043e\u0434\u043d\u044b\u0435.',
      cta: '\u041f\u043e\u043b\u0443\u0447\u0438\u0442\u044c \u0440\u0430\u0441\u0447\u0451\u0442',
      alt: '\u041a\u0430\u043a \u044d\u0442\u043e \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442',
      secTitle: '\u0427\u0442\u043e \u0432\u0445\u043e\u0434\u0438\u0442 \u0432 \u0437\u0430\u043f\u0443\u0441\u043a',
      eyebrow: '\u041a\u043e\u043c\u043f\u043b\u0435\u043a\u0442',
      cards: [
        ['3 \u0434\u043d\u044f', '\u043e\u0442 \u0431\u0440\u0438\u0444\u0430 \u0434\u043e \u0440\u0430\u0431\u043e\u0447\u0435\u0433\u043e \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0430'],
        ['0%', '\u043a\u043e\u043c\u0438\u0441\u0441\u0438\u0438 \u0441 \u043a\u0430\u0436\u0434\u043e\u0433\u043e \u0437\u0430\u043a\u0430\u0437\u0430'],
        ['\u0421\u0411\u041f', '\u043e\u043f\u043b\u0430\u0442\u0430 \u043a\u0430\u0440\u0442\u043e\u0439 \u0438 \u043f\u043e QR \u0438\u0437 \u043a\u043e\u0440\u0437\u0438\u043d\u044b'],
        ['CDEK', '\u0440\u0430\u0441\u0447\u0451\u0442 \u0434\u043e\u0441\u0442\u0430\u0432\u043a\u0438 \u043f\u0440\u044f\u043c\u043e \u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435']
      ],
      page2: { path: '/order', name: '\u0417\u0430\u044f\u0432\u043a\u0430', title: '\u0417\u0430\u044f\u0432\u043a\u0430 \u043d\u0430 \u0437\u0430\u043f\u0443\u0441\u043a', steps: '1. \u0420\u0430\u0441\u0441\u043a\u0430\u0436\u0438 \u043f\u0440\u043e \u0442\u043e\u0432\u0430\u0440. 2. \u041f\u0440\u0438\u0448\u043b\u0438 \u0444\u043e\u0442\u043e \u0438 \u0446\u0435\u043d\u044b. 3. \u0427\u0435\u0440\u0435\u0437 3 \u0434\u043d\u044f \u043f\u043e\u043b\u0443\u0447\u0438\u0448\u044c \u0441\u0441\u044b\u043b\u043a\u0443 \u043d\u0430 \u043c\u0430\u0433\u0430\u0437\u0438\u043d.' }
    }
  ];

  var GENERIC = {
    preset: 'graphite',
    name: '\u041d\u043e\u0432\u044b\u0439 \u043f\u0440\u043e\u0435\u043a\u0442',
    hero: '\u041f\u043e\u043d\u044f\u0442\u043d\u044b\u0439 \u0441\u0430\u0439\u0442 \u0432\u043c\u0435\u0441\u0442\u043e \u0434\u043b\u0438\u043d\u043d\u043e\u0433\u043e \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u044f',
    sub: '\u041e\u0434\u043d\u0430 \u0433\u043b\u0430\u0432\u043d\u0430\u044f \u043c\u044b\u0441\u043b\u044c \u043d\u0430 \u044d\u043a\u0440\u0430\u043d, \u043e\u0434\u043d\u043e \u0434\u0435\u0439\u0441\u0442\u0432\u0438\u0435 \u043d\u0430 \u0441\u0435\u043a\u0446\u0438\u044e.',
    cta: '\u041e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443',
    alt: '\u041f\u043e\u0434\u0440\u043e\u0431\u043d\u0435\u0435',
    secTitle: '\u0427\u0442\u043e \u0432\u043d\u0443\u0442\u0440\u0438',
    eyebrow: '\u041a\u043e\u0440\u043e\u0442\u043a\u043e',
    cards: [
      ['1 \u044d\u043a\u0440\u0430\u043d', '\u0433\u043b\u0430\u0432\u043d\u043e\u0435 \u0447\u0438\u0442\u0430\u0435\u0442\u0441\u044f \u0431\u0435\u0437 \u043f\u0440\u043e\u043a\u0440\u0443\u0442\u043a\u0438'],
      ['2 \u0446\u0432\u0435\u0442\u0430', '\u0433\u0440\u0443\u043d\u0442 \u0438 \u0430\u043a\u0446\u0435\u043d\u0442, \u0431\u0435\u0437 \u043f\u0435\u0441\u0442\u0440\u043e\u0442\u044b'],
      ['3 \u0448\u0430\u0433\u0430', '\u043f\u0443\u0442\u044c \u043e\u0442 \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0430 \u0434\u043e \u0437\u0430\u044f\u0432\u043a\u0438'],
      ['0 \u0432\u043e\u0434\u044b', '\u0442\u043e\u043b\u044c\u043a\u043e \u043a\u043e\u043d\u043a\u0440\u0435\u0442\u043d\u044b\u0435 \u0444\u0430\u043a\u0442\u044b']
    ],
    page2: { path: '/order', name: '\u0417\u0430\u044f\u0432\u043a\u0430', title: '\u041e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u0437\u0430\u044f\u0432\u043a\u0443', steps: '1. \u041e\u043f\u0438\u0448\u0438 \u0437\u0430\u0434\u0430\u0447\u0443. 2. \u041e\u0441\u0442\u0430\u0432\u044c \u043a\u043e\u043d\u0442\u0430\u043a\u0442. 3. \u041e\u0442\u0432\u0435\u0447\u0430\u0435\u043c \u0432 \u0442\u0435\u0447\u0435\u043d\u0438\u0435 \u0434\u043d\u044f.' }
  };

  function topicFor(text) {
    var low = lower(text);
    for (var i = 0; i < TOPICS.length; i++) {
      for (var j = 0; j < TOPICS[i].k.length; j++) {
        if (low.indexOf(TOPICS[i].k[j]) >= 0) return TOPICS[i];
      }
    }
    return null;
  }

  /* Запрос на создание сайта целиком или точечная правка? */
  function wantsWholeSite(text) {
    var low = lower(text);
    return /(\u0441\u0434\u0435\u043b\u0430|\u0441\u043e\u0431\u0435\u0440|\u0441\u043e\u0437\u0434\u0430|\u043d\u0430\u043f\u0438\u0448|\u0441\u0432\u0435\u0440\u0441\u0442\u0430|\u0440\u0430\u0437\u0440\u0430\u0431\u043e\u0442|\u043f\u0435\u0440\u0435\u0434\u0435\u043b\u0430|\u0437\u0430\u043c\u0435\u043d\u0438)/.test(low) &&
      /(\u0441\u0430\u0439\u0442|\u043b\u0435\u043d\u0434\u0438\u043d\u0433|\u0441\u0442\u0440\u0430\u043d\u0438\u0446|\u043f\u043e\u0440\u0442\u0444\u043e\u043b\u0438|\u0432\u0438\u0437\u0438\u0442\u043a)/.test(low);
  }

  function P(text, size, weight, color, extra) {
    var props = { text: text, fontSize: size };
    if (weight) props.fontWeight = weight;
    if (color) props.color = color;
    if (extra) Object.keys(extra).forEach(function (k) { props[k] = extra[k]; });
    return { type: 'paragraph', props: props };
  }

  function band(anchor, inner, surface, pad) {
    var outer = { padding: '0 24px', alignItems: 'center', anchor: anchor };
    if (surface) outer.backgroundColor = 'var(--sf-surface)';
    return {
      type: 'frame',
      props: outer,
      children: [{
        type: 'frame',
        props: { maxWidth: '1100px', width: '100%', padding: pad || '96px 0', gap: 24 },
        children: inner
      }]
    };
  }

  function anim(variant, trigger, delay, kids) {
    return {
      type: 'animation',
      props: { variant: variant, trigger: trigger, duration: 450, delay: delay || 0 },
      children: kids
    };
  }

  function siteOps(text) {
    var t = topicFor(text) || GENERIC;
    var brand = t.name.replace(/^[^\u00ab]*\u00ab|\u00bb.*$/g, '') || t.name;
    var p2 = t.page2;

    var navLinks = [
      { label: t.secTitle, href: '#about' },
      { label: p2.name, href: p2.path }
    ];

    var header = {
      type: 'header',
      props: { sticky: true, padding: '16px 32px' },
      children: [
        P(brand, 20, 700, null, { href: '/' }),
        { type: 'nav', props: { links: navLinks } }
      ]
    };

    var footer = {
      type: 'footer',
      props: { padding: '28px 32px' },
      children: [
        P('\u00a9 2026 ' + t.name, 14, null, 'var(--sf-muted)'),
        { type: 'nav', props: { links: [{ label: p2.name, href: p2.path }, { label: '\u041d\u0430\u0432\u0435\u0440\u0445', href: '#hero' }] } }
      ]
    };

    var cards = t.cards.map(function (c, i) {
      return anim('slide-up', 'onScroll', i * 120, [{
        type: 'frame',
        props: { backgroundColor: 'var(--sf-bg)', borderRadius: 14, padding: 24, gap: 12 },
        children: [
          P(c[0], 30, 600, 'var(--sf-accent)'),
          P(c[1], 16, null, 'var(--sf-muted)')
        ]
      }]);
    });

    var home = [
      header,
      band('hero', [
        anim('slide-up', 'onLoad', 0, [P(t.hero, 64, 600, null, { lineHeight: 1.1, maxWidth: '760px' })]),
        P(t.sub, 19, null, 'var(--sf-muted)', { maxWidth: '640px' }),
        {
          type: 'frame',
          props: { direction: 'row', gap: 12, padding: 0 },
          children: [
            { type: 'button', props: { label: t.cta, href: p2.path } },
            { type: 'button', props: { label: t.alt, variant: 'outline', href: '#about' } }
          ]
        }
      ], false, '120px 0'),
      band('about', [
        P(t.eyebrow, 14, 600, 'var(--sf-accent)'),
        P(t.secTitle, 40, 600),
        { type: 'frame', props: { direction: 'row', gap: 16, padding: 0, wrap: true }, children: cards }
      ], true),
      band('cta', [
        P('\u0413\u043e\u0442\u043e\u0432\u044b \u043d\u0430\u0447\u0430\u0442\u044c', 36, 600),
        P(t.sub, 18, null, 'var(--sf-muted)', { maxWidth: '620px' }),
        {
          type: 'frame', props: { direction: 'row', gap: 12, padding: 0 },
          children: [{ type: 'button', props: { label: t.cta, href: p2.path } }]
        }
      ], false, '80px 0'),
      footer
    ];

    var second = [
      {
        type: 'header',
        props: { sticky: true, padding: '16px 32px' },
        children: [
          P(brand, 20, 700, null, { href: '/' }),
          { type: 'nav', props: { links: [{ label: '\u041d\u0430 \u0433\u043b\u0430\u0432\u043d\u0443\u044e', href: '/' }] } }
        ]
      },
      {
        type: 'frame',
        props: { padding: '0 24px', alignItems: 'center', anchor: 'order' },
        children: [{
          type: 'frame',
          props: { maxWidth: '760px', width: '100%', padding: '96px 0', gap: 24 },
          children: [
            P(p2.title, 48, 600, null, { lineHeight: 1.1 }),
            P(p2.steps, 18, null, 'var(--sf-muted)'),
            {
              type: 'frame', props: { direction: 'row', gap: 12, padding: 0 },
              children: [
                { type: 'button', props: { label: '\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0432 Telegram', href: 'https://t.me/', openInNewTab: true } },
                { type: 'button', props: { label: '\u041d\u0430 \u0433\u043b\u0430\u0432\u043d\u0443\u044e', variant: 'outline', href: '/' } }
              ]
            }
          ]
        }]
      },
      footer
    ];

    /* Тема: берём пресет по теме запроса, а цвета/шрифты — из базы скиллов,
       если она загружена. Именно так скилл влияет на вид, а не только на текст. */
    var theme = { preset: t.preset };
    var fromSkill = themeFromSkill(lastSkill || skillFor(text, 'scratch'));
    if (fromSkill) Object.keys(fromSkill).forEach(function (k) { theme[k] = fromSkill[k]; });

    return {
      say: '\u0421\u043e\u0431\u0440\u0430\u043b \u0441\u0430\u0439\u0442 \u00ab' + t.name + '\u00bb \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u044b\u043c \u0434\u0432\u0438\u0436\u043a\u043e\u043c: \u0433\u043b\u0430\u0432\u043d\u0430\u044f \u0441 \u044f\u043a\u043e\u0440\u044f\u043c\u0438 \u0438 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0430 \u00ab' + p2.name + '\u00bb. \u0421\u0435\u0442\u044c \u0431\u044b\u043b\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430 \u2014 \u043f\u043e\u0432\u0442\u043e\u0440\u0438 \u0437\u0430\u043f\u0440\u043e\u0441, \u0447\u0442\u043e\u0431\u044b \u0418\u0418 \u0434\u043e\u0432\u0451\u043b \u0442\u0435\u043a\u0441\u0442\u044b \u0434\u043e \u0443\u043c\u0430.',
      ops: [
        { op: 'renameProject', name: t.name },
        { op: 'setTheme', theme: theme },
        { op: 'replacePage', path: '/', name: '\u0413\u043b\u0430\u0432\u043d\u0430\u044f', children: home },
        { op: 'replacePage', path: p2.path, name: p2.name, children: second },
        { op: 'setActivePage', path: '/' }
      ]
    };
  }

  /* ======================================================================= */
  /*                              ПАТЧИ SFAI                                */
  /* ======================================================================= */
  function patch() {
    if (!ready() || window.__dlBoardAI) return;
    window.__dlBoardAI = true;

    var SFAI = window.SFAI;
    var origPrompt = SFAI.systemPrompt;
    var origParse = SFAI.parseResponse;

    /* ---- A + B: компактная схема + скилл из базы -------------------- */
    SFAI.systemPrompt = function (schema, opts) {
      opts = opts || {};
      var base;
      try {
        /* Базовый промпт строим на ПУСТОЙ схеме, чтобы получить только
           правила без гигантского дампа, а схему подставляем компактную. */
        base = origPrompt.call(SFAI, { name: '', pages: [], theme: '' }, opts);
        base = base.replace(/\n\{"name":"","pages":\[\][^\n]*$/, '');
      } catch (e) {
        base = origPrompt.call(SFAI, schema, opts);
      }

      var parts = [base];

      var brief = '';
      try { brief = skillBrief(window.__dlBoardLastMessage || '', opts.starter ? 'scratch' : 'edit'); } catch (e) { }
      if (brief) {
        parts.push('');
        parts.push('\u0414\u0418\u0417\u0410\u0419\u041d-\u0421\u041a\u0418\u041b\u041b \u0418\u0417 \u0411\u0410\u0417\u042b \u041f\u0420\u041e\u0415\u041a\u0422\u0410 \u2014 \u0438\u0441\u043f\u043e\u043b\u043d\u044f\u0439 \u0435\u0433\u043e, \u043d\u0435 \u0432\u044b\u0434\u0443\u043c\u044b\u0432\u0430\u0439 \u0441\u0432\u043e\u0451:');
        parts.push(brief);
        parts.push('\u041f\u0435\u0440\u0435\u043d\u0435\u0441\u0438 \u043f\u0430\u043b\u0438\u0442\u0440\u0443 \u0438 \u0448\u0440\u0438\u0444\u0442\u044b \u0441\u043a\u0438\u043b\u043b\u0430 \u0432 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u044e setTheme (\u043a\u043b\u044e\u0447\u0438 bg, surface, text, muted, accent, displayFont, bodyFont), \u0430 \u043f\u043b\u0430\u043d \u0441\u0435\u043a\u0446\u0438\u0439 \u2014 \u0432 \u043f\u043e\u0440\u044f\u0434\u043e\u043a \u043f\u043e\u043b\u043e\u0441 \u043d\u0430 \u0433\u043b\u0430\u0432\u043d\u043e\u0439.');
      }

      parts.push('');
      parts.push('\u0422\u0415\u041a\u0423\u0429\u0410\u042f \u0421\u0425\u0415\u041c\u0410 \u0421\u0410\u0419\u0422\u0410 (\u0441\u043e\u043a\u0440\u0430\u0449\u0451\u043d\u043d\u0430\u044f \u043a\u0430\u0440\u0442\u0430: id \u0434\u043b\u044f \u0442\u043e\u0447\u0435\u0447\u043d\u044b\u0445 \u043e\u043f\u0435\u0440\u0430\u0446\u0438\u0439, t \u2014 \u043d\u0430\u0447\u0430\u043b\u043e \u0442\u0435\u043a\u0441\u0442\u0430):');
      try { parts.push(JSON.stringify(compactSchema(schema))); }
      catch (e) { parts.push('{}'); }

      return parts.join('\n');
    };

    /* ---- C: терпимый парсер с ремонтом ------------------------------ */
    SFAI.parseResponse = function (text) {
      try {
        return origParse.call(SFAI, text);
      } catch (e) {
        var fixed = repairJson(text);
        if (fixed) return fixed;
        throw e;
      }
    };

    SFAI.repairJson = repairJson;
    SFAI.compactSchema = compactSchema;

    /* ---- D: фолбэк вместо вставки текста запроса -------------------- */
    SFAI.demoOps = function (text, schema) {
      var q = lower(text);

      /* Точечные просьбы, которые можно чес\u0442\u043dо выполнить без ИИ. */
      if (/\u0442\u0435\u043c[\u0443\u044b\u0430]/.test(q) && window.SF && window.SF.THEMES) {
        var keys = Object.keys(window.SF.THEMES);
        var cur = typeof schema.theme === 'string' ? schema.theme : (schema.theme && schema.theme.preset) || keys[0];
        var nextTheme = keys[(keys.indexOf(cur) + 1) % keys.length];
        return {
          say: '\u0418\u0418 \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b, \u043d\u043e \u0442\u0435\u043c\u0443 \u043f\u0435\u0440\u0435\u043a\u043b\u044e\u0447\u0438\u043b \u043b\u043e\u043a\u0430\u043b\u044c\u043d\u043e: \u00ab' + window.SF.THEMES[nextTheme].name + '\u00bb.',
          ops: [{ op: 'setTheme', theme: { preset: nextTheme } }]
        };
      }

      /* Просили собрать сайт — собираем настоящий сайт, а не заголовок. */
      if (wantsWholeSite(text)) return siteOps(text);

      /* Во всех остальных случаях НИЧЕГО не трогаем. Старый фолбэк клал
         текст запроса заголовком вниз страницы — именно это выглядело как
         «модель испортила доску». Лучше сказать правду. */
      return {
        say: '\u041d\u0435 \u0441\u043c\u043e\u0433 \u0441\u0432\u044f\u0437\u0430\u0442\u044c\u0441\u044f \u043d\u0438 \u0441 \u043e\u0434\u043d\u043e\u0439 \u043c\u043e\u0434\u0435\u043b\u044c\u044e, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0430 \u0434\u043e\u0441\u043a\u0435 \u043d\u0435 \u043c\u0435\u043d\u044f\u043b \u2014 \u043b\u0443\u0447\u0448\u0435 \u043e\u0441\u0442\u0430\u0432\u0438\u0442\u044c \u043c\u0430\u043a\u0435\u0442 \u0446\u0435\u043b\u044b\u043c, \u0447\u0435\u043c \u0438\u0441\u043f\u043e\u0440\u0442\u0438\u0442\u044c \u0435\u0433\u043e \u0432\u0441\u043b\u0435\u043f\u0443\u044e. \u041f\u0440\u043e\u0432\u0435\u0440\u044c \u0441\u0435\u0442\u044c \u0438\u043b\u0438 \u0432\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c \u0432 \u043f\u0438\u043b\u044e\u043b\u0435 \u0441\u043b\u0435\u0432\u0430 \u0432\u043d\u0438\u0437\u0443.',
        ops: []
      };
    };

    SFAI.siteOps = siteOps;

    /* ---- Запоминаем текст запроса: промпт строится без доступа к нему,
         а скилл подбирается именно по запросу. -------------------------- */
    var input = document.getElementById('chatInput');
    if (input) {
      input.addEventListener('keydown', function () {
        window.__dlBoardLastMessage = input.value || '';
      }, true);
    }
    var origSend = window.sendMessage;
    if (typeof origSend === 'function') {
      window.sendMessage = function () {
        var el = document.getElementById('chatInput');
        if (el && (el.value || '').trim()) window.__dlBoardLastMessage = el.value.trim();
        return origSend.apply(this, arguments);
      };
    }

    warmSkills();
  }

  /* SF/SFAI объявлены инлайном в index.html, но обёртки sfSendMessage ставятся
     на загрузке. Ждём готовности, но не бесконечно. */
  var tries = 0;
  (function wait() {
    if (ready()) { patch(); return; }
    if (++tries > 100) return;
    setTimeout(wait, 60);
  })();

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', patch);
  else setTimeout(patch, 0);
  window.addEventListener('load', patch);
})();
