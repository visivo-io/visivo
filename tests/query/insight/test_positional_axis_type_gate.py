"""WB9 / S5-14: the build-time gate on positional-axis prop types.

The failure this closes: an insight whose ``x`` (or any other coordinate)
resolves to a record-shaped SQL type builds "successfully" and renders a BLANK
chart with a SUCCESS job. The canonical producer is a doubled query string
``?{?{col}}`` — SQLGlot parses the residual ``?{col}`` as a DuckDB struct
literal, which round-trips through parquet as ``STRUCT(VARCHAR)``.

Three properties are pinned here, each falsifiable on its own:
1. a STRUCT on a positional axis FAILS the build, with the insight, prop,
   column and type in the message;
2. a STRUCT on a NON-positional prop is untouched (the gate is scoped);
3. every type an axis can render is still accepted (no over-rejection).
"""

import json
import os

import pytest
from sqlglot import exp

from visivo.models.diagnostic import (
    DIAGNOSTIC_CODES,
    Diagnostic,
    DiagnosticPhase,
    DiagnosticSeverity,
)
from visivo.models.insight import Insight
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.props.insight_props import InsightProps
from visivo.query.insight.insight_query_builder import InsightQueryBuilder
from visivo.query.insight.prop_type_validator import (
    NON_PLOTTABLE_AXIS_TYPES,
    PLOTTABLE_AXIS_TYPES,
    POSITIONAL_AXIS_PROP_NAMES,
    PositionalAxisTypeError,
    axis_plottability,
    check_positional_axis_plottability,
    is_positional_axis_prop,
)
from tests.factories.model_factories import SourceFactory

# ---------------------------------------------------------------------------
# Build harness: a real InsightQueryBuilder over a one-model project.
# ---------------------------------------------------------------------------


@pytest.fixture
def build_insight(tmpdir):
    def _build(insight, schema=None, force_dynamic=False):
        source = SourceFactory()
        model = SqlModel(name="m", sql="SELECT * FROM t", source=f"ref({source.name})")
        project = Project(
            name="p", sources=[source], models=[model], insights=[insight], dashboards=[]
        )
        dag = project.dag()
        schema_dir = os.path.join(str(tmpdir), "schemas")
        os.makedirs(schema_dir, exist_ok=True)
        with open(os.path.join(schema_dir, f"{model.name}.json"), "w") as f:
            json.dump(
                {model.name_hash(): schema or {"site": "VARCHAR", "amt": "DOUBLE"}},
                f,
            )
        builder = InsightQueryBuilder(insight, dag, str(tmpdir), force_dynamic=force_dynamic)
        builder.resolve()
        return builder.build()

    return _build


# ---------------------------------------------------------------------------
# 1. STRUCT on a positional axis is REJECTED (the S5-14 regression)
# ---------------------------------------------------------------------------


def test_struct_on_x_fails_the_build_naming_insight_prop_column_and_type(build_insight):
    """The exact S5-14 shape: ``x: ?{?{col}}``. Today it builds and renders
    blank; the gate must abort the build."""
    insight = Insight(
        name="site_totals",
        props=InsightProps(
            type="bar",
            x="?{?{${ref(m).site}}}",
            y="?{count(${ref(m).amt})}",
        ),
    )
    with pytest.raises(PositionalAxisTypeError) as excinfo:
        build_insight(insight)

    message = str(excinfo.value)
    assert "site_totals" in message, message  # the insight
    assert "props.x" in message, message  # the prop
    assert "'site'" in message, message  # the column
    assert "STRUCT" in message, message  # the type
    # Actionable: points at the doubled query string that produced it.
    assert "?{?{" in message, message


def test_struct_on_x_carries_a_structured_diagnostic(build_insight):
    insight = Insight(
        name="site_totals",
        props=InsightProps(type="bar", x="?{?{${ref(m).site}}}", y="?{count(${ref(m).amt})}"),
    )
    with pytest.raises(PositionalAxisTypeError) as excinfo:
        build_insight(insight)

    diagnostic = excinfo.value.diagnostic
    assert isinstance(diagnostic, Diagnostic)
    assert diagnostic.code == "non_plottable_axis_type"
    assert diagnostic.code in DIAGNOSTIC_CODES
    assert diagnostic.phase == DiagnosticPhase.COMPILE
    assert diagnostic.severity == DiagnosticSeverity.ERROR
    assert diagnostic.object.type == "insight"
    assert diagnostic.object.name == "site_totals"
    assert diagnostic.field == "props.x"
    assert "STRUCT" in (diagnostic.detail or "")
    assert diagnostic.hint
    # Stable across polls — derived from phase/code/object/field, not random.
    assert diagnostic.id == "compile:non_plottable_axis_type:site_totals:props.x"


def test_struct_on_y_also_fails(build_insight):
    insight = Insight(
        name="i",
        props=InsightProps(type="bar", x="?{${ref(m).site}}", y="?{?{${ref(m).amt}}}"),
    )
    with pytest.raises(PositionalAxisTypeError) as excinfo:
        build_insight(insight)
    assert "props.y" in str(excinfo.value)


def test_struct_on_the_dynamic_preview_path_also_fails(build_insight):
    """The Explorer preview (force_dynamic) build must gate too — that is the
    surface where the blank chart is actually seen."""
    insight = Insight(
        name="i",
        props=InsightProps(type="bar", x="?{?{${ref(m).site}}}", y="?{count(${ref(m).amt})}"),
    )
    with pytest.raises(PositionalAxisTypeError):
        build_insight(insight, force_dynamic=True)


# ---------------------------------------------------------------------------
# 2. The gate is SCOPED — non-positional props are untouched
# ---------------------------------------------------------------------------


def test_struct_on_a_non_positional_prop_is_unaffected(build_insight):
    """``customdata`` legitimately carries arbitrary nested values in Plotly;
    a record there must NOT fail the build."""
    insight = Insight(
        name="i",
        props=InsightProps(
            type="bar",
            x="?{${ref(m).site}}",
            y="?{count(${ref(m).amt})}",
            customdata="?{?{${ref(m).site}}}",
        ),
    )
    query_info = build_insight(insight)
    assert "props.customdata" in query_info.props_mapping


def test_struct_on_a_nested_prop_named_like_an_axis_is_unaffected(build_insight):
    """``props.marker.color`` — and any other leaf that happens to share a
    name with an axis — is not a coordinate. Matching is anchored to the
    top-level ``props.<name>`` path."""
    assert is_positional_axis_prop("props.x") is True
    assert is_positional_axis_prop("props.domain.x") is False
    assert is_positional_axis_prop("props.error_x.array") is False
    assert is_positional_axis_prop("props.marker.colorscale[0]") is False
    assert is_positional_axis_prop("props.ids") is False
    assert is_positional_axis_prop("props.customdata") is False
    assert is_positional_axis_prop("") is False
    assert is_positional_axis_prop("split") is False


def test_every_declared_positional_name_is_recognised():
    for name in POSITIONAL_AXIS_PROP_NAMES:
        assert is_positional_axis_prop(f"props.{name}") is True, name


def test_check_returns_none_for_a_non_positional_prop():
    assert (
        check_positional_axis_plottability(
            insight_name="i",
            prop_path="props.customdata",
            sqlglot_dtype=_dtype("STRUCT"),
        )
        is None
    )


# ---------------------------------------------------------------------------
# 3. NO over-rejection — every plottable type still builds
# ---------------------------------------------------------------------------


def _dtype(type_name):
    """Build a bare ``exp.DataType`` from a sqlglot type NAME.

    ``exp.DataType.build`` goes through the SQL parser and cannot round-trip
    every member of ``DataType.Type`` (UBIGINT, TIMESTAMP_S, LOWCARDINALITY,
    ...), so the enum member is used directly — exactly the shape
    ``annotate_types`` hands the gate at runtime.
    """
    return exp.DataType(this=exp.DataType.Type[type_name])


@pytest.mark.parametrize("type_name", sorted(PLOTTABLE_AXIS_TYPES))
def test_every_plottable_type_is_accepted_on_a_positional_axis(type_name):
    """Guard against the gate widening into a false positive: a type an axis
    CAN render must never produce a diagnostic."""
    dtype = _dtype(type_name)
    assert axis_plottability(dtype) == "plottable", type_name
    assert (
        check_positional_axis_plottability(
            insight_name="i", prop_path="props.x", sqlglot_dtype=dtype
        )
        is None
    ), type_name


def test_unrecognised_types_pass_through_rather_than_failing():
    """A type in neither list classes as 'unknown' and the gate does nothing —
    a build that used to work must not start failing because sqlglot grew a
    type name we have not triaged."""
    for type_name in ("GEOMETRY", "GEOGRAPHY", "POINT", "VECTOR", "HLLSKETCH", "BLOB"):
        dtype = _dtype(type_name)
        assert axis_plottability(dtype) == "unknown", type_name
        assert (
            check_positional_axis_plottability(
                insight_name="i", prop_path="props.x", sqlglot_dtype=dtype
            )
            is None
        ), type_name


def test_unknown_type_inference_passes():
    assert axis_plottability(None) == "unknown"
    assert (
        check_positional_axis_plottability(
            insight_name="i", prop_path="props.x", sqlglot_dtype=None
        )
        is None
    )


def test_array_types_are_deliberately_not_rejected():
    """A positional prop with a scalar slice (``x: ?{...}[0]``) binds ONE
    row's value, so an array column is a perfectly plottable array. Rejecting
    ARRAY/LIST would be a real false positive."""
    for type_name in ("ARRAY", "LIST"):
        dtype = _dtype(type_name)
        assert axis_plottability(dtype) != "non_plottable", type_name


def test_ordinary_insight_still_builds(build_insight):
    insight = Insight(
        name="i",
        props=InsightProps(type="bar", x="?{${ref(m).site}}", y="?{count(${ref(m).amt})}"),
    )
    query_info = build_insight(insight)
    assert query_info.props_mapping["props.x"]
    assert query_info.props_mapping["props.y"]


@pytest.mark.parametrize(
    "column_type",
    ["VARCHAR", "DOUBLE", "BIGINT", "DATE", "TIMESTAMP", "BOOLEAN", "DECIMAL(10,2)"],
)
def test_real_columns_of_every_common_type_still_build(build_insight, column_type):
    """End-to-end over the real builder, not just the classifier: the
    ordinary column types every project uses must keep building."""
    insight = Insight(
        name="i",
        props=InsightProps(type="scatter", x="?{${ref(m).col}}", y="?{count(${ref(m).amt})}"),
    )
    query_info = build_insight(insight, schema={"col": column_type, "amt": "DOUBLE"})
    assert query_info.props_mapping["props.x"]


# ---------------------------------------------------------------------------
# Classifier internals
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("type_name", sorted(NON_PLOTTABLE_AXIS_TYPES))
def test_every_non_plottable_type_is_rejected(type_name):
    dtype = _dtype(type_name)
    assert axis_plottability(dtype) == "non_plottable", type_name
    diagnostic = check_positional_axis_plottability(
        insight_name="i", prop_path="props.y", sqlglot_dtype=dtype
    )
    assert diagnostic is not None, type_name
    assert diagnostic.code == "non_plottable_axis_type"


def test_every_listed_type_name_is_a_real_sqlglot_type():
    """Both lists are keyed on ``exp.DataType.Type`` MEMBER names — what
    ``annotate_types`` puts in ``DataType.this``. A SQL spelling that is not a
    member (``INTEGER``, ``REAL``, ``STRING``) would be a dead entry that
    silently never matches, so pin it."""
    members = {t.name for t in exp.DataType.Type}
    assert PLOTTABLE_AXIS_TYPES <= members, sorted(PLOTTABLE_AXIS_TYPES - members)
    assert NON_PLOTTABLE_AXIS_TYPES <= members, sorted(NON_PLOTTABLE_AXIS_TYPES - members)


def test_plottable_and_non_plottable_sets_are_disjoint():
    assert not (PLOTTABLE_AXIS_TYPES & NON_PLOTTABLE_AXIS_TYPES)


def test_all_record_shaped_sqlglot_types_are_covered():
    """sqlglot's own record-type set must be fully claimed by the denylist —
    if it grows a record type we do not list, this test says so."""
    record_type_names = {t.value for t in exp.DataType.STRUCT_TYPES}
    assert record_type_names <= NON_PLOTTABLE_AXIS_TYPES


@pytest.mark.parametrize("resolved_sql", [None, "", "1 + 1"])
def test_message_omits_the_column_clause_when_there_is_no_column(resolved_sql):
    """No resolvable source column (or no expression at all) must still
    produce a complete, non-garbled message."""
    diagnostic = check_positional_axis_plottability(
        insight_name="i",
        prop_path="props.x",
        sqlglot_dtype=_dtype("STRUCT"),
        resolved_sql=resolved_sql,
        dialect="duckdb",
    )
    assert diagnostic is not None
    assert "built from column" not in diagnostic.message
    assert "props.x" in diagnostic.message
    assert "STRUCT" in diagnostic.message


def test_message_names_multiple_source_columns():
    diagnostic = check_positional_axis_plottability(
        insight_name="i",
        prop_path="props.x",
        sqlglot_dtype=_dtype("STRUCT"),
        resolved_sql='{\'_0\': "t"."site", \'_1\': "t"."region"}',
        dialect="duckdb",
    )
    assert diagnostic is not None
    assert "'site'" in diagnostic.message
    assert "'region'" in diagnostic.message


def test_positional_axis_error_message_includes_the_hint():
    diagnostic = check_positional_axis_plottability(
        insight_name="i",
        prop_path="props.x",
        sqlglot_dtype=_dtype("STRUCT"),
    )
    error = PositionalAxisTypeError(diagnostic)
    assert diagnostic.message in str(error)
    assert diagnostic.hint in str(error)
    assert isinstance(error, ValueError)
