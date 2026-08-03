/* Модель отвечает статьёй вместо схемы сайта.

   Симптом: запрос уходит, модель отвечает 200, в ответе аккуратный текст с
   заголовками, списками и ссылками — и на странице не меняется ничего.
   Причина: доска ждёт ОДИН JSON-объект со схемой блоков, а разбор прозы
   падает. Цепочка считает это неудачей и идёт к следующей модели, та тоже
   отвечает текстом — отсюда и список моделей в плашке отчёта.

   Лечим промптом, а не параметрами запроса: response_format поддерживают не все
   шлюзы из цепочки, и незнакомое поле в теле запроса легко превращается в 400
   для всех моделей сразу. Текстовое указание безопасно и обратимо.

   Что делается:

   1. К последнему сообщению пользователя добавляется короткое жёсткое условие
      ответа. Последнее сообщение модели видно лучше всего — системную часть
      длинные модели часто размывают.
   2. Сырой ответ запоминается в window.__dlLastAnswer — чтобы было видно, что
      именно вернула модель, а не гадать по пустому экрану.
   3. Если модель всё равно ответила прозой, человек получает внятное
      сообщение вместо молчания. */
(function () {
  'use strict';
  if (window.__dlBoardJsonForce) return;
  window.__dlBoardJsonForce = true;

  var MARK = '__dl_json_rule__';
  var RULE = '\n\n[\u0424\u043e\u0440\u043c\u0430\u0442 \u043e\u0442\u0432\u0435\u0442\u0430 ' + MARK + ']\n' +
    '\u041e\u0442\u0432\u0435\u0442\u044c \u0420\u041e\u0412\u041d\u041e \u043e\u0434\u043d\u0438\u043c \u043e\u0431\u044a\u0435\u043a\u0442\u043e\u043c JSON \u043f\u043e \u0441\u0445\u0435\u043c\u0435 \u0438\u0437 \u0441\u0438\u0441\u0442\u0435\u043c\u043d\u043e\u0433\u043e \u0441\u043e\u043e\u0431\u0449\u0435\u043d\u0438\u044f. ' +
    '\u041f\u0435\u0440\u0432\u044b\u0439 \u0441\u0438\u043c\u0432\u043e\u043b \u043e\u0442\u0432\u0435\u0442\u0430 \u2014 \u00ab{\u00bb, \u043f\u043e\u0441\u043b\u0435\u0434\u043d\u0438\u0439 \u2014 \u00ab}\u00bb. ' +
    '\u0411\u0435\u0437 markdown, \u0431\u0435\u0437 \u043e\u0433\u0440\u0430\u0436\u0434\u0435\u043d\u0438\u0439 \u0432 \u0442\u0440\u043e\u0439\u043d\u044b\u0445 \u043a\u0430\u0432\u044b\u0447\u043a\u0430\u0445, \u0431\u0435\u0437 \u0437\u0430\u0433\u043e\u043b\u043e\u0432\u043a\u043e\u0432, \u0431\u0435\u0437 \u0441\u043f\u0438\u0441\u043a\u043e\u0432, ' +
    '\u0431\u0435\u0437 \u0441\u0441\u044b\u043b\u043e\u043a, \u0431\u0435\u0437 \u043f\u043e\u044f\u0441\u043d\u0435\u043d\u0438\u0439 \u0434\u043e \u0438 \u043f\u043e\u0441\u043b\u0435 JSON. ' +
    '\u0421\u043e\u0432\u0435\u0442\u044b, \u0441\u0442\u0430\u0442\u044c\u0438 \u0438 \u0440\u0430\u0437\u0431\u043e\u0440\u044b \u043d\u0435 \u043d\u0443\u0436\u043d\u044b: \u0442\u0432\u043e\u0439 \u043e\u0442\u0432\u0435\u0442 \u0447\u0438\u0442\u0430\u0435\u0442 \u043f\u0440\u043e\u0433\u0440\u0430\u043c\u043c\u0430, \u0430 \u043d\u0435 \u0447\u0435\u043b\u043e\u0432\u0435\u043a.';

  // Важно: только готовые выражения, без сборки в строке. Одна лишняя
  // скобка в литерале роняет весь файл на разборе, и слой просто не работает.
  var HAS_JSON = /json/i;
  var HAS_SCHEMA = /\bops\b|\bblocks\b|\bschema\b|\u0441\u0445\u0435\u043c/i;

  function boardRequest(data) {
    if (!data || !Array.isArray(data.messages) || !data.messages.length) return false;
    // Признак запроса доски: в системной части описана схема блоков.
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
    if (body.indexOf('```') === 0) return true;
    return body.indexOf('{') === 0 || body.indexOf('[') === 0;
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
      if (looksJson(text)) return;
      if (typeof window.dlModelNote === 'function') {
        window.dlModelNote(
          '\u041c\u043e\u0434\u0435\u043b\u044c \u043e\u0442\u0432\u0435\u0442\u0438\u043b\u0430 \u0442\u0435\u043a\u0441\u0442\u043e\u043c \u0432\u043c\u0435\u0441\u0442\u043e \u0441\u0445\u0435\u043c\u044b \u0441\u0430\u0439\u0442\u0430, \u043f\u043e\u044d\u0442\u043e\u043c\u0443 \u043d\u0430 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u0435 \u043d\u0438\u0447\u0435\u0433\u043e \u043d\u0435 ' +
          '\u043f\u043e\u043c\u0435\u043d\u044f\u043b\u043e\u0441\u044c. \u041f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u043f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0437\u0430\u043f\u0440\u043e\u0441 \u0438\u043b\u0438 \u0432\u044b\u0431\u0435\u0440\u0438 \u0434\u0440\u0443\u0433\u0443\u044e \u043c\u043e\u0434\u0435\u043b\u044c.'
        );
      }
    }, function () { });
  }

  var original = window.fetch;
  if (typeof original !== 'function' || original.__dlJsonForce) return;

  var wrapped = function (input, init) {
    var url = '';
    var method = '';
    try {
      url = typeof input === 'string' ? input : (input && input.url) || '';
      method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    } catch (e) { url = ''; }

    if (method !== 'POST' || url.indexOf('/api/proxy') < 0 ||
      !init || typeof init.body !== 'string') {
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
    } catch (e) { /* чужое тело — не трогаем */ }

    var result = original.apply(this, args);
    if (result && result.then) {
      result.then(function (response) {
        if (response && response.ok) inspect(response);
      }, function () { });
    }
    return result;
  };
  wrapped.__dlJsonForce = true;
  window.fetch = wrapped;
})();
