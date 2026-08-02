/* Design Lab - закрытие нижнего листа выбора модели на телефоне.

   Проблема, которую чиним (найдена тестом на 390x844):
   в index.html меню закрывается только так:
     document.addEventListener('click', e => { if (!promptBox.contains(e.target)) close(); })
   Но само меню лежит ВНУТРИ .prompt-box, а на телефоне оно растянуто
   на весь низ экрана и перекрывает саму кнопку-пилюлю. Итог: любой тап
   попадает внутрь prompt-box, условие никогда не срабатывает, и лист невозможно
   закрыть — пользователь заперт. Escape для этого меню тоже не был подключён.

   Добавляем три привычных способа закрыть лист: тап по затемнённому фону,
   свайп вниз и Escape / кнопка «назад». */
(function () {
  'use strict';
  if (window.__dlSheetClose) return;
  window.__dlSheetClose = true;

  var SEL = '#heroModelMenu, .model-menu, .di-chat-model-menu';

  function isPhone() {
    return document.documentElement.classList.contains('dl-phone');
  }

  function openSheets() {
    var out = [];
    var list = document.querySelectorAll(SEL);
    for (var i = 0; i < list.length; i++) {
      if (list[i].classList.contains('on')) out.push(list[i]);
    }
    return out;
  }

  function close(menu) {
    menu.classList.remove('on');
    // Пилюля должна перестать выглядеть нажатой, иначе стрелка останется развёрнутой.
    var pill = document.getElementById('heroModelPill');
    if (pill) pill.classList.remove('open');
    var others = document.querySelectorAll('.hero-model.open, .model-pill.open');
    for (var i = 0; i < others.length; i++) others[i].classList.remove('open');
  }

  function closeAll() {
    var list = openSheets();
    for (var i = 0; i < list.length; i++) close(list[i]);
    return list.length > 0;
  }

  /* 1. Тап по затемнённому фону.
     Фон — это ::before самого меню, поэтому браузер отдаёт e.target === меню.
     Тап по пункту списка даёт вложенный элемент и сюда не попадает. */
  document.addEventListener('click', function (e) {
    if (!isPhone()) return;
    var list = openSheets();
    for (var i = 0; i < list.length; i++) {
      if (e.target === list[i]) {
        e.stopPropagation();
        close(list[i]);
      }
    }
  }, true);

  /* 2. Escape / аппаратная кнопка «назад». */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' || e.key === 'Esc') closeAll();
  });

  /* 3. Свайп вниз по листу.
     Закрываем только если список уже прокручен вверх (scrollTop около 0),
     иначе обычная прокрутка списка случайно закрывала бы меню. */
  var startY = 0, tracking = null;
  document.addEventListener('touchstart', function (e) {
    if (!isPhone() || !e.touches || e.touches.length !== 1) return;
    var list = openSheets();
    if (!list.length) return;
    var sheet = list[0];
    if (!sheet.contains(e.target) && e.target !== sheet) return;
    startY = e.touches[0].clientY;
    tracking = sheet.scrollTop <= 1 ? sheet : null;
  }, { passive: true });

  document.addEventListener('touchend', function (e) {
    if (!tracking) return;
    var endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : startY;
    // 70px — осознанный свайп, а не дрожание пальца.
    if (endY - startY > 70) close(tracking);
    tracking = null;
  }, { passive: true });
})();
