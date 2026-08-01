/* Design Lab — безопасность окна предпросмотра.
 *
 * В превью попадает HTML, который написала модель, то есть чужой код со своим JS.
 * Пара allow-scripts + allow-same-origin даёт такому коду тот же origin, что и у сайта:
 * из превью можно читать localStorage и забрать токен. Поэтому allow-same-origin убираем.
 *
 * Если редактору всё же нужен прямой доступ к DOM превью (contentDocument становится null),
 * скрипт замечает это при первом же обращении, сам возвращает прежний sandbox
 * и запоминает это — сайт не ломается, а в консоли остаётся предупреждение.
 */
(function () {
  if (window.__dlSandboxPatched) return;
  window.__dlSandboxPatched = true;

  var SAFE = 'allow-scripts allow-popups allow-forms allow-modals';
  var FLAG = 'dl_preview_same_origin';
  var descriptor = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype, 'contentDocument'
  );

  function needsSameOrigin() {
    try { return localStorage.getItem(FLAG) === '1'; } catch (e) { return false; }
  }

  function rememberSameOrigin() {
    try { localStorage.setItem(FLAG, '1'); } catch (e) {}
  }

  function isPreview(frame) {
    if (!frame || frame.tagName !== 'IFRAME') return false;
    if (frame.id === 'pvFrame') return true;
    if (frame.hasAttribute('data-preview')) return true;
    var name = (frame.className || '') + ' ' + (frame.id || '');
    return /preview|pv-?frame|result/i.test(name);
  }

  /* Перечитать содержимое: новый sandbox действует только со следующей загрузки. */
  function reload(frame) {
    var srcdoc = frame.getAttribute('srcdoc');
    if (srcdoc != null) { frame.setAttribute('srcdoc', srcdoc); return; }
    var src = frame.getAttribute('src');
    if (src) { frame.setAttribute('src', src); }
  }

  function relax(frame) {
    rememberSameOrigin();
    var value = frame.getAttribute('sandbox') || SAFE;
    if (value.indexOf('allow-same-origin') < 0) {
      frame.setAttribute('sandbox', value + ' allow-same-origin');
      reload(frame);
    }
    if (!window.__dlSandboxWarned) {
      window.__dlSandboxWarned = true;
      console.warn(
        '[Design Lab] Редактору нужен прямой доступ к DOM превью, поэтому allow-same-origin возвращён. ' +
        'Превью стоит вынести на отдельный домен.'
      );
    }
  }

  /* Ловушка на самом элементе: первое же чтение null — сигнал отката. */
  function watchAccess(frame) {
    if (!descriptor || !descriptor.get) return;
    if (frame.__dlGuarded) return;
    frame.__dlGuarded = true;
    try {
      Object.defineProperty(frame, 'contentDocument', {
        configurable: true,
        get: function () {
          var value = descriptor.get.call(this);
          if (value === null && !needsSameOrigin()) relax(this);
          return value;
        }
      });
    } catch (e) {}
  }

  function harden(frame) {
    if (!isPreview(frame)) return;
    watchAccess(frame);
    var value = frame.getAttribute('sandbox');
    if (value === null) return;              // без sandbox вообще — не наш случай
    if (needsSameOrigin()) return;           // редактору нужен доступ, не трогаем
    if (value.indexOf('allow-same-origin') < 0) return;
    var next = value.split(/\s+/).filter(function (token) {
      return token && token !== 'allow-same-origin';
    }).join(' ');
    frame.setAttribute('sandbox', next || SAFE);
    reload(frame);
  }

  function scan() {
    var frames = document.getElementsByTagName('iframe');
    for (var i = 0; i < frames.length; i++) harden(frames[i]);
  }

  function start() {
    scan();
    if (window.MutationObserver) {
      var pending = null;
      new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () { pending = null; scan(); }, 100);
      }).observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['sandbox']
      });
    }
    setInterval(scan, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
