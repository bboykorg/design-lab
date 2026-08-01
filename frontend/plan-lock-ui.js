/* Design Lab — тариф выдаётся только администратором. */
(function () {
  'use strict';
  if (window.__dlPlanLockUi) return;
  window.__dlPlanLockUi = true;

  function lock() {
    var buttons = document.querySelectorAll('[data-dl-plan-button]');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      if (button.getAttribute('data-dl-plan-locked')) continue;
      button.setAttribute('data-dl-plan-locked', '1');
      button.setAttribute('aria-disabled', 'true');
      button.style.pointerEvents = 'none';
      button.style.opacity = '.58';
      button.style.cursor = 'not-allowed';
      if (button.textContent.indexOf('Текущий тариф') < 0) {
        button.textContent = 'Тариф выдаёт администратор';
      }
    }
  }

  function start() {
    lock();
    new MutationObserver(lock).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(lock, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
