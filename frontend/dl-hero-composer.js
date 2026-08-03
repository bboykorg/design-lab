/* ============================================================================
   Design Lab — герой-композер на главном экране: поведение.
   Подключается ПОСЛЕ dl-chat-mobile.js и dl-desktop-chat.js.

   Отвечает за три вещи, которые CSS сделать не может:

   1. Гарантирует структуру на ЛЮБОЙ ширине:
        .prompt-row
          └ .dl-cmp-bar    → .dl-cmp-tools [ + ] [ модель ]      … [ отправка ]
          └ .prompt-actions.dl-cmp-alt → подсказка + «Выбрать шаблон»
      Раньше перестановка жила в мобильном патче, а стили к ней — только
      в @media(max-width:900px). На десктопе это давало сломанную вёрстку.

   2. Держит кнопку отправки ВСЕГДА видимой и всегда справа.
      Базовый heroSync() прятал её (display:none), пока поле пустое, и строка
      меняла состав прямо под рукой. В мессенджерах так не делают:
      кнопка стоит на месте, просто неактивна.

   3. Поле ввода растёт под текст и на десктопе тоже (раньше авторост
      был только на телефоне).
   ========================================================================= */
(function () {
  'use strict';
  if (window.__dlHeroComposer) return;
  window.__dlHeroComposer = true;

  var HINT_ID = 'dlHeroHint';

  function $(id) { return document.getElementById(id); }

  function isPhone() {
    return window.matchMedia('(max-width:900px)').matches;
  }

  /* ---------- 1. Структура ---------- */
  function build() {
    var box = document.querySelector('.prompt-box');
    if (!box) return false;

    var row = box.querySelector('.prompt-row');
    var send = $('heroSendBtn');
    if (!row || !send) return false;

    var actions = box.querySelector('.prompt-actions');
    var attach = $('heroAttachBtn');
    var pill = $('heroModelPill');

    var bar = box.querySelector('.dl-cmp-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'dl-cmp-bar';
      bar.appendChild(Object.assign(document.createElement('div'), { className: 'dl-cmp-tools' }));
      row.insertBefore(bar, row.firstChild);
    }
    if (bar.parentElement !== row || row.firstElementChild !== bar) row.insertBefore(bar, row.firstChild);

    var tools = bar.querySelector('.dl-cmp-tools');
    if (!tools) {
      tools = document.createElement('div');
      tools.className = 'dl-cmp-tools';
      bar.insertBefore(tools, bar.firstChild);
    }

    /* Инструменты слева — в том же порядке, что в композере редактора. */
    if (attach && attach.parentElement !== tools) tools.appendChild(attach);
    if (pill && pill.parentElement !== tools) tools.appendChild(pill);

    /* Отправка — всегда последний ребёнок ряда, то есть крайняя справа. */
    if (send.parentElement !== bar || bar.lastElementChild !== send) bar.appendChild(send);
    send.classList.add('hero-send');

    /* Альтернативный сценарий — свой ряд под hairline. */
    if (actions) {
      actions.classList.add('dl-cmp-alt');
      if (actions.parentElement === row && row.lastElementChild !== actions) row.appendChild(actions);

      var hint = $(HINT_ID);
      if (!hint) {
        hint = document.createElement('span');
        hint.id = HINT_ID;
        hint.className = 'dl-cmp-hint';
        hint.textContent = 'Enter — отправить, Shift+Enter — новая строка';
      }
      if (hint.parentElement !== actions || actions.firstElementChild !== hint) actions.insertBefore(hint, actions.firstChild);
    }

    box.classList.add('dl-cmp');
    return true;
  }

  /* ---------- 2. Состояние кнопки отправки ---------- */
  function hasPayload() {
    var ta = $('heroPrompt');
    var txt = ta ? (ta.value || '').trim() : '';
    var files = (window.heroAtts || []).some(function (a) { return a.kind === 'html'; });
    return !!(txt || files);
  }

  function syncSend() {
    var send = $('heroSendBtn');
    if (!send) return;
    var ready = hasPayload();
    /* .on остаётся всегда: старые стили без него прячут кнопку целиком. */
    send.classList.add('on', 'is-ready');
    send.classList.toggle('is-ready', ready);
    send.disabled = !ready;
    send.setAttribute('aria-disabled', ready ? 'false' : 'true');

    /* «Выбрать шаблон» прячется, когда прикреплён свой HTML — тогда шаблон уже есть. */
    var box = document.querySelector('.prompt-box');
    var tpl = box ? box.querySelector('.prompt-actions .btn-grad:not(.hero-send)') : null;
    var ownHtml = (window.heroAtts || []).some(function (a) { return a.kind === 'html'; });
    if (tpl) tpl.style.display = ownHtml ? 'none' : '';
  }

  /* Базовый heroSync из index.html прячет кнопку — переопределяем его целиком. */
  function overrideHeroSync() {
    if (window.__dlHeroSyncPatched) return;
    window.__dlHeroSyncPatched = true;
    var prevRender = window.renderHeroStrip;
    window.heroSync = syncSend;
    if (typeof prevRender === 'function') {
      window.renderHeroStrip = function () {
        var r = prevRender.apply(this, arguments);
        syncSend();
        return r;
      };
    }
  }

  /* ---------- 3. Авторост поля ---------- */
  function autoGrow(ta) {
    if (!ta) return;
    var min = isPhone() ? 56 : 52;
    var max = isPhone()
      ? Math.max(120, Math.round(window.innerHeight * 0.4))
      : 220;
    ta.style.height = 'auto';
    ta.style.height = Math.max(min, Math.min(max, ta.scrollHeight)) + 'px';
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  }

  function wire() {
    var ta = $('heroPrompt');
    if (!ta || ta.dataset.dlHeroWired) return;
    ta.dataset.dlHeroWired = '1';

    function sync() { autoGrow(ta); syncSend(); }

    ta.addEventListener('input', sync);
    window.addEventListener('resize', sync, { passive: true });

    /* Enter отправляет только на физической клавиатуре. На телефоне Enter —
       перенос строки, иначе невозможно набрать многострочное описание. */
    ta.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (window.matchMedia('(pointer:coarse)').matches) return;
      var send = $('heroSendBtn');
      if (send && !send.disabled) { e.preventDefault(); send.click(); }
    }, true);

    sync();
  }

  function label() {
    var map = [
      ['heroSendBtn', 'Отправить описание'],
      ['heroAttachBtn', 'Прикрепить HTML или фото'],
      ['heroModelPill', 'Выбрать модель ИИ']
    ];
    map.forEach(function (p) {
      var el = $(p[0]);
      if (el && !el.getAttribute('aria-label')) el.setAttribute('aria-label', p[1]);
    });
    var ta = $('heroPrompt');
    if (ta && !ta.getAttribute('aria-label')) ta.setAttribute('aria-label', 'Описание сайта');
  }

  function run() {
    var ok = build();
    overrideHeroSync();
    wire();
    label();
    syncSend();
    return ok;
  }

  function boot() {
    run();
    /* Композер трогают ещё несколько патчей (dl-fix.js, models-patch.js,
       dl-chat-mobile.js). Следим за перестановками, а не делаем один проход. */
    var box = document.querySelector('.prompt-box');
    if (box && window.MutationObserver) {
      var timer = 0, guard = false;
      new MutationObserver(function () {
        if (guard) return;
        clearTimeout(timer);
        timer = setTimeout(function () {
          guard = true;
          try { run(); } finally { guard = false; }
        }, 50);
      }).observe(box, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.addEventListener('load', function () { setTimeout(run, 260); });

  window.__dlHeroComposerRun = run;
})();
