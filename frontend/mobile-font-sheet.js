/* Design Lab — мобильная панель выбора шрифта v5.

   Что пошло не так в прошлых версиях:
     • v3/v4 целились в класс .tb-menu — реальный контейнер списка оказался
       другим, поэтому шторка была пустой;
     • крестик кликал кнопку «Шрифты» повторно, но приложение УЖЕ закрывало
       меню по внешнему клику — повторный клик открывал его заново
       («не закрывается вообще»).

   v5 работает без угадывания классов:
     • после нажатия «Шрифты» ищет среди видимых узлов страницы контейнер,
       в котором есть минимум три названия шрифтов (Inter, Space Grotesk, …),
       — это и есть список, какой бы класс у него ни был;
     • берёт самый внешний такой контейнер (не внутреннюю строку и не body);
     • временно переносит его в <body> — его больше не режут mask и overflow
       горизонтальной ленты тулбара;
     • раскладывает пункты в столбец и растягивает список между шапкой и чатом;
     • добавляет отдельную шапку «Шрифты ×»;
     • крестик: сначала убирает наше оформление, потом проверяет, осталось ли
       меню видимым, и только тогда просит приложение закрыть его штатно —
       без двойного переключения;
     • при закрытии меню приложением (выбор шрифта, клик мимо) наш слой
       снимается сам по наблюдателю и интервальной проверке;
     • палитра скрыта, пока открыты шрифты; затемнения и блокировки страницы
       нет — всё остальное остаётся кликабельным.

   Диагностика в консоли: dlFontSheetState(). */
(function () {
  'use strict';
  if (window.__dlMobileFontSheet) return;
  window.__dlMobileFontSheet = true;

  var MQ = window.matchMedia ? window.matchMedia('(max-width:860px)') : null;
  var MODE = 'dl-font-mode';
  var ROOT_ATTR = 'data-dl-font-menu';
  var HEAD_ID = 'dl-font-head';
  var CSS_ID = 'dl-mobile-font-sheet-css';
  var FONT_WORDS = [
    'inter', 'space grotesk', 'manrope', 'montserrat', 'roboto', 'open sans',
    'playfair display', 'poppins', 'oswald', 'raleway', 'lora', 'nunito',
    'pt sans', 'source sans', 'georgia', 'arial', 'rubik', 'ubuntu',
    'fira sans', 'work sans', 'dm sans', 'dm serif', 'cormorant', 'unbounded',
    'russo one', 'golos', 'onest', 'bricolage', 'archivo', 'jetbrains',
    'space mono', 'marcellus', 'mulish', 'ibm plex', 'wix madefor', 'bebas',
    'comfortaa', 'exo', 'jost', 'karla', 'libre', 'merriweather', 'prompt'
  ];

  var trigger = null;
  var panel = null;
  var home = null;
  var observer = null;
  var closing = false;
  var opening = false;
  var lastDiag = { candidates: 0, failed: false };

  function phone() {
    return MQ ? MQ.matches : (window.innerWidth || 0) <= 860;
  }
  function norm(value) {
    return String(value || '').replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
  }
  function scoreOf(text) {
    var hits = 0;
    for (var i = 0; i < FONT_WORDS.length; i++) {
      if (text.indexOf(FONT_WORDS[i]) >= 0) hits++;
    }
    return hits;
  }

  function style() {
    if (document.getElementById(CSS_ID)) return;
    var node = document.createElement('style');
    node.id = CSS_ID;
    node.textContent = [
      '@media(max-width:860px){',
      'body.'+MODE+' [data-dl-palette-button],body.'+MODE+' [data-dl-palette-panel]{display:none!important;visibility:hidden!important;pointer-events:none!important}',
      '#'+HEAD_ID+'{position:fixed;left:8px;right:8px;top:calc(var(--dlm-top,52px) + env(safe-area-inset-top,0px));z-index:9599;height:58px;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:7px 9px 7px 16px;background:#101114;border:1px solid rgba(255,255,255,.12);border-bottom-color:rgba(255,255,255,.08);border-radius:16px 16px 0 0;box-shadow:0 -8px 26px rgba(0,0,0,.25);font:700 16px/1.2 Inter,system-ui,sans-serif;color:#f4f4f5;pointer-events:auto}',
      '#'+HEAD_ID+' .dl-font-close{appearance:none;-webkit-appearance:none;display:inline-flex;align-items:center;justify-content:center;flex:0 0 44px;width:44px;height:44px;min-width:44px;min-height:44px;margin:0;padding:0;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:#1a1c21;color:#fff;font:300 28px/1 system-ui,sans-serif;box-shadow:none;cursor:pointer;touch-action:manipulation}',
      '#'+HEAD_ID+' .dl-font-close:active{background:#292c33;transform:scale(.96)}',
      /* Найденный список — свободная область между шапкой и строкой ввода. */
      'body.'+MODE+' ['+ROOT_ATTR+']{position:fixed!important;left:8px!important;right:8px!important;top:calc(var(--dlm-top,52px) + env(safe-area-inset-top,0px) + 57px)!important;bottom:calc(var(--dlm-comp,92px) + var(--dlm-kb,0px) + 8px)!important;width:auto!important;min-width:0!important;max-width:none!important;height:auto!important;max-height:none!important;margin:0!important;padding:10px!important;box-sizing:border-box!important;z-index:9598!important;display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;align-items:stretch!important;justify-content:flex-start!important;gap:4px!important;overflow-x:hidden!important;overflow-y:auto!important;overscroll-behavior:contain!important;-webkit-overflow-scrolling:touch;background:#101114!important;border:1px solid rgba(255,255,255,.12)!important;border-top:0!important;border-radius:0 0 16px 16px!important;box-shadow:0 22px 58px rgba(0,0,0,.56)!important;transform:none!important;opacity:1!important;visibility:visible!important;touch-action:pan-y;white-space:normal!important}',
      /* Пункты — строки на всю ширину. */
      'body.'+MODE+' ['+ROOT_ATTR+']>*{flex:0 0 auto!important;width:100%!important;min-width:0!important;max-width:100%!important;min-height:48px!important;margin:0!important;box-sizing:border-box!important}',
      /* Если пункты завёрнуты в единственный внутренний скроллер — колонка и ему. */
      'body.'+MODE+' ['+ROOT_ATTR+']>*:first-child:last-child{display:flex!important;flex-direction:column!important;flex-wrap:nowrap!important;align-items:stretch!important;gap:4px!important;min-height:0!important;overflow:visible!important}',
      'body.'+MODE+' ['+ROOT_ATTR+']>*:first-child:last-child>*{flex:0 0 auto!important;width:100%!important;min-width:0!important;max-width:100%!important;min-height:48px!important;margin:0!important;box-sizing:border-box!important}',
      'body.'+MODE+' ['+ROOT_ATTR+'] button,body.'+MODE+' ['+ROOT_ATTR+'] [role="button"],body.'+MODE+' ['+ROOT_ATTR+'] li{min-height:48px;touch-action:manipulation}',
      '}',
      '@media(max-width:380px){#'+HEAD_ID+',body.'+MODE+' ['+ROOT_ATTR+']{left:5px!important;right:5px!important}}'
    ].join('');
    (document.head || document.documentElement).appendChild(node);
  }

  function visible(el) {
    if (!el || !el.isConnected) return false;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    var r = el.getBoundingClientRect();
    return r.width > 60 && r.height > 16 && r.bottom > 0 && r.right > 0;
  }
  function inPreview(el) {
    if (!el || !el.closest) return false;
    try { return !!el.closest('#pvFrame,#pvStage,iframe'); } catch (e) { return false; }
  }
  function fontButton(el) {
    if (!el || !el.closest) return null;
    var btn = el.closest('button,[role="button"],.tb-btn,.tool-btn,.seg');
    if (!btn) return null;
    var t = norm(btn.textContent || btn.getAttribute('aria-label') || btn.title);
    return t === 'шрифты' || t === 'шрифт' || t === 'fonts' || t === 'font' ? btn : null;
  }

  /* Ищем список по содержимому: минимум три названия шрифтов внутри
     видимого контейнера умеренного размера. Берём самый внешний из
     подходящих — так не заденем ни отдельную строку, ни всю страницу. */
  function findRoot() {
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    var maxArea = vw * vh * 0.8;
    var all = document.getElementsByTagName('*');
    var list = [];
    var i;
    for (i = 0; i < all.length; i++) {
      var el = all[i];
      if (!el.children || !el.children.length) continue;
      if (el.id === HEAD_ID) continue;
      if (el === document.body || el === document.documentElement) continue;
      if (trigger && (el === trigger || el.contains(trigger))) continue;
      if (inPreview(el)) continue;
      var txt = norm(el.textContent);
      if (!txt || txt.length > 6000) continue;
      var hits = scoreOf(txt);
      if (hits < 3) continue;
      if (!visible(el)) continue;
      var r = el.getBoundingClientRect();
      var area = r.width * r.height;
      if (area >= maxArea) continue;
      list.push({ el: el, hits: hits });
    }
    lastDiag.candidates = list.length;
    for (i = 0; i < list.length; i++) {
      var p = list[i].el.parentElement;
      var nested = false;
      while (p) {
        for (var j = 0; j < list.length; j++) {
          if (list[j].el === p) { nested = true; break; }
        }
        if (nested) break;
        p = p.parentElement;
      }
      if (!nested) return list[i].el;
    }
    return null;
  }

  function closePalettePopup() {
    var marked = document.querySelector('[data-dl-palette-panel]');
    if (marked) marked.style.display = 'none';
    var nodes = document.querySelectorAll('body > div');
    for (var i = 0; i < nodes.length; i++) {
      if (String(nodes[i].textContent || '').indexOf('Цветовая схема сайта') >= 0) {
        nodes[i].style.display = 'none';
      }
    }
  }

  function makeHead() {
    var old = document.getElementById(HEAD_ID);
    if (old) return old;
    var head = document.createElement('div');
    head.id = HEAD_ID;
    head.setAttribute('role', 'toolbar');
    head.setAttribute('aria-label', 'Выбор шрифта');
    var title = document.createElement('span');
    title.textContent = 'Шрифты';
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'dl-font-close';
    closeBtn.setAttribute('aria-label', 'Закрыть выбор шрифта');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      close();
    });
    head.appendChild(title);
    head.appendChild(closeBtn);
    document.body.appendChild(head);
    return head;
  }

  function watchRoot(root) {
    if (!window.MutationObserver) return;
    observer = new MutationObserver(function () {
      if (!panel) return;
      if (!visible(panel) || scoreOf(norm(panel.textContent)) < 2) leave();
    });
    observer.observe(root, { attributes: true, attributeFilter: ['class', 'style', 'hidden'], childList: true });
  }

  function open(root) {
    opening = false;
    lastDiag.failed = false;
    panel = root;
    root.setAttribute(ROOT_ATTR, '1');
    home = { parent: root.parentNode, next: root.nextSibling };
    /* Выносим из ленты тулбара: её mask/overflow резали список. */
    try { document.body.appendChild(root); } catch (e) {}
    closePalettePopup();
    document.body.classList.add(MODE);
    makeHead();
    watchRoot(root);
  }

  function leave() {
    opening = false;
    if (observer) { try { observer.disconnect(); } catch (e) {} observer = null; }
    document.body.classList.remove(MODE);
    var head = document.getElementById(HEAD_ID);
    if (head) head.remove();
    if (panel) {
      panel.removeAttribute(ROOT_ATTR);
      if (home && home.parent && home.parent.isConnected && panel.isConnected) {
        try {
          var anchor = (home.next && home.next.isConnected && home.next.parentNode === home.parent) ? home.next : null;
          home.parent.insertBefore(panel, anchor);
        } catch (e) {}
      }
    }
    panel = null;
    home = null;
  }

  /* Закрытие крестиком: сначала снимаем наше оформление, потом смотрим,
     закрыло ли приложение меню само (оно закрывает по внешнему клику).
     Кликаем исходную кнопку только если меню ещё видно — иначе клик
     ОТКРОЕТ его заново. */
  function close() {
    if (closing) return;
    closing = true;
    var root = panel;
    var btn = trigger;
    leave();
    setTimeout(function () {
      var stillOpen = !!(root && root.isConnected && visible(root));
      if (stillOpen && btn && btn.isConnected) {
        try { btn.click(); } catch (e) {}
      } else if (stillOpen && root) {
        root.style.setProperty('display', 'none', 'important');
      }
      setTimeout(function () { closing = false; }, 160);
    }, 90);
  }

  function checkAlive() {
    if (!document.body.classList.contains(MODE)) return;
    if (!panel || !panel.isConnected || !visible(panel) || scoreOf(norm(panel.textContent)) < 2) leave();
  }

  function tryOpen(n) {
    if (!opening || closing) return;
    if (!phone()) { opening = false; return; }
    var root = findRoot();
    if (root) { open(root); return; }
    if (n < 6) setTimeout(function () { tryOpen(n + 1); }, 170);
    else { opening = false; lastDiag.failed = true; }
  }

  function onClick(e) {
    var btn = fontButton(e.target);
    if (btn) {
      if (closing) return;
      trigger = btn;
      if (document.body.classList.contains(MODE)) {
        /* Пользователь закрыл меню той же кнопкой — приложение переключит его
           само, нам остаётся снять оформление. */
        setTimeout(checkAlive, 300);
        setTimeout(checkAlive, 700);
        return;
      }
      opening = true;
      /* Меню появится после штатного обработчика — опрашиваем с паузами. */
      setTimeout(function () { tryOpen(0); }, 60);
      return;
    }
    if (!document.body.classList.contains(MODE)) return;
    if (panel && panel.contains(e.target)) {
      /* Выбор пункта обычно закрывает меню. */
      setTimeout(checkAlive, 300);
      return;
    }
    if (!(e.target.closest && e.target.closest('#' + HEAD_ID))) {
      /* Клик мимо — приложение тоже может закрыть меню. */
      setTimeout(checkAlive, 250);
    }
  }
  function onKey(e) {
    if (e.key === 'Escape' && document.body.classList.contains(MODE)) {
      e.preventDefault();
      close();
    }
  }

  function cleanOldVersions() {
    var back = document.getElementById('dl-font-backdrop');
    if (back) back.remove();
    document.body.classList.remove('dl-font-open');
    var stale = document.querySelectorAll('[data-dl-font-sheet],[' + ROOT_ATTR + ']');
    for (var i = 0; i < stale.length; i++) {
      stale[i].removeAttribute('data-dl-font-sheet');
      stale[i].removeAttribute(ROOT_ATTR);
    }
  }

  function boot() {
    style();
    cleanOldVersions();
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    addEventListener('resize', function () { if (!phone()) leave(); }, { passive: true });
    addEventListener('orientationchange', function () { setTimeout(checkAlive, 180); }, { passive: true });
    addEventListener('pageshow', function () { cleanOldVersions(); leave(); });
    if (MQ && MQ.addEventListener) MQ.addEventListener('change', function () { if (!phone()) leave(); });
    /* Страховка от пропущенных закрытий. */
    setInterval(function () {
      if (document.body.classList.contains(MODE)) checkAlive();
    }, 800);
  }

  window.dlCloseFonts = close;
  window.dlFontSheetState = function () {
    return {
      phone: phone(),
      mode: document.body.classList.contains(MODE),
      found: !!panel,
      rootTag: panel ? panel.tagName : '',
      rootClass: panel ? String(panel.className || '').slice(0, 80) : '',
      rootKids: panel ? panel.children.length : 0,
      rootVisible: !!(panel && visible(panel)),
      candidates: lastDiag.candidates,
      failed: !!lastDiag.failed,
      trigger: !!(trigger && trigger.isConnected)
    };
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', boot);
  else boot();
})();
