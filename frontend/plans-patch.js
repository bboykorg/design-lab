/* Design Lab — тарифы.
 * index.html огромный, поэтому карточки переписываются уже в браузере:
 * — списки возможностей берутся из этого файла;
 * — кнопка сразу оформляет тариф через /api/plan/subscribe (без оплаты, для проверки);
 * — действующий тариф подсвечен, его кнопка неактивна.
 */
(function () {
  if (window.__dlPlansPatched) return;
  window.__dlPlansPatched = true;

  var TOKEN_KEYS = ['dl_auth_token', 'dl_token', 'auth_token', 'token', 'dlToken'];
  var currentPlan = '';

  var PLANS = [
    {
      id: 'free',
      buttons: ['начать', 'попробовать', 'выбрать free'],
      features: [
        '5 генераций в день',
        'Модели gpt-oss 120b, gemma3, glm 4.7, nemotron',
        'Все 98 шаблонов',
        'Правки страницы в чате',
        'Экспорт HTML одним файлом'
      ]
    },
    {
      id: 'pro',
      buttons: ['оформить pro', 'купить pro', 'перейти на pro'],
      features: [
        'Без лимита генераций',
        'Все модели, включая самые сильные',
        'Создание сайта с нуля по описанию',
        'Скриншот как задание: модель читает картинку',
        'Очередь без ожидания',
        'История проектов без ограничений'
      ]
    },
    {
      id: 'team',
      buttons: ['связаться', 'оформить team', 'написать нам'],
      features: [
        'Всё из Pro каждому участнику',
        'До 5 участников в команде',
        'Общие проекты и шаблоны',
        'Свой логотип и цвета в экспорте',
        'Единый счёт на команду'
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

  function note(card, text, tone) {
    var box = card.querySelector('[data-dl-plan-note]');
    if (!box) {
      box = document.createElement('div');
      box.setAttribute('data-dl-plan-note', '1');
      box.style.cssText = 'margin-top:10px;font-size:12px;line-height:1.4;opacity:.85;';
      card.appendChild(box);
    }
    clearNotes(box);
    box.style.color = tone === 'error' ? '#ff8080' : '#8fe08f';
    box.textContent = text;
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
          note(card, 'Сначала войди в аккаунт.', 'error');
          return;
        }
        if (result.status >= 400) {
          note(card, result.data.detail || ('Ошибка ' + result.status), 'error');
          return;
        }
        var limit = result.data.limit;
        note(card, 'Готово: тариф ' + (result.data.title || planId) +
          (limit ? ', лимит ' + limit + ' в сутки' : ', без лимита') + '.');
        currentPlan = result.data.plan || planId;
        markActive();
        showCurrent();
      })
      .catch(function (error) {
        button.textContent = original;
        note(card, 'Сеть недоступна: ' + error, 'error');
      });
  }

  function showCurrent() {
    fetch('/api/plan', { headers: headers() })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (data) {
        if (!data) return;
        currentPlan = data.plan || '';
        var nodes = document.querySelectorAll('[data-dl-plan-current]');
        var text = 'Текущий тариф: ' + (data.title || data.plan) +
          (data.limit ? ' — сегодня ' + data.used + ' из ' + data.limit : ' — без лимита');
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
