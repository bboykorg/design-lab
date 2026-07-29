/* Hide only the direct GOOGLE GEMINI section in menus that are rendered
 * independently from the global MODELS map. The model definitions remain in
 * the app and can be restored with DL_GOOGLE_ENABLED=true before page load.
 */
(function () {
  'use strict';

  var enabled = typeof window.DL_GOOGLE_ENABLED === 'boolean'
    ? window.DL_GOOGLE_ENABLED
    : false;
  if (enabled) return;

  var MODEL_NAMES = ['Gemini Pro', 'Gemini Flash'];
  var MODEL_IDS = ['gemini-pro', 'gemini-flash'];
  var style = document.createElement('style');
  style.id = 'dl-hide-direct-google';
  style.textContent = MODEL_IDS.map(function (id) {
    return [
      '[data-model="' + id + '"]',
      '[data-model-id="' + id + '"]',
      '[data-id="' + id + '"]',
      '[data-value="' + id + '"]',
      '[onclick*="' + id + '"]'
    ].join(',');
  }).join(',') + '{display:none!important}';
  (document.head || document.documentElement).appendChild(style);

  function norm(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function directRow(el, name) {
    var explicit = el.closest && el.closest(
      '[data-model],[data-model-id],[data-id],[data-value],[onclick],button,' +
      '[role="option"],[role="menuitem"],li,.model-item,.model-option,.model-row'
    );
    if (explicit) return explicit;

    // The original menu uses plain nested divs. Starting at the text label,
    // choose the largest compact ancestor containing only this one model row.
    var node = el;
    var candidate = el;
    for (var i = 0; node && i < 6; i++, node = node.parentElement) {
      var text = norm(node.textContent);
      if (text.indexOf(name) < 0) break;
      var rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { height: 0 };
      var compact = !rect.height || rect.height <= 90;
      var hasOtherModel = MODEL_NAMES.some(function (other) {
        return other !== name && text.indexOf(other) >= 0;
      });
      if (compact && !hasOtherModel && text.length < 180) candidate = node;
    }
    return candidate;
  }

  function hideHeader(root) {
    Array.prototype.forEach.call(root.querySelectorAll('*'), function (el) {
      if (el.children.length || norm(el.textContent).toUpperCase() !== 'GOOGLE GEMINI') return;
      var node = el;
      var candidate = el;
      for (var i = 0; node && i < 3; i++, node = node.parentElement) {
        var text = norm(node.textContent).toUpperCase();
        if (text !== 'GOOGLE GEMINI') break;
        candidate = node;
      }
      candidate.style.setProperty('display', 'none', 'important');
      candidate.setAttribute('data-dl-hidden-google-header', '1');
    });
  }

  function hideRows(root) {
    if (!root || !root.querySelectorAll) return;
    Array.prototype.forEach.call(root.querySelectorAll('*'), function (el) {
      if (el.children.length) return;
      var text = norm(el.textContent);
      for (var i = 0; i < MODEL_NAMES.length; i++) {
        if (text !== MODEL_NAMES[i]) continue;
        var row = directRow(el, MODEL_NAMES[i]);
        row.style.setProperty('display', 'none', 'important');
        row.setAttribute('data-dl-hidden-direct-google', '1');
        break;
      }
    });
    hideHeader(root);
  }

  function apply() { hideRows(document.body || document.documentElement); }

  var observer = new MutationObserver(function (records) {
    records.forEach(function (record) {
      Array.prototype.forEach.call(record.addedNodes || [], function (node) {
        if (node.nodeType === 1) hideRows(node);
      });
    });
    apply();
  });

  function start() {
    apply();
    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
    // Some menus reuse hidden DOM instead of inserting it again.
    document.addEventListener('click', function () { setTimeout(apply, 0); }, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
