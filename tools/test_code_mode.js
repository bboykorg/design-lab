/* Тесты режима DL Code: размеры кнопок тулбара и шрифты хрома. */
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8899/__test_code.html';

const res = [];
function check(n, p, d) { res.push({ n, p, d }); console.log(`${p ? '  \u2713' : '  \u2717'} ${n}${d ? ' — ' + d : ''}`); }

(async () => {
  const b = await chromium.launch({
    executablePath: '/usr/local/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  for (const vp of [{ n: 'desktop', w: 1440, h: 900 }, { n: 'phone', w: 390, h: 844 }]) {
    const ctx = await b.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: vp.w < 700, hasTouch: vp.w < 700 });
    const p = await ctx.newPage();
    await p.goto(URL, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    console.log(`\n── DL Code · ${vp.n} (${vp.w}×${vp.h}) ──`);

    /* 1. Все кнопки тулбара одной высоты — Деплой больше не выбивается */
    const hs = await p.evaluate(() => {
      const o = {};
      document.querySelectorAll('.di-title-r .di-btn').forEach((e) => {
        o[e.id] = Math.round(e.getBoundingClientRect().height * 10) / 10;
      });
      return o;
    });
    const vals = [...new Set(Object.values(hs))];
    check(`[${vp.n}] все кнопки тулбара одной высоты`, vals.length === 1, JSON.stringify(hs));

    const deploy = await p.evaluate(() => {
      const d = document.getElementById('diDeploy').getBoundingClientRect();
      const o = document.getElementById('bBoard').getBoundingClientRect();
      return { dh: d.height, oh: o.height, dw: d.width, ow: o.width };
    });
    check(`[${vp.n}] "Деплой" не выше соседних`,
      Math.abs(deploy.dh - deploy.oh) < 0.6, `${deploy.dh} vs ${deploy.oh}`);

    /* 2. Нет серой ступеньки под chrome-кнопкой */
    const ledge = await p.evaluate(() => {
      const e = document.getElementById('diDeploy');
      const bf = getComputedStyle(e, '::before');
      return { content: bf.content, display: bf.display, ov: getComputedStyle(e).overflow };
    });
    check(`[${vp.n}] нет ступеньки под "Деплой"`,
      ledge.content === 'none' && ledge.ov === 'hidden', JSON.stringify(ledge));

    /* 3. Шрифты: UI-хром — Manrope, код — mono */
    const fonts = await p.evaluate(() => {
      const f = (s) => {
        const e = document.querySelector(s);
        return e ? getComputedStyle(e).fontFamily : null;
      };
      return {
        sideH: f('.di-side-h'), tab: f('.di-tab'), sres: f('.di-sres'),
        crumbs: f('.di-crumbs'), code: f('.di-code pre'),
      };
    });
    ['sideH', 'tab', 'sres', 'crumbs'].forEach((k) => {
      check(`[${vp.n}] ${k}: читаемый шрифт`,
        /Manrope/i.test(fonts[k]) && !/JetBrains|mono/i.test(fonts[k]), fonts[k]);
    });
    check(`[${vp.n}] код остался моноширинным`,
      /JetBrains|mono/i.test(fonts.code), fonts.code);

    /* 4. Сайдбар и тулбар не выезжают за экран */
    const of = await p.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const bad = [];
      document.querySelectorAll('body *').forEach((e) => {
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.position === 'fixed') return;
        const r = e.getBoundingClientRect();
        if (r.width && r.right > vw + 1) bad.push(String(e.className).split(' ')[0] + '=' + Math.round(r.right));
      });
      return { sw: document.documentElement.scrollWidth, vw, bad: [...new Set(bad)].slice(0, 6) };
    });
    check(`[${vp.n}] нет горизонтального выезда`,
      of.sw <= of.vw + 1 && of.bad.length === 0, `sw=${of.sw}/${of.vw} ${of.bad.join(',')}`);

    await p.screenshot({ path: `/data/shots/code-${vp.n}.png` });
    await ctx.close();
  }

  await b.close();
  const f = res.filter((r) => !r.p);
  console.log(`\n═══ DL Code: ${res.length - f.length}/${res.length} пройдено ═══`);
  f.forEach((x) => console.log('  ✗ ' + x.n + ' — ' + x.d));
  process.exit(f.length ? 1 : 0);
})();
