/* Design Lab — мобильный рунтайм.
   1) Ранняя метка html.dl-phone — до первого кадра, чтобы фоновые анимации не успели стартовать.
   2) Глушим JS-анимации фона (звёзды, кометы, токовая сетка, курсорные эффекты).
   3) Выдвижное меню вместо скрытого .nav-links.
   4) Честная высота экрана (--dvh) для iOS Safari. */
(function () {
  'use strict';
  if (window.__dlMobile) return;
  window.__dlMobile = true;

  var root = document.documentElement;
  var PHONE = 760;
  /* Ширина, до которой шапка остаётся без пунктов .nav-links и нужен гамбургер.
     Держим её синхронной с медиазапросами скрытия .nav-links (max-width:900px). */
  var NAV_MAX = 900;

  function isPhone() {
    return window.matchMedia('(max-width:' + PHONE + 'px)').matches ||
      (window.matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) <= 500);
  }

  function syncFlags() {
    var phone = isPhone();
    root.classList.toggle('dl-phone', phone);
    root.classList.toggle('dl-touch', window.matchMedia('(pointer:coarse)').matches);
    return phone;
  }

  var phone = syncFlags();

  /* --- Честный vh: 100vh в iOS Safari врёт на высоту адресной строки. --- */
  function setVh() {
    root.style.setProperty('--dvh', (window.innerHeight * 0.01).toFixed(3) + 'px');
  }
  setVh();
  window.addEventListener('resize', setVh, { passive: true });
  window.addEventListener('orientationchange', function () { setTimeout(setVh, 120); }, { passive: true });

  /* --- Глушим фоновые анимации, которые рисуются из JS. --- */
  function killMotion() {
    if (!root.classList.contains('dl-phone')) return;

    // Отключаем requestAnimationFrame-циклы только для декоративных слоёв:
    // удаляем сами узлы, тогда их таймеры не имеют цели для отрисовки.
    ['.bg-fx .stars', '.bg-fx .comets', '.bg-fx .current-grid', '.bg-fx .scanline',
      '.bg-fx .noise', '#cursorGlow', '#cursorDot', '#cursorRing'].forEach(function (sel) {
        document.querySelectorAll(sel).forEach(function (el) { el.remove(); });
      });

    document.querySelectorAll('.cursor-trail,.click-ripple').forEach(function (el) { el.remove(); });

    // Статичные слои остаются, но без движения и без дорогого blur.
    document.querySelectorAll('.bg-fx *').forEach(function (el) {
      el.style.animation = 'none';
    });
  }

  /* --- Мобильное меню из существующих пунктов навигации. --- */
  function buildNav() {
    if (document.getElementById('dlNavToggle')) return;
    var nav = document.querySelector('.nav');
    var links = document.querySelector('.nav-links');
    var cta = document.querySelector('.nav-cta');
    if (!nav || !links || !cta) return;

    var style = document.createElement('style');
    style.id = 'dlNavStyle';
    style.textContent = [
      /* flex-direction:column обязателен: без него три полоски выстраиваются в РЯД
         и сливаются в одну черту вместо иконки гамбургера. */
      '#dlNavToggle{display:none;flex-direction:column;align-items:center;justify-content:center;width:44px;height:44px;',
      'border:1px solid var(--border);border-radius:9px;background:var(--surface-2);color:var(--text);',
      'cursor:pointer;flex:none;transition:border-color .16s var(--ease),background .16s var(--ease)}',
      '#dlNavToggle:active{background:var(--surface-3)}',
      '#dlNavToggle span{display:block;width:17px;height:1.5px;background:currentColor;border-radius:2px;',
      'transition:transform .26s cubic-bezier(.16,1,.3,1),opacity .16s linear}',
      '#dlNavToggle span+span{margin-top:4.5px}',
      '#dlNavToggle[aria-expanded="true"] span:nth-child(1){transform:translateY(6px) rotate(45deg)}',
      '#dlNavToggle[aria-expanded="true"] span:nth-child(2){opacity:0}',
      '#dlNavToggle[aria-expanded="true"] span:nth-child(3){transform:translateY(-6px) rotate(-45deg)}',
      '#dlNavSheet{position:fixed;left:0;right:0;top:0;z-index:78;display:none;flex-direction:column;',
      'gap:2px;padding:70px 14px 18px;background:#000;border-bottom:1px solid var(--border-2);',
      'transform:translateY(-102%);transition:transform .3s cubic-bezier(.16,1,.3,1);',
      'padding-top:calc(62px + env(safe-area-inset-top))}',
      '#dlNavSheet.on{transform:translateY(0)}',
      '#dlNavSheet button{width:100%;text-align:left;padding:14px 14px;min-height:48px;font-size:16px;',
      'font-weight:600;color:var(--text);background:none;border:0;border-radius:10px;cursor:pointer;',
      'transition:background .14s var(--ease)}',
      '#dlNavSheet button:active{background:var(--surface-2)}',
      '#dlNavScrim{position:fixed;inset:0;z-index:77;display:none;background:rgba(0,0,0,.6);opacity:0;',
      'transition:opacity .24s var(--ease)}',
      '#dlNavScrim.on{opacity:1}',
      /* Порог показа гамбургера — 900px, а не 760.
         В index.html (строка 247) и dl-design-system.css (строка 250) пункты
         .nav-links скрываются уже с max-width:900px, а гамбургер раньше появлялся
         только с 760px. В диапазоне 761-900px (это ровно iPad в портрете, 768px)
         навигации по разделам не было вообще: ни пунктов, ни кнопки меню. */
      '@media(max-width:' + NAV_MAX + 'px){#dlNavToggle{display:flex;flex-direction:column}#dlNavSheet{display:flex}#dlNavScrim{display:block}}',
      // display:flex/block выше перебивает user-agent-правило [hidden]{display:none},
      // из-за чего закрытый скрим накрывал весь экран и съедал все нажатия.
      '#dlNavSheet[hidden],#dlNavScrim[hidden],#dlNavToggle[hidden]{display:none!important}',
      // Пока меню закрыто, слои не должны ловить указатель ни при каких условиях.
      '#dlNavScrim{pointer-events:none}#dlNavScrim.on{pointer-events:auto}',
      '#dlNavSheet{pointer-events:none}#dlNavSheet.on{pointer-events:auto}',
      '@media(prefers-reduced-motion:reduce){#dlNavSheet,#dlNavToggle span,#dlNavScrim{transition:none}}'
    ].join('');
    document.head.appendChild(style);

    var scrim = document.createElement('div');
    scrim.id = 'dlNavScrim';
    scrim.hidden = true;

    var sheet = document.createElement('nav');
    sheet.id = 'dlNavSheet';
    sheet.setAttribute('aria-label', 'Мобильная навигация');
    sheet.hidden = true;

    /* Пункты меню.

       Раньше это был «прокси»: close() и через 60 мс src.click() по скрытой
       кнопке шапки, которая звала scrollIntoView({behavior:'smooth'}).
       На телефоне это НЕ работало — ни один пункт никуда не переносил.
       Причина (замер в браузере на 390x844): скролл-контейнер здесь <body>,
       а close() ставил body.style.overflow='hidden'/''. Снятие overflow со
       скролл-контейнера заставляет браузер асинхронно восстанавливать его
       scrollTop, и это восстановление приходит ПОСЛЕ старта плавной прокрутки,
       возвращая страницу на 0.

       Теперь: цель извлекаем один раз при сборке меню, прокрутку ведёт
       dl-scroll.js по явному контейнеру, и стартуем её ТОЛЬКО после того,
       как лист закрылся и блокировка снята. */
    links.querySelectorAll('button,a').forEach(function (src) {
      var item = document.createElement('button');
      item.type = 'button';
      item.textContent = (src.textContent || '').trim();
      if (!item.textContent) return;

      // scrollTo2('gallery') -> 'gallery'; href="#pricing" -> 'pricing'.
      var target = '';
      var m = /scrollTo2\(\s*['"]([^'"]+)['"]\s*\)/.exec(src.getAttribute('onclick') || '');
      if (m) target = m[1];
      if (!target) {
        var href = src.getAttribute('href') || '';
        if (href.charAt(0) === '#' && href.length > 1) target = href.slice(1);
      }
      if (target) item.setAttribute('data-target', target);

      item.addEventListener('click', function () {
        closeThen(function () {
          if (target && typeof window.dlScrollToId === 'function') {
            window.dlScrollToId(target);
          } else {
            src.click();
          }
        });
      });
      sheet.appendChild(item);
    });
    if (!sheet.children.length) { style.remove(); return; }

    var toggle = document.createElement('button');
    toggle.id = 'dlNavToggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Меню');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'dlNavSheet');
    toggle.innerHTML = '<span></span><span></span><span></span>';

    cta.appendChild(toggle);
    document.body.appendChild(scrim);
    document.body.appendChild(sheet);

    // Длительность закрытия должна совпадать с transition листа (.3s), иначе
     // прокрутка стартует поверх ещё едущей панели и выглядит как рывок.
    var CLOSE_MS = 300;
    var locked = false;

    function open() {
      scrim.hidden = false; sheet.hidden = false;
      requestAnimationFrame(function () { scrim.classList.add('on'); sheet.classList.add('on'); });
      toggle.setAttribute('aria-expanded', 'true');
      /* НЕ трогаем overflow скролл-контейнера: на этом сайте это <body>,
         и в iOS Safari overflow:hidden на нём сбрасывает позицию прокрутки.
         dlLockScroll гасит жест через touch-action, сохраняя scrollTop. */
      if (typeof window.dlLockScroll === 'function' && !locked) {
        window.dlLockScroll();
        locked = true;
      }
    }

    function unlock() {
      if (locked && typeof window.dlUnlockScroll === 'function') {
        window.dlUnlockScroll();
      }
      locked = false;
    }

    function close() { closeThen(null); }

    function closeThen(after) {
      var wasOpen = toggle.getAttribute('aria-expanded') === 'true';
      scrim.classList.remove('on'); sheet.classList.remove('on');
      toggle.setAttribute('aria-expanded', 'false');
      unlock();
      setTimeout(function () {
        if (!sheet.classList.contains('on')) { scrim.hidden = true; sheet.hidden = true; }
        if (after) after();
      }, wasOpen ? CLOSE_MS : 0);
    }
    toggle.addEventListener('click', function () {
      if (toggle.getAttribute('aria-expanded') === 'true') close(); else open();
    });
    scrim.addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') close();
    });
    window.addEventListener('resize', function () {
      // Закрываем по ресайзу только когда вернулись к полноценной шапке с .nav-links,
      // иначе на планшете меню схлопывалось бы сразу после открытия.
      if (window.innerWidth > NAV_MAX && toggle.getAttribute('aria-expanded') === 'true') close();
    }, { passive: true });
  }

  /* --- Меню моделей на телефоне не должно уезжать за край экрана. --- */
  function guardMenus() {
    document.querySelectorAll('.model-menu').forEach(function (menu) {
      menu.addEventListener('touchmove', function (e) { e.stopPropagation(); }, { passive: true });
    });
  }

  function init() {
    syncFlags();
    killMotion();
    buildNav();
    guardMenus();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Фоновые слои часть скриптов создаёт после load — чистим повторно.
  window.addEventListener('load', function () { setTimeout(killMotion, 0); setTimeout(killMotion, 700); });

  var mq = window.matchMedia('(max-width:' + PHONE + 'px)');
  var onChange = function () { if (syncFlags()) killMotion(); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);

  window.dlIsPhone = isPhone;
})();
