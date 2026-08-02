/* ============================================================================
   Design Lab — десктопный рунтайм. Подключается ПОСЛЕДНИМ из скриптов.

   Зачем нужен:
   1. Ставит метку html.dl-desktop — её ждёт dl-desktop-chat.css, чтобы вернуть
      фоновые анимации на компьютере.
   2. Снимает мобильные метки (dl-phone, dl-lowfx), если их ошибочно поставил
      один из ранних патчей: именно эти метки глушат всё движение.
   3. Возвращает в DOM фоновые слои, если killMotion() из dl-mobile.js успел их
      удалить до того, как окно растянули до десктопной ширины.
   4. Снимает инлайновые style.animation='none', которые тот же killMotion() проставил
      на узлы — инлайн бьёт любой внешний CSS, кроме !important.
   5. Держит высоту поля ввода в чате в согласии с текстом.
   ========================================================================= */
(function () {
	'use strict';
	if (window.__dlDesktopChat) return;
	window.__dlDesktopChat = true;

	var root = document.documentElement;

	/* Компьютер = есть мышь и экран не телефонной ширины.
	   Ширина одна без указателя не годится: планшет в альбоме шире ноутбука. */
	function isDesktop() {
		if (!window.matchMedia) return true;
		return matchMedia('(hover:hover) and (pointer:fine)').matches &&
			!matchMedia('(max-width:900px)').matches;
	}

	function reduced() {
		return !!(window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches);
	}

	/* --- 1. Метка и чистка мобильных меток. ------------------------------ */
	function syncFlags() {
		var desktop = isDesktop();
		root.classList.toggle('dl-desktop', desktop);
		if (desktop) {
			/* На компьютере этим меткам делать нечего: каждая из них вешает
			   свой набор `animation:none !important`. */
			root.classList.remove('dl-phone');
			root.classList.remove('dl-touch');
			if (!reduced()) root.classList.remove('dl-lowfx');
		}
		return desktop;
	}

	/* --- 2. Восстановление фоновых слоёв. ------------------------------- */
	/* Разметка взята из index.html: .bg-fx собирается статично, поэтому её
	   безопасно воссоздать один в один. Звёзды досыпает скрипт index.html. */
	var LAYERS = [
		{ sel: '.scanline', html: '<div class="scanline"></div>' },
		{ sel: '.noise', html: '<div class="noise"></div>' },
		{ sel: '.stars', html: '<div class="stars" id="stars"></div>' },
		{
			sel: '.comets',
			html: '<div class="comets"><i></i><i></i><i></i></div>'
		}
	];

	function restoreLayers() {
		var fx = document.querySelector('.bg-fx');
		if (!fx) return;
		LAYERS.forEach(function (l) {
			if (fx.querySelector(l.sel)) return;
			var t = document.createElement('template');
			t.innerHTML = l.html;
			fx.appendChild(t.content.firstChild);
		});
		/* Звёзды: если контейнер пересоздан пустым, насыпаем точки сами. */
		var stars = fx.querySelector('.stars');
		if (stars && !stars.children.length && !reduced()) {
			var frag = document.createDocumentFragment();
			for (var i = 0; i < 42; i++) {
				var s = document.createElement('div');
				var size = (Math.random() * 1.6 + 1).toFixed(2);
				s.className = 'st';
				s.style.cssText =
					'left:' + (Math.random() * 100).toFixed(2) + '%;' +
					'top:' + (Math.random() * 100).toFixed(2) + '%;' +
					'width:' + size + 'px;height:' + size + 'px;' +
					'animation-duration:' + (Math.random() * 4 + 3).toFixed(2) + 's,' +
					(Math.random() * 8 + 8).toFixed(2) + 's;' +
					'animation-delay:' + (Math.random() * 6).toFixed(2) + 's,' +
					(Math.random() * 6).toFixed(2) + 's';
				frag.appendChild(s);
			}
			stars.appendChild(frag);
		}
	}

	/* --- 3. Снятие инлайновых глушителей. ------------------------------ */
	function unmuteInline() {
		var nodes = document.querySelectorAll('.bg-fx [style*="animation"]');
		for (var i = 0; i < nodes.length; i++) {
			var st = nodes[i].style;
			if (st.animation === 'none' || st.animationName === 'none') {
				st.removeProperty('animation');
				st.removeProperty('animation-name');
				st.removeProperty('animation-play-state');
			}
		}
	}

	function reviveMotion() {
		if (!root.classList.contains('dl-desktop') || reduced()) return;
		restoreLayers();
		unmuteInline();
	}

	/* --- 4. Автовысота поля ввода. ---------------------------------- */
	/* В index.html есть autoGrow(), но он не вызывается при вставке текста мышью
	   и при изменении ширины колонки делителем — поле оставалось с чужой высотой
	   и строка кнопок под ним выглядела съехавшей. */
	function fitInput() {
		var ta = document.getElementById('chatInput');
		if (!ta || !root.classList.contains('dl-desktop')) return;
		ta.style.height = 'auto';
		ta.style.height = Math.min(ta.scrollHeight, 168) + 'px';
		ta.style.overflowY = ta.scrollHeight > 168 ? 'auto' : 'hidden';
	}

	function bindInput() {
		var ta = document.getElementById('chatInput');
		if (!ta || ta.__dlFit) return;
		ta.__dlFit = true;
		['input', 'change', 'paste', 'cut', 'focus'].forEach(function (ev) {
			ta.addEventListener(ev, function () { setTimeout(fitInput, 0); }, { passive: true });
		});
		fitInput();
	}

	/* --- 5. Запуск и поддержание. ----------------------------------- */
	function run() {
		syncFlags();
		reviveMotion();
		bindInput();
	}

	syncFlags();

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', run, { once: true });
	} else {
		run();
	}
	/* dl-mobile.js вызывает killMotion() также после загрузки — проходим следом. */
	window.addEventListener('load', run, { once: true });
	setTimeout(run, 400);

	var t = null;
	window.addEventListener('resize', function () {
		clearTimeout(t);
		t = setTimeout(function () { run(); fitInput(); }, 150);
	}, { passive: true });

	/* Размер колонки меняется делителем, а не окном — следим отдельно. */
	if (window.ResizeObserver) {
		var ro = new ResizeObserver(function () { fitInput(); });
		var attach = function () {
			var chat = document.querySelector('.editor .chat');
			if (chat) ro.observe(chat);
		};
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', attach, { once: true });
		} else {
			attach();
		}
	}

	window.dlFitChatInput = fitInput;
})();
