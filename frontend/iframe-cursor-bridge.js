/* Design Lab — forward pointer movement from the editable preview iframe. */
(function () {
  'use strict';
  if (window.__dlIframeCursorBridge) return;
  window.__dlIframeCursorBridge = true;

  function forward(frame, event, type) {
    var rect = frame.getBoundingClientRect();
    document.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      clientX: rect.left + event.clientX,
      clientY: rect.top + event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      buttons: event.buttons,
    }));
  }

  function bind(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc || doc.__dlCursorBridgeBound) return;
      doc.__dlCursorBridgeBound = true;
      doc.addEventListener('mousemove', function (event) { forward(frame, event, 'mousemove'); }, true);
      doc.addEventListener('pointermove', function (event) { forward(frame, event, 'pointermove'); }, true);
    } catch (e) {
      /* Preview may be cross-origin; the editor remains usable without bridging. */
    }
  }

  function start() {
    var frame = document.getElementById('pvFrame');
    if (!frame) return false;
    frame.addEventListener('load', function () { bind(frame); });
    bind(frame);
    setTimeout(function () { bind(frame); }, 500);
    return true;
  }

  if (!start()) {
    var observer = new MutationObserver(function () {
      if (start()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
