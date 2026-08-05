/* Гарантия применимого ответа для конструктора.

   Доска принимает только JSON с операциями. Иногда модель возвращает прозу
   либо JSON из двух служебных операций (например renameProject и setTheme).
   Интерфейс пишет «Применено операций: 2», но блоки не меняются. Теперь
   запрос про сайт/лендинг считается созданием даже без глагола «создай», а
   ответ без структурных операций заменяется полноценными siteOps из движка.

   response_format в тело запроса не добавляется: не все шлюзы его понимают. */
(function () {
  'use strict';
  if (window.__dlBoardJsonForce) return;
  window.__dlBoardJsonForce = true;

  var MARK = '__dl_json_rule__';
  var RULE = '\n\n[Формат ответа ' + MARK + ']\n' +
    'Ответь РОВНО одним объектом JSON по схеме из системного сообщения. ' +
    'Первый символ ответа — «{», последний — «}». Без markdown, без ```-ограждений, ' +
    'без заголовков, списков, ссылок и пояснений до или после JSON. ' +
    'Для создания сайта обязательно верни структурные операции replacePage/addPage/addNode, ' +
    'а не только renameProject или setTheme.';
  var HAS_JSON = /json/i;
  var HAS_SCHEMA = /\bops\b|\bblocks\b|\bschema\b|схем/i;
  var SITE_WORD = /сайт|лендинг|страниц|портфоли|визитк|интернет-магазин|web\s*site|landing/i;
  var STRUCTURAL = {
    replacePage: 1, addPage: 1, addNode: 1, replaceNode: 1,
    insertNode: 1, setPage: 1, createPage: 1
  };

  function boardRequest(data) {
    if (!data || !Array.isArray(data.messages) || !data.messages.length) return false;
    for (var i = 0; i < data.messages.length; i++) {
      var item = data.messages[i] || {};
      if (item.role !== 'system') continue;
      var text = typeof item.content === 'string' ? item.content : '';
      if (HAS_JSON.test(text) && HAS_SCHEMA.test(text)) return true;
    }
    return false;
  }
  function addRule(data) {
    for (var i = data.messages.length - 1; i >= 0; i--) {
      var item = data.messages[i] || {};
      if (item.role !== 'user' || typeof item.content !== 'string') continue;
      if (item.content.indexOf(MARK) >= 0) return false;
      item.content += RULE;
      return true;
    }
    return false;
  }
  function looksJson(text) {
    var body = String(text || '').trim();
    return body.indexOf('```') === 0 || body.indexOf('{') === 0 || body.indexOf('[') === 0;
  }
  function wholeSite(message) {
    var text = String(message || '').trim();
    if (!SITE_WORD.test(text)) return false;
    // На стартовом экране само описание «Лендинг сервиса с тарифами» уже команда.
    return true;
  }
  function hasStructure(result) {
    var ops = result && Array.isArray(result.ops) ? result.ops : [];
    for (var i = 0; i < ops.length; i++) {
      var name = String((ops[i] && (ops[i].op || ops[i].type)) || '');
      if (STRUCTURAL[name]) return true;
    }
    return false;
  }
  function localSite(message, say) {
    var S = window.SFAI;
    if (!S || typeof S.siteOps !== 'function') return null;
    try {
      var result = S.siteOps(message);
      if (result && Array.isArray(result.ops) && result.ops.length) {
        result.say = say || 'Собрал полноценный сайт по описанию и заменил содержимое страницы.';
        result.__dlStructuralFallback = true;
        return result;
      }
    } catch (e) {}
    return null;
  }

  /* Проверяем уже разобранный ответ непосредственно перед применением.
     Две служебные операции больше не считаются готовым сайтом. */
  function patchParser() {
    var S = window.SFAI;
    if (!S || typeof S.parseResponse !== 'function' || S.parseResponse.__dlApplyGuard) return false;
    var original = S.parseResponse;
    var guarded = function (text) {
      var message = String(window.__dlBoardLastMessage || '').trim();
      var result;
      try { result = original.apply(this, arguments); }
      catch (error) {
        if (wholeSite(message)) {
          var fromText = localSite(message, 'Модель ответила текстом; собрал применимую структуру сайта по этому описанию.');
          if (fromText) return fromText;
        }
        throw error;
      }
      if (wholeSite(message) && !hasStructure(result)) {
        var say = result && typeof result.say === 'string' ? result.say : '';
        var built = localSite(message, say || 'Собрал сайт по описанию.');
        if (built) return built;
      }
      return result;
    };
    guarded.__dlApplyGuard = true;
    S.parseResponse = guarded;
    return true;
  }

  function inspect(response) {
    var copy = null;
    try { copy = response.clone(); } catch (e) { return; }
    copy.json().then(function (data) {
      var choice = data && data.choices && data.choices[0];
      var message = choice && choice.message;
      var text = message && typeof message.content === 'string' ? message.content : '';
      if (!text) return;
      window.__dlLastAnswer = {
        model: (data && data.model) || '', at: Date.now(),
        json: looksJson(text), text: text.slice(0, 400)
      };
      // Проза для запроса о сайте теперь обрабатывается parser guard и не является ошибкой.
      if (looksJson(text) || wholeSite(window.__dlBoardLastMessage || '')) return;
      if (typeof window.dlModelNote === 'function') {
        window.dlModelNote('Модель ответила текстом вместо схемы. Страница не изменена.');
      }
    }, function () {});
  }

  function wrapFetch() {
    var original = window.fetch;
    if (typeof original !== 'function' || original.__dlJsonForce) return;
    var wrapped = function (input, init) {
      var url = '', method = '';
      try {
        url = typeof input === 'string' ? input : (input && input.url) || '';
        method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
      } catch (e) {}
      if (method !== 'POST' || url.indexOf('/api/proxy') < 0 || !init || typeof init.body !== 'string') {
        return original.apply(this, arguments);
      }
      var args = arguments;
      try {
        var data = JSON.parse(init.body);
        if (boardRequest(data) && addRule(data)) {
          var nextInit = {};
          Object.keys(init).forEach(function (name) { nextInit[name] = init[name]; });
          nextInit.body = JSON.stringify(data);
          args = [input, nextInit];
        }
      } catch (e) {}
      var result = original.apply(this, args);
      if (result && result.then) {
        result.then(function (response) { if (response && response.ok) inspect(response); }, function () {});
      }
      return result;
    };
    wrapped.__dlJsonForce = true;
    window.fetch = wrapped;
  }

  function start() {
    wrapFetch();
    if (patchParser()) return;
    var tries = 0;
    var timer = setInterval(function () {
      wrapFetch();
      if (patchParser() || ++tries > 100) clearInterval(timer);
    }, 80);
  }
  start();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  window.addEventListener('load', start);
})();
