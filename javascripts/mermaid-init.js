/* Visivo docs — Mermaid loader + initializer (VIS-987)
 * ---------------------------------------------------------------------------
 * Material for MkDocs ships a built-in Mermaid integration, but it is
 * unreliable alongside `navigation.instant` (the diagram element gets emptied
 * but never redrawn). We therefore emit the fence under a NON-`mermaid` class
 * (`mermaid-vz`, set in mkdocs.yml superfences) so Material ignores it, then
 * load a pinned Mermaid build and render it ourselves — on the initial load
 * AND on every instant-navigation page swap. Theme follows the color scheme. */
(function () {
  var MERMAID_SRC =
    'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
  var seq = 0;

  function currentTheme() {
    var scheme =
      document.body.getAttribute('data-md-color-scheme') || 'visivo_light';
    return scheme === 'visivo_dark' ? 'dark' : 'neutral';
  }

  function renderAll() {
    if (!window.mermaid) return;
    try {
      window.mermaid.initialize({
        startOnLoad: false,
        theme: currentTheme(),
        securityLevel: 'loose',
        flowchart: { htmlLabels: true, curve: 'basis' },
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      });
    } catch (e) {
      /* initialize is idempotent enough; ignore */
    }

    var blocks = document.querySelectorAll(
      '.mermaid-vz:not([data-vz-rendered])'
    );
    blocks.forEach(function (el) {
      var code = el.querySelector('code');
      var src = (code ? code.textContent : el.textContent) || '';
      src = src.trim();
      if (!src) return;
      el.setAttribute('data-vz-rendered', '1');
      var id = 'vz-mermaid-' + ++seq;
      window.mermaid
        .render(id, src)
        .then(function (out) {
          el.innerHTML = out.svg;
          el.classList.add('vz-mermaid-done');
          if (out.bindFunctions) out.bindFunctions(el);
        })
        .catch(function () {
          // On failure, leave the original source visible rather than blank.
          el.removeAttribute('data-vz-rendered');
        });
    });
  }

  function loadMermaid(cb) {
    if (window.mermaid) {
      cb();
      return;
    }
    var existing = document.getElementById('vz-mermaid-lib');
    if (existing) {
      existing.addEventListener('load', cb);
      return;
    }
    var s = document.createElement('script');
    s.id = 'vz-mermaid-lib';
    s.src = MERMAID_SRC;
    s.onload = cb;
    document.head.appendChild(s);
  }

  function boot() {
    loadMermaid(renderAll);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // Re-render after Material's instant navigation swaps the page content.
  if (window.document$ && typeof window.document$.subscribe === 'function') {
    window.document$.subscribe(function () {
      loadMermaid(renderAll);
    });
  }
})();
