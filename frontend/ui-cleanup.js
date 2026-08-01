/* Небольшие визуальные исправления поверх большого index.html. */
(function () {
  var style = document.createElement('style');
  style.textContent =
    '[data-dl-plan-current]{display:none!important}' +
    '[data-dl-hidden-feature]{display:none!important}';
  (document.head || document.documentElement).appendChild(style);

  function textOf(node) {
    return (node.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function replaceExact(from, to) {
    var nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,div,strong,b');
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (textOf(node) !== from) continue;

      // Меняем самый глубокий элемент, чтобы не стереть иконку или соседний текст.
      var children = node.querySelectorAll('*');
      var hasExactChild = false;
      for (var j = 0; j < children.length; j++) {
        if (textOf(children[j]) === from) {
          hasExactChild = true;
          break;
        }
      }
      if (!hasExactChild) node.textContent = to;
    }
  }

  function hideLivePreviewCard() {
    var nodes = document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,span,div,strong,b');
    for (var i = 0; i < nodes.length; i++) {
      var title = nodes[i];
      if (textOf(title).toLowerCase() !== 'live-превью') continue;

      var card = title;
      for (var level = 0; level < 7 && card; level++) {
        var text = textOf(card);
        if (
          text.indexOf('Live-превью') >= 0 &&
          text.indexOf('Смотри, как всё меняется на глазах.') >= 0 &&
          text.length < 220
        ) {
          card.setAttribute('data-dl-hidden-feature', '1');
          break;
        }
        card = card.parentElement;
      }
    }
  }

  function clean() {
    var planLabels = document.querySelectorAll('[data-dl-plan-current]');
    for (var i = 0; i < planLabels.length; i++) planLabels[i].remove();

    replaceExact('2 провайдера ИИ', 'Много моделей ИИ');
    replaceExact(
      'GLM и Mistral — переключай в один клик.',
      'Выбирай модель под задачу — от быстрых до самых мощных.'
    );
    hideLivePreviewCard();
  }

  clean();
  if (window.MutationObserver) {
    var pending = null;
    new MutationObserver(function () {
      if (pending) return;
      pending = setTimeout(function () {
        pending = null;
        clean();
      }, 100);
    }).observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
})();
