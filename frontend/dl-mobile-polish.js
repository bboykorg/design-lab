/* Design Lab — финишный мобильный рунтайм.
   Идёт ПОСЛЕ dl-mobile.js и dl-mobile-sheet.js: опирается на готовые html.dl-phone,
   #dlNavSheet и нижний лист выбора модели.

   Решает четыре задачи, которые невозможно закрыть одним CSS. */
(function () {
  'use strict';
  if (window.__dlMobilePolish) return;
  window.__dlMobilePolish = true;

  var root = document.documentElement;
  var isPhone = function () { return root.classList.contains('dl-phone'); };

  /* ═══ 1. Плейсхолдеры hero: короткие версии для узкого экрана.

     Исходный текст — 156 символов с вложенной цитатой. На 390px это шесть строк
     в контейнере высотой в три: замер показал 48px срезанного текста,
     фраза обрывалась на предлоге. Растягивать контейнер до шести строк нельзя —
     плейсхолдер вытолкнет кнопки за первый экран. Правильный ход — короткий
     текст целиком вместо длинного вполовину. Смысл сохранён полностью. */
  var PHONE_HINTS = [
    'Опиши сайт словами. Например: «лендинг кофейни, тёплые тона»',
    'Или нажми скрепку и загрузи свой HTML — сделаю редизайн',
    'Или возьми готовый шаблон и меняй его в чате'
  ];

  function shortenHints() {
    var ph = document.getElementById('heroPh');
    var line = ph && ph.querySelector('.ph-line');
    var ta = document.getElementById('heroPrompt');
    if (!line) return;

    if (!isPhone()) return;

    // Ротацию ведёт чужой setInterval через window.__phNext — он каждые 20с
    // ставит свой длинный текст. Перехватывать таймер нельзя (нет ссылки),
    // поэтому наблюдаем за узлом и сразу меняем текст на короткий аналог.
    // Подмена идёт в той же микрозадаче, поэтому мелькания нет.
    var idx = 0;
    var applying = false;

    function apply() {
      if (applying) return;
      var want = PHONE_HINTS[idx % PHONE_HINTS.length];
      if (line.textContent === want) return;
      applying = true;
      line.textContent = want;
      applying = false;
    }

    var mo = new MutationObserver(function () {
      if (!isPhone()) return;
      // Чужой код поставил следующую длинную фразу — сдвигаем свой счётчик.
      if (PHONE_HINTS.indexOf(line.textContent) === -1) {
        idx++;
        apply();
      }
    });
    mo.observe(line, { childList: true, characterData: true, subtree: true });

    idx = 0;
    apply();

    // Атрибут placeholder у textarea сброшен в '' исходным кодом — но если
    // кастомный слой не соберётся, поле останется без подсказки вообще.
    // Ставим честный запасной текст в aria-label — скринридерам он нужен всегда.
    if (ta && !ta.getAttribute('aria-label')) {
      ta.setAttribute('aria-label', 'Описание сайта, который нужно создать');
    }
  }

  /* ═══ 2. На самых узких экранах «Войти» переезжает в выдвижное меню.

     CSS прячет кнопку на <375px, но просто спрятать вход — это потеря функции.
     Дублируем пункт в листе навигации и проксируем клик на настоящую кнопку,
     чтобы не дублировать openAuth() и не рассинхронизироваться с логикой сессии. */
  function mirrorAuthIntoSheet() {
    var sheet = document.getElementById('dlNavSheet');
    var auth = document.getElementById('authBtn');
    if (!sheet || !auth || sheet.querySelector('[data-dl-auth]')) return;

    var item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('data-dl-auth', '1');
    item.textContent = (auth.textContent || 'Войти').trim();
    item.addEventListener('click', function () {
      var toggle = document.getElementById('dlNavToggle');
      if (toggle && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
      setTimeout(function () { auth.click(); }, 70);
    });
    sheet.appendChild(item);

    // Текст кнопки меняется после входа («Войти» → имя/профиль).
    // Держим копию в актуальном состоянии, иначе меню будет врать.
    new MutationObserver(function () {
      var t = (auth.textContent || '').trim();
      if (t && t !== item.textContent) item.textContent = t;
      item.hidden = auth.hidden || getComputedStyle(auth).display === 'none' ? false : false;
    }).observe(auth, { childList: true, characterData: true, subtree: true });
  }

  /* ═══ 3. Ленивая загрузка превью галереи.

     В галерее 99 карточек. Если браузер тянет все превью сразу, на 3G и 2 ГБ ОЗУ
     это десятки мегабайт трафика и гарантированный вылет вкладки.
     loading="lazy" и decoding="async" решают это средствами браузера, без своего
     наблюдателя и без риска разойтись с логикой фильтрации карточек.
     Карточки рисуются скриптом уже после загрузки, поэтому нужен MutationObserver. */
  function lazifyImages(scope) {
    var imgs = (scope || document).querySelectorAll('img:not([data-dl-lazy])');
    imgs.forEach(function (img) {
      img.setAttribute('data-dl-lazy', '1');
      // Первый экран грузим обычно: lazy выше складки только замедляет LCP.
      var r = img.getBoundingClientRect();
      var aboveFold = r.top < window.innerHeight && r.bottom > 0;
      if (!aboveFold && !img.getAttribute('loading')) img.loading = 'lazy';
      if (!img.getAttribute('decoding')) img.decoding = 'async';
      // Размеры картинкам здесь НЕ навязываем. В галерее соотношение сторон уже
      // держит контейнер .card .ph (aspect-ratio:16/10), а само превью .thumb —
      // position:absolute; inset:0. Пробная попытка задать aspect-ratio самой
      // картинке ломала высоту: тест на 390px показал 77px срезанного содержимого
      // в шести карточках из-за overflow:hidden на .card.
    });

    // iframe-превью тяжелее картинок на порядок: каждый — отдельный документ.
    (scope || document).querySelectorAll('iframe:not([data-dl-lazy])').forEach(function (f) {
      f.setAttribute('data-dl-lazy', '1');
      if (!f.getAttribute('loading')) f.loading = 'lazy';
    });
  }

  function watchGallery() {
    var host = document.getElementById('cards') || document.querySelector('.gallery');
    if (!host) return;
    lazifyImages(host);
    var pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      // Карточки добавляются пачкой — обрабатываем одним проходом в простое.
      (window.requestIdleCallback || window.requestAnimationFrame)(function () {
        pending = false;
        lazifyImages(host);
      });
    }).observe(host, { childList: true, subtree: true });
  }

  /* ═══ 4. Блокировка фонового скролла при открытом листе моделей.

     Навигационный лист свой скролл блокирует, а лист выбора модели — нет:
     прокрутка пальцем до конца списка перетекает в страницу под ним
     (scroll chaining). На iOS это выглядит как сломанный жест.
     overscroll-behavior в CSS уже есть, но он не держит случай, когда палец
     начал движение вне листа — поэтому фиксируем body. */
  function lockScrollWithModelSheet() {
    var locked = false;
    var savedY = 0;

    function anyOpen() {
      return !!document.querySelector('.model-menu.on, #heroModelMenu.on, #modelMenu.on');
    }

    function lock() {
      if (locked || !isPhone()) return;
      locked = true;
      savedY = window.scrollY;
      document.body.style.position = 'fixed';
      document.body.style.top = -savedY + 'px';
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
    }

    function unlock() {
      if (!locked) return;
      locked = false;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
      window.scrollTo(0, savedY);
    }

    // Класс .on ставит чужой код — следим за атрибутом, а не за кликами:
    // так ловим и программное открытие/закрытие тоже.
    var mo = new MutationObserver(function () {
      if (anyOpen()) lock(); else unlock();
    });
    mo.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });

    // Переворот экрана с зафиксированным body ломает позицию — снимаем замок.
    window.addEventListener('orientationchange', unlock, { passive: true });
  }

  /* ═══ Запуск */
  /* Меню выбора модели не должно уезжать за нижний край окна.

     Найдено тестом на 1024x768 (ноутбук с невысоким экраном):
     меню открывалось на top 667 и тянулось до 997 при высоте окна 768 —
     229px списка оказывались за экраном, до последних моделей дотянуться было нельзя.
     На телефоне этого нет: там меню — нижний лист с position:fixed, поэтому
     телефонный случай не трогаем вовсе.

     Логика: если снизу места не хватает, открываем вверх от кнопки.
     Если и сверху не влезает — ограничиваем высоту доступным местом
     и включаем прокрутку, чтобы последний пункт всегда был достижим. */
  function keepMenusOnScreen() {
    var SEL = '#heroModelMenu, .model-menu, .di-chat-model-menu, #modelMenu';
    var GAP = 10;

    function fit(menu) {
      if (!menu || !menu.classList.contains('on')) return;
      // Телефонный нижний лист уже прижат к низу экрана — не трогаем.
      if (getComputedStyle(menu).position === 'fixed') return;

      // Сбрасываем прошлую корректировку, иначе замер будет относительно себя же.
      menu.style.maxHeight = '';
      menu.style.top = '';
      menu.style.bottom = '';
      menu.style.overflowY = '';

      var r = menu.getBoundingClientRect();
      var vh = window.innerHeight;
      if (r.height === 0) return;

      var overflowBottom = r.bottom - (vh - GAP);
      if (overflowBottom <= 0) return;

      // Сколько места было бы при открытии вверх: от верха кнопки до верха окна.
      var anchorTop = r.top;
      var spaceAbove = anchorTop - GAP;
      var spaceBelow = vh - GAP - r.top;

      if (spaceAbove > spaceBelow) {
        // Открываем вверх от точки привязки.
        menu.style.top = 'auto';
        menu.style.bottom = 'calc(100% + 8px)';
        if (r.height > spaceAbove) {
          menu.style.maxHeight = Math.max(160, spaceAbove) + 'px';
          menu.style.overflowY = 'auto';
        }
      } else {
        menu.style.maxHeight = Math.max(160, spaceBelow) + 'px';
        menu.style.overflowY = 'auto';
      }
    }

    function fitAll() {
      document.querySelectorAll(SEL).forEach(fit);
    }

    // Меню открываются добавлением класса on — следим за атрибутом class.
    var mo = new MutationObserver(function (recs) {
      for (var i = 0; i < recs.length; i++) {
        var t = recs[i].target;
        if (t && t.matches && t.matches(SEL)) {
          // Ждём кадр: во время анимации открытия высота ещё не финальная.
          requestAnimationFrame(function () { fitAll(); });
        }
      }
    });
    mo.observe(document.documentElement, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    window.addEventListener('resize', fitAll, { passive: true });
    fitAll();
  }

  function init() {
    shortenHints();
    mirrorAuthIntoSheet();
    watchGallery();
    lockScrollWithModelSheet();
    keepMenusOnScreen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // #heroPh и #dlNavSheet создаются чужими скриптами позже — повторяем попытку.
  window.addEventListener('load', function () {
    setTimeout(init, 60);
    setTimeout(init, 800);
  });
})();
