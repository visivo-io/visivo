import json
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import urlsplit

POLICY = json.loads((Path(__file__).parent / "template_policy.json").read_text())

SLOT_ATTRIBUTE = POLICY["slot_attribute"]
_TAGS = {tag: set(attrs) for tag, attrs in POLICY["tags"].items()}
_DOCUMENT_TAGS = set(POLICY["document_tags"])
_DROPPED_TAGS = set(POLICY["dropped_tags"])
_DROPPED_TAG_ATTRIBUTES = {tag: set(a) for tag, a in POLICY["dropped_tag_attributes"].items()}
_GLOBAL_ATTRIBUTES = set(POLICY["global_attributes"])
_ATTRIBUTE_PREFIXES = tuple(POLICY["attribute_prefixes"])
_URL_ATTRIBUTES = set(POLICY["url_attributes"])
_URL_SCHEMES = set(POLICY["url_schemes"])
_DATA_URL_TAGS = set(POLICY["data_url_tags"])
_DATA_URL_PREFIXES = tuple(POLICY["data_url_prefixes"])
_FRAGMENT_ONLY_URL_TAGS = set(POLICY["fragment_only_url_tags"])
_CSS_FORBIDDEN = tuple(POLICY["css_forbidden"])

_VOID_TAGS = {
    "area",
    "base",
    "br",
    "col",
    "embed",
    "hr",
    "img",
    "input",
    "link",
    "meta",
    "source",
    "track",
    "wbr",
}


@dataclass
class TemplateViolation:
    line: int
    column: int
    message: str

    def __str__(self):
        return f"line {self.line}: {self.message}"


@dataclass
class TemplateAnalysis:
    slots: List[str] = field(default_factory=list)
    violations: List[TemplateViolation] = field(default_factory=list)

    @property
    def item_names(self) -> List[str]:
        """Slot names in document order, without repeats."""
        return list(dict.fromkeys(self.slots))


def _normalize_url(value: str) -> str:
    """What a browser sees when it decides a URL's scheme: control characters and
    whitespace are skipped, so `java\\tscript:` is still `javascript:`."""
    return "".join(ch for ch in value if ord(ch) > 0x20 and ord(ch) != 0x7F).lower()


def _decode_css_escapes(css: str) -> str:
    """Resolve CSS backslash escapes so `@\\69mport` is checked as `@import`."""
    out = []
    i = 0
    hex_digits = "0123456789abcdefABCDEF"
    while i < len(css):
        ch = css[i]
        if ch != "\\" or i + 1 >= len(css):
            out.append(ch)
            i += 1
            continue
        j = i + 1
        while j < len(css) and j - i <= 6 and css[j] in hex_digits:
            j += 1
        if j > i + 1:
            code = int(css[i + 1 : j], 16)
            out.append(chr(code) if 0 < code <= 0x10FFFF else "�")
            if j < len(css) and css[j] in " \t\n\r\f":
                j += 1
            i = j
        else:
            out.append(css[i + 1])
            i += 2
    return "".join(out)


def css_violation(css: str) -> Optional[str]:
    decoded = _decode_css_escapes(css).lower()
    for token in _CSS_FORBIDDEN:
        if token in decoded:
            return f"CSS may not contain `{token}`"
    return None


def url_violation(tag: str, attribute: str, value: str) -> Optional[str]:
    url = _normalize_url(value)
    if tag in _FRAGMENT_ONLY_URL_TAGS:
        if url.startswith("#"):
            return None
        return f"<{tag} {attribute}> may only point at an element in the template (`#id`)"
    if url.startswith("data:"):
        if tag in _DATA_URL_TAGS and url.startswith(_DATA_URL_PREFIXES):
            return None
        return f"<{tag} {attribute}> may not use a `data:` URL"
    scheme = urlsplit(url).scheme
    if scheme and scheme not in _URL_SCHEMES:
        return f"<{tag} {attribute}> may not use the `{scheme}:` scheme"
    return None


def attribute_violation(tag: str, attribute: str, value: Optional[str]) -> Optional[str]:
    if attribute.startswith("on"):
        return f"event handler attribute `{attribute}` is not allowed on <{tag}>"
    allowed = (
        attribute in _GLOBAL_ATTRIBUTES
        or attribute.startswith(_ATTRIBUTE_PREFIXES)
        or attribute in _TAGS.get(tag, ())
        or attribute in _DROPPED_TAG_ATTRIBUTES.get(tag, ())
    )
    if not allowed:
        return f"attribute `{attribute}` is not allowed on <{tag}>"
    if value is None:
        return None
    if attribute in _URL_ATTRIBUTES:
        return url_violation(tag, attribute, value)
    if attribute == "style":
        return css_violation(value)
    return None


class _TemplateAuditor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.analysis = TemplateAnalysis()
        self._open: List[Tuple[str, bool]] = []

    def _violation(self, message: str):
        line, column = self.getpos()
        self.analysis.violations.append(TemplateViolation(line, column + 1, message))

    def _inside_slot(self) -> bool:
        return any(is_slot for _, is_slot in self._open)

    def _audit_element(self, tag: str, attrs, self_closing: bool):
        if tag not in _TAGS and tag not in _DOCUMENT_TAGS and tag not in _DROPPED_TAGS:
            self._violation(f"<{tag}> is not allowed in a dashboard template")
        for attribute, value in attrs:
            message = attribute_violation(tag, attribute, value)
            if message:
                self._violation(message)

        slot_values = [value for attribute, value in attrs if attribute == SLOT_ATTRIBUTE]
        is_slot = bool(slot_values)
        if is_slot:
            name = (slot_values[0] or "").strip()
            if not name:
                self._violation(
                    f"`{SLOT_ATTRIBUTE}` needs the name of a chart, table, markdown or input"
                )
            elif name.startswith(("ref(", "${")):
                self._violation(
                    f'`{SLOT_ATTRIBUTE}` takes a bare name — write `{SLOT_ATTRIBUTE}="my-chart"`, '
                    f"not `{name}`"
                )
            else:
                self.analysis.slots.append(name)
            if tag in _VOID_TAGS:
                self._violation(
                    f"<{tag}> cannot hold an item; put `{SLOT_ATTRIBUTE}` on a container"
                )
            if self._inside_slot():
                self._violation(
                    f"`{SLOT_ATTRIBUTE}` elements cannot be nested — the outer one's "
                    "contents are replaced by its item"
                )

        if not self_closing and tag not in _VOID_TAGS:
            self._open.append((tag, is_slot))

    def handle_starttag(self, tag, attrs):
        self._audit_element(tag, attrs, self_closing=False)

    def handle_startendtag(self, tag, attrs):
        self._audit_element(tag, attrs, self_closing=True)

    def handle_endtag(self, tag):
        for index in range(len(self._open) - 1, -1, -1):
            if self._open[index][0] == tag:
                del self._open[index:]
                return

    def handle_data(self, data):
        if self._open and self._open[-1][0] == "style":
            message = css_violation(data)
            if message:
                self._violation(message)


def analyze_template(html: str) -> TemplateAnalysis:
    auditor = _TemplateAuditor()
    auditor.feed(html)
    auditor.close()
    return auditor.analysis
