/* Design Lab — тарифы.
 * index.html огромный, поэтому карточки переписываются уже в браузере:
 * — списки возможностей берутся из этого файла;
 * — кнопка сразу оформляет тариф через /api/plan/subscribe (без оплаты, для проверки);
 * — действующий тариф подсвечен, его кнопка неактивна;
 * — Team не шлёт запрос на сервер: командный тариф обсуждается лично, поэтому
 *   кнопка открывает Telegram и оставляет видимую ссылку в карточке.
 */
(function () {
  if (window.__dlPlansPatched) return;
  window.__dlPlansPatched = true;

  var TOKEN_KEYS = ['dl_token', 'dl_auth_token', 'auth_token', 'token', 'dlToken'];
  var TELEGRAM = 'https://t.me/bboy_korg';
  var TELEGRAM_NAME = '@bboy_korg';
  var currentPlan = '';

  var PLANS = [
    {
      id: 'free',
      buttons: ['\u043d\u0430\u0447\u0430\u0442\u044c', '\u043f\u043e\u043f\u0440\u043e\u0431\u043e\u0432\u0430\u0442\u044c', '\u0432\u044b\u0431\u0440\u0430\u0442\u044c free'],
      features: [
        '5 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0439 \u0432 \u0434\u0435\u043d\u044c',
        '\u041c\u043e\u0434\u0435\u043b\u0438 gpt-oss 120b, gemma3, glm 4.7, nemotron',
        '\u0412\u0441\u0435 98 \u0448\u0430\u0431\u043b\u043e\u043d\u043e\u0432',
        '\u041f\u0440\u0430\u0432\u043a\u0438 \u0441\u0442\u0440\u0430\u043d\u0438\u0446\u044b \u0432 \u0447\u0430\u0442\u0435',
        '\u042d\u043a\u0441\u043f\u043e\u0440\u0442 HTML \u043e\u0434\u043d\u0438\u043c \u0444\u0430\u0439\u043b\u043e\u043c'
      ]
    },
    {
      id: 'pro',
      buttons: ['\u043e\u0444\u043e\u0440\u043c\u0438\u0442\u044c pro', '\u043a\u0443\u043f\u0438\u0442\u044c pro', '\u043f\u0435\u0440\u0435\u0439\u0442\u0438 \u043d\u0430 pro'],
      features: [
        '\u0411\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u0430 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0439',
        '\u0412\u0441\u0435 \u043c\u043e\u0434\u0435\u043b\u0438, \u0432\u043a\u043b\u044e\u0447\u0430\u044f \u0441\u0430\u043c\u044b\u0435 \u0441\u0438\u043b\u044c\u043d\u044b\u0435',
        '\u0421\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u0441\u0430\u0439\u0442\u0430 \u0441 \u043d\u0443\u043b\u044f \u043f\u043e \u043e\u043f\u0438\u0441\u0430\u043d\u0438\u044e',
        '\u0421\u043a\u0440\u0438\u043d\u0448\u043e\u0442 \u043a\u0430\u043a \u0437\u0430\u0434\u0430\u043d\u0438\u0435: \u043c\u043e\u0434\u0435\u043b\u044c \u0447\u0438\u0442\u0430\u0435\u0442 \u043a\u0430\u0440\u0442\u0438\u043d\u043a\u0443',
        '\u041e\u0447\u0435\u0440\u0435\u0434\u044c \u0431\u0435\u0437 \u043e\u0436\u0438\u0434\u0430\u043d\u0438\u044f',
        '\u0418\u0441\u0442\u043e\u0440\u0438\u044f \u043f\u0440\u043e\u0435\u043a\u0442\u043e\u0432 \u0431\u0435\u0437 \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0438\u0439'
      ]
    },
    {
      id: 'team',
      buttons: ['\u0441\u0432\u044f\u0437\u0430\u0442\u044c\u0441\u044f', '\u043e\u0444\u043e\u0440\u043c\u0438\u0442\u044c team', '\u043d\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u043d\u0430\u043c'],
      features: [
        '\u0412\u0441\u0451 \u0438\u0437 Pro \u043a\u0430\u0436\u0434\u043e\u043c\u0443 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u0443',
        '\u0414\u043e 5 \u0443\u0447\u0430\u0441\u0442\u043d\u0438\u043a\u043e\u0432 \u0432 \u043a\u043e\u043c\u0430\u043d\u0434\u0435',
        '\u041e\u0431\u0449\u0438\u0435 \u043f\u0440\u043e\u0435\u043a\u0442\u044b \u0438 \u0448\u0430\u0431\u043b\u043e\u043d\u044b',
        '\u0421\u0432\u043e\u0439 \u043b\u043e\u0433\u043e\u0442\u0438\u043f \u0438 \u0446\u0432\u0435\u0442\u0430 \u0432 \u044d\u043a\u0441\u043f\u043e\u0440\u0442\u0435',
        '\u0415\u0434\u0438\u043d\u044b\u0439 \u0441\u0447\u0451\u0442 \u043d\u0430 \u043a\u043e\u043c\u0430\u043d\u0434\u0443',
        '\u0421\u0432\u044f\u0437\u044c \u0432 Telegram: ' + TELEGRAM_NAME
      ]
    }
  ];

  var TICK = /^\s*[\u2713\u2714\u2022]/;

  function readToken() {
    try {
      for (var i = 0; i < TOKEN_KEYS.length; i++) {
        var value = localStorage.getItem(TOKEN_KEYS[i]);
        if (value && value.length > 10) return value;
      }
    } catch (e) {}
    return '';
  }

  function headers() {
    var out = { 'Content-Type': 'application/json' };
    var token = readToken();
    if (token) out.Authorization = 'Bearer ' + token;
    return out;
  }

  function textOf(el) {
    return (el.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function tickItems(root) {
    var all = root.querySelectorAll('*');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      var el = all[i];
      if (!TICK.test(textOf(el))) continue;
      var nested = el.querySelectorAll('*');
      var hasInner = false;
      for (var j = 0; j < nested.length; j++) {
        if (TICK.test(textOf(nested[j]))) { hasInner = true; break; }
      }
      if (!hasInner) out.push(el);
    }
    return out;
  }

  function findButtons(names) {
    var nodes = document.querySelectorAll('button, a, [role="button"], .btn, input[type="button"]');
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var label = textOf(nodes[i]).toLowerCase();
      if (!label) continue;
      for (var j = 0; j < names.length; j++) {
        if (label === names[j]) { out.push(nodes[i]); break; }
      }
    }
    return out;
  }

  function cardOf(button) {
    var el = button;
    for (var i = 0; i < 8 && el; i++) {
      el = el.parentElement;
      if (!el) break;
      if (tickItems(el).length >= 2) return el;
    }
    return null;
  }

  function setItemText(el, text) {
    el.textContent = text;
  }

  function applyFeatures(card, features) {
    var items = tickItems(card);
    if (!items.length) return false;
    var match = textOf(items[0]).match(/^\s*[\u2713\u2714\u2022]\s*/);
    var tick = match ? match[0].trim() + ' ' : '\u2713 ';
    var last = items[items.length - 1];
    for (var i = 0; i < features.length; i++) {
      if (i < items.length) {
        setItemText(items[i], tick + features[i]);
        items[i].style.display = '';
      } else {
        var clone = last.cloneNode(true);
        setItemText(clone, tick + features[i]);
        last.parentNode.appendChild(clone);
        items.push(clone);
      }
    }
    for (var k = features.length; k < items.length; k++) items[k].style.display = 'none';
    return true;
  }

  function clearNotes(except) {
    var boxes = document.querySelectorAll('[data-dl-plan-note]');
    for (var i = 0; i < boxes.length; i++) {
      if (except && boxes[i] === except) continue;
      boxes[i].textContent = '';
    }
  }

  function noteBox(card) {
    var box = card.querySelector('[data-dl-plan-note]');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-dl-plan-note', '1');
      box.style.cssText = 'margin-top:10px;font-size:12px;line-height:1.4;opacity:.85;';
      card.appendChild(box);
    }
    return box;
  }

  function note(card, text, tone) {
    var box = noteBox(card);
    clearNotes(box);
    box.style.color = tone === 'error' ? '#ff8080' : '#8fe08f';
    box.textContent = text;
  }

  /* Team — живая ссылка, а не сообщение «напиши нам». */
  function contactLink(card) {
    var box = card.querySelector('[data-dl-plan-contact]');
    if (box) return box;
    box = document.createElement('div');
    box.setAttribute('data-dl-plan-contact', '1');
    box.style.cssText = 'margin-top:10px;font-size:13px;line-height:1.5;';

    var link = document.createElement('a');
    link.href = TELEGRAM;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = '\u041d\u0430\u043f\u0438\u0441\u0430\u0442\u044c \u0432 Telegram ' + TELEGRAM_NAME;
    link.style.cssText = 'color:#8fd0ff;text-decoration:underline;font-weight:600;';
    box.appendChild(link);
    card.appendChild(box);
    return box;
  }

  function contact(card) {
    contactLink(card);
    note(card, '\u041d\u0430\u043f\u0438\u0448\u0438 \u0432 Telegram ' + TELEGRAM_NAME +
      ' \u2014 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0438\u043c \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u044b\u0439 \u0442\u0430\u0440\u0438\u0444 \u0432\u0440\u0443\u0447\u043d\u0443\u044e.');
    try { window.open(TELEGRAM, '_blank', 'noopener'); } catch (e) { location.href = TELEGRAM; }
  }

  /* Действующий тариф: рамка вокруг карточки и неактивная кнопка. */
  function markActive() {
    var cards = document.querySelectorAll('[data-dl-plan]');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var active = card.getAttribute('data-dl-plan') === currentPlan;
      if (active) {
        if (!card.getAttribute('data-dl-plan-outline')) {
          card.setAttribute('data-dl-plan-outline', card.style.outline || 'none');
        }
        card.style.outline = '1px solid rgba(143,224,143,.7)';
        card.style.outlineOffset = '2px';
      } else if (card.getAttribute('data-dl-plan-outline')) {
        var saved = card.getAttribute('data-dl-plan-outline');
        card.style.outline = saved === 'none' ? '' : saved;
      }
      var buttons = card.querySelectorAll('[data-dl-plan-button]');
      for (var b = 0; b < buttons.length; b++) {
        var button = buttons[b];
        if (!button.getAttribute('data-dl-plan-label')) {
          button.setAttribute('data-dl-plan-label', textOf(button));
        }
        if (active) {
          button.textContent = '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0442\u0430\u0440\u0438\u0444';
          button.setAttribute('aria-disabled', 'true');
          button.style.opacity = '.55';
          button.style.cursor = 'default';
        } else {
          button.textContent = button.getAttribute('data-dl-plan-label');
          button.removeAttribute('aria-disabled');
          button.style.opacity = '';
          button.style.cursor = '';
        }
      }
    }
  }

  function subscribe(planId, card, button) {
    if (planId === currentPlan) {
      note(card, '\u042d\u0442\u043e\u0442 \u0442\u0430\u0440\u0438\u0444 \u0443\u0436\u0435 \u0434\u0435\u0439\u0441\u0442\u0432\u0443\u0435\u0442.');
      return;
    }
    if (planId === 'team') { contact(card); return; }
    var original = button.getAttribute('data-dl-plan-label') || textOf(button);
    button.textContent = '\u041e\u0444\u043e\u0440\u043c\u043b\u044f\u0435\u043c\u2026';
    fetch('/api/plan/subscribe', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ plan: planId })
    })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          return { status: response.status, data: data };
        });
      })
      .then(function (result) {
        button.textContent = original;
        if (result.status === 401) {
          note(card, '\u0421\u043d\u0430\u0447\u0430\u043b\u0430 \u0432\u043e\u0439\u0434\u0438 \u0432 \u0430\u043a\u043a\u0430\u0443\u043d\u0442.', 'error');
          return;
        }
        if (result.status >= 400) {
          note(card, result.data.detail || ('\u041e\u0448\u0438\u0431\u043a\u0430 ' + result.status), 'error');
          return;
        }
        var limit = result.data.limit;
        note(card, '\u0413\u043e\u0442\u043e\u0432\u043e: \u0442\u0430\u0440\u0438\u0444 ' + (result.data.title || planId) +
          (limit ? ', \u043b\u0438\u043c\u0438\u0442 ' + limit + ' \u0432 \u0441\u0443\u0442\u043a\u0438' : ', \u0431\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u0430') + '.');
        currentPlan = result.data.plan || planId;
        markActive();
        showCurrent();
      })
      .catch(function (error) {
        button.textContent = original;
        note(card, '\u0421\u0435\u0442\u044c \u043d\u0435\u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0430: ' + error, 'error');
      });
  }

  function showCurrent() {
    fetch('/api/plan', { headers: headers() })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data) return;
        currentPlan = data.plan || '';
        var nodes = document.querySelectorAll('[data-dl-plan-current]');
        var text = '\u0422\u0435\u043a\u0443\u0449\u0438\u0439 \u0442\u0430\u0440\u0438\u0444: ' + (data.title || data.plan) +
          (data.limit ? ' \u2014 \u0441\u0435\u0433\u043e\u0434\u043d\u044f ' + data.used + ' \u0438\u0437 ' + data.limit : ' \u2014 \u0431\u0435\u0437 \u043b\u0438\u043c\u0438\u0442\u0430');
        for (var i = 0; i < nodes.length; i++) nodes[i].textContent = text;
        markActive();
      })
      .catch(function () {});
  }

  function badge(card) {
    if (card.querySelector('[data-dl-plan-current]')) return;
    var line = document.createElement('div');
    line.setAttribute('data-dl-plan-current', '1');
    line.style.cssText = 'margin-top:8px;font-size:12px;opacity:.6;';
    card.appendChild(line);
  }

  function patch() {
    var done = 0;
    for (var i = 0; i < PLANS.length; i++) {
      var plan = PLANS[i];
      var buttons = findButtons(plan.buttons);
      for (var b = 0; b < buttons.length; b++) {
        var button = buttons[b];
        if (button.getAttribute('data-dl-plan-button')) { done++; continue; }
        var card = cardOf(button);
        if (!card) continue;
        if (card.getAttribute('data-dl-plan') !== plan.id) {
          if (!applyFeatures(card, plan.features)) continue;
          card.setAttribute('data-dl-plan', plan.id);
          badge(card);
        }
        if (plan.id === 'team') contactLink(card);
        button.setAttribute('data-dl-plan-button', plan.id);
        button.setAttribute('data-dl-plan-label', textOf(button));
        (function (planId, cardEl, buttonEl) {
          buttonEl.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();
            subscribe(planId, cardEl, buttonEl);
          }, true);
        })(plan.id, card, button);
        done++;
      }
    }
    if (done) {
      markActive();
      if (!currentPlan) showCurrent();
    }
    return done;
  }

  function start() {
    patch();
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      patch();
      if (tries > 40) clearInterval(timer);
    }, 700);
    if (window.MutationObserver) {
      var pending = null;
      new MutationObserver(function () {
        if (pending) return;
        pending = setTimeout(function () { pending = null; patch(); }, 300);
      }).observe(document.documentElement, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
