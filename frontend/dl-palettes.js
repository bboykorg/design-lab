/* Палитры для сайта пользователя.

   Кнопка «Палитра» рядом с областью предпросмотра открывает набор готовых
   цветовых схем. Выбор сразу перекрашивает сайт внутри #pvFrame — и в шаблонах,
   и в конструкторе. Разметка сайта заранее неизвестна, поэтому цвета не
   угадываются по классам, а берутся из вычисленных стилей.

   Три правила, из-за которых раньше были баги:

   1) Правятся только цветовые свойства, и откат убирает именно их. Раньше
      целиком запоминался и возвращался атрибут style, а в нём живут и размеры
      блоков, и кегль текста, выставленные в режиме дизайна — смена палитры
      возвращала устаревший слепок и блоки съезжали к левому краю.
   2) Сначала чтение всех вычисленных стилей, потом одна волна записи.
      Смешанный порядок давал гонку, из-за которой второе нажатие «чинило» вид.
   3) Переменная CSS переопределяется только если её текущее значение — цвет.
      Шаблоны иногда держат в --border или --panel целые сокращённые записи
      или размеры; подмена их цветом ломала раскладку.

   «Без палитры» всегда возвращает исходные цвета. window.dlStripPalette(root)
   снимает палитру перед сохранением, чтобы цвета не запекались в проект. */
(function () {
  'use strict';
  if (window.__dlPalettes) return;
  window.__dlPalettes = true;

  var KEY = 'dl_palette';
  var MARK = 'data-dl-pal';
  var KEEP = 'data-dl-pal-keep';
  var STYLE_ID = 'dl-pal-style';
  var STYLE_MARK = 'data-dl-pal-style';
  var VAR_MARK = '--dl-bg:';
  var MAX_NODES = 5000;
  var COLOR_WORDS = ['transparent', 'currentcolor', 'inherit', 'initial', 'unset', 'white', 'black'];

  var PALETTES = [
    { id: 'sunfire', name: '\u0416\u0451\u043b\u0442\u044b\u0439 \u0438 \u043a\u0440\u0430\u0441\u043d\u044b\u0439', bg: '#1b0f08', surface: '#2a1710', surface2: '#3a2115', text: '#ffeccd', muted: '#d7a273', accent: '#ffc93c', accent2: '#e63946', border: '#4b2b18' },
    { id: 'ocean', name: '\u041d\u043e\u0447\u043d\u043e\u0439 \u043e\u043a\u0435\u0430\u043d', bg: '#061726', surface: '#0c2438', surface2: '#123048', text: '#e6f2ff', muted: '#8fb3ce', accent: '#38bdf8', accent2: '#6366f1', border: '#1c3d58' },
    { id: 'emerald', name: '\u0418\u0437\u0443\u043c\u0440\u0443\u0434', bg: '#06170f', surface: '#0b2418', surface2: '#113222', text: '#e4fff1', muted: '#8ec9ab', accent: '#34d399', accent2: '#a3e635', border: '#1b4230' },
    { id: 'sunset', name: '\u0417\u0430\u043a\u0430\u0442', bg: '#1a0d16', surface: '#2a1424', surface2: '#3a1c31', text: '#ffe8f3', muted: '#d197b5', accent: '#fb7185', accent2: '#fbbf24', border: '#4a2440' },
    { id: 'lavender', name: '\u041b\u0430\u0432\u0430\u043d\u0434\u0430', bg: '#120f22', surface: '#1c1833', surface2: '#272145', text: '#ece9ff', muted: '#a6a0cc', accent: '#a78bfa', accent2: '#f472b6', border: '#332c57' },
    { id: 'graphite', name: '\u0413\u0440\u0430\u0444\u0438\u0442', bg: '#0d0f12', surface: '#15181d', surface2: '#1e232a', text: '#e8ecf2', muted: '#9aa4b2', accent: '#e5e7eb', accent2: '#64748b', border: '#2a313a' },
    { id: 'neon', name: '\u041d\u0435\u043e\u043d', bg: '#0a0a14', surface: '#12122a', surface2: '#1a1a3d', text: '#eafaff', muted: '#93a3c9', accent: '#22d3ee', accent2: '#f0abfc', border: '#26264f' },
    { id: 'cherry', name: '\u0412\u0438\u0448\u043d\u044f', bg: '#170a10', surface: '#241019', surface2: '#331723', text: '#ffe9ee', muted: '#cf98a8', accent: '#f43f5e', accent2: '#fda4af', border: '#43202f' },
    { id: 'coffee', name: '\u041a\u043e\u0444\u0435', bg: '#161009', surface: '#231a10', surface2: '#322517', text: '#f6ead9', muted: '#c0a583', accent: '#d9a441', accent2: '#8d6e4a', border: '#40311e' },
    { id: 'mint', name: '\u041c\u044f\u0442\u043d\u0430\u044f (\u0441\u0432\u0435\u0442\u043b\u0430\u044f)', bg: '#f3fbf7', surface: '#ffffff', surface2: '#e4f5ec', text: '#0f2a20', muted: '#4c7a68', accent: '#0f9d76', accent2: '#f59e0b', border: '#cbe7db' },
    { id: 'sand', name: '\u041f\u0435\u0441\u043e\u043a (\u0441\u0432\u0435\u0442\u043b\u0430\u044f)', bg: '#faf6ef', surface: '#ffffff', surface2: '#f1e8da', text: '#2a2118', muted: '#7c6a56', accent: '#c2703b', accent2: '#2f6f6b', border: '#e4d7c3' },
    { id: 'sky', name: '\u041d\u0435\u0431\u043e (\u0441\u0432\u0435\u0442\u043b\u0430\u044f)', bg: '#f4f8ff', surface: '#ffffff', surface2: '#e6efff', text: '#101c33', muted: '#54688c', accent: '#2563eb', accent2: '#f472b6', border: '#cddcf5' }
  ];

  /* --- Цвет: разбор и меры ---------------------------------------- */
  function parse(value) {
    var hit = String(value || '').match(/rgba?\(([^)]+)\)/);
    if (!hit) return null;
    var parts = hit[1].split(',');
    var out = {
      r: parseFloat(parts[0]) || 0,
      g: parseFloat(parts[1]) || 0,
      b: parseFloat(parts[2]) || 0,
      a: parts.length > 3 ? parseFloat(parts[3]) : 1
    };
    if (isNaN(out.a)) out.a = 1;
    return out;
  }
  function hexRgb(hex) {
    var value = String(hex).replace('#', '');
    if (value.length === 3) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }
    var num = parseInt(value, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 1 };
  }
  function lum(color) {
    return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
  }
  function sat(color) {
    var max = Math.max(color.r, color.g, color.b);
    var min = Math.min(color.r, color.g, color.b);
    return max === 0 ? 0 : (max - min) / max;
  }
  function readable(hex, pal) {
    return lum(hexRgb(hex)) > 0.55 ? '#10141a' : pal.text;
  }
  function colorish(value) {
    var text = String(value || '').trim().toLowerCase();
    if (!text) return true;
    if (text.indexOf(' ') >= 0 && text.indexOf('(') < 0) return false;
    if (text.charAt(0) === '#') return true;
    if (text.indexOf('rgb') === 0 || text.indexOf('hsl') === 0) return true;
    return COLOR_WORDS.indexOf(text) >= 0;
  }

  /* --- Аккуратная правка только цветовых свойств ---------------- */
  function savedMap(el) {
    var raw = el.getAttribute(KEEP);
    if (!raw) return {};
    if (raw.charAt(0) !== '{') return { __legacy: raw };
    try {
      var data = JSON.parse(raw);
      return data && typeof data === 'object' ? data : {};
    } catch (e) { return {}; }
  }
  function touch(el, prop, value) {
    var saved = savedMap(el);
    if (!(prop in saved)) {
      var was = el.style.getPropertyValue(prop);
      if (was && el.style.getPropertyPriority(prop)) was += ' !important';
      saved[prop] = was || '';
    }
    el.setAttribute(MARK, '1');
    el.setAttribute(KEEP, JSON.stringify(saved));
    el.style.setProperty(prop, value, 'important');
  }
  function untouch(el) {
    var saved = savedMap(el);
    if (saved.__legacy !== undefined) {
      /* Старый формат из ранее сохранённых проектов. */
      if (saved.__legacy) el.setAttribute('style', saved.__legacy);
      else el.removeAttribute('style');
    } else {
      Object.keys(saved).forEach(function (prop) {
        el.style.removeProperty(prop);
        var was = String(saved[prop] || '');
        if (!was) return;
        var bang = / !important$/i.test(was);
        el.style.setProperty(prop, was.replace(/ !important$/i, ''), bang ? 'important' : '');
      });
      if (!el.getAttribute('style')) el.removeAttribute('style');
    }
    el.removeAttribute(MARK);
    el.removeAttribute(KEEP);
  }

  /* Снятие следов палитры с живого документа или с копии перед сохранением. */
  function strip(root) {
    if (!root || !root.querySelectorAll) return root;
    var list;
    try { list = root.querySelectorAll('[' + MARK + ']'); } catch (e) { list = []; }
    Array.prototype.forEach.call(list, function (el) { untouch(el); });
    var styles;
    try { styles = root.querySelectorAll('style'); } catch (e) { styles = []; }
    Array.prototype.forEach.call(styles, function (node) {
      var own = node.id === STYLE_ID || node.hasAttribute(STYLE_MARK) ||
        String(node.textContent || '').indexOf(VAR_MARK) >= 0;
      if (own && node.parentNode) node.parentNode.removeChild(node);
    });
    return root;
  }
  window.dlStripPalette = strip;

  function baseStyle(doc, pal) {
    var vars = [
      ['--dl-bg', pal.bg], ['--dl-surface', pal.surface], ['--dl-text', pal.text],
      ['--dl-accent', pal.accent], ['--dl-accent-2', pal.accent2], ['--dl-border', pal.border],
      ['--bg', pal.bg], ['--background', pal.bg], ['--surface', pal.surface],
      ['--card', pal.surface], ['--panel', pal.surface], ['--text', pal.text],
      ['--fg', pal.text], ['--muted', pal.muted], ['--accent', pal.accent],
      ['--primary', pal.accent], ['--secondary', pal.accent2], ['--border', pal.border]
    ];
    var view = null;
    try { view = doc.defaultView; } catch (e) { view = null; }
    var root = null;
    if (view && view.getComputedStyle) {
      try { root = view.getComputedStyle(doc.documentElement); } catch (e) { root = null; }
    }
    var body = [];
    vars.forEach(function (pair) {
      var now = '';
      if (root) {
        try { now = root.getPropertyValue(pair[0]); } catch (e) { now = ''; }
      }
      /* Не трогаем переменные, в которых лежит не цвет (размер, сокращённая запись). */
      if (colorish(now)) body.push(pair[0] + ':' + pair[1]);
    });
    return ':root{' + body.join(';') + '}' +
      '::selection{background:' + pal.accent + ';color:' + readable(pal.accent, pal) + '}' +
      '::-webkit-scrollbar-thumb{background:' + pal.border + '}';
  }

  function apply(doc, pal) {
    if (!doc || !doc.body) return false;
    strip(doc);

    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute(STYLE_MARK, pal.id);
    style.textContent = baseStyle(doc, pal);
    (doc.head || doc.documentElement).appendChild(style);

    var nodes;
    try { nodes = doc.body.querySelectorAll('*'); } catch (e) { return false; }
    var limit = Math.min(nodes.length, MAX_NODES);

    /* --- Фаза 1: только чтение вычисленных стилей ---------------- */
    var plan = [];
    var bgOf = new WeakMap();
    bgOf.set(doc.body, pal.bg);

    for (var i = 0; i < limit; i++) {
      var el = nodes[i];
      var tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'BR' ||
          tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'IFRAME') continue;

      var cs;
      try { cs = el.ownerDocument.defaultView.getComputedStyle(el); } catch (e) { continue; }
      if (!cs) continue;

      var props = [];
      var ownBg = null;

      var bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0.05) {
        var bgSat = sat(bg);
        var bgLum = lum(bg);
        if (bgSat > 0.3 && bgLum > 0.12) {
          ownBg = (bg.r >= bg.b) ? pal.accent : pal.accent2;
        } else if (bgLum < 0.14) {
          ownBg = pal.bg;
        } else if (bgLum < 0.55) {
          ownBg = pal.surface;
        } else {
          ownBg = pal.surface2;
        }
        props.push(['background-color', ownBg]);
      }

      var image = String(cs.backgroundImage || '');
      if (image.indexOf('gradient') >= 0) {
        props.push(['background-image',
          'linear-gradient(135deg,' + pal.accent + ',' + pal.accent2 + ')']);
        ownBg = ownBg || pal.accent;
      }

      var under = ownBg;
      if (!under) {
        var up = el.parentElement;
        while (up && !under) { under = bgOf.get(up); up = up.parentElement; }
        under = under || pal.bg;
      }
      bgOf.set(el, under);

      var fg = parse(cs.color);
      if (fg && fg.a > 0.05) {
        var tone;
        if (under === pal.accent || under === pal.accent2) {
          tone = readable(under, pal);
        } else if (sat(fg) > 0.35) {
          tone = pal.accent;
        } else if (lum(fg) < 0.45 && lum(hexRgb(under)) < 0.5) {
          tone = pal.muted;
        } else if (lum(fg) > 0.75 && lum(hexRgb(under)) > 0.5) {
          tone = pal.muted;
        } else {
          tone = readable(under, pal);
        }
        props.push(['color', tone]);
      }

      var width = parseFloat(cs.borderTopWidth) || parseFloat(cs.borderBottomWidth) ||
        parseFloat(cs.borderLeftWidth) || parseFloat(cs.borderRightWidth) || 0;
      if (width > 0) props.push(['border-color', pal.border]);

      if (String(cs.boxShadow || '').indexOf('rgb') >= 0 && cs.boxShadow !== 'none') {
        props.push(['box-shadow', '0 10px 30px rgba(0,0,0,.28)']);
      }

      if (props.length) plan.push({ el: el, props: props });
    }

    /* --- Фаза 2: одна волна записи, размеры блоков не трогаем ------ */
    [doc.documentElement, doc.body].forEach(function (el) {
      if (!el) return;
      touch(el, 'background-color', pal.bg);
      touch(el, 'background-image', 'none');
      touch(el, 'color', pal.text);
    });
    plan.forEach(function (item) {
      item.props.forEach(function (pair) { touch(item.el, pair[0], pair[1]); });
    });
    return true;
  }

  /* --- Состояние и кадр предпросмотра ------------------------------ */
  var chosen = '';
  try { chosen = String(localStorage.getItem(KEY) || ''); } catch (e) { chosen = ''; }

  function palById(id) {
    for (var i = 0; i < PALETTES.length; i++) {
      if (PALETTES[i].id === id) return PALETTES[i];
    }
    return null;
  }
  function frame() {
    return document.getElementById('pvFrame');
  }
  function frameDoc() {
    var node = frame();
    if (!node) return null;
    try { return node.contentDocument || null; } catch (e) { return null; }
  }
  function appliedId(doc) {
    var node = doc.getElementById(STYLE_ID);
    if (!node) return null;
    return node.getAttribute(STYLE_MARK) || '';
  }
  function repaint(doc, pal) {
    var view = null;
    try { view = doc.defaultView; } catch (e) { view = null; }
    if (view && view.requestAnimationFrame) {
      view.requestAnimationFrame(function () { apply(doc, pal); });
    } else {
      apply(doc, pal);
    }
  }
  function paint(force) {
    var doc = frameDoc();
    if (!doc || !doc.body) return;
    var pal = palById(chosen);
    if (!pal) {
      if (appliedId(doc) !== null) strip(doc);
      return;
    }
    if (!force && appliedId(doc) === pal.id) return;
    repaint(doc, pal);
  }
  function clear() {
    var doc = frameDoc();
    if (doc) strip(doc);
  }

  /* --- Панель выбора -------------------------------------------- */
  var button = null;
  var panel = null;

  function css(el, text) { el.setAttribute('style', text); }

  function buildPanel() {
    panel = document.createElement('div');
    css(panel,
      'position:fixed;right:16px;bottom:74px;z-index:99998;width:300px;max-width:calc(100vw - 32px);' +
      'max-height:min(70vh,520px);overflow:auto;padding:14px;border-radius:16px;' +
      'background:#12151b;border:1px solid #262c36;box-shadow:0 24px 60px rgba(0,0,0,.5);display:none;' +
      'font:14px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#e8ecf2');

    var head = document.createElement('div');
    css(head, 'font-weight:600;margin:0 0 10px;font-size:15px');
    head.textContent = '\u0426\u0432\u0435\u0442\u043e\u0432\u0430\u044f \u0441\u0445\u0435\u043c\u0430 \u0441\u0430\u0439\u0442\u0430';
    panel.appendChild(head);

    var note = document.createElement('div');
    css(note, 'color:#9aa4b2;font-size:12px;margin:0 0 12px');
    note.textContent = '\u041f\u0440\u0438\u043c\u0435\u043d\u044f\u0435\u0442\u0441\u044f \u0441\u0440\u0430\u0437\u0443 \u043a \u0442\u0435\u043a\u0443\u0449\u0435\u043c\u0443 \u0441\u0430\u0439\u0442\u0443 \u0432 \u043f\u0440\u0435\u0434\u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0435.';
    panel.appendChild(note);

    PALETTES.forEach(function (pal) {
      var row = document.createElement('button');
      row.setAttribute('type', 'button');
      css(row,
        'display:flex;align-items:center;gap:10px;width:100%;margin:0 0 8px;padding:8px 10px;' +
        'border-radius:12px;border:1px solid ' + (chosen === pal.id ? '#5b8def' : '#242a34') + ';' +
        'background:#171b22;color:#e8ecf2;cursor:pointer;text-align:left');
      var dots = document.createElement('span');
      css(dots, 'display:inline-flex;gap:4px;flex:0 0 auto');
      [pal.bg, pal.accent, pal.accent2].forEach(function (tone) {
        var dot = document.createElement('span');
        css(dot, 'width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:' + tone);
        dots.appendChild(dot);
      });
      row.appendChild(dots);
      var label = document.createElement('span');
      label.textContent = pal.name;
      row.appendChild(label);
      row.addEventListener('click', function () {
        chosen = pal.id;
        try { localStorage.setItem(KEY, chosen); } catch (e) {}
        paint(true);
        refreshMarks();
      });
      row.setAttribute('data-dl-pal-id', pal.id);
      panel.appendChild(row);
    });

    var reset = document.createElement('button');
    reset.setAttribute('type', 'button');
    css(reset,
      'width:100%;margin-top:4px;padding:9px 10px;border-radius:12px;border:1px solid #242a34;' +
      'background:#0f1116;color:#9aa4b2;cursor:pointer');
    reset.textContent = '\u0411\u0435\u0437 \u043f\u0430\u043b\u0438\u0442\u0440\u044b';
    reset.addEventListener('click', function () {
      chosen = '';
      try { localStorage.removeItem(KEY); } catch (e) {}
      clear();
      refreshMarks();
    });
    panel.appendChild(reset);

    document.body.appendChild(panel);
  }

  function refreshMarks() {
    if (!panel) return;
    var rows = panel.querySelectorAll('[data-dl-pal-id]');
    Array.prototype.forEach.call(rows, function (row) {
      var on = row.getAttribute('data-dl-pal-id') === chosen;
      row.style.borderColor = on ? '#5b8def' : '#242a34';
    });
  }

  function buildButton() {
    button = document.createElement('button');
    button.setAttribute('type', 'button');
    button.setAttribute('data-dl-palette-button', '1');
    css(button,
      'position:fixed;right:16px;bottom:16px;z-index:99998;display:none;align-items:center;gap:8px;' +
      'padding:10px 14px;border-radius:999px;border:1px solid #2a313c;background:#151a22;color:#e8ecf2;' +
      'cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.4);' +
      'font:14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif');
    button.textContent = '\u041f\u0430\u043b\u0438\u0442\u0440\u0430';
    button.addEventListener('click', function (event) {
      event.preventDefault();
      event.stopPropagation();
      if (!panel) buildPanel();
      panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
    });
    document.body.appendChild(button);

    document.addEventListener('click', function (event) {
      if (!panel || panel.style.display !== 'block') return;
      if (panel.contains(event.target) || button.contains(event.target)) return;
      panel.style.display = 'none';
    });
  }

  function visible() {
    var node = frame();
    if (!node) return false;
    var box;
    try { box = node.getBoundingClientRect(); } catch (e) { return false; }
    return box.width > 80 && box.height > 80;
  }

  function tick() {
    if (!button) return;
    var on = visible();
    button.style.display = on ? 'inline-flex' : 'none';
    if (!on && panel) panel.style.display = 'none';
    if (on) paint(false);
  }

  function start() {
    buildButton();
    tick();
    setInterval(tick, 700);
    var node = frame();
    if (node) node.addEventListener('load', function () { setTimeout(function () { paint(true); }, 60); });
    if (window.MutationObserver) {
      var pending = null;
      new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () { pending = null; tick(); }, 250);
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
