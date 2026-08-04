/* Превью сайта в карточках «Твои проекты» и «Недавние».

   Было: миниатюра рисовалась в кадре шириной в саму карточку — две-три
   сотни пикселей. Сайт внутри видел телефонную ширину, перестраивался
   под мобильную вёрстку и занимал узкую полосу у левого края, а остальное
   место оставалось пустым. Сам сохранённый сайт при этом цел, дело только
   в картинке предпросмотра.

   Стало: кадр получает настоящую десктопную ширину (1280 точек) и сжимается
   под карточку масштабом. Масштаб не меняет внутреннюю ширину окна,
   поэтому видна именно та вёрстка, которая будет на компьютере.

   Разметка карточек заранее неизвестна, поэтому кадры ищутся по признакам:
   любое iframe вне рабочего предпросмотра #pvFrame, которое уже уже размером
   десктопного окна. Размеры пересчитываются при изменении окна и при
   появлении новых карточек. */
(function () {
  'use strict';
  if (window.__dlProjectThumbs) return;
  window.__dlProjectThumbs = true;

  var MARK = 'data-dl-thumb';
  var DESK = 1280;
  var MAX_W = 700;
  var MIN_BOX = 40;

  function frames() {
    var list;
    try { list = document.querySelectorAll('iframe'); } catch (e) { return []; }
    return Array.prototype.filter.call(list, function (node) {
      if (node.id === 'pvFrame') return false;
      if (node.closest && node.closest('#pvFrame')) return false;
      return true;
    });
  }

  /* Область, в которую вписана миниатюра. */
  function holder(node) {
    var box = node.parentElement;
    if (!box) return null;
    var rect;
    try { rect = box.getBoundingClientRect(); } catch (e) { return null; }
    if (rect.width < MIN_BOX || rect.height < MIN_BOX) return null;
    return box;
  }

  function fit(node) {
    var box = holder(node);
    if (!box) return;
    var rect = box.getBoundingClientRect();
    if (rect.width > MAX_W) return;

    var view;
    try { view = window.getComputedStyle(box); } catch (e) { view = null; }
    if (view) {
      if (view.position === 'static') box.style.position = 'relative';
      if (view.overflow === 'visible') box.style.overflow = 'hidden';
    }

    var scale = rect.width / DESK;
    var height = Math.round(rect.height / scale);

    node.style.position = 'absolute';
    node.style.top = '0';
    node.style.left = '0';
    node.style.width = DESK + 'px';
    node.style.height = height + 'px';
    node.style.maxWidth = 'none';
    node.style.minWidth = '0';
    node.style.border = '0';
    node.style.transformOrigin = 'top left';
    node.style.transform = 'scale(' + scale + ')';
    node.setAttribute(MARK, String(Math.round(rect.width)) + 'x' + String(Math.round(rect.height)));
  }

  function run() {
    frames().forEach(function (node) {
      var box = holder(node);
      if (!box) return;
      var rect = box.getBoundingClientRect();
      var key = String(Math.round(rect.width)) + 'x' + String(Math.round(rect.height));
      /* Пересчёт только когда место под миниатюру действительно изменилось. */
      if (node.getAttribute(MARK) === key) return;
      fit(node);
    });
  }

  function soon() {
    if (soon.timer) return;
    soon.timer = setTimeout(function () { soon.timer = null; run(); }, 120);
  }

  function start() {
    run();
    window.addEventListener('resize', soon);
    window.addEventListener('orientationchange', soon);
    document.addEventListener('load', soon, true);
    if (window.MutationObserver) {
      new MutationObserver(soon).observe(document.documentElement, { childList: true, subtree: true });
    }
    setTimeout(run, 600);
    setTimeout(run, 2000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
