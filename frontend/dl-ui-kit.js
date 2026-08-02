/* ============================================================================
   Design Lab — UI Kit 2.0 (поведение)

   Скрипт ничего не ломает в существующей логике: он только добавляет
   разметку и состояния, которые невозможно выразить одним CSS:

     1. Кнопка «назад» — две стрелки в ленте (требует вложенной разметки).
     2. Форма входа — переключатель «Вход / Регистрация», валидация, Enter, глаз.
     3. Мобильное меню — нумерация пунктов и блок действий внизу.
     4. Проводник — глубина узла и иконка папки (дерево рисует чужой код,
        поэтому дорабатываем его через MutationObserver, а не правкой рендера).
     5. Шапка — подсветка активного раздела при скролле.
   ========================================================================= */
(function () {
  'use strict';
  if (window.__dlUiKit) return;
  window.__dlUiKit = true;

  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path></svg>';

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  /* ═══ 1. Кнопка «назад» в шапке редактора ═══
     Лента из двух стрелок: при наведении первая уезжает влево, вторая встаёт
     на её место — читается как движение назад. */
  function upgradeBackButton() {
    var btn = document.querySelector('.chat-head .icon-btn[onclick*="closeEditor"]');
    if (!btn || btn.classList.contains('dl-back')) return;
    btn.classList.add('dl-back');
    btn.setAttribute('aria-label', 'Назад к шаблонам');
    btn.innerHTML =
      '<span class="dl-back-box">' +
      '<span class="dl-back-el">' + ARROW + '</span>' +
      '<span class="dl-back-el">' + ARROW + '</span>' +
      '</span>';
  }

  /* ═══ 2. Вход / регистрация ═══
     Логика до мелочей:
     • одна кнопка-действие, режим выбирается табами;
     • в регистрации появляется повтор пароля — иначе опечатка в пароле
       закрывает человеку доступ навсегда (восстановления почтой нет);
     • проверки повторяют ограничения бэкенда (логин 3–40, пароль от 6);
     • Enter отправляет форму, ошибка показывается в форме, а не только в тосте;
     • кнопка блокируется на время запроса — нет двойных регистраций. */
  var ICON_USER = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm0 1.5c-2.67 0-5 1.34-5 3v.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V12.5c0-1.66-2.33-3-5-3z"></path></svg>';
  var ICON_LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1a2 2 0 0 1 2 2v4H6V3a2 2 0 0 1 2-2zm3 6V3a3 3 0 0 0-6 0v4a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"></path></svg>';
  var ICON_EYE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/></svg>';

  function field(id, type, placeholder, icon, autocomplete) {
    return '<label class="dl-af-field" data-for="' + id + '">' + icon +
      '<input id="' + id + '" type="' + type + '" placeholder="' + placeholder +
      '" autocomplete="' + autocomplete + '" spellcheck="false">' +
      (type === 'password' ? '<button type="button" class="dl-af-eye" aria-label="Показать пароль">' + ICON_EYE + '</button>' : '') +
      '</label>';
  }

  function installAuth() {
    if (typeof window.openAuth !== 'function') return;

    window.openAuth = function (mode) {
      var modal = document.getElementById('modal');
      var form = document.getElementById('mdForm');
      var okBtn = document.getElementById('mdBtn');
      if (!modal || !form) return;

      var state = { mode: mode === 'register' ? 'register' : 'login', busy: false };

      document.getElementById('mdTitle').textContent = 'Вход в Design Lab';
      document.getElementById('mdText').textContent =
        'Сохраняй проекты, историю правок и доступ к моделям с любого устройства.';
      if (okBtn) okBtn.style.display = 'none';

      form.style.display = 'block';
      form.innerHTML =
        '<div class="dl-af">' +
          '<div class="dl-af-tabs" role="tablist">' +
            '<button type="button" role="tab" data-mode="login">Вход</button>' +
            '<button type="button" role="tab" data-mode="register">Регистрация</button>' +
          '</div>' +
          field('authUser', 'text', 'Логин', ICON_USER, 'username') +
          field('authPass', 'password', 'Пароль', ICON_LOCK, 'current-password') +
          '<div id="dlAfRepeatWrap" hidden>' +
            field('authPass2', 'password', 'Повторите пароль', ICON_LOCK, 'new-password') +
          '</div>' +
          '<div class="dl-af-hint" id="dlAfHint"></div>' +
          '<button type="button" class="btn-grad dl-af-submit" id="dlAfSubmit">Войти</button>' +
          '<button type="button" class="dl-af-alt" id="dlAfAlt">Нет аккаунта? Создать за 30 секунд</button>' +
          '<div class="dl-auth-or"><span>или</span></div>' +
          '<button class="dl-gh-login" id="ghLoginBtn" type="button">' +
            '<svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>' +
            '<span>Войти через GitHub</span>' +
          '</button>' +
        '</div>';

      var tabs = form.querySelectorAll('.dl-af-tabs button');
      var user = form.querySelector('#authUser');
      var pass = form.querySelector('#authPass');
      var pass2 = form.querySelector('#authPass2');
      var repeat = form.querySelector('#dlAfRepeatWrap');
      var hint = form.querySelector('#dlAfHint');
      var submit = form.querySelector('#dlAfSubmit');
      var alt = form.querySelector('#dlAfAlt');

      function say(text, isError) {
        hint.textContent = text || '';
        hint.classList.toggle('err', !!isError);
      }
      function markError(input, on) {
        var wrap = input && input.closest('.dl-af-field');
        if (wrap) wrap.classList.toggle('err', !!on);
      }

      function render() {
        var reg = state.mode === 'register';
        tabs.forEach(function (t) {
          t.setAttribute('aria-selected', String(t.getAttribute('data-mode') === state.mode));
        });
        repeat.hidden = !reg;
        submit.textContent = reg ? 'Создать аккаунт' : 'Войти';
        alt.textContent = reg ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Создать за 30 секунд';
        pass.setAttribute('autocomplete', reg ? 'new-password' : 'current-password');
        say(reg ? 'Логин — от 3 до 40 символов, пароль — от 6.' : '', false);
        markError(user, false); markError(pass, false); markError(pass2, false);
      }

      tabs.forEach(function (t) {
        t.addEventListener('click', function () {
          state.mode = t.getAttribute('data-mode');
          render();
          user.focus();
        });
      });
      alt.addEventListener('click', function () {
        state.mode = state.mode === 'register' ? 'login' : 'register';
        render();
        user.focus();
      });

      form.querySelectorAll('.dl-af-eye').forEach(function (eye) {
        eye.addEventListener('click', function () {
          var input = eye.parentElement.querySelector('input');
          var show = input.type === 'password';
          input.type = show ? 'text' : 'password';
          eye.setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
          input.focus();
        });
      });

      function validate() {
        var u = (user.value || '').trim();
        var p = pass.value || '';
        markError(user, false); markError(pass, false); markError(pass2, false);
        if (u.length < 3 || u.length > 40) {
          markError(user, true); say('Логин должен быть от 3 до 40 символов.', true); user.focus(); return null;
        }
        if (p.length < 6) {
          markError(pass, true); say('Пароль — минимум 6 символов.', true); pass.focus(); return null;
        }
        if (state.mode === 'register' && pass2.value !== p) {
          markError(pass2, true); say('Пароли не совпадают.', true); pass2.focus(); return null;
        }
        return { username: u, password: p };
      }

      async function send() {
        if (state.busy) return;
        var data = validate();
        if (!data) return;
        state.busy = true;
        submit.disabled = true;
        var label = submit.textContent;
        submit.textContent = state.mode === 'register' ? 'Создаю…' : 'Вхожу…';
        say('', false);
        try {
          var r = await fetch('/api/auth/' + (state.mode === 'register' ? 'register' : 'login'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
          });
          if (!r.ok) {
            var detail = '';
            try { detail = (await r.json()).detail || ''; } catch (e) {}
            if (r.status === 401 || r.status === 403) detail = detail || 'Неверный логин или пароль.';
            if (r.status === 409) detail = detail || 'Такой логин уже занят.';
            throw new Error(detail || ('Ошибка сервера (' + r.status + ')'));
          }
          var j = await r.json();
          localStorage.setItem('dl_token', j.token);
          if (typeof window.closeModal === 'function') window.closeModal();
          if (typeof window.refreshAuthUI === 'function') window.refreshAuthUI();
          if (typeof window.toast === 'function') window.toast('Привет, ' + j.username + '!');
        } catch (e) {
          say((e && e.message) || 'Не удалось войти', true);
        } finally {
          state.busy = false;
          submit.disabled = false;
          submit.textContent = label;
        }
      }

      submit.addEventListener('click', send);
      form.querySelectorAll('input').forEach(function (i) {
        i.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
        i.addEventListener('input', function () { markError(i, false); });
      });

      var gh = form.querySelector('#ghLoginBtn');
      if (gh && typeof window.doGithubAuth === 'function') {
        gh.addEventListener('click', function () { window.doGithubAuth(); });
      } else if (gh) {
        gh.remove();
        var or = form.querySelector('.dl-auth-or');
        if (or) or.remove();
      }

      render();
      modal.classList.add('on');
      setTimeout(function () { user.focus(); }, 60);
    };

    /* Кнопка в шапке берёт обработчик из refreshAuthUI — перепривязываем на новый. */
    var authBtn = document.getElementById('authBtn');
    if (authBtn && authBtn.textContent.trim() === 'Войти') authBtn.onclick = function () { window.openAuth(); };
  }

  /* ═══ 3. Мобильное меню: нумерация и действия ═══
     В выдвижном меню были только четыре раздела и ни одного действия:
     чтобы войти, надо было закрыть меню и искать кнопку в шапке. */
  var SHEET_DROP = ['войти', 'начать бесплатно', 'мои проекты', 'новый проект'];

  function closeSheet() {
    var toggle = document.getElementById('dlNavToggle');
    if (toggle && toggle.getAttribute('aria-expanded') === 'true') toggle.click();
  }

  function upgradeSheet() {
    var sheet = document.getElementById('dlNavSheet');
    if (!sheet) return;
    if (sheet.__dlPrune) { sheet.__dlPrune(); return; }
    if (!sheet.querySelector(':scope > button')) return;

    var foot = document.createElement('div');
    foot.className = 'dl-sheet-foot';

    var login = document.createElement('button');
    login.type = 'button';
    login.className = 'btn-line';

    var cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'btn-grad';
    cta.textContent = 'Начать бесплатно';
    cta.addEventListener('click', function () {
      closeSheet();
      setTimeout(function () { if (typeof window.scrollTo2 === 'function') window.scrollTo2('gallery'); }, 120);
    });

    foot.appendChild(login);
    foot.appendChild(cta);
    sheet.appendChild(foot);

    /* Список разделов чужой скрипт пересобирает при каждом открытии и снова
       добавляет туда кнопки шапки. Поэтому чистка идёт повторно, а не один раз. */
    function prune() {
      var top = document.getElementById('authBtn');
      var logged = !!(top && top.title === 'Выйти');
      var kept = [];
      Array.prototype.forEach.call(sheet.querySelectorAll(':scope > button'), function (b) {
        var t = (b.textContent || '').trim().toLowerCase();
        var isAuthDup = SHEET_DROP.indexOf(t) >= 0 || (logged && top && t === top.textContent.trim().toLowerCase());
        if (isAuthDup) { b.remove(); return; }
        kept.push(b);
      });
      kept.forEach(function (b, i) { b.setAttribute('data-i', '0' + (i + 1)); });
      if (sheet.lastElementChild !== foot) sheet.appendChild(foot);

      login.textContent = logged ? ('Выйти — ' + top.textContent.trim()) : 'Войти';
      login.onclick = function () {
        closeSheet();
        setTimeout(function () {
          if (logged && typeof window.authLogout === 'function') window.authLogout();
          else if (typeof window.openAuth === 'function') window.openAuth();
        }, 120);
      };
    }

    sheet.__dlPrune = prune;
    prune();
    new MutationObserver(function () {
      clearTimeout(prune.timer);
      prune.timer = setTimeout(prune, 30);
    }).observe(sheet, { childList: true });
  }

  /* ═══ 4. Проводник: глубина + иконка папки ═══
     Глубина зашита в padding-left (10/26 + depth*14). Считаем её обратно и кладём в
     CSS-переменную — так направляющая линия встаёт точно под родительской папкой. */
  var FOLDER_CLOSED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path></svg>';
  var FOLDER_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"></path><path d="M2 10h20"></path></svg>';

  function decorateTree(root) {
    root.querySelectorAll('.di-node').forEach(function (n) {
      var pad = parseInt(n.style.paddingLeft, 10) || 0;
      var isDir = n.classList.contains('di-dir');
      var depth = Math.max(0, Math.round((pad - (isDir ? 10 : 26)) / 14));
      n.setAttribute('data-depth', String(depth));
      n.style.setProperty('--dl-guide', (depth * 14) + 'px');

      var ico = n.querySelector('.di-dir-ico');
      if (ico) {
        var want = n.classList.contains('open') ? 'open' : 'closed';
        if (ico.getAttribute('data-dl-ico') !== want) {
          ico.setAttribute('data-dl-ico', want);
          ico.innerHTML = want === 'open' ? FOLDER_OPEN : FOLDER_CLOSED;
        }
      }
    });
  }

  function watchTree() {
    var tree = document.getElementById('diTree');
    if (!tree || tree.dataset.dlKit) return;
    tree.dataset.dlKit = '1';
    decorateTree(tree);
    new MutationObserver(function () { decorateTree(tree); }).observe(tree, { childList: true, subtree: true });
  }

  /* ═══ 5. Активный раздел в шапке ═══
     Пилюля без активного состояния — просто рамка. Связываем пункты с секциями. */
  function navSpy() {
    var buttons = Array.prototype.slice.call(document.querySelectorAll('.nav-links button'));
    if (!buttons.length) return;
    var pairs = buttons.map(function (b) {
      var m = /scrollTo2\('([^']+)'\)/.exec(b.getAttribute('onclick') || '');
      return { btn: b, el: m ? document.getElementById(m[1]) : null };
    }).filter(function (p) { return p.el; });
    if (!pairs.length) return;

    var ticking = false;
    function update() {
      ticking = false;
      var line = (window.pageYOffset || 0) + window.innerHeight * 0.32;
      var active = null;
      pairs.forEach(function (p) {
        var top = p.el.getBoundingClientRect().top + (window.pageYOffset || 0);
        if (line >= top - 120) active = p;
      });
      pairs.forEach(function (p) { p.btn.classList.toggle('dl-on', p === active); });
    }
    addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    update();
  }

  function init() {
    upgradeBackButton();
    installAuth();
    upgradeSheet();
    watchTree();
    navSpy();
  }

  ready(function () {
    init();
    /* Часть узлов (меню, дерево, IDE) создаётся позже чужими скриптами — догоняем. */
    var tries = 0;
    var t = setInterval(function () {
      tries++;
      upgradeBackButton(); upgradeSheet(); watchTree();
      if (tries > 40) clearInterval(t);
    }, 400);
    document.addEventListener('click', function () {
      setTimeout(function () { upgradeBackButton(); watchTree(); }, 300);
    }, true);
  });
})();
