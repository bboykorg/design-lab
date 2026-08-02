/* Design&Lab — движок дизайн-скиллов на стороне браузера.

   Зачем: часть моделей вызывается напрямую из index.html (со своим DL_AI_SYS),
   мимо backend/prompts.py. Чтобы скилл работал ДЛЯ ЛЮБОЙ модели, мы
   перехватываем fetch и дописываем бриф в system-сообщение перед отправкой.
   Логика и база те же, что у backend/design_skills.py (dl-design-kb.json). */
(function () {
  'use strict';
  if (window.DLSkills) return;

  var KB = null, LOADING = null;
  var SAFE = ['swiss', 'editorial', 'corporate-modern', 'minimalmono', 'tech', 'luxe'];
  var SERIF = ['Playfair Display', 'Cormorant Garamond', 'Bodoni Moda', 'Prata', 'Marcellus',
    'Gloock', 'Fraunces', 'Literata', 'Lora', 'Alegreya', 'Merriweather', 'Newsreader',
    'Libre Baskerville'];

  function load() {
    if (KB) return Promise.resolve(KB);
    if (LOADING) return LOADING;
    LOADING = fetch('dl-design-kb.json', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { KB = j || null; return KB; })
      .catch(function () { return null; });
    return LOADING;
  }

  /* Детерминированный хэш: один и тот же запрос → один скилл,
     другой variant → другой, но тоже сильный вариант. */
  function hash(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function pick(arr, n) { return arr && arr.length ? arr[n % arr.length] : null; }
  function byId(list, k) { var m = {}; list.forEach(function (x) { m[x[k || 'id']] = x; }); return m; }
  function norm(s) { return ' ' + String(s || '').toLowerCase().replace(/\u0451/g, '\u0435') + ' '; }

  function moodsOf(low) {
    var out = [], mw = KB.moodWords || {};
    Object.keys(mw).forEach(function (m) {
      if (mw[m].some(function (w) { return low.indexOf(w) >= 0; })) out.push(m);
    });
    return out;
  }

  function chooseDirection(text, n) {
    var low = norm(text), scores = {}, i;
    KB.directions.forEach(function (d) { scores[d.id] = 0; });

    Object.keys(KB.industries || {}).forEach(function (pattern) {
      var ids = KB.industries[pattern], hit = false;
      pattern.split('|').forEach(function (tok) {
        if (hit) return;
        tok = tok.trim().replace(/\u0451/g, '\u0435');
        if (tok && low.indexOf(tok) >= 0) {
          hit = true;
          ids.forEach(function (id, k) { if (id in scores) scores[id] += 6 - k * 0.8; });
        }
      });
    });

    var moods = moodsOf(low);
    KB.directions.forEach(function (d) {
      (d.keywords || []).forEach(function (kw) {
        if (low.indexOf(kw.replace(/\u0451/g, '\u0435')) >= 0) scores[d.id] += 2.2;
      });
      if (low.indexOf(d.name.toLowerCase()) >= 0) scores[d.id] += 3;
      var overlap = (d.paletteMood || []).filter(function (m) { return moods.indexOf(m) >= 0; }).length;
      scores[d.id] += overlap * 1.6;
    });

    var ranked = KB.directions.slice().sort(function (a, b) {
      return (scores[b.id] - scores[a.id]) || (a.id < b.id ? -1 : 1);
    });
    if (scores[ranked[0].id] <= 0) {
      var pool = KB.directions.filter(function (d) { return SAFE.indexOf(d.id) >= 0; });
      return pick(pool.length ? pool : KB.directions, n);
    }
    var best = scores[ranked[0].id];
    var top = ranked.filter(function (d) { return scores[d.id] >= best - 0.01; });
    return pick(top, n);
  }

  function choosePalette(dir, text, n) {
    var low = norm(text), preferDark = null;
    if (/\u0442\u0435\u043c\u043d|\u0442\u0451\u043c\u043d|dark|\u043d\u043e\u0447|\u0447\u0435\u0440\u043d\u044b\u0439 \u0444\u043e\u043d/.test(low)) preferDark = true;
    else if (/\u0441\u0432\u0435\u0442\u043b|light|\u0431\u0435\u043b\u044b\u0439 \u0444\u043e\u043d|\u0432\u043e\u0437\u0434\u0443\u0448\u043d/.test(low)) preferDark = false;

    var wants = {}, i;
    (dir.paletteMood || []).concat(moodsOf(low)).forEach(function (m) { wants[m] = 1; });

    var scored = KB.palettes.map(function (p) {
      var s = (p.mood || []).filter(function (m) { return wants[m]; }).length * 2;
      if (preferDark === true) s += p.dark ? 4 : -6;
      else if (preferDark === false) s += p.dark ? -6 : 4;
      return { s: s, p: p };
    });
    var best = Math.max.apply(null, scored.map(function (x) { return x.s; }));
    var pool = scored.filter(function (x) { return x.s >= best - 0.01; }).map(function (x) { return x.p; });
    return pick(pool, n);
  }

  function chooseFont(dir, text, n) {
    var fonts = byId(KB.fonts), pool = [];
    (dir.fonts || []).forEach(function (f) { if (fonts[f]) pool.push(fonts[f]); });
    if (!pool.length) pool = KB.fonts;
    if (/[\u0430-\u044f\u0451]/i.test(text || '')) {
      var cyr = pool.filter(function (f) { return f.cyrillic; });
      if (!cyr.length) cyr = KB.fonts.filter(function (f) { return f.cyrillic; });
      if (cyr.length) pool = cyr;
    }
    return pick(pool, n);
  }

  function scaleFor(dir, layoutId, n) {
    var s = byId(KB.scales);
    if (layoutId === 'poster' || layoutId === 'full-bleed' ||
        ['brutal', 'sport', 'nightclub'].indexOf(dir.id) >= 0) return s.poster;
    if (['tech', 'data', 'terminalcore', 'corporate-modern'].indexOf(dir.id) >= 0) return s.compact;
    if (['calmcare', 'luxe', 'organic', 'education'].indexOf(dir.id) >= 0) return s.calm;
    if (['editorial', 'craft', 'fashion', 'travel'].indexOf(dir.id) >= 0) return s.editorial;
    return pick(KB.scales, n);
  }

  function shapeFor(dir) {
    var s = byId(KB.shapes);
    if (['swiss', 'minimalmono', 'gallerywhite', 'fashion', 'editorial', 'terminalcore'].indexOf(dir.id) >= 0) return s.sharp;
    if (['brutal', 'sport', 'nightclub', 'cyber', 'retro'].indexOf(dir.id) >= 0) return s.slab;
    if (['playful', 'calmcare', 'organic', 'appetite'].indexOf(dir.id) >= 0) return s.round;
    return s.soft;
  }

  function build(message, mode, variant) {
    if (!KB || !KB.directions) return null;
    var text = String(message || '').trim();
    var n = hash(String(variant || 0) + '|' + text.toLowerCase());

    var dir = chooseDirection(text, n);
    var palette = choosePalette(dir, text, n >>> 3);
    var font = chooseFont(dir, text, n >>> 6);

    var layouts = byId(KB.layouts), lpool = [];
    (dir.layouts || []).forEach(function (l) { if (layouts[l]) lpool.push(layouts[l]); });
    if (!lpool.length) lpool = KB.layouts;
    var layout = pick(lpool, n >>> 9);

    var motion = byId(KB.motion)[dir.motion] || KB.motion[0];
    var texture = byId(KB.textures)[dir.texture] || KB.textures[0];
    var scale = scaleFor(dir, layout.id, n >>> 12);
    var shape = shapeFor(dir);

    var base = KB.details.filter(function (d) { return ['focus', 'icon-svg', 'hairline'].indexOf(d.id) >= 0; });
    var rest = KB.details.filter(function (d) { return base.indexOf(d) < 0; });
    var start = (n >>> 18) % rest.length, extra = [], i;
    for (i = 0; i < 4; i++) extra.push(rest[(start + i) % rest.length]);

    var sections = byId(KB.sections), plan = [];
    (dir.sections || []).forEach(function (s) { if (sections[s]) plan.push(sections[s]); });

    return {
      variant: variant || 0, mode: mode || 'scratch',
      direction: dir, palette: palette, font: font, layout: layout,
      motion: motion, texture: texture, scale: scale, shape: shape,
      details: base.concat(extra), plan: plan, checklist: KB.checklist || []
    };
  }

  function tokens(sk) {
    var p = sk.palette, f = sk.font, s = sk.scale, sh = sk.shape, m = sk.motion;
    var displayStack = SERIF.indexOf(f.display) >= 0 || /Serif/.test(f.display)
      ? "'" + f.display + "', Georgia, serif"
      : "'" + f.display + "', system-ui, sans-serif";
    return [
      ':root{',
      '  --bg: ' + p.bg + ';',
      '  --surface: ' + p.surface + ';',
      '  --raised: ' + p.raised + ';',
      '  --text: ' + p.text + ';',
      '  --muted: ' + p.muted + ';',
      '  --border: ' + p.border + ';',
      '  --accent: ' + p.accent + ';',
      '  --accent-soft: ' + p.accentSoft + ';',
      '  --accent-2: ' + p.accent2 + ';',
      '  --on-accent: ' + p.onAccent + ';',
      '  --font-display: ' + displayStack + ';',
      "  --font-body: '" + f.body + "', system-ui, -apple-system, sans-serif;",
      '  --fs-display: ' + s.display + ';',
      '  --fs-h2: ' + s.h2 + ';',
      '  --fs-h3: ' + s.h3 + ';',
      '  --fs-body: ' + s.body + ';',
      '  --fs-small: ' + s.small + ';',
      '  --lh: ' + s.lh + ';',
      '  --lh-tight: ' + s.lhTight + ';',
      '  --tracking-display: ' + s.tracking + ';',
      '  --measure: ' + s.measure + ';',
      '  --radius: ' + sh.radius + ';',
      '  --radius-lg: ' + sh.radiusLg + ';',
      '  --border-w: ' + sh.border + ';',
      '  --shadow: ' + sh.shadow + ';',
      '  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px;',
      '  --space-5: 24px; --space-6: 32px; --space-7: 48px; --space-8: 64px;',
      '  --space-9: 96px; --space-10: 140px;',
      '  --container: 1120px;',
      '  --ease: ' + m.easing + ';',
      '  --dur: ' + m.duration + ';',
      '}'
    ].join('\n');
  }

  var EDIT_NOTE = [
    '\u0412 \u0420\u0415\u0416\u0418\u041c\u0415 \u041f\u0420\u0410\u0412\u041a\u0418 \u0434\u0438\u0437\u0430\u0439\u043d-\u0441\u043a\u0438\u043b\u043b \u0440\u0430\u0431\u043e\u0442\u0430\u0435\u0442 \u0438\u043d\u0430\u0447\u0435:',
    '\u2022 \u0422\u043e\u0447\u0435\u0447\u043d\u0430\u044f \u043f\u0440\u0430\u0432\u043a\u0430 \u2014 \u041d\u0415 \u043f\u0435\u0440\u0435\u043a\u0440\u0430\u0448\u0438\u0432\u0430\u0439 \u0441\u0430\u0439\u0442. \u0421\u043a\u0438\u043b\u043b \u0437\u0434\u0435\u0441\u044c \u0442\u043e\u043b\u044c\u043a\u043e \u044d\u0442\u0430\u043b\u043e\u043d \u043a\u0430\u0447\u0435\u0441\u0442\u0432\u0430:',
    '  \u043f\u0440\u0430\u0432\u043a\u0430 \u043e\u0431\u044f\u0437\u0430\u043d\u0430 \u043f\u043e\u043f\u0430\u0441\u0442\u044c \u0432 \u0441\u0443\u0449\u0435\u0441\u0442\u0432\u0443\u044e\u0449\u0438\u0439 \u044f\u0437\u044b\u043a \u0448\u0430\u0431\u043b\u043e\u043d\u0430.',
    '\u2022 \u0415\u0441\u043b\u0438 \u043f\u0440\u043e\u0441\u044f\u0442 \u0440\u0435\u0434\u0438\u0437\u0430\u0439\u043d, \u00ab\u0441\u0434\u0435\u043b\u0430\u0439 \u043a\u0440\u0430\u0441\u0438\u0432\u043e\u00bb, \u00ab\u0434\u0440\u0443\u0433\u043e\u0439 \u0441\u0442\u0438\u043b\u044c\u00bb \u2014 \u043f\u0440\u0438\u043c\u0435\u043d\u044f\u0439 \u0441\u043a\u0438\u043b\u043b \u0446\u0435\u043b\u0438\u043a\u043e\u043c.',
    '\u2022 \u0416\u0438\u0432\u044b\u0435 \u0434\u0432\u0438\u0436\u043a\u0438, canvas \u0438 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0451\u043d\u043d\u044b\u0435 \u0441\u043a\u0440\u0438\u043f\u0442\u044b \u0448\u0430\u0431\u043b\u043e\u043d\u0430 \u043d\u0435 \u0442\u0440\u043e\u0433\u0430\u0435\u043c \u043d\u0438\u043a\u043e\u0433\u0434\u0430.'
  ].join('\n');

  var LINE = '\u2550'.repeat(75);

  function brief(sk) {
    if (!sk) return '';
    var d = sk.direction, p = sk.palette, f = sk.font, l = sk.layout;
    var m = sk.motion, t = sk.texture, sh = sk.shape;
    var plan = sk.plan.map(function (s, i) { return '   ' + (i + 1) + '. ' + s.name + ' \u2014 ' + s.recipe; }).join('\n');
    var det = sk.details.map(function (x) { return '   \u2022 ' + x.text; }).join('\n');
    var chk = sk.checklist.map(function (c) { return '   \u2610 ' + c; }).join('\n');

    var out = [
      '', LINE,
      'DESIGN&LAB \u00b7 \u0413\u041e\u0422\u041e\u0412\u042b\u0419 \u0414\u0418\u0417\u0410\u0419\u041d-\u0421\u041a\u0418\u041b\u041b \u0418\u0417 \u0411\u0410\u0417\u042b (\u0432\u044b\u0431\u0440\u0430\u043d \u0434\u0432\u0438\u0436\u043a\u043e\u043c \u043f\u043e\u0434 \u044d\u0442\u043e\u0442 \u0437\u0430\u043f\u0440\u043e\u0441)',
      LINE,
      '\u042d\u0442\u043e \u043d\u0435 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u0438, \u0430 \u0432\u044b\u0434\u0430\u043d\u043d\u0430\u044f \u0442\u0435\u0431\u0435 \u0434\u0438\u0437\u0430\u0439\u043d-\u0441\u0438\u0441\u0442\u0435\u043c\u0430. \u0422\u0432\u043e\u044f \u0440\u0430\u0431\u043e\u0442\u0430 \u2014 \u0431\u0435\u0437\u0443\u043f\u0440\u0435\u0447\u043d\u043e',
      '\u0440\u0435\u0430\u043b\u0438\u0437\u043e\u0432\u0430\u0442\u044c \u0435\u0451 \u0432 \u0432\u0451\u0440\u0441\u0442\u043a\u0435 \u0438 \u0432 \u0442\u0435\u043a\u0441\u0442\u0435. \u041d\u0435 \u043f\u0440\u0438\u0434\u0443\u043c\u044b\u0432\u0430\u0439 \u0441\u0432\u043e\u044e \u043f\u0430\u043b\u0438\u0442\u0440\u0443 \u0438 \u0441\u0432\u043e\u0438 \u0448\u0440\u0438\u0444\u0442\u044b.',
      '',
      '1) \u0410\u0420\u0422-\u0414\u0418\u0420\u0415\u041a\u0426\u0418\u042f: ' + d.name,
      '   ' + d.vibe,
      '   \u0424\u0438\u0440\u043c\u0435\u043d\u043d\u044b\u0439 \u043f\u0440\u0438\u0451\u043c (\u043e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u0435\u043d, \u0438\u043c\u0435\u043d\u043d\u043e \u043e\u043d \u0434\u0430\u0451\u0442 \u044d\u0444\u0444\u0435\u043a\u0442 \u00ab\u0432\u0430\u0443\u00bb):',
      '   \u2192 ' + d.signature,
      '   \u0417\u0430\u043f\u0440\u0435\u0442 \u044d\u0442\u043e\u0439 \u0434\u0438\u0440\u0435\u043a\u0446\u0438\u0438: ' + d.forbid,
      '',
      '2) \u0422\u041e\u041a\u0415\u041d\u042b \u0414\u0418\u0417\u0410\u0419\u041d-\u0421\u0418\u0421\u0422\u0415\u041c\u042b \u2014 \u0432\u0441\u0442\u0430\u0432\u044c \u042d\u0422\u041e\u0422 \u0431\u043b\u043e\u043a \u0432 <style> \u0421\u0418\u041c\u0412\u041e\u041b \u0412 \u0421\u0418\u041c\u0412\u041e\u041b',
      '   \u0438 \u0434\u0430\u043b\u044c\u0448\u0435 \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0439 \u0442\u043e\u043b\u044c\u043a\u043e \u044d\u0442\u0438 \u043f\u0435\u0440\u0435\u043c\u0435\u043d\u043d\u044b\u0435, \u043d\u0438 \u043e\u0434\u043d\u043e\u0433\u043e \u0446\u0432\u0435\u0442\u0430 \u043c\u0438\u043c\u043e \u043d\u0438\u0445:',
      '',
      tokens(sk),
      '',
      '   \u041f\u0430\u043b\u0438\u0442\u0440\u0430 \u00ab' + p.name + '\u00bb \u043f\u0440\u043e\u0432\u0435\u0440\u0435\u043d\u0430 \u043d\u0430 \u043a\u043e\u043d\u0442\u0440\u0430\u0441\u0442: \u0442\u0435\u043a\u0441\u0442 ' + p.contrast.text + ':1, ' +
        '\u0432\u0442\u043e\u0440\u0438\u0447\u043d\u044b\u0439 ' + p.contrast.muted + ':1, \u0430\u043a\u0446\u0435\u043d\u0442 ' + p.contrast.accent + ':1. \u041d\u0435 \u043f\u0440\u0430\u0432\u044c \u044d\u0442\u0438 hex.',
      '   \u0424\u043e\u043d \u2014 ' + (p.dark ? '\u0442\u0451\u043c\u043d\u044b\u0439' : '\u0441\u0432\u0435\u0442\u043b\u044b\u0439') +
        '. \u0410\u043a\u0446\u0435\u043d\u0442 \u0437\u0430\u043d\u0438\u043c\u0430\u0435\u0442 \u043d\u0435 \u0431\u043e\u043b\u0435\u0435 10% \u043f\u043b\u043e\u0449\u0430\u0434\u0438 \u044d\u043a\u0440\u0430\u043d\u0430.',
      '',
      '3) \u0428\u0420\u0418\u0424\u0422\u042b \u2014 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438 \u0440\u043e\u0432\u043d\u043e \u044d\u0442\u043e\u0442 <link> \u0432 <head>:',
      '   <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      '   <link rel="stylesheet" href="' + f.link + '">',
      '   \u0414\u0438\u0441\u043f\u043b\u0435\u0439\u043d\u044b\u0439: ' + f.display + ' \u2014 \u0442\u043e\u043b\u044c\u043a\u043e \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u0438 \u0438 \u043a\u0440\u0443\u043f\u043d\u044b\u0435 \u0447\u0438\u0441\u043b\u0430.',
      '   \u0422\u0435\u043a\u0441\u0442\u043e\u0432\u043e\u0439: ' + f.body + ' \u2014 \u0432\u0441\u0451 \u043e\u0441\u0442\u0430\u043b\u044c\u043d\u043e\u0435. \u0422\u0440\u0435\u0442\u044c\u0435\u0433\u043e \u0448\u0440\u0438\u0444\u0442\u0430 \u043d\u0435\u0442.',
      '',
      '4) \u041a\u041e\u041c\u041f\u041e\u0417\u0418\u0426\u0418\u042f: ' + l.name,
      '   \u041f\u0435\u0440\u0432\u044b\u0439 \u044d\u043a\u0440\u0430\u043d: ' + l.hero,
      '   \u0421\u0435\u0442\u043a\u0430 \u0434\u0430\u043b\u044c\u0448\u0435: ' + l.grid,
      '   \u0413\u0435\u043e\u043c\u0435\u0442\u0440\u0438\u044f: \u0440\u0430\u0434\u0438\u0443\u0441 ' + sh.radius + ' (\u043a\u0440\u0443\u043f\u043d\u044b\u0435 \u0431\u043b\u043e\u043a\u0438 ' + sh.radiusLg + '), \u0433\u0440\u0430\u043d\u0438\u0446\u0430 ' + sh.border + '.',
      '',
      '5) \u041f\u041b\u0410\u041d \u0421\u0415\u041a\u0426\u0418\u0419 (\u0441\u0432\u0435\u0440\u0445\u0443 \u0432\u043d\u0438\u0437, \u0441\u043e\u0441\u0435\u0434\u043d\u0438\u0435 \u0441\u0435\u043a\u0446\u0438\u0438 \u043d\u0435 \u043f\u043e\u0432\u0442\u043e\u0440\u044f\u044e\u0442 \u043a\u043e\u043c\u043f\u043e\u0437\u0438\u0446\u0438\u044e):',
      plan,
      '',
      '6) \u0424\u041e\u041d \u0418 \u0422\u0415\u041a\u0421\u0422\u0423\u0420\u0410: ' + t.name,
      '   ' + t.recipe,
      '',
      '7) \u0414\u0412\u0418\u0416\u0415\u041d\u0418\u0415: ' + m.name + ' \u00b7 transition: all var(--dur) var(--ease)',
      '   ' + m.recipe,
      '   \u041e\u0431\u044f\u0437\u0430\u0442\u0435\u043b\u044c\u043d\u043e: @media (prefers-reduced-motion: reduce) \u043e\u0442\u043a\u043b\u044e\u0447\u0430\u0435\u0442 \u0432\u0441\u0451 \u0434\u0432\u0438\u0436\u0435\u043d\u0438\u0435.',
      '',
      '8) \u041c\u0418\u041a\u0420\u041e\u0414\u0415\u0422\u0410\u041b\u0418 \u2014 \u0440\u0435\u0430\u043b\u0438\u0437\u0443\u0439 \u0432\u0441\u0435 \u0434\u043e \u0435\u0434\u0438\u043d\u043e\u0439:',
      det,
      '',
      '9) \u041f\u0420\u0418\u0401\u041c\u041a\u0410 \u2014 \u043c\u043e\u043b\u0447\u0430 \u043f\u0440\u043e\u0439\u0434\u0438\u0441\u044c \u043f\u043e \u0441\u043f\u0438\u0441\u043a\u0443 \u0438 \u0438\u0441\u043f\u0440\u0430\u0432\u044c \u043d\u0430\u0440\u0443\u0448\u0435\u043d\u0438\u044f:',
      chk,
      LINE
    ].join('\n');

    if (sk.mode !== 'scratch') out += '\n\n' + EDIT_NOTE;
    return out;
  }

  function briefFor(message, mode, variant) {
    var sk = build(message, mode, variant);
    return sk ? brief(sk) : '';
  }

  /* ---- \u0432\u0430\u0440\u0438\u0430\u043d\u0442: \u043a\u0430\u0436\u0434\u044b\u0439 \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u043f\u0440\u043e\u043c\u0442 \u043f\u043e \u0442\u043e\u0439 \u0436\u0435 \u0442\u0435\u043c\u0435 \u0434\u0430\u0451\u0442 \u0434\u0440\u0443\u0433\u0443\u044e \u0430\u0440\u0442-\u0434\u0438\u0440\u0435\u043a\u0446\u0438\u044e ---- */
  var seen = {};
  function variantFor(text) {
    var k = 'v' + hash(String(text || '').toLowerCase().slice(0, 200));
    var again = /\u0434\u0440\u0443\u0433|\u0435\u0449\u0435|\u0435\u0449\u0451|\u043f\u0435\u0440\u0435\u0434\u0435\u043b|\u0437\u0430\u043d\u043e\u0432\u043e|\u0432\u0430\u0440\u0438\u0430\u043d\u0442|\u043d\u0435 \u043d\u0440\u0430\u0432/i.test(String(text || ''));
    seen[k] = (seen[k] || 0) + (again ? 1 : 0);
    return seen[k];
  }

  /* ---- \u043f\u0435\u0440\u0435\u0445\u0432\u0430\u0442 fetch: \u0434\u043e\u043f\u0438\u0441\u044b\u0432\u0430\u0435\u043c \u0431\u0440\u0438\u0444 \u0432 system \u043b\u044e\u0431\u043e\u0439 \u043c\u043e\u0434\u0435\u043b\u0438 ---- */
  var MARK = 'DESIGN&LAB \u00b7 \u0413\u041e\u0422\u041e\u0412\u042b\u0419 \u0414\u0418\u0417\u0410\u0419\u041d-\u0421\u041a\u0418\u041b\u041b';

  function injectBody(body) {
    if (!body || typeof body !== 'object' || !KB) return body;
    var sysIdx = -1, userText = '', i, msg;

    if (Array.isArray(body.messages)) {
      for (i = 0; i < body.messages.length; i++) {
        msg = body.messages[i];
        if (!msg || !msg.role) continue;
        if (msg.role === 'system' && sysIdx < 0) sysIdx = i;
        if (msg.role === 'user' && typeof msg.content === 'string') userText = msg.content;
      }
      if (sysIdx < 0 || typeof body.messages[sysIdx].content !== 'string') return body;
      if (body.messages[sysIdx].content.indexOf(MARK) >= 0) return body;
    } else if (body.systemInstruction && body.contents) {
      var parts = body.systemInstruction.parts || [];
      if (!parts.length || typeof parts[0].text !== 'string') return body;
      if (parts[0].text.indexOf(MARK) >= 0) return body;
      (body.contents || []).forEach(function (c) {
        (c.parts || []).forEach(function (p) { if (p && typeof p.text === 'string') userText = p.text; });
      });
    } else if (typeof body.message === 'string') {
      return body; /* \u044d\u0442\u043e /api/ai \u2014 \u0441\u043a\u0438\u043b\u043b \u0434\u043e\u0431\u0430\u0432\u0438\u0442 \u0431\u044d\u043a\u0435\u043d\u0434 */
    } else {
      return body;
    }

    if (!userText) return body;
    var mode = /HTML \u0448\u0430\u0431\u043b\u043e\u043d\u0430:|\u0417\u0430\u043f\u0440\u043e\u0441: /.test(userText) ? 'edit' : 'scratch';
    var clean = userText.split(/HTML \u0448\u0430\u0431\u043b\u043e\u043d\u0430:/)[0].slice(0, 4000);
    var text = briefFor(clean, mode, variantFor(clean));
    if (!text) return body;

    if (sysIdx >= 0) body.messages[sysIdx].content += '\n\n' + text;
    else body.systemInstruction.parts[0].text += '\n\n' + text;
    try { window.__dlLastSkill = build(clean, mode, variantFor(clean)); } catch (e) {}
    return body;
  }

  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      if (KB && init && typeof init.body === 'string' && init.body.charAt(0) === '{') {
        var parsed = JSON.parse(init.body);
        if (parsed && (parsed.messages || parsed.systemInstruction)) {
          init = Object.assign({}, init, { body: JSON.stringify(injectBody(parsed)) });
        }
      }
    } catch (e) { /* \u043b\u044e\u0431\u0430\u044f \u043e\u0448\u0438\u0431\u043a\u0430 \u2014 \u043e\u0442\u043f\u0440\u0430\u0432\u043b\u044f\u0435\u043c \u0438\u0441\u0445\u043e\u0434\u043d\u044b\u0439 \u0437\u0430\u043f\u0440\u043e\u0441 */ }
    return nativeFetch(input, init);
  };

  window.DLSkills = {
    load: load,
    ready: function () { return !!KB; },
    build: build,
    brief: brief,
    briefFor: briefFor,
    tokens: tokens,
    stats: function () {
      if (!KB) return null;
      return {
        palettes: KB.palettes.length, fonts: KB.fonts.length, layouts: KB.layouts.length,
        directions: KB.directions.length, details: KB.details.length, sections: KB.sections.length,
        combinations: KB.palettes.length * KB.fonts.length * KB.layouts.length *
          KB.scales.length * KB.shapes.length
      };
    },
    last: function () { return window.__dlLastSkill || null; }
  };

  load();
})();
