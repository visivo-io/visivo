"""The viewer's interaction help text is the model's, or it is a lie.

`viewer/src/schemas/interactionHelp.js` supplies the label, description and
example the insight editors show under each interaction field. Before it
existed, those strings were retyped by hand in each editor, and the sort field
ended up advertising `date DESC` — a value `InsightInteraction.sort` rejects
(it is a `QueryString`, so it must be `?{ ... }`) and which, even wrapped,
names a loose column the semantic layer cannot resolve.

A jest test already pins that module against the VENDORED
`viewer/src/schemas/visivo_project_schema.json`. This one closes the other end:
it reads the strings straight out of the live Pydantic model, so a stale
vendored schema cannot hide a drift. If it fails, either re-copy the schema and
update `interactionHelp.js`, or the model's wording changed and the UI needs to
follow it.
"""

import json
import re
from pathlib import Path

import pytest

from visivo.models.interaction import InsightInteraction
from visivo.models.base.query_string import QueryString
from visivo.query.patterns import QUERY_STRING_VALUE_PATTERN

INTERACTION_HELP_JS = (
    Path(__file__).parent.parent.parent / "viewer" / "src" / "schemas" / "interactionHelp.js"
)

FIELDS = ("filter", "split", "sort")


def _js_source() -> str:
    assert INTERACTION_HELP_JS.exists(), f"missing {INTERACTION_HELP_JS}"
    return INTERACTION_HELP_JS.read_text()


def _entry(source: str, field: str) -> dict:
    """Pull one `<field>: Object.freeze({ ... })` block out of the module.

    Deliberately a small hand parser rather than a JS runtime: this test's job
    is to compare STRINGS, and a node dependency in the Python suite would buy
    nothing.
    """
    start = source.index(f"  {field}: Object.freeze({{")
    end = source.index("}),", start)
    block = source[start:end]
    out = {}
    for key in ("label", "description", "yamlExample", "example"):
        match = re.search(rf"{key}:\s*\n?\s*'((?:[^'\\]|\\.)*)'", block)
        assert match, f"{field}.{key} not found in interactionHelp.js"
        out[key] = match.group(1).replace("\\'", "'").replace("\\\\", "\\")
    return out


@pytest.fixture(scope="module")
def help_entries() -> dict:
    source = _js_source()
    return {field: _entry(source, field) for field in FIELDS}


@pytest.mark.parametrize("field", FIELDS)
def test_help_description_matches_the_model_field(field, help_entries):
    """The hint under the field IS the Pydantic field's description."""
    expected = InsightInteraction.model_fields[field].description
    assert help_entries[field]["description"] == expected


@pytest.mark.parametrize("field", FIELDS)
def test_help_example_matches_the_model_docstring(field, help_entries):
    """The advertised example IS the one the docs site publishes."""
    docstring = InsightInteraction.__doc__ or ""
    published = {}
    for line in docstring.splitlines():
        match = re.match(r"\s*-\s+(filter|split|sort):\s*(.+?)\s*$", line)
        if match:
            published[match.group(1)] = match.group(2)
    assert help_entries[field]["yamlExample"] == published[field]


@pytest.mark.parametrize("field", FIELDS)
def test_the_advertised_example_is_accepted_by_the_model(field, help_entries):
    """C15's core claim: copy the hint, get a value that saves.

    The editors wrap what the user types, so the check is on the wrapped form
    of `example` — which must also equal the documented `yamlExample`.
    """
    body = help_entries[field]["example"]
    assert "?{" not in body, "the hint shows the BODY; the editor adds the wrapper"

    stored = "?{" + body + "}"
    interaction = InsightInteraction(**{field: stored})
    assert getattr(interaction, field).get_value() == body

    yaml_example = help_entries[field]["yamlExample"]
    assert re.match(QUERY_STRING_VALUE_PATTERN, yaml_example)
    assert QueryString(yaml_example).get_value() == body


@pytest.mark.parametrize("field", FIELDS)
def test_the_advertised_example_names_a_real_ref(field, help_entries):
    """Not a loose column.

    `?{date DESC}` clears the parser and then dies at the binder, because the
    resolver only rewrites `${ref(...)}` tokens. Every example must carry one.
    """
    assert re.search(r"\$\{\s*ref\(", help_entries[field]["example"])


def test_the_bare_form_the_old_hint_taught_is_still_rejected():
    """The regression that made C15 worth fixing, pinned.

    If `InsightInteraction` ever starts accepting bare bodies, this test fails
    and someone gets to decide whether the hint should change back — rather
    than the two drifting apart again in silence.
    """
    with pytest.raises(Exception) as excinfo:
        InsightInteraction(sort="date DESC")
    assert "?{" in str(excinfo.value)


def test_no_help_string_advertises_date_desc(help_entries):
    assert not re.search(r"date\s+DESC", json.dumps(help_entries), re.IGNORECASE)


def test_help_covers_exactly_the_fields_the_model_declares(help_entries):
    assert set(help_entries) == set(InsightInteraction.model_fields)
