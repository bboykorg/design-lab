/* Design Lab - nastoyashchiy chat-kompozer na telefone.

   PROBLEMA (zamer DOM na 390x844 do pravki):
     <div .prompt-row>
       <button #heroAttachBtn>          [28,482 44x44]
       <button #heroModelPill>          [80,482 169x44]
       <div .prompt-actions>            [28,534 334x98]
         <button .btn-grad>Vybrat shablon</button>  [28,534 334x44]
         <button #heroSendBtn>          [318,588 44x44]

   Knopka otpravki lezhit VNUTRI .prompt-actions, a tot na uzkom ekrane
   stanovitsya kolonkoy (dl-fix.css, @media max-width:620px:
   .prompt-actions{flex-direction:column} + #heroSendBtn{align-self:flex-end}).
   Itog: otpravka uezzhaet POD shirokuyu knopku "Vybrat shablon" i visit
   v pustote v pravom nizhnem uglu. Na chat eto ne pohozhe voobshche.

   RESHENIE - kanonicheskaya raskladka messendzhera:

     +-------------------------------------+
     |  pole vvoda (rastet pod tekst)      |
     |                                     |
     |  [+] [model v]                ( ^ ) |   <- odna stroka
     +-------------------------------------+
     |        Vybrat shablon ->            |   <- otdelnyy vtoroy put
     +-------------------------------------+

   Otpravka stoit tam, gde ee ishchet bolshoy palets - sprava na odnoy linii
   s instrumentami. "Vybrat shablon" - alternativnyy stsenariy, a ne konkurent
   otpravki, poetomu u nego svoya stroka i svoy ves.

   Perestanovka delaetsya v DOM, a ne tolko v CSS: order/grid ne spasayut,
   potomu chto send i shablon lezhat v odnom roditele, a nuzhny v raznyh
   strokah. Semantika i poryadok chteniya pri etom sovpadayut s vizualnym. */
(function () {
  'use strict';
  if (window.__dlChatMobile) return;
  window.__dlChatMobile = true;

  var EASE = 'cubic-bezier(.22,1,.36,1)';

  function isPhone() {
    return window.matchMedia('(max-width:900px)').matches;
  }

  /* --- 1. Peresborka geroy-kompozera. --- */
  function build() {
    var box = document.querySelector('.prompt-box');
    if (!box) return false;

    var row = box.querySelector('.prompt-row');
    var actions = box.querySelector('.prompt-actions');
    var send = document.getElementById('heroSendBtn');
    var attach = document.getElementById('heroAttachBtn');
    var pill = document.getElementById('heroModelPill');
    if (!row || !send) return false;

    var bar = box.querySelector('.dl-cmp-bar');
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'dl-cmp-bar';
      var t = document.createElement('div');
      t.className = 'dl-cmp-tools';
      bar.appendChild(t);
      row.insertBefore(bar, row.firstChild);
    }

    var tools = bar.querySelector('.dl-cmp-tools');

    // Instrumenty sleva, otpravka - posledniy rebenok stroki (prizhata vpravo).
    if (attach && attach.parentElement !== tools) tools.appendChild(attach);
    if (pill && pill.parentElement !== tools) tools.appendChild(pill);
    if (send.parentElement !== bar || bar.lastElementChild !== send) bar.appendChild(send);

    // V .prompt-actions ostaetsya tolko alternativnoe deystvie.
    if (actions) {
      actions.classList.add('dl-cmp-alt');
      if (actions.parentElement === row && row.lastElementChild !== actions) row.appendChild(actions);
    }

    box.classList.add('dl-cmp');
    return true;
  }

  /* --- 2. Pole vvoda rastet pod tekst, kak v lyubom messendzhere. ---
     Fiksirovannye 80px - eto libo pustota pri odnoy stroke, libo vnutrenniy
     skroll pri dlinnom opisanii. Potolok stavim po 40% vysoty ekrana, chtoby
     klaviatura i stroka deystviy vsegda ostavalis vidny. */
  function autoGrow(ta) {
    if (!ta) return;
    var min = 56;
    var max = Math.max(120, Math.round(window.innerHeight * 0.4));
    ta.style.height = 'auto';
    ta.style.height = Math.max(min, Math.min(max, ta.scrollHeight)) + 'px';
    ta.style.overflowY = ta.scrollHeight > max ? 'auto' : 'hidden';
  }

  function toggleSend(ta) {
    var send = document.getElementById('heroSendBtn');
    if (!send) return;
    send.classList.toggle('is-ready', !!(ta && ta.value.trim()));
  }

  function wireGrow() {
    var ta = document.getElementById('heroPrompt');
    if (!ta || ta.dataset.dlGrow) return;
    ta.dataset.dlGrow = '1';

    function sync() {
      if (isPhone()) {
        autoGrow(ta);
      } else {
        ta.style.height = '';
        ta.style.overflowY = '';
      }
      toggleSend(ta);
    }

    ta.addEventListener('input', sync);
    window.addEventListener('resize', sync, { passive: true });

    /* Enter otpravlyaet tolko na fizicheskoy klaviature. Na telefone Enter -
       eto perenos stroki, inache nevozmozhno nabrat mnogostrochnoe opisanie. */
    ta.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (window.matchMedia('(pointer:coarse)').matches) return;
      var send = document.getElementById('heroSendBtn');
      if (send && !send.disabled) {
        e.preventDefault();
        send.click();
      }
    });

    sync();
  }

  /* --- 3. Podpisi dlya skrinriderov. --- */
  function label() {
    var map = [
      ['heroSendBtn', 'Otpravit opisanie'],
      ['heroAttachBtn', 'Prikrepit HTML-fayl']
    ];
    for (var i = 0; i < map.length; i++) {
      var el = document.getElementById(map[i][0]);
      if (el && !el.getAttribute('aria-label')) el.setAttribute('aria-label', map[i][1]);
    }
    var ta = document.getElementById('heroPrompt');
    if (ta && !ta.getAttribute('aria-label')) ta.setAttribute('aria-label', 'Opisanie sayta');
  }

  function run() {
    var ok = build();
    wireGrow();
    label();
    toggleSend(document.getElementById('heroPrompt'));
    return ok;
  }

  function boot() {
    run();
    /* Kompozer trogayut eshche neskolko patchey (dl-fix.js normalizeSend,
       models-patch.js). Oni mogut vernut knopku na mesto, poetomu sledim za
       perestanovkami, a ne delaem odin prohod. */
    var box = document.querySelector('.prompt-box');
    if (box && window.MutationObserver) {
      var timer = 0;
      var mo = new MutationObserver(function () {
        clearTimeout(timer);
        timer = setTimeout(run, 40);
      });
      mo.observe(box, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
  window.addEventListener('load', function () { setTimeout(run, 200); });

  window.__dlChatMobileRun = run;
  window.__dlChatEase = EASE;
})();
