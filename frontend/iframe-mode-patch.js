/* Разные права iframe для редактирования и запуска пользовательского JS. */
(function () {
  if (window.__dlIframeModesPatched) return;
  window.__dlIframeModesPatched = true;

  var DESIGN_SANDBOX = 'allow-same-origin';
  var PREVIEW_SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups';
  var currentMode = 'design';

  function frame() {
    return document.getElementById('pvFrame');
  }

  function prepareDesignHtml(html) {
    var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
    doc.querySelectorAll(
      'script,iframe,object,embed,meta[http-equiv="refresh"],' +
      'link[rel="modulepreload"],link[rel="preload"][as="script"]'
    ).forEach(function (node) { node.remove(); });

    doc.querySelectorAll('*').forEach(function (node) {
      Array.prototype.slice.call(node.attributes || []).forEach(function (attr) {
        var name = attr.name.toLowerCase();
        var value = String(attr.value || '');
        if (name.indexOf('on') === 0) node.removeAttribute(attr.name);
        if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*javascript:/i.test(value)) {
          node.removeAttribute(attr.name);
        }
      });
    });
    return '<!doctype html>\n' + doc.documentElement.outerHTML;
  }

  function sourceHtml(target) {
    try {
      if (typeof current !== 'undefined' && current && typeof current.html === 'string') {
        return current.html;
      }
    } catch (error) {}
    return target.getAttribute('srcdoc') || target.srcdoc || '';
  }

  function loadFrameMode(mode, html) {
    var target = frame();
    if (!target) return;
    currentMode = mode === 'preview' ? 'preview' : 'design';
    target.setAttribute(
      'sandbox',
      currentMode === 'preview' ? PREVIEW_SANDBOX : DESIGN_SANDBOX
    );
    target.srcdoc = currentMode === 'preview' ? String(html || '') : prepareDesignHtml(html);
  }

  function install() {
    var target = frame();
    if (!target) return false;
    if (window.setMode && !window.setMode.__dlSafeModes) {
      var original = window.setMode;
      var wrapped = function (mode) {
        if (mode !== 'design' && mode !== 'preview') {
          return original.apply(this, arguments);
        }
        var html = sourceHtml(target);
        try { boardMode = mode; } catch (error) {}
        loadFrameMode(mode, html);
        try {
          if (typeof syncModeBtns === 'function') syncModeBtns();
        } catch (error) {}
      };
      wrapped.__dlSafeModes = true;
      wrapped.__dlOriginal = original;
      window.setMode = wrapped;
    }

    // Безопасный режим по умолчанию. После явного Preview включится JS,
    // но allow-same-origin уже не будет.
    var initial = 'design';
    try {
      if (typeof boardMode !== 'undefined' && boardMode === 'preview') initial = 'preview';
    } catch (error) {}
    loadFrameMode(initial, sourceHtml(target));

    // Не позволять другому коду вернуть опасную комбинацию прав.
    new MutationObserver(function () {
      var value = target.getAttribute('sandbox') || '';
      if (value.indexOf('allow-scripts') >= 0 && value.indexOf('allow-same-origin') >= 0) {
        target.setAttribute(
          'sandbox',
          currentMode === 'preview' ? PREVIEW_SANDBOX : DESIGN_SANDBOX
        );
      }
    }).observe(target, { attributes: true, attributeFilter: ['sandbox'] });
    return true;
  }

  function start() {
    if (install()) return;
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (install() || tries > 40) clearInterval(timer);
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
