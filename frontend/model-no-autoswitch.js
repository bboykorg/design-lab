/* Без автоподмены модели.

   Раньше было так: если выбранная модель не ответила, сайт сам брал следующую
   из цепочки FALLBACK_ORDER. Со стороны это выглядело как «выбрал Terra —
   ответил Opus», причём в Network никакого «переключения» не видно: вся логика
   живёт в браузере. Теперь модель меняет только человек.

   Что делает файл:
   1) чистит FALLBACK_ORDER — подставлять больше нечего (список сохранён
      в window.__dlFallbackOrder, чтобы поведение можно было вернуть одной строкой);
   2) ставит заслон на pickModel: вызов без живого клика/касания игнорируется;
   3) показывает ПРИЧИНУ отказа: код и короткий текст ошибки провайдера,
      а полный текст кладёт в window.__dlLastModelError для разбора.

   Тело ответа читаем только у КЛОНА и только у неудачных ответов, чтобы поток
   успешной генерации не ломался.

   Ничего не блокируется и не затемняется: все кнопки остаются кликабельными.
   Резерв на сервере (другой шлюз для ТОЙ ЖЕ модели) не трогаем — он не меняет
   то, что выбрал пользователь. */
(function () {
  'use strict';
  if (window.__dlNoAutoSwitch) return;
  window.__dlNoAutoSwitch = true;

  var GESTURE_MS = 2500;   // сколько времени клик считается живым
  var BOOT_MS = 8000;      // на старте страницы разрешаем восстановление выбора
  var NOTE_MS = 6000;      // не чаще одной подсказки в этот интервал

  var bootAt = Date.now();
  var lastGesture = 0;
  var lastNote = 0;

  ['pointerdown', 'mousedown', 'click', 'touchstart', 'keydown'].forEach(function (type) {
    document.addEventListener(type, function () { lastGesture = Date.now(); }, true);
  });

  function byUser() {
    return (Date.now() - lastGesture) < GESTURE_MS;
  }

  function note(text) {
    var now = Date.now();
    if (now - lastNote < NOTE_MS) return;
    lastNote = now;
    if (typeof window.toast === 'function') {
      try { window.toast(text); return; } catch (e) { /* своё окно ниже */ }
    }
    var box = document.createElement('div');
    box.textContent = text;
    box.setAttribute('data-dl-model-note', '1');
    box.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
      'z-index:99999;max-width:min(460px,92vw);padding:12px 16px;border-radius:12px;' +
      'background:#0f1116;color:#fff;font:14px/1.4 Manrope,system-ui,sans-serif;' +
      'border:1px solid rgba(255,255,255,.14);box-shadow:0 10px 30px rgba(0,0,0,.35);' +
      'pointer-events:none;';
    document.body.appendChild(box);
    setTimeout(function () { box.remove(); }, 5500);
  }
  window.dlModelNote = note;

  // 1. Цепочка автоподмены. FALLBACK_ORDER объявлён через const в index.html,
  // переприсвоить его нельзя, но сам массив изменяем — просто опустошаем его.
  // Делаем это повторно: seekai-models.js добавляет туда свои модели позже.
  function clearChain() {
    var chain;
    try { chain = FALLBACK_ORDER; } catch (e) { chain = window.FALLBACK_ORDER; }
    if (!chain || !chain.splice) return;
    if (chain.length) {
      if (!window.__dlFallbackOrder) window.__dlFallbackOrder = chain.slice();
      chain.splice(0, chain.length);
    }
  }

  // 2. Заслон на машинный вызов pickModel.
  function guardPick() {
    var pick = window.pickModel;
    if (typeof pick !== 'function' || pick.__dlGuardedAuto) return;
    var guarded = function (key) {
      var startup = (Date.now() - bootAt) < BOOT_MS;
      if (!byUser() && !startup) {
        note('\u041c\u043e\u0434\u0435\u043b\u044c \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430. \u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c \u0432\u0440\u0443\u0447\u043d\u0443\u044e.');
        return;
      }
      return pick.apply(this, arguments);
    };
    guarded.__dlGuardedAuto = true;
    window.pickModel = guarded;
  }

  function shorten(text) {
    var out = String(text || '').replace(/\s+/g, ' ').trim();
    try {
      var data = JSON.parse(out);
      var message = (data && data.error && (data.error.message || data.error)) ||
        (data && data.detail) || (data && data.message) || '';
      if (message) out = String(message);
    } catch (e) { /* не JSON — оставляем как есть */ }
    return out.length > 160 ? out.slice(0, 160) + '\u2026' : out;
  }

  // 3. Ошибка запроса к модели — говорим о ней вслух и с причиной.
  function watchFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlModelWatch) return;
    var wrapped = function (input, init) {
      var url = '';
      try { url = typeof input === 'string' ? input : (input && input.url) || ''; } catch (e) { url = ''; }
      var watched = url.indexOf('/api/proxy') >= 0;
      var result = original.apply(this, arguments);
      if (watched && result && result.then) {
        result.then(function (response) {
          if (!response || response.ok) return;
          var status = response.status;
          var copy = null;
          try { copy = response.clone(); } catch (e) { copy = null; }
          if (!copy) {
            window.__dlLastModelError = { status: status, text: '' };
            note('\u041c\u043e\u0434\u0435\u043b\u044c \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430 (\u043a\u043e\u0434 ' + status +
              '). \u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c \u0432\u0440\u0443\u0447\u043d\u0443\u044e.');
            return;
          }
          copy.text().then(function (text) {
            var reason = shorten(text);
            window.__dlLastModelError = { status: status, text: reason, at: Date.now() };
            note('\u041c\u043e\u0434\u0435\u043b\u044c \u043d\u0435 \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430 (\u043a\u043e\u0434 ' + status + ')' +
              (reason ? ': ' + reason : '') +
              '. \u0412\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c \u0432\u0440\u0443\u0447\u043d\u0443\u044e.');
          }, function () { });
        }, function () { });
      }
      return result;
    };
    wrapped.__dlModelWatch = true;
    window.fetch = wrapped;
  }

  function run() {
    clearChain();
    guardPick();
    watchFetch();
  }

  run();
  setTimeout(run, 300);
  setTimeout(run, 1200);
  setInterval(run, 1500);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  window.addEventListener('load', run);
})();
