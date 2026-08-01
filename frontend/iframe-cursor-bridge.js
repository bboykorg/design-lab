/* Design Lab — forward pointer movement from every editable preview iframe. */
(function () {
  'use strict';
  if (window.__dlIframeCursorBridge) return;
  window.__dlIframeCursorBridge = true;

  var currentFrame = null;

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

  function bindDocument(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc || doc.__dlCursorBridgeBound) return;
      doc.__dlCursorBridgeBound = true;
      doc.addEventListener('mousemove', function (event) { forward(frame, event, 'mousemove'); }, true);
      doc.addEventListener('pointermove', function (event) { forward(frame, event, 'pointermove'); }, true);
    } catch (e) {
      /* Cross-origin preview: browser correctly prevents parent-page access. */
    }
  }

  function bindFrame(frame) {
    if (!frame) return;
    if (!frame.__dlCursorBridgeFrameBound) {
      frame.__dlCursorBridgeFrameBound = true;
      frame.addEventListener('load', function () { bindDocument(frame); });
    }
    bindDocument(frame);
    setTimeout(function () { bindDocument(frame); }, 300);
  }

  function scan() {
    var frame = document.getElementById('pvFrame');
    if (!frame) return;
    if (frame !== currentFrame) currentFrame = frame;
    bindFrame(frame);
  }

  function start() {
    scan();
    new MutationObserver(function () {
      /* Some templates replace the iframe itself instead of only its srcdoc. */
      var frame = document.getElementById('pvFrame');
      if (frame && frame !== currentFrame) {
        currentFrame = frame;
        bindFrame(frame);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
