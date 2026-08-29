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
    property listing, ``~/.visivo/config.yml``). Not validated — but asserted to
    still *fail* validation, so a `skip` cannot quietly sit on a fence that is,
    or has become, real config.

``<!-- visivo-example: skip-keys(models) - reason -->``
    A *hybrid* fence: some top-level keys are foreign (dbt's ``models:`` catalog
    lives in the same file as Visivo's ``insights:``), the rest is real config.
    Only the named keys are exempt; every other key is validated normally, and
    each named key is asserted to still be rejected on its own.

``<!-- visivo-example: invalid - reason -->``
    A deliberate counter-example ("this does not work"). Asserted to FAIL.

``<!-- visivo-example: broken - reason -->``
    Known-broken and not yet fixed. Asserted to FAIL, so the marker cannot rot:
    the moment someone fixes the fence, the harness demands the marker's removal.

Every marker must carry a written reason, and EVERY marker kind — ``skip``
included — is re-checked against reality on every run. An exemption here can only
ever shrink.
"""

import ast
import hashlib
import re
import textwrap
from collections import Counter
from pathlib import Path

import pytest
import yaml
from pydantic import TypeAdapter

from tests.docs.test_docs_parity import EXCLUDED_DOC_SUBPATHS
from visivo.models.dashboard import Dashboard
from visivo.models.insight import Insight
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
# The key is (repo-relative path, fence FINGERPRINT), never a line number: the
# owning PR will almost certainly move the fence down the page before it fixes
# it, and keying on a line number would turn every unrelated edit above the fence
# into two red tests — one of them telling the author to go edit the very file
# the handoff exists to leave alone. The fingerprint follows the fence around the
# page and stops matching only when the fence's *content* changes, which is
# exactly when the handoff genuinely needs re-examining.
#
#   mkdocs/index.md (line 67 at the time of writing) — `layout: {title: "Monthly
#   Revenue"}`. Plotly's layout schema requires `title` to be an object, so
#   Visivo rejects the string form (see the same fix applied across
#   topics/annotations.md in this PR). PR #658 is rewriting mkdocs/index.md; the
#   fix belongs there.
# ---------------------------------------------------------------------------
HANDOFFS = {
    (
        "mkdocs/index.md",
        "fcb7e485a014",
    ): "PR #658 owns mkdocs/index.md — layout.title must be `title: {text: ...}`",
}


# ===========================================================================
# Fence extraction
# ===========================================================================
# Matches ```yaml / ``` yaml / ```yml / ```YAML, with or without a pymdown
# `title="..."` attribute, at any indentation (mkdocs admonitions and tabbed
# blocks indent their fences). The closing fence must sit at the SAME
# indentation, which is how fenced code inside an admonition is written.
# `re.IGNORECASE` is deliberate: a contributor who writes ```YAML must not get a
# silently unvalidated published example, which is the exact failure class this
# module exists to prevent.
_FENCE_RE = re.compile(
    r"^(?P<indent>[ \t]*)```[ ]?ya?ml(?P<info>[^\n]*)\n(?P<body>.*?)^(?P=indent)```",
    re.MULTILINE | re.DOTALL | re.IGNORECASE,
)

# The cheap prefilter used before paying for `ast.parse` on a .py file. It must
# accept EXACTLY what `_FENCE_RE` accepts — a substring test for "yaml" would
# drop a ```yml fence in a file that never spells the word out, which is a silent
# no-op in a harness whose whole point is that it cannot stop checking quietly.
_FENCE_HINT_RE = re.compile(r"```[ ]?ya?ml", re.IGNORECASE)

# The opt-out marker. It must sit on the nearest non-blank line above the fence,
# so it is visually attached to the block it exempts. `skip-keys(a, b)` names the
# top-level keys that are foreign; everything else in the fence is still checked.
_MARKER_RE = re.compile(
    r"<!--\s*visivo-example:\s*(?P<kind>skip-keys|skip|invalid|broken)\b"
    r"(?:\s*\((?P<keys>[^)]*)\))?"
    r"(?P<reason>[^>]*?)-->\s*$",
    re.IGNORECASE,
)

_MUST_FAIL_KINDS = ("invalid", "broken")
_SKIP_KINDS = ("skip", "skip-keys")

# The synthetic project name used to check a fence's ${ref()}s (see
# `validate_fence`). It can never collide with a documented resource name.
_SYNTHETIC_PROJECT_NAME = "__docs_fence__"


class Fence:
    """One extracted YAML example."""

    def __init__(
        self,
        *,
        source,
        ordinal,
        line,
        body,
        marker_kind=None,
        marker_reason=None,
        marker_keys=(),
    ):
        self.source = source  # repo-relative "path", or "path::Owner" for docstrings
        self.ordinal = ordinal  # 1-based fence number within that source
        self.line = line  # 1-based line of the opening ``` in the FILE
        self.body = body
        self.marker_kind = marker_kind  # None | "skip" | "skip-keys" | "invalid" | "broken"
        self.marker_reason = marker_reason
        self.marker_keys = tuple(marker_keys)  # top-level keys exempted by `skip-keys`

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
    def fingerprint(self):
        """A stable id for this fence's CONTENT, immune to the fence moving.

        Trailing whitespace and surrounding blank lines are normalised away so a
        reflow of the page around the fence does not change the id; anything that
        changes the YAML does.
        """
        normalised = "\n".join(line.rstrip() for line in self.body.strip().splitlines())
        return hashlib.sha1(normalised.encode("utf-8")).hexdigest()[:12]

    @property
    def handoff(self):
        return HANDOFFS.get((self.file, self.fingerprint))

    def __repr__(self):  # pragma: no cover - pytest id helper
        return self.label


def _marker_above(text, fence_start):
    """Return (kind, keys, reason) for a marker on the nearest non-blank line above."""
    for raw in reversed(text[:fence_start].splitlines()):
        if not raw.strip():
            continue  # blank lines between marker and fence are fine
        match = _MARKER_RE.search(raw.strip())
        if match:
            raw_keys = match.group("keys") or ""
            keys = tuple(k.strip() for k in raw_keys.replace(",", " ").split() if k.strip())
            return (
                match.group("kind").lower(),
                keys,
                match.group("reason").strip(" -—:\t"),
            )
        return None, (), None
    return None, (), None


def _fences_in_text(text, *, source, line_offset=0, ordinal_start=1):
    """Extract every YAML fence from a markdown page or a docstring blob."""
    found = []
    for ordinal, match in enumerate(_FENCE_RE.finditer(text), start=ordinal_start):
        kind, keys, reason = _marker_above(text, match.start())
        found.append(
            Fence(
                source=source,
                ordinal=ordinal,
                line=text[: match.start()].count("\n") + 1 + line_offset,
                body=textwrap.dedent(match.group("body")),
                marker_kind=kind,
                marker_reason=reason,
                marker_keys=keys,
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


def _fences_in_python_source(source_text, rel):
    """Every YAML fence in a docstring of one .py source blob.

    ``ast`` is used (rather than a grep over the file) so that only real
    docstrings are collected: the module-level string constants that *generate*
    fences (``visivo/parsers/mkdocs_utils/markdown.py``) and comments that merely
    mention a yaml fence are not examples and must not be validated.

    The prefilter is ``_FENCE_HINT_RE``, not ``"yaml" in text``, so that the set
    of files scanned is exactly the set of files whose fences ``_FENCE_RE`` can
    match. Split into its own function so this can be exercised directly on a
    synthetic source string.
    """
    fences = []
    if not _FENCE_HINT_RE.search(source_text):
        return fences
    try:
        tree = ast.parse(source_text)
    except SyntaxError:  # pragma: no cover - the package must be importable
        return fences
    per_owner_counts = {}
    for node in _docstring_nodes(tree):
        if not (node.body and isinstance(node.body[0], ast.Expr)):
            continue
        value = node.body[0].value
        if not (isinstance(value, ast.Constant) and isinstance(value.value, str)):
            continue
        if not _FENCE_HINT_RE.search(value.value):
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


def docstring_fences():
    """Every YAML fence in a docstring under ``visivo/``.

    Docstrings are not incidental prose here: ``mkdocs/src/write_mkdocs_markdown_files.py``
    renders model docstrings straight onto docs.visivo.io, so a fence that does
    not parse is a published, copy-pasteable lie.
    """
    fences = []
    for py in sorted(PACKAGE_DIR.rglob("*.py")):
        fences.extend(
            _fences_in_python_source(py.read_text(), py.relative_to(REPO_ROOT).as_posix())
        )
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
#
# Every entry here also widens the `unknown top-level key(s)` allowlist, so this
# dict lists ONLY shapes a fence actually uses today. `test_every_fragment_spec_is_used`
# keeps it that way: a speculative entry admits a fence and then checks it
# loosely, which is strictly worse than refusing it and making the author add the
# entry deliberately. (`interactions:` was such an entry — the interaction model
# accepts unknown keys, so an `interactions:` fence would have been waved
# through unchecked.)
_FRAGMENT_SPECS = {
    "rows": (Dashboard, "rows"),
    "items": (Row, "items"),
    "props": (Insight, "props"),
    "format_cells": (Table, "format_cells"),
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


def _fence_data(fence, skipped_keys=()):
    """``yaml.safe_load`` the fence, minus any ``skip-keys`` exemptions."""
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
    if skipped_keys:
        data = {k: v for k, v in data.items() if k not in skipped_keys}
    return data


def validate_fence(fence, skipped_keys=()):
    """Validate one fence, raising ``FenceError`` with an actionable message.

    Returns the list of things that were checked. A single
    ``"Project(sources, models, ...)"`` entry means the fence was validated as a
    whole project, so every ``${ref()}`` in it was RESOLVED as well; a list of
    bare key names means the fence is a fragment of a larger project and its refs
    point outside itself, so only its shape could be checked.
    """
    data = _fence_data(fence, skipped_keys)

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

    # Per-key validation checks each resource's SHAPE but never resolves a
    # `${ref()}`, because a TypeAdapter over one field has no view of the rest of
    # the project. Most doc fences are genuine fragments — they reference a model
    # the page defined three fences earlier — but a fence that carries everything
    # it references is a whole project missing only its `name:`, and for those the
    # resolution check is available for free. Take it: the same fence then fails
    # if one of its refs stops pointing at anything, which per-key validation can
    # never see. A fence that is NOT self-contained simply keeps the per-key
    # result, so this can only add coverage, never remove it.
    try:
        Project(**data, name=_SYNTHETIC_PROJECT_NAME)
    except Exception:  # noqa: BLE001 - a fragment; the per-key result stands
        return checked
    return [f"Project({', '.join(resource_keys)})"]


def resolves_refs(result):
    """True when ``validate_fence``'s result means the fence's refs were resolved."""
    return len(result) == 1 and result[0].startswith("Project(")


def ref_resolving_fences(fences):
    """Fences containing a ``ref(`` whose refs the harness actually resolved."""
    resolved = []
    for fence in fences:
        if fence.marker_kind or "ref(" not in fence.body:
            continue
        try:
            result = validate_fence(fence)
        except FenceError:
            continue
        if resolves_refs(result):
            resolved.append(fence)
    return resolved


def _describe(fence, exc):
    """The failure text. A harness whose output is unreadable gets disabled."""
    return (
        f"\n\n  {fence.label}"
        f"\n    first line: {fence.first_line}"
        f"\n    {textwrap.indent(str(exc), '    ').strip()}"
    )


def _skipped_key_rot(fence, key):
    """Why a ``skip-keys`` exemption is no longer needed, or None if it still is."""
    try:
        data = _fence_data(fence)
    except FenceError:
        # The fence as a whole does not even load; the fence-level result covers it.
        return None
    if key not in data:
        return f"`{key}:` is no longer a top-level key of this fence"
    if key not in _VALIDATORS:
        return None  # not a Visivo key at all — the exemption is doing real work
    try:
        _VALIDATORS[key](data[key])
    except Exception:  # noqa: BLE001 - still rejected, so still exempt
        return None
    return f"`{key}:` is now accepted by the schema, so it does not need exempting"


def _run(fences):
    """Return (failures, stale) for a fence list.

    ``stale`` entries are ``(marker_kind, message)``: an exemption that no longer
    describes reality. EVERY marker kind is checked, `skip` included — an
    unchecked `skip` is the silent skip list this module exists to avoid, just
    relocated into the page, and it is the one marker a reviewer under time
    pressure can reach for to make any failing fence go away forever.
    """
    failures = []
    stale = []
    for fence in fences:
        kind = fence.marker_kind

        if kind == "skip":
            try:
                validate_fence(fence)
            except FenceError:
                pass  # still not Visivo config — the exemption is honest
            else:
                stale.append(
                    (
                        kind,
                        f"\n  {fence.label} — marked `visivo-example: skip` "
                        f"({fence.marker_reason!r}) but the whole fence now validates as "
                        "Visivo config. Drop the marker, or narrow it to "
                        "`skip-keys(...)` over the keys that really are foreign.",
                    )
                )
            continue

        skipped_keys = fence.marker_keys if kind == "skip-keys" else ()
        for key in skipped_keys:
            rot = _skipped_key_rot(fence, key)
            if rot:
                stale.append(
                    (
                        kind,
                        f"\n  {fence.label} — `skip-keys({key})` is stale: {rot}.",
                    )
                )

        exempt = kind in _MUST_FAIL_KINDS or fence.handoff is not None
        try:
            validate_fence(fence, skipped_keys)
        except FenceError as exc:
            if not exempt:
                failures.append(_describe(fence, exc))
        else:
            if exempt:
                reason = fence.handoff or f"visivo-example: {kind}"
                stale.append((kind or "handoff", f"\n  {fence.label} — recorded as {reason!r}"))
    return failures, stale


def _stale_of(kinds, fences):
    _, stale = _run(fences)
    return [message for kind, message in stale if kind in kinds]


# ===========================================================================
# Discovery sanity — a bad glob must not silently make this a no-op
# ===========================================================================
# Floors, not exact counts: the docs must be free to grow, and a fence may be
# legitimately deleted. But they sit just under the real numbers (96 markdown /
# 53 docstring at the time of writing), because a floor with 40% of slack in it
# lets an extractor regression quietly shed a third of the corpus and still pass
# — which is the same silent no-op these tests exist to catch. Lowering one is a
# deliberate act: say in the commit which fences went away and why.
_MARKDOWN_FENCE_FLOOR = 90
_DOCSTRING_FENCE_FLOOR = 50


def test_markdown_fences_are_discovered():
    fences = markdown_fences()
    assert len(fences) >= _MARKDOWN_FENCE_FLOOR, (
        f"Only {len(fences)} YAML fences found under {MKDOCS_DIR}, below the floor "
        f"of {_MARKDOWN_FENCE_FLOOR}. Either the fence regex or the docs tree moved "
        "and this harness has quietly shrunk, or fences were deliberately removed — "
        "in which case lower the floor in the same commit and say which ones."
    )


def test_docstring_fences_are_discovered():
    fences = docstring_fences()
    assert len(fences) >= _DOCSTRING_FENCE_FLOOR, (
        f"Only {len(fences)} YAML fences found in docstrings under {PACKAGE_DIR}, "
        f"below the floor of {_DOCSTRING_FENCE_FLOOR}. Model docstrings ARE the "
        "generated reference pages — if this count dropped, the extractor broke or "
        "examples were deleted."
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
        "schema. Users copy these, so fixing the example is almost always the "
        "answer. Exemptions, in order of preference: `<!-- visivo-example: "
        "skip-keys(models) - why -->` if only some top-level keys are foreign "
        "(the rest stays checked); `<!-- visivo-example: skip - why -->` if the "
        "whole block is not Visivo config; `invalid` for a deliberate "
        "counter-example. Every one of them is re-checked on every run." + "".join(failures)
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
# Field descriptions are published too — and no fence can reach them
# ===========================================================================
# A `Field(description=...)` string is not incidental: it is committed into
# `visivo/src/visivo_project_schema.json` (so it is the IDE tooltip a user reads
# while typing) and rendered onto the generated reference page. It is therefore
# exactly as copy-pasteable as a fenced example, and structurally invisible to
# the fence harness above. The one promise a description can make that the schema
# can contradict is "you may write a `${ ref() }` here".
_REF_PROMISE_RE = re.compile(r"\$\{\s*ref|\bref\(\s*\)", re.IGNORECASE)


def _all_visivo_models():
    import importlib
    import inspect
    import pkgutil

    import visivo.models as models_package
    from pydantic import BaseModel

    seen = {}
    for module_info in pkgutil.walk_packages(models_package.__path__, "visivo.models."):
        try:
            module = importlib.import_module(module_info.name)
        except Exception:  # pragma: no cover - an unimportable module is another test's job
            continue
        for _, obj in inspect.getmembers(module, inspect.isclass):
            if issubclass(obj, BaseModel) and obj.__module__.startswith("visivo."):
                seen[f"{obj.__module__}.{obj.__name__}"] = obj
    return sorted(seen.values(), key=lambda c: c.__name__)


def test_fields_that_promise_refs_actually_accept_them():
    """A description saying `${ ref() }` must be backed by an annotation that takes one.

    `Alert.destinations` said "Destination objects defined inline or `${ ref() }`s
    to destinations" while being a discriminated union of concrete destinations
    with no Ref member: `destinations: ["${ref(prod-slack)}"]` raised
    `Input should be a valid dictionary or object to extract fields from`. The
    example above it in the same docstring was fixed; the description one line
    below shipped the identical lie into the schema and onto the reference page,
    where no fence harness can ever see it.
    """
    liars = []
    for model in _all_visivo_models():
        for name, field in model.model_fields.items():
            if not _REF_PROMISE_RE.search(field.description or ""):
                continue
            adapter = TypeAdapter(field.annotation)
            for sample in ("${ref(some_name)}", ["${ref(some_name)}"]):
                try:
                    adapter.validate_python(sample)
                    break
                except Exception:  # noqa: BLE001 - try the list form too
                    continue
            else:
                liars.append(f"\n  {model.__name__}.{name}: {field.description!r}")
    assert not liars, (
        "These field descriptions promise a `${ ref() }` the annotation rejects. "
        "The string is committed into visivo_project_schema.json and rendered on "
        "the reference page, so it is as copy-pasteable as any example — either "
        "make the field accept a ref, or stop advertising it:" + "".join(liars)
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
    stale = _stale_of(_MUST_FAIL_KINDS + ("handoff",), all_fences())
    assert not stale, (
        "These fences are recorded as failing but now validate cleanly. Delete "
        "the marker (or the HANDOFFS entry):" + "".join(stale)
    )


def test_skip_markers_still_describe_non_visivo_config():
    """A `skip` must still be a non-example, and a `skip-keys` key still foreign.

    `skip` is the exemption with the widest blast radius — it exempts the WHOLE
    fence — and it is the one anybody can reach for to make a failing example go
    away. Without this test it is exactly the silent skip list the harness was
    built to replace, only written into the page. So `skip` is held to the same
    no-rot rule as `invalid`/`broken`: the fence must still be rejected. If only
    part of a fence is foreign (a dbt `schema.yml` whose `models:` is dbt's
    catalog, sharing a file with Visivo's `insights:`), the marker must be
    narrowed to `skip-keys(models)` so the Visivo half stays checked.
    """
    stale = _stale_of(_SKIP_KINDS, all_fences())
    assert not stale, (
        "These `skip` exemptions no longer describe reality — they are now hiding "
        "config the harness could be checking:" + "".join(stale)
    )


def test_handoffs_are_still_needed():
    """Every HANDOFFS entry must point at a fence that still exists.

    Keyed on the fence's content fingerprint, so the owning PR moving the fence
    down its page does not red this build (and does not aim a failure message at
    a file this branch is under orders not to touch). It goes red exactly when
    the fence's content changes — i.e. when the handoff has been honoured.
    """
    located = {(f.file, f.fingerprint) for f in all_fences()}
    missing = [
        f"{path} (fingerprint {fingerprint}) — {why}"
        for (path, fingerprint), why in HANDOFFS.items()
        if (path, fingerprint) not in located
    ]
    assert not missing, (
        "These HANDOFFS entries no longer match a fence (it was fixed, rewritten "
        "or deleted). Remove them:\n  " + "\n  ".join(missing)
    )


def test_every_handoff_entry_matches_a_fence_that_still_fails():
    """A handed-off fence must still be broken, and must still be found.

    The entry-point assertion for the real HANDOFFS dict: each entry has to
    resolve to a fence that exists AND that the schema still rejects. (The
    "still rejects" half is `test_must_fail_markers_still_describe_failing_fences`;
    this pins the lookup itself, so an entry can never quietly match nothing.)
    """
    by_key = {(f.file, f.fingerprint): f for f in all_fences()}
    for key, why in HANDOFFS.items():
        fence = by_key.get(key)
        assert fence is not None, f"HANDOFFS entry {key} matched no fence — {why}"
        with pytest.raises(FenceError):
            validate_fence(fence)


def test_handoff_keys_survive_the_fence_moving_down_its_page(monkeypatch):
    """Line drift above a handed-off fence must not red this build.

    A HANDOFFS entry names a fence in a file another open PR owns. That PR — or
    any unrelated typo fix on the page — shifts the fence's line number long
    before the fence itself is fixed. Keyed on a line number that shift produced
    two failures, one of them telling the author to go edit the very file the
    handoff exists to leave alone. Keyed on content it produces none, while a
    real fix to the fence still trips `test_handoffs_are_still_needed`.
    """
    page = "Prose.\n\n```yaml\ncharts:\n  - name: c\n    layout:\n      title: Revenue\n```\n"
    (fence,) = _fences_in_text(page, source="doc.md")
    monkeypatch.setitem(HANDOFFS, ("doc.md", fence.fingerprint), "PR #999 owns doc.md")
    assert fence.handoff == "PR #999 owns doc.md"

    drifted = "An unrelated new sentence.\n\n" + page
    (moved,) = _fences_in_text(drifted, source="doc.md")
    assert moved.line != fence.line, "the fence did not actually move"
    assert moved.handoff == "PR #999 owns doc.md"

    # ...but editing the fence's YAML *does* invalidate the entry, which is the
    # signal that the owning PR has done the work and the entry can go.
    fixed = page.replace("title: Revenue", "title:\n        text: Revenue")
    (rewritten,) = _fences_in_text(fixed, source="doc.md")
    assert rewritten.handoff is None


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
    assert validate_fence(_fence(body)) == ["Project(sources)"]


def test_every_fragment_spec_is_used_by_a_real_fence():
    """A fragment spec that nothing uses only widens the allowlist.

    Each key in `_FRAGMENT_SPECS` is also an exemption from the
    `unknown top-level key(s)` error, so a speculative entry admits a fence
    shape and then validates it with whatever leniency that owner happens to
    have. `interactions:` was exactly that: the interaction model accepts
    unknown keys, so `interactions:\\n  - bogus: 1` would have been waved
    through. Keys are added when a fence needs one, never in advance.
    """
    used = set()
    for fence in all_fences():
        try:
            data = yaml.safe_load(fence.body)
        except yaml.YAMLError:
            continue
        if isinstance(data, dict):
            used |= set(data) & set(_FRAGMENT_SPECS)
    unused = sorted(set(_FRAGMENT_SPECS) - used)
    assert not unused, (
        f"These fragment specs are used by no fence: {unused}. Each one exempts "
        "its key from the unknown-top-level-key check for nothing. Delete them; "
        "add one back the day a fence needs it."
    )


def test_harness_refuses_a_fragment_shape_it_cannot_check_strictly():
    """The removed `interactions` spec must now be refused, not waved through."""
    with pytest.raises(FenceError, match="unknown top-level key"):
        validate_fence(_fence("interactions:\n  - bogus_key: 1\n"))


# ---------------------------------------------------------------------------
# Ref resolution
# ---------------------------------------------------------------------------
def test_a_self_contained_fence_has_its_refs_resolved():
    """A fence that carries everything it references is checked as a Project.

    Per-key validation checks a resource's shape but can never resolve a
    `${ref()}` — a TypeAdapter over one field has no view of the rest of the
    project — so a one-character slip in a ref name used to ship green and then
    fail at `visivo compile` for the first person who copied it.
    """
    body = (
        "sources:\n"
        "  - name: scatter_data-source\n"
        "    type: duckdb\n"
        "    database: target/local.duckdb\n"
        "models:\n"
        "  - name: scatter_data\n"
        "    source: ${ref(scatter_data-source)}\n"
        "    sql: select 1 as x\n"
    )
    assert resolves_refs(validate_fence(_fence(body)))

    typo = body.replace("${ref(scatter_data-source)}", "${ref(scatter_data-sorce)}")
    assert not resolves_refs(validate_fence(_fence(typo))), (
        "a ref pointing at nothing must not be reported as resolved — otherwise "
        "the ref-resolution floor below cannot notice it"
    )


# How many ref-bearing fences per file the harness RESOLVES, rather than merely
# shape-checking. Most doc fences are genuine fragments that reference a model
# defined three fences earlier on the page, and for those a ref pointing at
# nothing is indistinguishable from a ref pointing at the rest of the page — so
# this counts only the fences that carry everything they reference.
#
# A count going DOWN is the signal: a self-contained example stopped being
# self-contained, which in practice means one of its `${ref(...)}`s stopped
# naming anything — the `bad_reference` that `visivo compile` throws at the first
# person who copies it. Per file rather than in total so the failure names the
# page to look at.
_REF_RESOLVING_FLOORS = {
    "mkdocs/topics/annotations.md": 11,
    "mkdocs/topics/dashboards.md": 2,
    "mkdocs/topics/source-types.md": 2,
    "visivo/models/chart.py": 3,
    "visivo/models/item.py": 1,
    "visivo/models/project.py": 1,
    "visivo/models/sources/csv_source.py": 1,
    "visivo/models/sources/excel_source.py": 1,
    "visivo/models/sources/seed.py": 2,
}


def test_ref_bearing_fences_keep_resolving_their_refs():
    counts = Counter(f.file for f in ref_resolving_fences(all_fences()))
    regressions = [
        f"\n  {file}: {counts.get(file, 0)} of {expected} ref-bearing fences still resolve"
        for file, expected in sorted(_REF_RESOLVING_FLOORS.items())
        if counts.get(file, 0) < expected
    ]
    assert not regressions, (
        "Ref-bearing examples that used to resolve as whole projects no longer do. "
        "The usual cause is a `${ref(...)}` in one of them that no longer names "
        "anything the fence defines — copy the fence into a `project.visivo.yml` "
        "and `visivo compile` will say `bad_reference`. If a fence was deliberately "
        "made to depend on something outside itself, lower its floor here and say "
        "why:" + "".join(regressions)
    )


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


# ---------------------------------------------------------------------------
# skip-keys: a hybrid fence keeps its Visivo half checked
# ---------------------------------------------------------------------------
_HYBRID_FENCE = (
    "insights:\n"
    "  - name: weekly_sales\n"
    "    props:\n"
    "      type: scatter\n"
    "models:\n"
    "  - name: widget_sales\n"
    "    description: dbt's model catalog, not Visivo's\n"
    "    columns:\n"
    "      - name: widget\n"
    "        description: the type of widget sold\n"
)


def test_skip_keys_exempts_only_the_named_key():
    """The rest of a hybrid fence is validated exactly as if it stood alone."""
    fence = _fence(_HYBRID_FENCE)
    with pytest.raises(FenceError, match="`models:`"):
        validate_fence(fence)
    assert validate_fence(fence, ("models",)) == ["Project(insights)"]


def test_skip_keys_still_catches_a_bad_example_in_the_kept_half():
    """The whole point: the exempt key must not shelter the keys beside it.

    `mkdocs/how_it_works.md`'s dbt tab is two-thirds Visivo config living beside
    dbt's `models:` catalog. Under a whole-fence `skip` a broken `props.type`
    there was invisible; under `skip-keys(models)` it is not.
    """
    broken = _HYBRID_FENCE.replace("type: scatter", "type: scattr")
    with pytest.raises(FenceError, match="`insights:`"):
        validate_fence(_fence(broken), ("models",))


def test_skip_keys_marker_parses_its_key_list():
    text = (
        "<!-- visivo-example: skip-keys(models, columns) - dbt's catalog, validated by dbt -->\n"
        "```yaml\n"
        "insights: []\n"
        "```\n"
    )
    (fence,) = _fences_in_text(text, source="doc.md")
    assert fence.marker_kind == "skip-keys"
    assert fence.marker_keys == ("models", "columns")
    assert "dbt" in fence.marker_reason


def test_a_stale_skip_keys_entry_is_reported():
    """Naming a key the fence no longer has, or one the schema now accepts."""
    text = (
        "<!-- visivo-example: skip-keys(models) - dbt's model catalog, validated by dbt -->\n"
        "```yaml\n"
        "sources:\n"
        "  - name: local\n"
        "    type: duckdb\n"
        "    database: target/local.duckdb\n"
        "```\n"
    )
    fences = _fences_in_text(text, source="doc.md")
    stale = _stale_of(_SKIP_KINDS, fences)
    assert len(stale) == 1 and "no longer a top-level key" in stale[0]


def test_a_skip_marker_on_valid_config_is_reported():
    """The anti-rot rule `skip` did not have: a skip must still be a non-example."""
    text = (
        "<!-- visivo-example: skip - claimed to be a GitHub Actions workflow -->\n"
        "```yaml\n"
        "sources:\n"
        "  - name: local\n"
        "    type: duckdb\n"
        "    database: target/local.duckdb\n"
        "```\n"
    )
    stale = _stale_of(_SKIP_KINDS, _fences_in_text(text, source="doc.md"))
    assert len(stale) == 1 and "now validates as Visivo config" in stale[0]


def test_a_skip_marker_on_a_genuine_non_example_is_not_reported():
    text = (
        "<!-- visivo-example: skip - a GitHub Actions workflow, not Visivo config -->\n"
        "```yaml\n"
        "on:\n"
        "  push:\n"
        "jobs:\n"
        "  build:\n"
        "    runs-on: ubuntu-latest\n"
        "```\n"
    )
    assert _stale_of(_SKIP_KINDS, _fences_in_text(text, source="doc.md")) == []


# ---------------------------------------------------------------------------
# Fence spellings the extractor must not silently drop
# ---------------------------------------------------------------------------
def test_uppercase_and_yml_fences_are_extracted():
    """```YAML and ```yml are fences a reader would expect to be checked.

    Neither spelling appears in the docs today; both are one keystroke away, and
    a fence the extractor cannot see is a published example nothing validates —
    the precise failure this module exists to prevent, arriving silently.
    """
    for opener in ("```YAML", "``` yml", "```Yml", "```yaml"):
        text = f"{opener}\nsources: []\n```\n"
        fences = _fences_in_text(text, source="doc.md")
        assert len(fences) == 1, f"{opener} was not extracted"


def test_a_yml_only_docstring_is_extracted():
    """The .py prefilter must accept exactly what the fence regex accepts.

    A ```yml example in a module that never spells out the word "yaml" was
    dropped by the `"yaml" not in source_text` fast path — no failure, no
    discovery-guard signal, just a published example nobody checks.
    """
    source = 'class Widget:\n    """Doc.\n\n    ```yml\n    sources: []\n    ```\n    """\n'
    assert "yaml" not in source
    fences = _fences_in_python_source(source, "visivo/models/widget.py")
    assert [f.source for f in fences] == ["visivo/models/widget.py::Widget"]
