/* Палитры для сайта пользователя.

   Кнопка «Палитра» рядом с областью предпросмотра открывает набор готовых
   цветовых схем. Выбор сразу перекрашивает сайт внутри #pvFrame — и в шаблонах,
   и в конструкторе. Разметка сайта заранее неизвестна, поэтому цвета не
   угадываются по классам, а берутся из вычисленных стилей: тёмные фоны
   становятся фоном палитры, насыщенные — акцентом, текст подбирается по
   контрасту к новому фону. Любой выбор обратим: «Без палитры» возвращает
   исходные цвета, так как старые inline-стили сохраняются рядом. */
(function () {
  'use strict';
  if (window.__dlPalettes) return;
  window.__dlPalettes = true;

  var KEY = 'dl_palette';
  var MARK = 'data-dl-pal';
  var KEEP = 'data-dl-pal-keep';
  var STYLE_ID = 'dl-pal-style';
  var MAX_NODES = 5000;

  var PALETTES = [
    { id: 'sunfire', name: 'Жёлтый и красный', bg: '#1b0f08', surface: '#2a1710', surface2: '#3a2115', text: '#ffeccd', muted: '#d7a273', accent: '#ffc93c', accent2: '#e63946', border: '#4b2b18' },
    { id: 'ocean', name: 'Ночной океан', bg: '#061726', surface: '#0c2438', surface2: '#123048', text: '#e6f2ff', muted: '#8fb3ce', accent: '#38bdf8', accent2: '#6366f1', border: '#1c3d58' },
    { id: 'emerald', name: 'Изумруд', bg: '#06170f', surface: '#0b2418', surface2: '#113222', text: '#e4fff1', muted: '#8ec9ab', accent: '#34d399', accent2: '#a3e635', border: '#1b4230' },
    { id: 'sunset', name: 'Закат', bg: '#1a0d16', surface: '#2a1424', surface2: '#3a1c31', text: '#ffe8f3', muted: '#d197b5', accent: '#fb7185', accent2: '#fbbf24', border: '#4a2440' },
    { id: 'lavender', name: 'Лаванда', bg: '#120f22', surface: '#1c1833', surface2: '#272145', text: '#ece9ff', muted: '#a6a0cc', accent: '#a78bfa', accent2: '#f472b6', border: '#332c57' },
    { id: 'graphite', name: 'Графит', bg: '#0d0f12', surface: '#15181d', surface2: '#1e232a', text: '#e8ecf2', muted: '#9aa4b2', accent: '#e5e7eb', accent2: '#64748b', border: '#2a313a' },
    { id: 'neon', name: 'Неон', bg: '#0a0a14', surface: '#12122a', surface2: '#1a1a3d', text: '#eafaff', muted: '#93a3c9', accent: '#22d3ee', accent2: '#f0abfc', border: '#26264f' },
    { id: 'cherry', name: 'Вишня', bg: '#170a10', surface: '#241019', surface2: '#331723', text: '#ffe9ee', muted: '#cf98a8', accent: '#f43f5e', accent2: '#fda4af', border: '#43202f' },
    { id: 'coffee', name: 'Кофе', bg: '#161009', surface: '#231a10', surface2: '#322517', text: '#f6ead9', muted: '#c0a583', accent: '#d9a441', accent2: '#8d6e4a', border: '#40311e' },
    { id: 'mint', name: 'Мятная (светлая)', bg: '#f3fbf7', surface: '#ffffff', surface2: '#e4f5ec', text: '#0f2a20', muted: '#4c7a68', accent: '#0f9d76', accent2: '#f59e0b', border: '#cbe7db' },
    { id: 'sand', name: 'Песок (светлая)', bg: '#faf6ef', surface: '#ffffff', surface2: '#f1e8da', text: '#2a2118', muted: '#7c6a56', accent: '#c2703b', accent2: '#2f6f6b', border: '#e4d7c3' },
    { id: 'sky', name: 'Небо (светлая)', bg: '#f4f8ff', surface: '#ffffff', surface2: '#e6efff', text: '#101c33', muted: '#54688c', accent: '#2563eb', accent2: '#f472b6', border: '#cddcf5' }
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

  /* --- Перекраска документа --------------------------------------- */
  function setProp(el, name, value) {
    el.style.setProperty(name, value, 'important');
  }
  function remember(el) {
    if (el.hasAttribute(MARK)) return;
    el.setAttribute(MARK, '1');
    el.setAttribute(KEEP, el.getAttribute('style') || '');
  }
  function restore(doc) {
    var list;
    try { list = doc.querySelectorAll('[' + MARK + ']'); } catch (e) { return; }
    Array.prototype.forEach.call(list, function (el) {
      var old = el.getAttribute(KEEP) || '';
      if (old) el.setAttribute('style', old);
      else el.removeAttribute('style');
      el.removeAttribute(MARK);
      el.removeAttribute(KEEP);
    });
    var style = doc.getElementById(STYLE_ID);
    if (style && style.parentNode) style.parentNode.removeChild(style);
  }

  function baseStyle(pal) {
    return ':root{--dl-bg:' + pal.bg + ';--dl-surface:' + pal.surface + ';--dl-text:' + pal.text +
      ';--dl-accent:' + pal.accent + ';--dl-accent-2:' + pal.accent2 + ';--dl-border:' + pal.border +
      ';--bg:' + pal.bg + ';--background:' + pal.bg + ';--surface:' + pal.surface +
      ';--card:' + pal.surface + ';--panel:' + pal.surface + ';--text:' + pal.text +
      ';--fg:' + pal.text + ';--muted:' + pal.muted + ';--accent:' + pal.accent +
      ';--primary:' + pal.accent + ';--secondary:' + pal.accent2 + ';--border:' + pal.border + '}' +
      'html,body{background:' + pal.bg + '!important;color:' + pal.text + '!important}' +
      '::selection{background:' + pal.accent + ';color:' + readable(pal.accent, pal) + '}' +
      '::-webkit-scrollbar-thumb{background:' + pal.border + '}';
  }

  function apply(doc, pal) {
    if (!doc || !doc.body) return false;
    restore(doc);

    var style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent = baseStyle(pal);
    (doc.head || doc.documentElement).appendChild(style);

    var nodes;
    try { nodes = doc.body.querySelectorAll('*'); } catch (e) { return false; }
    var limit = Math.min(nodes.length, MAX_NODES);
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
        remember(el);
        setProp(el, 'background-color', ownBg);
      }

      var image = String(cs.backgroundImage || '');
      if (image.indexOf('gradient') >= 0) {
        remember(el);
        setProp(el, 'background-image',
          'linear-gradient(135deg,' + pal.accent + ',' + pal.accent2 + ')');
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
        remember(el);
        setProp(el, 'color', tone);
      }

      var width = parseFloat(cs.borderTopWidth) || parseFloat(cs.borderBottomWidth) ||
        parseFloat(cs.borderLeftWidth) || parseFloat(cs.borderRightWidth) || 0;
      if (width > 0) {
        remember(el);
        setProp(el, 'border-color', pal.border);
      }
      if (String(cs.boxShadow || '').indexOf('rgb') >= 0 && cs.boxShadow !== 'none') {
        remember(el);
        setProp(el, 'box-shadow', '0 10px 30px rgba(0,0,0,.28)');
      }
    }
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
  function paint(force) {
    var doc = frameDoc();
    if (!doc || !doc.body) return;
    var pal = palById(chosen);
    if (!pal) return;
    if (!force && doc.getElementById(STYLE_ID)) return;
    apply(doc, pal);
  }
  function clear() {
    var doc = frameDoc();
    if (doc) restore(doc);
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
    head.textContent = 'Цветовая схема сайта';
    panel.appendChild(head);

    var note = document.createElement('div');
    css(note, 'color:#9aa4b2;font-size:12px;margin:0 0 12px');
    note.textContent = 'Применяется сразу к текущему сайту в предпросмотре.';
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
    reset.textContent = 'Без палитры';
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
    button.textContent = 'Палитра';
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
