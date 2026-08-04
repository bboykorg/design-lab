/* Палитры для сайта пользователя.

   Кнопка «Палитра» рядом с областью предпросмотра открывает готовые схемы
   и раздел «Свои цвета»: фон, поверхность, текст и два акцента выбираются
   вручную, остальные тона (вторая поверхность, приглушённый текст, граница)
   считаются автоматически смешением. Разметка сайта заранее неизвестна,
   поэтому цвета берутся из вычисленных стилей.

   Границы карточек. Если блок выделялся фоном, рамкой или тенью, ему
   гарантируется видимость: фон берётся на шаг светлее родительского,
   а обводка рисуется внутренней тенью — она не занимает места и потому
   не может сдвинуть верстку, в отличие от настоящего border.

   Почему блоки больше не съезжают к левому краю:
     • палитра ничего не пишет в атрибут style — именно через него
       работают растягивание блоков и масштаб текста в режиме дизайна;
     • элементу ставится только номер цветовой группы, цвета живут
       в одной таблице стилей внутри сайта;
     • CSS-переменные шаблона не подменяются — в них бывают размеры;
     • геометрия сверяется сразу, через 0,5 с и через 1,5 с; при сдвиге
       палитра сама переходит в бережный режим, а затем снимается.

   window.dlStripPalette(root) снимает палитру перед сохранением, чтобы цвета
   не запекались в проект; он же чистит inline-следы старых версий. */
(function () {
  'use strict';
  if (window.__dlPalettes) return;
  window.__dlPalettes = true;

  var KEY = 'dl_palette';
  var OWN_KEY = 'dl_palette_own';
  var OWN_ID = 'own';
  var GROUP = 'data-dl-pal-i';
  var OLD_MARK = 'data-dl-pal';
  var OLD_KEEP = 'data-dl-pal-keep';
  var STYLE_ID = 'dl-pal-style';
  var STYLE_MARK = 'data-dl-pal-style';
  var VAR_MARK = '--dl-bg:';
  var MAX_NODES = 5000;
  var PROBE_NODES = 120;
  var SHIFT_PX = 2;
  var LATE_MS = [500, 1500];

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

  var OWN_DEFAULT = { bg: '#101318', surface: '#191d24', text: '#eef2f8', accent: '#4f8cff', accent2: '#f59e0b' };
  var OWN_FIELDS = [
    { key: 'bg', label: '\u0424\u043e\u043d \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u044b' },
    { key: 'surface', label: '\u0424\u043e\u043d \u043a\u0430\u0440\u0442\u043e\u0447\u0435\u043a' },
    { key: 'text', label: '\u0422\u0435\u043a\u0441\u0442' },
    { key: 'accent', label: '\u0410\u043a\u0446\u0435\u043d\u0442' },
    { key: 'accent2', label: '\u0412\u0442\u043e\u0440\u043e\u0439 \u0430\u043a\u0446\u0435\u043d\u0442' }
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
    var value = String(hex || '').replace('#', '');
    if (value.length === 3) {
      value = value[0] + value[0] + value[1] + value[1] + value[2] + value[2];
    }
    if (value.length !== 6) return { r: 0, g: 0, b: 0, a: 1 };
    var num = parseInt(value, 16);
    if (isNaN(num)) return { r: 0, g: 0, b: 0, a: 1 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255, a: 1 };
  }
  function toHex(color) {
    function part(value) {
      var num = Math.max(0, Math.min(255, Math.round(value)));
      return (num < 16 ? '0' : '') + num.toString(16);
    }
    return '#' + part(color.r) + part(color.g) + part(color.b);
  }
  function mix(hexA, hexB, share) {
    var a = hexRgb(hexA);
    var b = hexRgb(hexB);
    return toHex({
      r: a.r + (b.r - a.r) * share,
      g: a.g + (b.g - a.g) * share,
      b: a.b + (b.b - a.b) * share
    });
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
  function isHex(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''));
  }

  /* --- Свои цвета -------------------------------------------------- */
  function readOwn() {
    var data = null;
    try { data = JSON.parse(localStorage.getItem(OWN_KEY) || 'null'); } catch (e) { data = null; }
    var out = {};
    OWN_FIELDS.forEach(function (field) {
      var value = data && data[field.key];
      out[field.key] = isHex(value) ? String(value).toLowerCase() : OWN_DEFAULT[field.key];
    });
    return out;
  }
  function writeOwn(data) {
    try { localStorage.setItem(OWN_KEY, JSON.stringify(data)); } catch (e) {}
  }
  /* Остальные тона считаются смешением, чтобы выбирать надо было мало. */
  function ownPalette() {
    var own = readOwn();
    return {
      id: OWN_ID,
      name: '\u0421\u0432\u043e\u0438 \u0446\u0432\u0435\u0442\u0430',
      bg: own.bg,
      surface: own.surface,
      surface2: mix(own.surface, own.text, 0.12),
      text: own.text,
      muted: mix(own.text, own.bg, 0.42),
      accent: own.accent,
      accent2: own.accent2,
      border: mix(own.surface, own.text, 0.24)
    };
  }

  /* --- Снятие палитры ------------------------------------------- */
  function strip(root) {
    if (!root || !root.querySelectorAll) return root;
    var groups;
    try { groups = root.querySelectorAll('[' + GROUP + ']'); } catch (e) { groups = []; }
    Array.prototype.forEach.call(groups, function (el) { el.removeAttribute(GROUP); });

    /* Наследие старых версий: inline-цвета и слепки атрибута style. */
    var old;
    try { old = root.querySelectorAll('[' + OLD_MARK + ']'); } catch (e) { old = []; }
    Array.prototype.forEach.call(old, function (el) {
      var raw = el.getAttribute(OLD_KEEP);
      if (raw && raw.charAt(0) === '{') {
        var data = {};
        try { data = JSON.parse(raw) || {}; } catch (e) { data = {}; }
        Object.keys(data).forEach(function (prop) {
          el.style.removeProperty(prop);
          var was = String(data[prop] || '');
          if (!was) return;
          var bang = / !important$/i.test(was);
          el.style.setProperty(prop, was.replace(/ !important$/i, ''), bang ? 'important' : '');
        });
        if (!el.getAttribute('style')) el.removeAttribute('style');
      } else if (raw) {
        el.setAttribute('style', raw);
      } else {
        ['background-color', 'background-image', 'color', 'border-color', 'box-shadow'].forEach(function (prop) {
          el.style.removeProperty(prop);
        });
        if (!el.getAttribute('style')) el.removeAttribute('style');
      }
      el.removeAttribute(OLD_MARK);
      el.removeAttribute(OLD_KEEP);
    });

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

  /* --- Слепок геометрии --------------------------------------- */
  function shape(doc) {
    var out = [];
    var nodes;
    try { nodes = doc.body.querySelectorAll('*'); } catch (e) { return out; }
    var limit = Math.min(nodes.length, PROBE_NODES);
    for (var i = 0; i < limit; i++) {
      var box;
      try { box = nodes[i].getBoundingClientRect(); } catch (e) { box = null; }
      out.push(box ? [box.left, box.width] : [0, 0]);
    }
    return out;
  }
  function moved(before, after) {
    if (before.length !== after.length) return true;
    for (var i = 0; i < before.length; i++) {
      if (Math.abs(before[i][0] - after[i][0]) > SHIFT_PX) return true;
      if (Math.abs(before[i][1] - after[i][1]) > SHIFT_PX) return true;
    }
    return false;
  }

  /* --- Перекраска таблицей стилей ---------------------------- */
  function apply(doc, pal, safe) {
    if (!doc || !doc.body) return false;
    strip(doc);

    var nodes;
    try { nodes = doc.body.querySelectorAll('*'); } catch (e) { return false; }
    var limit = Math.min(nodes.length, MAX_NODES);

    var rules = [];
    var index = {};
    var bgOf = new WeakMap();
    bgOf.set(doc.body, pal.bg);
    var marks = [];

    for (var i = 0; i < limit; i++) {
      var el = nodes[i];
      var tag = el.tagName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK' || tag === 'BR' ||
          tag === 'IMG' || tag === 'VIDEO' || tag === 'CANVAS' || tag === 'IFRAME') continue;

      var cs;
      try { cs = el.ownerDocument.defaultView.getComputedStyle(el); } catch (e) { continue; }
      if (!cs) continue;

      /* Фон родителя в новой схеме — от него строится шаг контраста. */
      var parentBg = null;
      var up = el.parentElement;
      while (up && !parentBg) { parentBg = bgOf.get(up); up = up.parentElement; }
      parentBg = parentBg || pal.bg;

      var props = [];
      var ownBg = null;
      var accentBg = false;

      var bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0.05) {
        if (sat(bg) > 0.3 && lum(bg) > 0.12) {
          ownBg = (bg.r >= bg.b) ? pal.accent : pal.accent2;
          accentBg = true;
        } else if (parentBg === pal.bg) {
          ownBg = pal.surface;
        } else if (parentBg === pal.surface) {
          ownBg = pal.surface2;
        } else if (parentBg === pal.surface2) {
          ownBg = pal.surface;
        } else {
          ownBg = pal.surface;
        }
        props.push('background-color:' + ownBg + '!important');
      }

      var image = String(cs.backgroundImage || '');
      if (!safe && image.indexOf('gradient') >= 0) {
        props.push('background-image:linear-gradient(135deg,' + pal.accent + ',' + pal.accent2 + ')!important');
        ownBg = ownBg || pal.accent;
        accentBg = true;
      }

      var under = ownBg || parentBg;
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
        props.push('color:' + tone + '!important');
      }

      if (!safe) {
        var edge = parseFloat(cs.borderTopWidth) || parseFloat(cs.borderBottomWidth) ||
          parseFloat(cs.borderLeftWidth) || parseFloat(cs.borderRightWidth) || 0;
        if (edge > 0) props.push('border-color:' + pal.border + '!important');

        var shadow = String(cs.boxShadow || '');
        var hadShadow = shadow !== 'none' && shadow.indexOf('rgb') >= 0;
        var card = !!ownBg && !accentBg;
        /* Карточка без рамки теряла границы — рисуем обводку внутренней
           тенью: она не занимает места и не сдвигает верстку. */
        if (card && edge <= 0) {
          props.push('box-shadow:inset 0 0 0 1px ' + pal.border +
            ',0 10px 30px rgba(0,0,0,.18)!important');
        } else if (hadShadow) {
          props.push('box-shadow:0 10px 30px rgba(0,0,0,.28)!important');
        }
      }

      if (!props.length) continue;
      var key = props.join(';');
      if (!(key in index)) {
        index[key] = rules.length;
        rules.push(key);
      }
      marks.push([el, index[key]]);
    }

    /* Запись: один атрибут-номер на элемент, никаких inline-стилей. */
    marks.forEach(function (pair) {
      pair[0].setAttribute(GROUP, String(pair[1]));
    });

    var text = 'html,body{background-color:' + pal.bg + '!important;color:' + pal.text + '!important}';
    if (!safe) text += 'html,body{background-image:none!important}';
    text += '::selection{background:' + pal.accent + ';color:' + readable(pal.accent, pal) + '}' +
      '::-webkit-scrollbar-thumb{background:' + pal.border + '}';
    if (!safe) {
      /* Разделители секций тоже должны быть видны. */
      text += 'hr{border-color:' + pal.border + '!important}';
    }
    rules.forEach(function (body, idx) {
      text += '[' + GROUP + '="' + idx + '"]{' + body + '}';
    });

    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.setAttribute(STYLE_MARK, pal.id);
    style.textContent = text;
    (doc.head || doc.documentElement).appendChild(style);
    return true;
  }

  /* Перекраска с проверками сразу и с задержкой. */
  function applyChecked(doc, pal) {
    var before = shape(doc);
    if (!apply(doc, pal, false)) return;
    var safeUsed = false;
    function fix() {
      if (!moved(before, shape(doc))) return;
      if (!safeUsed) {
        safeUsed = true;
        apply(doc, pal, true);
        if (!moved(before, shape(doc))) return;
      }
      strip(doc);
    }
    fix();
    LATE_MS.forEach(function (wait) {
      setTimeout(function () {
        if (!doc.body || !doc.getElementById(STYLE_ID)) return;
        fix();
      }, wait);
    });
  }

  /* --- Состояние и кадр предпросмотра ------------------------------ */
  var chosen = '';
  try { chosen = String(localStorage.getItem(KEY) || ''); } catch (e) { chosen = ''; }

  function palById(id) {
    if (id === OWN_ID) return ownPalette();
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
  function paint(force) {
    var doc = frameDoc();
    if (!doc || !doc.body) return;
    var pal = palById(chosen);
    if (!pal) {
      if (appliedId(doc) !== null) strip(doc);
      return;
    }
    if (!force && appliedId(doc) === pal.id) return;
    var view = null;
    try { view = doc.defaultView; } catch (e) { view = null; }
    if (view && view.requestAnimationFrame) {
      view.requestAnimationFrame(function () { applyChecked(doc, pal); });
    } else {
      applyChecked(doc, pal);
    }
  }
  function clear() {
    var doc = frameDoc();
    if (doc) strip(doc);
  }

  /* --- Панель выбора -------------------------------------------- */
  var button = null;
  var panel = null;
  var ownRow = null;
  var ownDots = null;

  function css(el, text) { el.setAttribute('style', text); }

  function rowStyle(on) {
    return 'display:flex;align-items:center;gap:10px;width:100%;margin:0 0 8px;padding:8px 10px;' +
      'border-radius:12px;border:1px solid ' + (on ? '#5b8def' : '#242a34') + ';' +
      'background:#171b22;color:#e8ecf2;cursor:pointer;text-align:left';
  }
  function dotsFor(pal) {
    var dots = document.createElement('span');
    css(dots, 'display:inline-flex;gap:4px;flex:0 0 auto');
    [pal.bg, pal.accent, pal.accent2].forEach(function (tone) {
      var dot = document.createElement('span');
      css(dot, 'width:16px;height:16px;border-radius:50%;border:1px solid rgba(255,255,255,.18);background:' + tone);
      dots.appendChild(dot);
    });
    return dots;
  }

  function buildOwnSection() {
    var box = document.createElement('div');
    css(box, 'margin:12px 0 8px;padding:10px;border-radius:12px;border:1px solid #242a34;background:#0f1319');

    var title = document.createElement('div');
    css(title, 'font-weight:600;margin:0 0 8px');
    title.textContent = '\u0421\u0432\u043e\u0438 \u0446\u0432\u0435\u0442\u0430';
    box.appendChild(title);

    var own = readOwn();
    OWN_FIELDS.forEach(function (field) {
      var line = document.createElement('label');
      css(line, 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 7px;font-size:13px;color:#c7cedb');
      var name = document.createElement('span');
      name.textContent = field.label;
      line.appendChild(name);
      var input = document.createElement('input');
      input.setAttribute('type', 'color');
      input.value = own[field.key];
      css(input, 'width:44px;height:26px;padding:0;border:1px solid #2a313c;border-radius:7px;background:#171b22;cursor:pointer');
      input.addEventListener('input', function () {
        var data = readOwn();
        data[field.key] = String(input.value || '').toLowerCase();
        writeOwn(data);
        refreshOwnDots();
        if (chosen === OWN_ID) paint(true);
      });
      line.appendChild(input);
      box.appendChild(line);
    });

    var hint = document.createElement('div');
    css(hint, 'color:#8b95a5;font-size:12px;margin:2px 0 10px');
    hint.textContent = '\u041e\u0441\u0442\u0430\u043b\u044c\u043d\u044b\u0435 \u0442\u043e\u043d\u0430 \u0438 \u0433\u0440\u0430\u043d\u0438\u0446\u044b \u043f\u043e\u0434\u0431\u0435\u0440\u0443\u0442\u0441\u044f \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u0438.';
    box.appendChild(hint);

    ownRow = document.createElement('button');
    ownRow.setAttribute('type', 'button');
    ownRow.setAttribute('data-dl-pal-id', OWN_ID);
    css(ownRow, rowStyle(chosen === OWN_ID));
    ownDots = dotsFor(ownPalette());
    ownRow.appendChild(ownDots);
    var label = document.createElement('span');
    label.textContent = '\u041f\u0440\u0438\u043c\u0435\u043d\u0438\u0442\u044c \u0441\u0432\u043e\u0438 \u0446\u0432\u0435\u0442\u0430';
    ownRow.appendChild(label);
    ownRow.addEventListener('click', function () {
      chosen = OWN_ID;
      try { localStorage.setItem(KEY, chosen); } catch (e) {}
      paint(true);
      refreshMarks();
    });
    box.appendChild(ownRow);

    return box;
  }
  function refreshOwnDots() {
    if (!ownRow || !ownDots) return;
    var fresh = dotsFor(ownPalette());
    ownRow.replaceChild(fresh, ownDots);
    ownDots = fresh;
  }

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

    panel.appendChild(buildOwnSection());

    PALETTES.forEach(function (pal) {
      var row = document.createElement('button');
      row.setAttribute('type', 'button');
      row.setAttribute('data-dl-pal-id', pal.id);
      css(row, rowStyle(chosen === pal.id));
      row.appendChild(dotsFor(pal));
      var label = document.createElement('span');
      label.textContent = pal.name;
      row.appendChild(label);
      row.addEventListener('click', function () {
        chosen = pal.id;
        try { localStorage.setItem(KEY, chosen); } catch (e) {}
        paint(true);
        refreshMarks();
      });
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
