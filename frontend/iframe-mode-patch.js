/* Design Lab — isolated Design / Preview modes for the generated site. */
(function () {
  'use strict';
  if (window.__dlFrameModesPatched) return;
  window.__dlFrameModesPatched = true;

  var DESIGN_SANDBOX = 'allow-same-origin';
  var PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups';
  var frame, rawHtml = '', mode = 'design', writing = false;

  function designHtml(html) {
    if (typeof html !== 'string') return '';
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+(?:href|src)\s*=\s*("|')\s*javascript:[\s\S]*?\1/gi, '');
  }

  function setFrame(html) {
    if (!frame) return;
    writing = true;
    frame.setAttribute('sandbox', mode === 'preview' ? PREVIEW_SANDBOX : DESIGN_SANDBOX);
    frame.srcdoc = mode === 'preview' ? html : designHtml(html);
    setTimeout(function () { writing = false; }, 0);
  }

  function setMode(next) {
    if (!frame || next === mode) return;
    mode = next === 'preview' ? 'preview' : 'design';
    setFrame(rawHtml);
    document.querySelectorAll('[data-dl-frame-mode]').forEach(function (button) {
      var active = button.getAttribute('data-dl-frame-mode') === mode;
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.style.background = active ? '#fff' : 'transparent';
      button.style.color = active ? '#111827' : '#fff';
    });
  }

  function controls() {
    var host = frame.parentElement;
    if (!host || host.querySelector('[data-dl-frame-modes]')) return;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    var bar = document.createElement('div');
    bar.setAttribute('data-dl-frame-modes', '1');
    bar.setAttribute('aria-label', 'Режим превью');
    bar.style.cssText = 'position:absolute;z-index:30;top:12px;right:12px;display:flex;padding:3px;border:1px solid rgba(255,255,255,.22);border-radius:9px;background:rgba(17,24,39,.86);backdrop-filter:blur(8px);font:600 12px/1 system-ui,sans-serif;';
    [['design', 'Дизайн'], ['preview', 'Превью']].forEach(function (entry) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = entry[1];
      button.setAttribute('data-dl-frame-mode', entry[0]);
      button.setAttribute('aria-pressed', entry[0] === 'design' ? 'true' : 'false');
      button.style.cssText = 'border:0;border-radius:6px;padding:7px 9px;background:' + (entry[0] === 'design' ? '#fff' : 'transparent') + ';color:' + (entry[0] === 'design' ? '#111827' : '#fff') + ';cursor:pointer;font:inherit;';
      button.addEventListener('click', function () { setMode(entry[0]); });
      bar.appendChild(button);
    });
    host.appendChild(bar);
  }

  function attach() {
    frame = document.getElementById('pvFrame');
    if (!frame) return false;
    rawHtml = frame.getAttribute('srcdoc') || frame.srcdoc || '';
    controls();
    setFrame(rawHtml);
    new MutationObserver(function () {
      if (writing) return;
      var next = frame.getAttribute('srcdoc') || frame.srcdoc || '';
      if (next === rawHtml) return;
      rawHtml = next;
      if (mode === 'design') setFrame(rawHtml);
    }).observe(frame, { attributes: true, attributeFilter: ['srcdoc'] });
    return true;
  }

  function start() {
    if (attach()) return;
    var observer = new MutationObserver(function () { if (attach()) observer.disconnect(); });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
