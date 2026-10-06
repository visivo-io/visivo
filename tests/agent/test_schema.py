"""Per-type schema slices (VIS-1334).

The whole project schema is 3.2 MB and cannot go in a context window. What
makes a slice useful is not that it is small — it is that it is small AND
self-contained enough to author from, which is the tension these pin.
"""

import json

import pytest

from visivo.agent.schema import SchemaSlicer
from visivo.agent.tools import ToolError, call


@pytest.fixture(scope="module")
def slicer():
    """Generating the project schema is the expensive part; slice from one."""
    return SchemaSlicer()


def _kb(payload):
    return len(json.dumps(payload)) / 1024


class TestItFitsInAContextWindow:
    def test_a_model_is_under_ten_kilobytes(self, slicer):
        """Its raw transitive closure is 48 KB — a model's `source` field
        reaches every source flavour, and an agent authoring a model needs
        none of them."""
        assert _kb(slicer.for_type("models")) < 10

    @pytest.mark.parametrize(
        "type_key", ["models", "metrics", "dimensions", "relations", "markdowns", "tables"]
    )
    def test_the_types_an_agent_authors_are_small(self, slicer, type_key):
        assert _kb(slicer.for_type(type_key)) < 10

    def test_even_the_big_ones_are_kilobytes_not_megabytes(self, slicer):
        """Chart and insight closures ARE the whole 3.2 MB schema, because
        their props reach Plotly."""
        for type_key in ("charts", "insights", "sources", "dashboards", "inputs"):
            assert _kb(slicer.for_type(type_key)) < 50, type_key


class TestNoPlotlyEverArrives:
    """Layout is 414 KB and each trace def is 80–95 KB. They describe a
    rendering library, not Visivo's vocabulary."""

    def test_no_slice_embeds_layout_or_a_trace(self, slicer):
        for type_key in slicer.type_keys():
            embedded = slicer.for_type(type_key)["$defs"]
            for heavy in ("Layout", "Scatter", "Scatter3d", "Bar"):
                assert heavy not in embedded, f"{type_key} embedded {heavy}"

    def test_no_slice_is_anywhere_near_the_whole_schema(self, slicer):
        for type_key in slicer.type_keys():
            assert _kb(slicer.for_type(type_key)) < 100, type_key

    def test_a_chart_is_told_what_to_do_instead(self, slicer):
        notes = " ".join(slicer.for_type("charts")["notes"])

        assert "validate_chart" in notes


class TestAStoppedReferenceSaysWhereToGo:
    """A dangling `$ref` an agent cannot resolve is worse than a pointer."""

    def test_a_models_source_points_at_the_source_type(self, slicer):
        text = json.dumps(slicer.for_type("models"))

        assert "get_schema('sources')" in text
        assert "${ref(name)}" in text

    def test_no_slice_leaves_an_unresolvable_ref(self, slicer):
        """Every `#/$defs/x` a slice still mentions must be a def it carries."""
        for type_key in slicer.type_keys():
            sliced = slicer.for_type(type_key)
            carried = set(sliced["$defs"])
            referenced = set()
            _collect_refs(sliced["$defs"], referenced)
            assert referenced <= carried, (type_key, referenced - carried)

    def test_a_union_type_says_it_is_one(self, slicer):
        notes = " ".join(slicer.for_type("dashboards")["notes"])

        assert "union" in notes.lower()
        assert "ExternalDashboard" in notes


class TestTheTool:
    def test_it_takes_the_singular_an_agent_would_reach_for(self):
        """Every other tool is named get_model, write_model — so 'model' is
        what an agent will pass."""
        assert call(None, "get_schema", {"type": "model"}) == call(
            None, "get_schema", {"type": "models"}
        )

    def test_an_unknown_type_lists_the_real_ones(self):
        with pytest.raises(ToolError, match="models"):
            call(None, "get_schema", {"type": "widget"})

    def test_it_says_what_it_needs(self):
        with pytest.raises(ToolError, match="'type' is required"):
            call(None, "get_schema", {})


class TestAuthoringFromTheSliceAlone:
    """The acceptance that matters: the slice has to be enough to write a
    valid object with, not merely small."""

    def _required(self, sliced, def_name):
        return set(sliced["$defs"][def_name].get("required", []))

    def test_a_slice_says_a_name_is_needed(self, slicer):
        """SqlModel's schema marks nothing required — but `write_model` stores
        the object under its name and rejects a config without one. The note
        closes that gap so the agent does not learn it from a rejection."""
        notes = " ".join(slicer.for_type("models")["notes"])

        assert "name" in notes
        assert "sql" in slicer.for_type("models")["$defs"]["SqlModel"]["properties"]

    def test_and_what_it_says_actually_validates(self, integration_app, slicer):
        """Authored from the slice, checked by the manager the routes use."""
        sliced = slicer.for_type("models")
        assert "sql" in sliced["$defs"]["SqlModel"]["properties"]

        result = call(
            integration_app,
            "validate_model",
            {"config": {"name": "from-slice", "sql": "select 1 as x"}},
        )

        assert result == {"valid": True}

    def test_a_metric_authored_from_its_slice_validates(self, integration_app, slicer):
        sliced = slicer.for_type("metrics")
        assert "expression" in self._required(sliced, "Metric")

        result = call(
            integration_app,
            "validate_metric",
            # No hyphen: a metric name becomes a SQL identifier.
            {"config": {"name": "from_slice", "expression": "sum(x)"}},
        )

        assert result == {"valid": True}

    def test_and_a_rejection_says_what_to_fix(self, integration_app):
        """The other half of "author with get_schema plus validate": when the
        slice does not carry a constraint, the rejection has to name it."""
        result = call(
            integration_app,
            "validate_metric",
            {"config": {"name": "from-slice", "expression": "sum(x)"}},
        )

        assert result["valid"] is False
        assert "letters" in result["error"]


def _collect_refs(node, found):
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "$ref" and isinstance(value, str) and value.startswith("#/$defs/"):
                found.add(value.rsplit("/", 1)[-1])
            else:
                _collect_refs(value, found)
    elif isinstance(node, list):
        for item in node:
            _collect_refs(item, found)
