/* Автотесты UI после fix-слоя v4.
 * Запуск: node tools/test_ui.js [имя-шага]
 * Ожидает, что статика раздаётся на http://127.0.0.1:8899
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8899/index.html';
const STEP = process.argv[2] || 'all';

const VIEWPORTS = [
  { name: 'phone-390', width: 390, height: 844, mobile: true },
  { name: 'phone-414', width: 414, height: 896, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'laptop-1280', width: 1280, height: 800, mobile: false },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
];

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  \u2713' : '  \u2717'} ${name}${detail ? ' — ' + detail : ''}`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_BIN || '/usr/local/bin/chromium',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 1,
      hasTouch: vp.mobile,
      isMobile: vp.mobile,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));

    await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1200);

    console.log(`\n── ${vp.name} (${vp.width}×${vp.height}) ──`);

    /* ─── ТЕСТ 0: слой вообще применился и нет JS-ошибок ─── */
    const loaded = await page.evaluate(() => ({
      css: !!getComputedStyle(document.documentElement).getPropertyValue('--ctl-h').trim(),
      js: !!window.__dlFixV4,
    }));
    check(`[${vp.name}] dl-fix.css загружен`, loaded.css);
    check(`[${vp.name}] dl-fix.js загружен`, loaded.js);
    check(`[${vp.name}] нет JS-ошибок`, errors.length === 0, errors.slice(0, 2).join(' | '));

    /* ─── ТЕСТ 1: нет серой "ступеньки" под белыми кнопками ─── */
    const ledge = await page.evaluate(() => {
      const sels = ['.btn-solid', '.btn-grad', '.plan .pick.g', '.dl-gh-login', '.di-btn-chrome'];
      let bad = [];
      sels.forEach((s) => {
        document.querySelectorAll(s).forEach((el) => {
          const b = getComputedStyle(el, '::before');
          const a = getComputedStyle(el, '::after');
          if (b.content !== 'none' && b.display !== 'none') bad.push(s + '::before');
          if (a.content !== 'none' && a.display !== 'none') bad.push(s + '::after');
          if (getComputedStyle(el).overflow === 'visible') bad.push(s + ' overflow:visible');
        });
      });
      return [...new Set(bad)];
    });
    check(`[${vp.name}] нет серой ступеньки под кнопками`, ledge.length === 0, ledge.join(', '));

    /* ─── ТЕСТ 2: кнопка не смещается на hover (magnetic pull) ─── */
    if (!vp.mobile) {
      const tpl = await page.$('.prompt-actions .btn-grad, .prompt-actions .btn-solid');
      if (tpl) {
        const before = await tpl.boundingBox();
        await tpl.hover();
        await page.waitForTimeout(400);
        const after = await tpl.boundingBox();
        const drift = Math.abs(after.x - before.x) + Math.abs(after.y - before.y);
        check(`[${vp.name}] кнопка не "плывёт" под курсором`, drift < 1.5, `смещение ${drift.toFixed(2)}px`);
        const t = await tpl.evaluate((e) => getComputedStyle(e).transform);
        check(`[${vp.name}] transform на hover = none`, t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)', t);
        await page.mouse.move(5, 5);
      }
    }

    /* ─── ТЕСТ 3: единая шкала высот кнопок ─── */
    const heights = await page.evaluate(() => {
      const out = {};
      const grab = (sel) => {
        const hs = [...document.querySelectorAll(sel)]
          .filter((e) => e.offsetParent !== null)
          .map((e) => Math.round(e.getBoundingClientRect().height));
        if (hs.length) out[sel] = [...new Set(hs)];
      };
      ['.btn-grad', '.btn-solid', '.btn-line', '.nav-links button', '.di-btn', '.di-btn-chrome'].forEach(grab);
      return out;
    });
    const spread = Object.entries(heights)
      .filter(([, v]) => v.length > 1)
      .map(([k, v]) => `${k}:[${v.join('/')}]`);
    check(`[${vp.name}] кнопки одного класса одной высоты`, spread.length === 0, spread.join(' '));

    /* ─── ТЕСТ 4: кнопка "Отправить" — круг, а не сплющенный овал ─── */
    const send = await page.evaluate(() => {
      const el = document.getElementById('heroSendBtn');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { w: r.width, h: r.height, radius: cs.borderRadius, pad: cs.padding };
    });
    if (send) {
      check(`[${vp.name}] "Отправить" — квадратный бокс`,
        Math.abs(send.w - send.h) < 1.5, `${send.w.toFixed(1)}×${send.h.toFixed(1)}`);
      check(`[${vp.name}] "Отправить" — достаточный размер`,
        send.w >= 34, `${send.w.toFixed(1)}px`);
    }

    /* ─── ТЕСТ 5: шрифты — mono только в коде ─── */
    const mono = await page.evaluate(() => {
      const allow = '.di-code,.di-gut,.di-term-log,.di-term-in,.code-ed,#epLogs,pre,code,.dl-dl,.hl';
      const bad = [];
      document.querySelectorAll('body *').forEach((el) => {
        if (el.offsetParent === null) return;
        const ff = getComputedStyle(el).fontFamily;
        if (!/mono|JetBrains|Consolas|Menlo/i.test(ff)) return;
        if (el.closest(allow)) return;
        bad.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0]);
      });
      return [...new Set(bad)].slice(0, 8);
    });
    check(`[${vp.name}] моноширинный шрифт только в коде`, mono.length === 0, mono.join(', '));

    /* ─── ТЕСТ 6: ничего не выезжает за правый край ─── */
    const of = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const doc = {
        scrollW: document.documentElement.scrollWidth,
        clientW: vw,
      };
      const bad = [];
      document.querySelectorAll('body *').forEach((el) => {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.right > vw + 1) {
          bad.push(el.tagName.toLowerCase() + '.' + String(el.className).split(' ')[0] +
                   ' right=' + Math.round(r.right));
        }
      });
      return { doc, bad: [...new Set(bad)].slice(0, 8) };
    });
    check(`[${vp.name}] нет горизонтального скролла страницы`,
      of.doc.scrollW <= of.doc.clientW + 1, `scrollW=${of.doc.scrollW} vs ${of.doc.clientW}`);
    check(`[${vp.name}] ни один элемент не выходит за поля`,
      of.bad.length === 0, of.bad.join(' | '));

    /* ─── ТЕСТ 7: производительность — стоимость движения мыши ─── */
    if (!vp.mobile) {
      const cost = await page.evaluate(async () => {
        const t0 = performance.now();
        for (let i = 0; i < 60; i++) {
          document.dispatchEvent(new MouseEvent('mousemove', {
            clientX: 200 + i * 5, clientY: 300 + (i % 20), bubbles: true,
          }));
        }
        // заставляем браузер считать layout, если он был инвалидирован
        void document.body.offsetHeight;
        return performance.now() - t0;
      });
      check(`[${vp.name}] 60 движений мыши < 60мс`, cost < 60, `${cost.toFixed(1)}мс`);

      const layers = await page.evaluate(() => {
        let n = 0;
        document.querySelectorAll('body *').forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.willChange !== 'auto' || cs.isolation === 'isolate') n++;
        });
        return n;
      });
      check(`[${vp.name}] мало принудительных слоёв (<40)`, layers < 40, `${layers} шт`);
    }

    /* ─── ТЕСТ 8: тап-зоны на таче ─── */
    if (vp.mobile) {
      const small = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('button, a[role=button], .btn-grad, .btn-line, .di-btn').forEach((el) => {
          if (el.offsetParent === null) return;
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.height < 28) {
            bad.push(String(el.className).split(' ')[0] + ' h=' + Math.round(r.height));
          }
        });
        return [...new Set(bad)].slice(0, 6);
      });
      check(`[${vp.name}] нет крошечных тап-зон`, small.length === 0, small.join(', '));
    }

    await page.screenshot({ path: `/data/shots/${STEP}-${vp.name}.png`, fullPage: false });
    await ctx.close();
  }

  await browser.close();

  const failed = results.filter((r) => !r.pass);
  console.log(`\n═══ ИТОГ: ${results.length - failed.length}/${results.length} пройдено ═══`);
  if (failed.length) {
    console.log('НЕ ПРОШЛИ:');
    failed.forEach((f) => console.log('  ✗ ' + f.name + (f.detail ? ' — ' + f.detail : '')));
  }
  process.exit(failed.length ? 1 : 0);
})();
