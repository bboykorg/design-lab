/* ============================================================================
   Design Lab — мобильный редактор в формате мессенджера (поведение).

   Отвечает за то, чего не сделать одним CSS:
     1) пересборка DOM под телефон и полный возврат на десктопе;
     2) жест перетаскивания с инерцией и прилипанием к трём состояниям;
     3) честная геометрия при открытой клавиатуре (visualViewport).

   Ключевое решение: строка ввода выносится ИЗ листа чата в корень редактора
   и закрепляется внизу навсегда, а ездит только лента переписки. Иначе при
   сворачивании поле ввода уезжало бы за край экрана вместе с листом.
   Переносятся живые узлы, а не клоны: все обработчики (sendMessage, pickFiles,
   toggleVoice, toggleModelMenu) продолжают работать без единой правки в index.html.

   Вся анимация — один transform. Ни одного чтения геометрии в pointermove.
   ========================================================================= */
(function () {
  'use strict';
  if (window.__dlMobileChat) return;
  window.__dlMobileChat = true;

  var root = document.documentElement;
  var mq = window.matchMedia('(max-width:860px)');

  var editor, chat, head, composer, msgs;
  var grab, badge, scrim;
  var mounted = false;
  var state = 'peek';   // peek | half | full
  var compH = 92;       // высота закреплённой строки ввода
  var sheetH = 0;       // высота ленты переписки

  function q(id) { return document.getElementById(id); }
  function isMobile() { return mq.matches; }
  function editorOpen() { return !!(editor && editor.classList.contains('on')); }
  function vh() {
    var vv = window.visualViewport;
    return vv ? vv.height : window.innerHeight;
  }

  /* ─── геометрия ───────────────────────────────────────────── */

  /* Сколько пикселей ленты видно в данном состоянии. */
  function shownFor(s) {
    if (s === 'full') return sheetH;
    if (s === 'half') return Math.min(sheetH, Math.round(vh() * 0.42));
    return 0;
  }

  function applyY(shown, animate) {
    if (!chat) return;
    var y = Math.max(0, sheetH - shown);
    if (!animate) chat.classList.add('dlm-drag');
    chat.style.setProperty('--dlm-y', y.toFixed(1) + 'px');
  }

  function measure() {
    if (!mounted || !chat) return;
    compH = composer ? composer.offsetHeight : 92;
    root.style.setProperty('--dlm-comp', compH + 'px');
    if (head) root.style.setProperty('--dlm-top', head.offsetHeight + 'px');
    sheetH = chat.offsetHeight;
    applyY(shownFor(state), false);
    /* Снимаем запрет анимации только после применения нового transform,
       иначе лента дёргается при ресайзе и повороте экрана. */
    requestAnimationFrame(function () {
      if (!drag) chat.classList.remove('dlm-drag');
    });
  }

  function setState(s, opts) {
    opts = opts || {};
    state = s;
    if (editor) editor.dataset.dlm = s;
    applyY(shownFor(s), true);
    if (badge) badge.textContent = s === 'peek' ? 'Показать переписку' : 'Свернуть чат';
    if (s !== 'peek' && !opts.noScroll) scrollMsgsToEnd();
    try { sessionStorage.setItem('dl_mchat_state', s); } catch (e) {}
  }

  function scrollMsgsToEnd() {
    if (!msgs) return;
    requestAnimationFrame(function () { msgs.scrollTop = msgs.scrollHeight; });
  }

  /* ─── сборка / разборка мобильной схемы ───────────────────────── */

  function mount() {
    if (mounted || !editor || !chat || !composer) return;

    /* Шапка чата — единственное место с кнопкой «Назад» и названием проекта:
       выносим её в верхнюю панель экрана. */
    if (head && head.parentNode === chat) {
      head.classList.add('dlm-top');
      editor.insertBefore(head, editor.firstChild);
    }

    /* Строка ввода уходит из листа в корень редактора: у листа есть transform,
       а он ломает position:fixed у потомков — внутри листа её не закрепить. */
    if (composer.parentNode === chat) editor.appendChild(composer);

    if (!grab) {
      grab = document.createElement('div');
      grab.className = 'dlm-grab';
      grab.setAttribute('role', 'button');
      grab.setAttribute('tabindex', '0');
      grab.setAttribute('aria-label', 'Потяните, чтобы развернуть переписку');
      grab.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); }
      });
    }
    composer.insertBefore(grab, composer.firstChild);

    if (!badge) {
      badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'dlm-badge';
      badge.addEventListener('click', function () {
        setState(state === 'peek' ? 'half' : 'peek');
      });
    }
    composer.appendChild(badge);

    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'dlm-scrim';
      scrim.addEventListener('click', function () { setState('half'); });
    }
    editor.insertBefore(scrim, chat);

    bindDrag();
    mounted = true;

    var saved = 'peek';
    try { saved = sessionStorage.getItem('dl_mchat_state') || 'peek'; } catch (e) {}
    measure();
    /* После перезагрузки не раскрываем чат на весь экран — сначала сайт. */
    setState(saved === 'full' ? 'half' : saved, { noScroll: true });
  }

  function unmount() {
    if (!mounted) return;
    /* Возвращаем исходный порядок: шапка, лента, подсказки, строка ввода. */
    if (grab && grab.parentNode) grab.parentNode.removeChild(grab);
    if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    if (scrim && scrim.parentNode) scrim.parentNode.removeChild(scrim);
    if (head && head.classList.contains('dlm-top')) {
      head.classList.remove('dlm-top');
      chat.insertBefore(head, chat.firstChild);
    }
    if (composer && composer.parentNode !== chat) chat.appendChild(composer);
    if (chat) {
      chat.style.removeProperty('--dlm-y');
      chat.classList.remove('dlm-drag');
    }
    if (composer) composer.style.removeProperty('bottom');
    if (editor) delete editor.dataset.dlm;
    root.style.removeProperty('--dlm-comp');
    root.style.removeProperty('--dlm-top');
    root.style.removeProperty('--dlm-kb');
    mounted = false;
  }

  function cycle() {
    setState(state === 'peek' ? 'half' : state === 'half' ? 'full' : 'peek');
  }

  /* ─── жест ────────────────────────────────────────────────── */

  var drag = null;

  function start(e, fromGrab) {
    if (!isMobile() || !mounted) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    /* Замеры только здесь: высота меняется, когда растёт поле ввода. */
    sheetH = chat.offsetHeight;
    compH = composer.offsetHeight;
    root.style.setProperty('--dlm-comp', compH + 'px');
    drag = {
      id: e.pointerId,
      y0: e.clientY,
      shown0: shownFor(state),
      shown: shownFor(state),
      t0: performance.now(),
      moved: false,
      fromGrab: fromGrab
    };
    chat.classList.add('dlm-drag');
    if (fromGrab) composer.classList.add('dlm-drag');
  }

  function move(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var dy = drag.y0 - e.clientY;              // вверх = положительно
    if (!drag.moved && Math.abs(dy) < 4) return;
    drag.moved = true;
    var shown = drag.shown0 + dy;
    /* За пределами диапазона лента идёт втрое медленнее пальца:
       резиновый ограничитель вместо жёсткого упора. */
    if (shown > sheetH) shown = sheetH + (shown - sheetH) / 3;
    else if (shown < 0) shown = shown / 3;
    drag.shown = shown;
    applyY(shown, false);
  }

  function end(e) {
    if (!drag || (e && e.pointerId != null && e.pointerId !== drag.id)) return;
    var d = drag;
    drag = null;
    chat.classList.remove('dlm-drag');
    composer.classList.remove('dlm-drag');
    if (!d.moved) {
      if (d.fromGrab) cycle();
      else applyY(shownFor(state), true);
      return;
    }
    var dt = Math.max(1, performance.now() - d.t0);
    var v = (d.shown - d.shown0) / dt;   // px/мс, вверх = +
    var target = d.shown + v * 130;      // учитываем бросок пальца
    var half = shownFor('half');
    var s;
    if (target < half / 2) s = 'peek';
    else if (target < (half + sheetH) / 2) s = 'half';
    else s = 'full';
    setState(s);
  }

  function bindDrag() {
    grab.addEventListener('pointerdown', function (e) { start(e, true); }, { passive: true });
    /* Свайп вниз по ленте работает только с самого верха переписки,
       иначе обычная прокрутка истории случайно схлопывала бы чат. */
    if (msgs) {
      msgs.addEventListener('pointerdown', function (e) {
        if (msgs.scrollTop <= 0) start(e, false);
      }, { passive: true });
    }
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerup', end, { passive: true });
    window.addEventListener('pointercancel', end, { passive: true });
  }

  /* ─── клавиатура ────────────────────────────────────────── */

  function syncKeyboard() {
    var vv = window.visualViewport;
    if (!vv || !isMobile() || !mounted) return;
    /* Разница между окном и видимой областью и есть клавиатура.
       Меньше 60px — это схлопывание адресной строки, а не клавиатура. */
    var kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    root.style.setProperty('--dlm-kb', (kb > 60 ? kb : 0) + 'px');
  }

  /* ─── связи с логикой приложения ────────────────────────────── */

  function wire() {
    var input = q('chatInput');
    if (input) {
      /* Фокус в поле = намерение переписываться: показываем историю. */
      input.addEventListener('focus', function () {
        if (isMobile() && mounted && state === 'peek') setState('half');
      });
      /* Рост textarea меняет высоту строки ввода — пересчитываем. */
      input.addEventListener('input', function () {
        if (isMobile() && mounted) measure();
      });
    }

    /* Новое сообщение: ответ ИИ не должен остаться за краем экрана. */
    if (msgs && window.MutationObserver) {
      new MutationObserver(function () {
        if (!isMobile() || !mounted) return;
        if (state === 'peek') setState('half');
        else scrollMsgsToEnd();
      }).observe(msgs, { childList: true });
    }

    /* Работа с тулбаром — это работа с сайтом: убираем чат с дороги. */
    var pv = document.querySelector('.editor .pv-head');
    if (pv) {
      pv.addEventListener('click', function () {
        if (isMobile() && mounted && state !== 'peek') setState('peek');
      }, true);
    }

    /* Escape сначала сворачивает чат и только потом закрывает редактор. */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (isMobile() && mounted && state !== 'peek') { e.stopPropagation(); setState('peek'); }
    }, true);
  }

  /* ─── жизненный цикл ────────────────────────────────────── */

  function sync() {
    if (!editor) return;
    if (isMobile()) { if (editorOpen()) { mount(); measure(); } }
    else unmount();
  }

  function init() {
    editor = q('editor');
    if (!editor) return;
    chat = editor.querySelector('.chat');
    head = editor.querySelector('.chat-head');
    composer = editor.querySelector('.composer');
    msgs = q('msgs');
    if (!chat || !composer) return;

    wire();
    sync();

    /* Редактор открывается классом .on — следим за ним, а не за кнопками: так схема
       одинаково работает и для шаблонов, и для работы с нуля, и при восстановлении сессии. */
    if (window.MutationObserver) {
      new MutationObserver(sync).observe(editor, { attributes: true, attributeFilter: ['class'] });
    }

    var t;
    window.addEventListener('resize', function () {
      clearTimeout(t);
      t = setTimeout(function () { sync(); syncKeyboard(); }, 80);
    }, { passive: true });
    window.addEventListener('orientationchange', function () { setTimeout(sync, 220); }, { passive: true });

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', syncKeyboard);
      window.visualViewport.addEventListener('scroll', syncKeyboard);
    }
    if (mq.addEventListener) mq.addEventListener('change', sync);
    else if (mq.addListener) mq.addListener(sync);

    window.dlMobileChat = {
      set: setState,
      state: function () { return state; },
      remeasure: measure
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
