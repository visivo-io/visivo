import { prepareTemplate, templateItemNames, isUrlAllowed, isCssAllowed } from './templateHtml';

const toHtml = fragment => {
  const div = document.createElement('div');
  div.appendChild(fragment.cloneNode(true));
  return div.innerHTML;
};

describe('prepareTemplate', () => {
  it('turns each data-visivo-item element into a host for a named slot', () => {
    const { fragment, slots } = prepareTemplate(
      '<section class="banner"><div class="kpi" data-visivo-item="revenue">placeholder</div></section>' +
        '<p>Revenue held.</p><div data-visivo-item=" by-month "></div>'
    );

    expect(slots).toEqual([
      { name: 'revenue', slotName: 'visivo-slot-0' },
      { name: 'by-month', slotName: 'visivo-slot-1' },
    ]);
    const kpi = fragment.querySelector('.kpi');
    expect(kpi.children).toHaveLength(1);
    expect(kpi.firstElementChild.localName).toBe('slot');
    expect(kpi.firstElementChild.getAttribute('name')).toBe('visivo-slot-0');
    expect(kpi.textContent).toBe('');
  });

  it('gives a repeated item its own slot each time', () => {
    const { slots } = prepareTemplate(
      '<div data-visivo-item="a"></div><div data-visivo-item="a"></div>'
    );
    expect(slots.map(slot => slot.slotName)).toEqual(['visivo-slot-0', 'visivo-slot-1']);
    expect(templateItemNames('<div data-visivo-item="a"></div><div data-visivo-item="a"></div>')).toEqual(['a']);
  });

  it('keeps layout HTML, CSS and SVG', () => {
    const { fragment } = prepareTemplate(
      '<style>.banner { display: grid; }</style>' +
        '<a href="https://visivo.io" target="_blank">docs</a>' +
        '<img src="data:image/png;base64,AAAA" alt="logo">' +
        '<svg viewBox="0 0 10 10"><rect x="1" width="8" height="8" fill="url(#g)"/><use href="#g"/></svg>'
    );
    const html = toHtml(fragment);
    expect(html).toContain('<style>.banner { display: grid; }</style>');
    expect(fragment.querySelector('a').getAttribute('rel')).toBe('noopener noreferrer');
    expect(fragment.querySelector('img').getAttribute('src')).toBe('data:image/png;base64,AAAA');
    expect(fragment.querySelector('svg').getAttribute('viewBox')).toBe('0 0 10 10');
    expect(fragment.querySelector('use').getAttribute('href')).toBe('#g');
  });

  it('removes scripts, embeds, forms and authored slots', () => {
    const { fragment } = prepareTemplate(
      '<script>window.pwned = 1</script><iframe src="https://x.test"></iframe>' +
        '<form action="https://x.test"><input name="p"></form><object data="x"></object>' +
        '<slot name="visivo-slot-0"></slot><template><p>t</p></template>' +
        '<svg><foreignObject><div>x</div></foreignObject><animate attributeName="href"/></svg>' +
        '<meta http-equiv="refresh" content="0"><link rel="stylesheet" href="x.css"><p>kept</p>'
    );
    expect(toHtml(fragment)).toBe('<svg></svg><p>kept</p>');
  });

  it('removes event handlers and unlisted attributes but keeps the element', () => {
    const { fragment } = prepareTemplate(
      '<img src="x.png" onerror="alert(1)" srcset="y.png"><div onclick="x()" data-k="1" aria-label="l"></div>'
    );
    expect(toHtml(fragment)).toBe('<img src="x.png"><div data-k="1" aria-label="l"></div>');
  });

  it('removes unsafe URLs and CSS', () => {
    const { fragment } = prepareTemplate(
      '<a href="javascript:alert(1)">a</a><a href=" JaVa&#x09;ScRiPt:alert(1)">b</a>' +
        '<a href="data:text/html,x">c</a><svg><use href="https://x.test/s.svg#a"/></svg>' +
        '<div style="width: expression(alert(1))">d</div><style>@\\69mport url(x.css);</style>'
    );
    expect(toHtml(fragment)).toBe(
      '<a>a</a><a>b</a><a>c</a><svg><use></use></svg><div>d</div>'
    );
  });

  it('ignores slots that cannot hold an item', () => {
    const { slots } = prepareTemplate(
      // eslint-disable-next-line no-template-curly-in-string
      '<img data-visivo-item="a"><div data-visivo-item=""></div><div data-visivo-item="${ref(b)}"></div>' +
        '<div data-visivo-item="outer"><span data-visivo-item="inner"></span></div>'
    );
    expect(slots.map(slot => slot.name)).toEqual(['outer']);
  });

  it('unwraps a full HTML document', () => {
    const { fragment, slots } = prepareTemplate(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>p{}</style></head>' +
        '<body><div data-visivo-item="a"></div></body></html>'
    );
    expect(slots.map(slot => slot.name)).toEqual(['a']);
    expect(toHtml(fragment)).toBe('<style>p{}</style><div data-visivo-item="a"><slot name="visivo-slot-0"></slot></div>');
  });

  it('never runs template scripts', () => {
    prepareTemplate('<img src="x" onerror="window.__templateRan = true"><script>window.__templateRan = true</script>');
    expect(window.__templateRan).toBeUndefined();
  });
});

describe('policy checks', () => {
  it.each([
    ['a', 'https://x.test', true],
    ['a', '/relative', true],
    ['a', '#top', true],
    ['a', 'mailto:a@b.test', true],
    // eslint-disable-next-line no-script-url
    ['a', 'javascript:alert(1)', false],
    ['a', 'vbscript:x', false],
    ['img', 'data:image/svg+xml;base64,AAAA', true],
    ['a', 'data:image/png;base64,AAAA', false],
    ['use', '#icon', true],
    ['use', 'icons.svg#icon', false],
  ])('%s %s allowed: %s', (tag, url, expected) => {
    expect(isUrlAllowed(tag, url)).toBe(expected);
  });

  it('rejects forbidden CSS, including escaped forms', () => {
    expect(isCssAllowed('.a { color: red; content: "\\2014"; }')).toBe(true);
    expect(isCssAllowed('@import url(x.css);')).toBe(false);
    expect(isCssAllowed('@\\69 mport url(x.css);')).toBe(false);
    expect(isCssAllowed('b { -moz-binding: url(x) }')).toBe(false);
  });
});
