# План правок Design Lab v4

## Диагноз

1. **Лаги.** `index.html:279` вешает `isolation:isolate` + `translateZ(0)` + `overflow:hidden` на ~18 селекторов сразу — сотни лишних слоёв компоситора. Плюс `::before` specular-sweep с анимацией на каждом hover, `ctaBreathe 4.4s infinite` на всех CTA, blur-блобы `.bg-fx`, и три обработчика `mousemove` на `document` с `capture:true`, которые дёргают `getBoundingClientRect()` на каждое движение мыши (layout thrashing).
2. **Серый квадрат из «Выбрать шаблон» и «Мои проекты».** `dl-ui-kit.css:62-75` — псевдоэлемент-«ступенька» `.btn-grad::before` с серым градиентом `#61646f -> #3a3c44`, сдвинутый `translate3d(0,.42em,-1em)` при `overflow:visible` на кнопке. Это он и торчит.
3. **Кнопка слишком большая.** `dl-ui-kit.css:45` — `padding:12px 20px; min-height:44px; font-size:14px` перебивает `index.html:141` (`9px 16px`).
4. **«Отправить» сжата.** `#heroSendBtn` — круг 38x38, но получает от ui-kit `padding:12px 20px; min-height:44px`.
5. **Deploy выбивается.** `.di-btn` = 29px высоты, а `.di-btn-chrome` попадает под ui-kit и становится 44px со ступенькой.
6. **Слоп-шрифт.** JetBrains Mono применён не только к коду, но и к UI-хрому: проводник, вкладки, крошки, бейджи, счётчики, заголовки панелей.
7. **Мобилка.** Нет глобальной защиты от горизонтального overflow, есть фиксированные ширины (`.di-side 250px`, `.proj-thumb iframe 1280px`, `#heroModelMenu 310px`).

## Шаги

1. Слой `dl-fix.css` + `dl-fix.js`, подключается последним.
2. Кнопки: убрать ступеньку, единая шкала высот 29 / 36 / 44, белая плоская главная кнопка.
3. Send: круг 36x36, иконка по центру.
4. Тулбар DL Code: `.di-btn`, `.di-btn-chrome`, `.di-btn-danger`, `.di-act`, `.di-st-btn` — одна шкала.
5. Шрифты: mono только внутри кода и терминала, весь UI-хром на Manrope.
6. Перфоманс: снять лишние слои, убрать бесконечные анимации, mousemove через rAF с кэшем rect, отключение тяжёлых эффектов на слабых устройствах.
7. Мобилка: `overflow-x:clip`, `min-width:0` во flex/grid, safe-area, адаптив тулбара и сайдбара.
8. Тесты после каждого шага + общий прогон (Playwright, 5 вьюпортов).
