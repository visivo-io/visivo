"""Unit coverage for the shared draft-endpoint helpers (Explore 2.0 Phase 4 —
extracted from the near-verbatim duplication between the compile and execute
draft endpoints)."""

import pytest
from flask import Flask

from visivo.server.views.insight_draft_common import (
    parse_draft_request,
    build_schema_overrides,
    diagnostic_fields,
    is_model_not_run_error,
    extract_model_not_run_name,
)


@pytest.fixture
def app_ctx():
    # parse_draft_request builds error responses with jsonify → needs an app ctx.
    app = Flask(__name__)
    with app.app_context():
        yield


def test_parse_valid_request_returns_fields(app_ctx):
    fields, error = parse_draft_request(
        {"insight": {"name": "x"}, "draft_models": [{"name": "m", "sql": "select 1"}]}
    )
    assert error is None
    assert fields["insight_config"] == {"name": "x"}
    assert fields["draft_models"] == [{"name": "m", "sql": "select 1"}]
    assert fields["draft_metrics"] == []
    assert fields["draft_dimensions"] == []
    assert fields["model_schemas"] == {}


def test_parse_non_dict_body_is_400(app_ctx):
    fields, error = parse_draft_request("not json")
    assert fields is None
    assert error[1] == 400


def test_parse_missing_insight_name_is_400(app_ctx):
    assert parse_draft_request({"insight": {}})[1][1] == 400
    assert parse_draft_request({})[1][1] == 400


def test_parse_model_schemas_non_dict_is_400_not_500(app_ctx):
    # The Phase 4 review fix: `data.get("model_schemas") or {}` only defaults on
    # falsy values, so a truthy non-dict (a JSON list) would otherwise reach
    # `.items()` and raise a raw 500. It must be a clean 400 instead.
    fields, error = parse_draft_request({"insight": {"name": "x"}, "model_schemas": [1, 2]})
    assert fields is None
    assert error[1] == 400


class _Node:
    def __init__(self, h):
        self._h = h

    def name_hash(self):
        return self._h


def test_build_schema_overrides_shapes_columns_by_model_hash():
    class Dag:
        def get_descendant_by_name(self, name):
            return _Node("mhash")

    assert build_schema_overrides(Dag(), {"m": {"x": "INTEGER"}}) == {
        "m": {"mhash": {"x": "INTEGER"}}
    }


def test_build_schema_overrides_skips_non_dict_columns_and_unknown_models():
    class Dag:
        def get_descendant_by_name(self, name):
            if name == "known":
                return _Node("h")
            raise KeyError(name)

    result = build_schema_overrides(
        Dag(), {"known": {"x": "INT"}, "bad_cols": [1, 2], "unknown": {"y": "INT"}}
    )
    assert result == {"known": {"h": {"x": "INT"}}}


def test_build_schema_overrides_tolerates_empty_or_none():
    class Dag:
        def get_descendant_by_name(self, name):
            return _Node("h")

    assert build_schema_overrides(Dag(), {}) == {}
    assert build_schema_overrides(Dag(), None) == {}


def test_model_not_run_markers_and_name_extraction():
    ast_msg = "Schema not found for model 'orders_q'. Has the model been executed yet?"
    dyn_msg = "Missing schema for model: cohort_q."
    assert is_model_not_run_error(ast_msg)
    assert is_model_not_run_error(dyn_msg)
    assert not is_model_not_run_error("some other error")
    assert not is_model_not_run_error(None)
    assert extract_model_not_run_name(ast_msg) == "orders_q"
    assert extract_model_not_run_name(dyn_msg) == "cohort_q"
    assert extract_model_not_run_name("no name here") is None


class TestDiagnosticFields:
    """WB9: build failures that carry a Diagnostic surface it on the 400 body;
    every other failure leaves the body byte-identical to before."""

    def test_returns_the_serialised_diagnostic_when_the_error_carries_one(self):
        from visivo.models.diagnostic import Diagnostic, DiagnosticPhase
        from visivo.query.insight.prop_type_validator import PositionalAxisTypeError

        diagnostic = Diagnostic(
            phase=DiagnosticPhase.COMPILE,
            code="non_plottable_axis_type",
            message="positional axis prop 'props.x' resolves to a STRUCT",
            field="props.x",
        )
        fields = diagnostic_fields(PositionalAxisTypeError(diagnostic))
        assert fields["diagnostic"]["code"] == "non_plottable_axis_type"
        assert fields["diagnostic"]["phase"] == "compile"
        assert fields["diagnostic"]["field"] == "props.x"
        # exclude_none: absent optionals must not become explicit nulls.
        assert "location" not in fields["diagnostic"]

    def test_returns_nothing_for_an_ordinary_exception(self):
        assert diagnostic_fields(ValueError("boom")) == {}

    def test_returns_nothing_when_the_attribute_is_not_a_diagnostic(self):
        class Weird(Exception):
            diagnostic = "not a model"

        assert diagnostic_fields(Weird()) == {}
