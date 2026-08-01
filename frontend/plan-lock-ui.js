/* Design Lab — тариф выдаётся только администратором. */
(function () {
  'use strict';
  if (window.__dlPlanLockUi) return;
  window.__dlPlanLockUi = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var currentPlan = '';

  function token() {
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        var value = localStorage.getItem(TOKEN_KEYS[i]);
        if (value && value.length > 10) return value;
      }
    } catch (e) {}
    return '';
  }

  function lock() {
    if (!currentPlan) return;
    var buttons = document.querySelectorAll('[data-dl-plan-button]');
    for (var i = 0; i < buttons.length; i++) {
      var button = buttons[i];
      var card = button.closest('[data-dl-plan]');
      var active = card && card.getAttribute('data-dl-plan') === currentPlan;
      if (active) {
        button.removeAttribute('data-dl-plan-locked');
        button.style.pointerEvents = 'none';
        button.style.cursor = 'default';
        continue;
      }
      button.setAttribute('data-dl-plan-locked', '1');
      button.setAttribute('aria-disabled', 'true');
      button.style.pointerEvents = 'none';
      button.style.opacity = '.58';
      button.style.cursor = 'not-allowed';
      if (button.textContent !== 'Тариф выдаёт администратор') {
        button.textContent = 'Тариф выдаёт администратор';
      }
    }
  }

  function load() {
    var value = token();
    if (!value) return;
    fetch('/api/plan', { headers: { Authorization: 'Bearer ' + value } })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data || !data.plan) return;
        currentPlan = data.plan;
        lock();
        setTimeout(lock, 300);
        setTimeout(lock, 1200);
      })
      .catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
