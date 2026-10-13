import json
from pathlib import Path

import pytest

from visivo.models.dashboards.template_html import POLICY, analyze_template

VIEWER_POLICY = (
    Path(__file__).parents[3] / "viewer/src/components/project/template/templatePolicy.json"
)


def messages(html):
    return [violation.message for violation in analyze_template(html).violations]


def test_viewer_sanitiser_reads_the_same_policy():
    assert json.loads(VIEWER_POLICY.read_text()) == POLICY


def test_slots_are_listed_in_document_order():
    analysis = analyze_template(
        '<section><div data-visivo-item="b"></div></section>'
        '<p>text</p><span data-visivo-item=" a "></span><div data-visivo-item="b"></div>'
    )
    assert analysis.violations == []
    assert analysis.slots == ["b", "a", "b"]
    assert analysis.item_names == ["b", "a"]


def test_plain_layout_html_and_css_is_allowed():
    html = """<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Q3</title>
<style media="screen">.banner { display: grid; content: "\\2014"; background: url(https://x.test/a.png); }</style>
</head><body>
  <section class="banner" aria-label="KPIs" data-anything="1">
    <div data-visivo-item="revenue"></div>
  </section>
  <a href="https://visivo.io" target="_blank" rel="noopener">docs</a>
  <a href="#top">top</a><a href="mailto:a@b.test">mail</a><a href="/relative/path">rel</a>
  <img src="data:image/png;base64,AAAA" alt="logo"><img src="logo.png" alt="">
  <table><tr><td colspan="2">cell</td></tr></table>
  <svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="red"/></linearGradient></defs>
    <rect x="1" y="1" width="8" height="8" fill="url(#g)"/><use href="#g"/><text x="1" y="9">t</text></svg>
</body></html>"""
    assert messages(html) == []


@pytest.mark.parametrize(
    "html, expected",
    [
        ("<script>alert(1)</script>", "<script> is not allowed in a dashboard template"),
        (
            "<iframe src='https://x.test'></iframe>",
            "<iframe> is not allowed in a dashboard template",
        ),
        ("<form action='https://x.test'></form>", "<form> is not allowed in a dashboard template"),
        ("<link rel='stylesheet' href='x.css'>", "<link> is not allowed in a dashboard template"),
        (
            "<svg><foreignObject></foreignObject></svg>",
            "<foreignobject> is not allowed in a dashboard template",
        ),
        (
            "<svg><animate attributeName='href'/></svg>",
            "<animate> is not allowed in a dashboard template",
        ),
        ("<div onclick='x()'></div>", "event handler attribute `onclick` is not allowed on <div>"),
        (
            "<img src=x onerror=alert(1)>",
            "event handler attribute `onerror` is not allowed on <img>",
        ),
        ("<div srcdoc='x'></div>", "attribute `srcdoc` is not allowed on <div>"),
        (
            "<meta http-equiv='refresh' content='0'>",
            "attribute `http-equiv` is not allowed on <meta>",
        ),
        ("<a href='javascript:alert(1)'>x</a>", "<a href> may not use the `javascript:` scheme"),
        ("<a href=' JaVa\tScRiPt:alert(1)'>x</a>", "<a href> may not use the `javascript:` scheme"),
        (
            "<a href='javascript&colon;alert(1)'>x</a>",
            "<a href> may not use the `javascript:` scheme",
        ),
        ("<a href='data:text/html,x'>x</a>", "<a href> may not use a `data:` URL"),
        ("<img src='data:text/html,x'>", "<img src> may not use a `data:` URL"),
        (
            "<svg><use href='https://x.test/s.svg#a'/></svg>",
            "<use href> may only point at an element in the template (`#id`)",
        ),
        ("<style>@import url(x.css);</style>", "CSS may not contain `@import`"),
        ("<style>@\\69mport url(x.css);</style>", "CSS may not contain `@import`"),
        ("<div style='width: expression(alert(1))'></div>", "CSS may not contain `expression(`"),
        (
            "<div style='background:url(javascript:alert(1))'></div>",
            "CSS may not contain `javascript:`",
        ),
    ],
)
def test_unsafe_html_is_reported(html, expected):
    assert expected in messages(html)


def test_slot_names_must_be_bare_names():
    assert messages('<div data-visivo-item=""></div>') == [
        "`data-visivo-item` needs the name of a chart, table, markdown or input"
    ]
    assert "bare name" in messages('<div data-visivo-item="${ref(chart)}"></div>')[0]


def test_slots_cannot_nest_or_sit_on_void_elements():
    assert (
        "cannot be nested"
        in messages('<div data-visivo-item="a"><p><span data-visivo-item="b"></span></p></div>')[0]
    )
    assert messages('<div data-visivo-item="a"></div><div data-visivo-item="b"></div>') == []
    assert "cannot hold an item" in messages('<img data-visivo-item="a">')[0]


def test_violations_carry_line_numbers():
    violation = analyze_template("<div>\n  <script></script>\n</div>").violations[0]
    assert (violation.line, violation.column) == (2, 3)
    assert str(violation) == "line 2: <script> is not allowed in a dashboard template"
