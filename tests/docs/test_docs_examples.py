"""Docs YAML-example harness — every fence in the docs must parse as real config.

This is the structural fix for the M8 class of bug: *valid-looking YAML that the
tool's own parser rejects.* Four field testers copied the scaffold's dashboard
example and were rejected by Visivo itself. The merged scaffold test
(``tests/commands/test_init_phase.py``) closed that hole for ``visivo init``;
this module closes it for everything we publish, because until now nothing ever
executed a single documented example.

It extracts EVERY YAML fence from

  * hand-authored ``mkdocs/**/*.md`` (the generated reference and the Plotly
    props docs are excluded — same exclusion list as ``test_docs_parity``), and
  * every docstring under ``visivo/`` — model docstrings ARE the generated
    reference pages, so a broken example there ships to docs.visivo.io verbatim,

and validates each one against the *real, current* models, using the technique
from the scaffold test: ``yaml.safe_load`` the fence, then construct the real
model — here through a ``TypeAdapter`` built from the matching field annotation,
so each resource is checked by exactly the class (and discriminated union) the
parser would pick. A fence carrying a top-level ``name:`` is a whole project and
is validated with ``Project`` itself, which additionally resolves its ``ref()``s.

Opt-outs are EXPLICIT and VISIBLE — there is deliberately no skip *list* here, so
a reader of the docs page sees, in the page, why a block is exempt. Put an HTML
comment on the line directly above the fence:

``<!-- visivo-example: skip - reason -->``
    Not Visivo project config at all (a GitHub Actions workflow, a Plotly
    property listing, ``~/.visivo/config.yml``). Never validated.

``<!-- visivo-example: invalid - reason -->``
    A deliberate counter-example ("this does not work"). Asserted to FAIL.

``<!-- visivo-example: broken - reason -->``
    Known-broken and not yet fixed. Asserted to FAIL, so the marker cannot rot:
    the moment someone fixes the fence, the harness demands the marker's removal.

Every marker must carry a written reason, and every ``invalid``/``broken`` marker
is re-checked against reality on every run.
"""

import ast
import re
import textwrap
from pathlib import Path

import pytest
import yaml
from pydantic import TypeAdapter

from tests.docs.test_docs_parity import EXCLUDED_DOC_SUBPATHS
from visivo.models.dashboard import Dashboard
from visivo.models.insight import Insight
from visivo.models.item import Item
from visivo.models.project import Project
from visivo.models.props.layout import Layout
from visivo.models.row import Row
from visivo.models.table import Table

# Repo root: tests/docs/test_docs_examples.py -> parents[2] == repo root.
REPO_ROOT = Path(__file__).resolve().parents[2]
MKDOCS_DIR = REPO_ROOT / "mkdocs"
PACKAGE_DIR = REPO_ROOT / "visivo"


# ---------------------------------------------------------------------------
# Fences owned by an open PR, which this branch must not edit.
#
# The marker convention above lives IN the page, which is the right home for it
# — but a page another open PR is rewriting cannot be touched without creating a
# conflict, so those fences are named here instead, loudly, with the PR that owns
# the fix. They are held to the same no-rot rule as a `broken` marker:
# `test_must_fail_markers_still_describe_failing_fences` asserts the fence still
# fails, and `test_handoffs_are_still_needed` asserts it still exists — so an
# entry cannot outlive the bug it describes.
#
#   mkdocs/index.md:67 — `layout: {title: "Monthly Revenue"}`. Plotly's layout
#   schema requires `title` to be an object, so Visivo rejects the string form
#   (see the same fix applied across topics/annotations.md in this PR). PR #658
#   is rewriting mkdocs/index.md; the fix belongs there.
# ---------------------------------------------------------------------------
HANDOFFS = {
    (
        "mkdocs/index.md",
        67,
    ): "PR #658 owns mkdocs/index.md — layout.title must be `title: {text: ...}`",
}


# ===========================================================================
# Fence extraction
# ===========================================================================
# Matches ```yaml / ``` yaml / ```yml, with or without a pymdown `title="..."`
# attribute, at any indentation (mkdocs admonitions and tabbed blocks indent
# their fences). The closing fence must sit at the SAME indentation, which is how
# fenced code inside an admonition is written.
_FENCE_RE = re.compile(
    r"^(?P<indent>[ \t]*)```[ ]?ya?ml(?P<info>[^\n]*)\n(?P<body>.*?)^(?P=indent)```",
    re.MULTILINE | re.DOTALL,
)

# The opt-out marker. It must sit on the nearest non-blank line above the fence,
# so it is visually attached to the block it exempts.
_MARKER_RE = re.compile(
    r"<!--\s*visivo-example:\s*(?P<kind>skip|invalid|broken)\b(?P<reason>[^>]*?)-->\s*$",
    re.IGNORECASE,
)

_MUST_FAIL_KINDS = ("invalid", "broken")


class Fence:
    """One extracted YAML example."""

    def __init__(self, *, source, ordinal, line, body, marker_kind=None, marker_reason=None):
        self.source = source  # repo-relative "path", or "path::Owner" for docstrings
        self.ordinal = ordinal  # 1-based fence number within that source
        self.line = line  # 1-based line of the opening ``` in the FILE
        self.body = body
        self.marker_kind = marker_kind  # None | "skip" | "invalid" | "broken"
        self.marker_reason = marker_reason

    @property
    def file(self):
        return self.source.split("::", 1)[0]

    @property
    def label(self):
        return f"{self.source} fence #{self.ordinal} (line {self.line})"

    @property
    def first_line(self):
        for line in self.body.splitlines():
            if line.strip():
                return line.strip()
        return "<empty fence>"

    @property
    def handoff(self):
        return HANDOFFS.get((self.file, self.line))

    def __repr__(self):  # pragma: no cover - pytest id helper
        return self.label


def _marker_above(text, fence_start):
    """Return (kind, reason) for a marker on the nearest non-blank line above."""
    for raw in reversed(text[:fence_start].splitlines()):
        if not raw.strip():
            continue  # blank lines between marker and fence are fine
        match = _MARKER_RE.search(raw.strip())
        if match:
            return match.group("kind").lower(), match.group("reason").strip(" -—:\t")
        return None, None
    return None, None


def _fences_in_text(text, *, source, line_offset=0, ordinal_start=1):
    """Extract every YAML fence from a markdown page or a docstring blob."""
    found = []
    for ordinal, match in enumerate(_FENCE_RE.finditer(text), start=ordinal_start):
        kind, reason = _marker_above(text, match.start())
        found.append(
            Fence(
                source=source,
                ordinal=ordinal,
                line=text[: match.start()].count("\n") + 1 + line_offset,
                body=textwrap.dedent(match.group("body")),
                marker_kind=kind,
                marker_reason=reason,
            )
        )
    return found


def docs_prose_files():
    """Hand-authored mkdocs pages (generated/Plotly subtrees excluded)."""
    files = []
    for md in MKDOCS_DIR.rglob("*.md"):
        rel = md.relative_to(MKDOCS_DIR).as_posix()
        if any(rel.startswith(prefix) for prefix in EXCLUDED_DOC_SUBPATHS):
            continue
        files.append(md)
    return sorted(files)


def markdown_fences():
    fences = []
    for md in docs_prose_files():
        rel = md.relative_to(REPO_ROOT).as_posix()
        fences.extend(_fences_in_text(md.read_text(), source=rel))
    return fences


def _docstring_nodes(tree):
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            yield node


def docstring_fences():
    """Every YAML fence in a docstring under ``visivo/``.

    Docstrings are not incidental prose here: ``mkdocs/src/write_mkdocs_markdown_files.py``
    renders model docstrings straight onto docs.visivo.io, so a fence that does
    not parse is a published, copy-pasteable lie.

    ``ast`` is used (rather than a grep over the file) so that only real
    docstrings are collected: the module-level string constants that *generate*
    fences (``visivo/parsers/mkdocs_utils/markdown.py``) and comments that merely
    mention a yaml fence are not examples and must not be validated.
    """
    fences = []
    for py in sorted(PACKAGE_DIR.rglob("*.py")):
        source_text = py.read_text()
        if "yaml" not in source_text:
            continue
        try:
            tree = ast.parse(source_text)
        except SyntaxError:  # pragma: no cover - the package must be importable
            continue
        rel = py.relative_to(REPO_ROOT).as_posix()
        per_owner_counts = {}
        for node in _docstring_nodes(tree):
            if not (node.body and isinstance(node.body[0], ast.Expr)):
                continue
            value = node.body[0].value
            if not (isinstance(value, ast.Constant) and isinstance(value.value, str)):
                continue
            if "yaml" not in value.value:
                continue
            raw = ast.get_source_segment(source_text, value)
            if raw is None:  # pragma: no cover - defensive
                continue
            owner = getattr(node, "name", "<module>")
            start = per_owner_counts.get(owner, 0) + 1
            new = _fences_in_text(
                raw,
                source=f"{rel}::{owner}",
                # `value.lineno` is the line of the opening quote, and offsets
                # inside `raw` are 1-based from there.
                line_offset=value.lineno - 1,
                ordinal_start=start,
            )
            per_owner_counts[owner] = start + len(new) - 1
            fences.extend(new)
    return fences


def all_fences():
    return markdown_fences() + docstring_fences()


# ===========================================================================
# Validation
# ===========================================================================
# Project fields that are internal bookkeeping, never authored in an example.
_INTERNAL_PROJECT_FIELDS = {
    "path",
    "file_path",
    "project_file_path",
    "project_dir",
    "cli_version",
}

# Fragment shapes that appear in the docs but are not Project fields: the `Item`
# reference page naturally shows `rows:`/`items:`, the query-string guide shows
# an insight's `props:`, and the annotations guide shows a layout's `shapes:`.
# Each is validated by its REAL owner, so these are not a weakening of the check
# — they are the check applied at the right altitude. A ``None`` field name means
# the owner is constructed directly with that single key (``Layout`` is validated
# against the Plotly JSON schema and declares no fields of its own).
_FRAGMENT_SPECS = {
    "rows": (Dashboard, "rows"),
    "items": (Row, "items"),
    "props": (Insight, "props"),
    "interactions": (Insight, "interactions"),
    "columns": (Table, "columns"),
    "format_cells": (Table, "format_cells"),
    "width": (Item, "width"),
    "shapes": (Layout, None),
    "annotations": (Layout, None),
}


def _build_validators():
    """key -> callable(value) that raises if the value is not valid config."""
    validators = {}
    for name, field in Project.model_fields.items():
        if name in _INTERNAL_PROJECT_FIELDS or name == "name":
            continue
        validators[name] = TypeAdapter(field.annotation).validate_python
    for key, (owner, field_name) in _FRAGMENT_SPECS.items():
        if key in validators:
            continue
        if field_name is None:
            validators[key] = lambda value, _o=owner, _k=key: _o(**{_k: value})
        else:
            annotation = owner.model_fields[field_name].annotation
            validators[key] = TypeAdapter(annotation).validate_python
    return validators


_VALIDATORS = _build_validators()
_RESOURCE_KEYS = frozenset(_VALIDATORS)


class FenceError(Exception):
    """A fence that the real schema rejects."""


def validate_fence(fence):
    """Validate one fence, raising ``FenceError`` with an actionable message."""
    try:
        data = yaml.safe_load(fence.body)
    except yaml.YAMLError as exc:
        raise FenceError(f"YAML did not parse: {exc}") from exc

    if data is None:
        raise FenceError("the fence is empty")
    if not isinstance(data, dict):
        raise FenceError(
            f"the top level is a {type(data).__name__}, not a mapping — a Visivo "
            "YAML example must be a mapping (or carry a `visivo-example: skip` "
            "marker if it is not Visivo config at all)"
        )

    keys = set(data)
    unknown = {k for k in keys if k not in _RESOURCE_KEYS and k != "name"}
    if unknown:
        raise FenceError(
            f"unknown top-level key(s) {sorted(map(str, unknown))} — not a field of "
            f"Project, nor a documented fragment ({', '.join(sorted(_FRAGMENT_SPECS))})"
        )

    resource_keys = sorted(keys & _RESOURCE_KEYS)
    if not resource_keys:
        raise FenceError("no Visivo resources in this fence — nothing was validated")

    # `name:` plus resources is a whole project: validate it as one, which also
    # resolves every ${ref()} it contains.
    if "name" in keys:
        try:
            Project(**data)
        except Exception as exc:  # noqa: BLE001 - reported verbatim below
            raise FenceError(f"Project rejected this example:\n{exc}") from exc
        return [f"Project({', '.join(resource_keys)})"]

    checked = []
    for key in resource_keys:
        try:
            _VALIDATORS[key](data[key])
        except Exception as exc:  # noqa: BLE001 - reported verbatim below
            raise FenceError(f"`{key}:` rejected by the schema:\n{exc}") from exc
        checked.append(key)
    return checked


def _describe(fence, exc):
    """The failure text. A harness whose output is unreadable gets disabled."""
    return (
        f"\n\n  {fence.label}"
        f"\n    first line: {fence.first_line}"
        f"\n    {textwrap.indent(str(exc), '    ').strip()}"
    )


def _run(fences):
    """Return (failures, stale_markers) for a fence list."""
    failures = []
    stale = []
    for fence in fences:
        if fence.marker_kind == "skip":
            continue
        exempt = fence.marker_kind in _MUST_FAIL_KINDS or fence.handoff is not None
        try:
            validate_fence(fence)
        except FenceError as exc:
            if not exempt:
                failures.append(_describe(fence, exc))
        else:
            if exempt:
                reason = fence.handoff or f"visivo-example: {fence.marker_kind}"
                stale.append(f"\n  {fence.label} — recorded as {reason!r}")
    return failures, stale


# ===========================================================================
# Discovery sanity — a bad glob must not silently make this a no-op
# ===========================================================================
def test_markdown_fences_are_discovered():
    fences = markdown_fences()
    assert len(fences) > 60, (
        f"Only {len(fences)} YAML fences found under {MKDOCS_DIR}. The docs have "
        "many more than that — the fence regex or the docs tree moved, and this "
        "harness has quietly become a no-op."
    )


def test_docstring_fences_are_discovered():
    fences = docstring_fences()
    assert len(fences) > 40, (
        f"Only {len(fences)} YAML fences found in docstrings under {PACKAGE_DIR}. "
        "Model docstrings ARE the generated reference pages — if this count "
        "collapsed, the extractor broke."
    )


def test_indented_and_spaced_fences_are_discovered():
    """Pins the two fence spellings a naive regex would miss.

    Most of the repo writes ```` ``` yaml ```` (with a space) and indents fences
    inside `!!! example` admonitions and `=== "tab"` blocks. A regex anchored to
    column 0 and to ```` ```yaml ```` silently drops ~100 of the ~150 fences.
    """
    sources = {f.source for f in docstring_fences()}
    for expected in (
        "visivo/models/project.py::Project",
        "visivo/models/item.py::Item",
        "visivo/models/sources/duckdb_source.py::DuckdbSource",
        "visivo/models/metric.py::Metric",
    ):
        assert expected in sources, f"{expected} contributed no fences to the harness"

    indented = [f for f in markdown_fences() if f.file == "mkdocs/how_it_works.md"]
    assert indented, "no fences found in mkdocs/how_it_works.md (its fences are indented in tabs)"


# ===========================================================================
# The harness
# ===========================================================================
def test_markdown_yaml_examples_validate():
    """Every YAML fence in the hand-authored docs must be config Visivo accepts."""
    failures, _ = _run(markdown_fences())
    assert not failures, (
        f"{len(failures)} YAML example(s) in the docs are rejected by the real "
        "schema. Users copy these. Fix the example — or, if the block is not "
        "Visivo config at all, put `<!-- visivo-example: skip - why -->` on the "
        "line above the fence (and `invalid` for a deliberate counter-example)." + "".join(failures)
    )


def test_docstring_yaml_examples_validate():
    """Every YAML fence in a docstring must be config Visivo accepts.

    Docstrings become the generated reference pages, so these examples are
    published exactly as written.
    """
    failures, _ = _run(docstring_fences())
    assert not failures, (
        f"{len(failures)} YAML example(s) in docstrings are rejected by the real "
        "schema. These render onto docs.visivo.io. Fix the example — or, if the "
        "block is not Visivo config at all, put `<!-- visivo-example: skip - why -->` "
        "on the line above the fence." + "".join(failures)
    )


# ===========================================================================
# Marker hygiene — exemptions must be justified, and must not rot
# ===========================================================================
def test_markers_carry_a_reason():
    """Every opt-out must say why, in the page, where a doc reader can see it."""
    bare = [
        f"\n  {f.label}: <!-- visivo-example: {f.marker_kind} -->"
        for f in all_fences()
        if f.marker_kind and len(f.marker_reason or "") < 12
    ]
    assert not bare, (
        "These `visivo-example` markers carry no (or too short a) justification. "
        "Write the reason into the marker — an unexplained exemption is a silent "
        "skip list with extra steps:" + "".join(bare)
    )


def test_must_fail_markers_still_describe_failing_fences():
    """An `invalid`/`broken` marker on a fence that now validates must be deleted.

    This is what keeps the exemption list honest: the moment someone fixes a
    fence, this test fails until they remove its marker, so the list can only
    shrink.
    """
    _, stale = _run(all_fences())
    assert not stale, (
        "These fences are recorded as failing but now validate cleanly. Delete "
        "the marker (or the HANDOFFS entry):" + "".join(stale)
    )


def test_handoffs_are_still_needed():
    """Every HANDOFFS entry must point at a fence that still exists."""
    located = {(f.file, f.line) for f in all_fences()}
    missing = [
        f"{path}:{line} — {why}"
        for (path, line), why in HANDOFFS.items()
        if (path, line) not in located
    ]
    assert not missing, (
        "These HANDOFFS entries no longer match a fence (the page moved or the "
        "fence was deleted). Remove them:\n  " + "\n  ".join(missing)
    )


# ===========================================================================
# The harness must be able to fail (self-checks)
# ===========================================================================
def _fence(body):
    return Fence(source="<self-check>", ordinal=1, line=0, body=body)


def test_harness_rejects_the_m8_shape():
    """The exact bug this harness exists to prevent: `insight:` as a row item.

    Four field testers wrote this; `Item` forbids extra keys, so Visivo rejects
    it. If this ever passes, the harness has stopped checking anything.
    """
    with pytest.raises(FenceError) as excinfo:
        validate_fence(
            _fence(
                "dashboards:\n"
                "  - name: Overview\n"
                "    rows:\n"
                "      - items:\n"
                "          - insight: ${ref(revenue_by_month)}\n"
            )
        )
    assert "dashboards" in str(excinfo.value)


def test_harness_rejects_unparseable_yaml():
    with pytest.raises(FenceError, match="YAML did not parse"):
        validate_fence(_fence("sources:\n  - name: x\n   type: duckdb\n"))


def test_harness_rejects_unquoted_eval_strings():
    """`>{ ... }` starts a YAML block scalar; it must be quoted in a real file."""
    with pytest.raises(FenceError, match="YAML did not parse"):
        validate_fence(_fence("tests:\n  - name: t\n    assertions:\n      - >{ 1 == 1 }\n"))


def test_harness_rejects_unknown_top_level_keys():
    with pytest.raises(FenceError, match="unknown top-level key"):
        validate_fence(_fence("trace:\n  - name: legacy\n"))


def test_harness_rejects_a_string_layout_title():
    """Plotly's layout schema requires an object title; the string form is a lie."""
    with pytest.raises(FenceError, match="not of type"):
        validate_fence(_fence('charts:\n  - name: c\n    layout:\n      title: "Revenue"\n'))


def test_harness_validates_fragments_by_their_real_owner():
    assert validate_fence(_fence("shapes:\n  - type: rect\n    x0: 1\n")) == ["shapes"]
    assert validate_fence(_fence("items:\n  - markdown: hello\n")) == ["items"]


def test_harness_accepts_a_real_source():
    body = "sources:\n  - name: local\n    type: duckdb\n    database: target/local.duckdb\n"
    assert validate_fence(_fence(body)) == ["sources"]


def test_marker_is_read_from_the_line_above_the_fence():
    text = (
        "Some prose.\n\n"
        "<!-- visivo-example: skip - a GitHub Actions workflow, not Visivo config -->\n\n"
        "```yaml\n"
        "on: push\n"
        "```\n"
    )
    (fence,) = _fences_in_text(text, source="doc.md")
    assert fence.marker_kind == "skip"
    assert "GitHub Actions" in fence.marker_reason


def test_marker_does_not_leak_to_a_later_fence():
    text = (
        "<!-- visivo-example: skip - a GitHub Actions workflow, not Visivo config -->\n"
        "```yaml\n"
        "on: push\n"
        "```\n\n"
        "Prose in between.\n\n"
        "```yaml\n"
        "sources: []\n"
        "```\n"
    )
    first, second = _fences_in_text(text, source="doc.md")
    assert first.marker_kind == "skip"
    assert second.marker_kind is None
