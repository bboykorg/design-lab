/* Небольшие визуальные исправления поверх большого index.html. */
(function () {
  var style = document.createElement('style');
  style.textContent = '[data-dl-plan-current]{display:none!important}';
  (document.head || document.documentElement).appendChild(style);

  function clean() {
    var nodes = document.querySelectorAll('[data-dl-plan-current]');
    for (var i = 0; i < nodes.length; i++) nodes[i].remove();
  }

  clean();
  if (window.MutationObserver) {
    new MutationObserver(clean).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
})();
