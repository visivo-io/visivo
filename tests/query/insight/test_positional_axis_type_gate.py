"""WB9 / S5-14: the build-time gate on positional-axis prop types.

The failure this closes: an insight whose ``x`` (or any other coordinate)
resolves to a record-shaped SQL type builds "successfully" and renders a BLANK
chart with a SUCCESS job. The canonical producer is a doubled query string
``?{?{col}}`` — SQLGlot parses the residual ``?{col}`` as a DuckDB struct
literal, which round-trips through parquet as ``STRUCT(VARCHAR)``.

Properties pinned here, each falsifiable on its own:
1. a STRUCT on a positional axis FAILS the build, with the insight, prop,
   column and type in the message;
2. a STRUCT on a NON-positional prop is untouched (the gate is scoped);
3. every type an axis can render is still accepted (no over-rejection);
4. the semi-structured family (OBJECT/VARIANT/ARRAY/SUPER/JSON) classifies
   CONSISTENTLY — those columns arrive as JSON text and plot as categories, so
   rejecting one of them while accepting its siblings is the over-rejection
   that shipped once already;
5. a prop that references an INPUT is gated too — its ``${input.accessor}``
   placeholder makes the resolved SQL unparseable, which used to drop the gate
   open on exactly the dynamic lane where the blank chart is seen;
6. ``props.value`` — the indicator datum — is a coordinate like any other.

Note on what counts as coverage here: the parametrisations over
``PLOTTABLE_AXIS_TYPES`` / ``NON_PLOTTABLE_AXIS_TYPES`` feed the classifier its
OWN member names, so they pin the classifier contract but cannot fail
independently of ``test_plottable_and_non_plottable_sets_are_disjoint``. The
real over-rejection guards are the ones that run the actual
``InsightQueryBuilder`` over a real schema —
``test_real_columns_of_every_common_type_still_build``,
``test_semi_structured_columns_still_build``,
``test_an_unsliced_array_column_still_builds`` and
``test_the_input_column_picker_itself_still_builds``.
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
def make_builder(tmpdir):
    def _make(insight, schema=None, force_dynamic=False, inputs=None, resolve=True):
        source = SourceFactory()
        model = SqlModel(name="m", sql="SELECT * FROM t", source=f"ref({source.name})")
        project = Project(
            name="p",
            sources=[source],
            models=[model],
            insights=[insight],
            inputs=inputs or [],
            dashboards=[],
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
        if resolve:
            builder.resolve()
        return builder

    return _make


@pytest.fixture
def build_insight(make_builder):
    def _build(insight, schema=None, force_dynamic=False, inputs=None):
        return make_builder(
            insight, schema=schema, force_dynamic=force_dynamic, inputs=inputs
        ).build()

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
    """ARRAY/LIST stay fail-open in BOTH authoring forms.

    Sliced (``x: ?{...}[0]``) the prop binds ONE row's value, so an array
    column is a plottable array of scalars. Unsliced it binds an array of
    arrays, which a linear axis really does draw as nothing — but sqlglot
    spells DuckDB's genuinely-nested LIST and Snowflake's ARRAY (a VARIANT
    constrained to arrays, delivered as JSON *text* and perfectly plottable)
    with the SAME ``DataType.Type.ARRAY``. Rejecting the unsliced case would
    hard-fail every Snowflake ARRAY column on an axis, so the ambiguity is
    resolved in favour of the false negative — the same call made for OBJECT,
    in the opposite direction.
    """
    for type_name in ("ARRAY", "LIST"):
        dtype = _dtype(type_name)
        assert axis_plottability(dtype) != "non_plottable", type_name


def test_an_unsliced_array_column_still_builds(build_insight):
    """The unsliced form specifically — end to end, not just the classifier.
    Pinned so that adding ARRAY to the denylist (which would break every
    Snowflake ARRAY column) cannot happen silently."""
    insight = Insight(
        name="i",
        props=InsightProps(
            type="bar",
            x="?{array_agg(${ref(m).site})}",
            y="?{count(${ref(m).amt})}",
        ),
    )
    query_info = build_insight(insight)
    assert query_info.props_mapping["props.x"]


# ---------------------------------------------------------------------------
# 3b. Semi-structured columns are NOT records on the wire
# ---------------------------------------------------------------------------


SEMI_STRUCTURED_COLUMN_TYPES = ["OBJECT", "VARIANT", "ARRAY", "SUPER", "JSON", "JSONB"]


@pytest.mark.parametrize("column_type", SEMI_STRUCTURED_COLUMN_TYPES)
def test_semi_structured_columns_still_build(build_insight, column_type):
    """Snowflake's OBJECT/VARIANT/ARRAY, Redshift's SUPER and JSON/JSONB all
    arrive as JSON *text* after the connector + parquet round trip, and plot as
    categories. Every one of them must keep building.

    OBJECT is the one that regressed: it is a member of sqlglot's
    ``DataType.STRUCT_TYPES``, so classifying by that grouping denylisted it
    while its identically-shaped sibling VARIANT stayed allowlisted — a hard
    build failure on a project that renders today.
    """
    insight = Insight(
        name="obj",
        props=InsightProps(type="bar", x="?{${ref(m).payload}}", y="?{count(${ref(m).id})}"),
    )
    query_info = build_insight(insight, schema={"payload": column_type, "id": "BIGINT"})
    assert query_info.props_mapping["props.x"]


def test_semi_structured_types_are_classified_consistently():
    """The whole family classifies the SAME way. The bug was one member of it
    classifying differently from the rest on reasoning that applied to all."""
    classifications = {t: axis_plottability(_dtype(t)) for t in SEMI_STRUCTURED_COLUMN_TYPES}
    assert classifications["OBJECT"] == classifications["VARIANT"], classifications
    assert {c for t, c in classifications.items() if t != "ARRAY"} == {"plottable"}, classifications


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
    [
        # SQL SPELLINGS, as a model's schema JSON actually records them — not
        # ``DataType.Type`` member names. That gap is where a dead allowlist
        # entry hides: a schema saying "INTEGER"/"REAL"/"DOUBLE PRECISION"
        # reaches the classifier as INT/FLOAT/DOUBLE, so listing the spelling
        # instead of the member would silently never match. Only a real build
        # closes that loop; the parametrisation over the allowlist itself
        # cannot, because it feeds the classifier its own member names.
        "VARCHAR",
        "TEXT",
        "CHAR(3)",
        "NVARCHAR(50)",
        "STRING",
        "INTEGER",
        "BIGINT",
        "SMALLINT",
        "REAL",
        "DOUBLE",
        "DOUBLE PRECISION",
        "FLOAT",
        "NUMERIC(10,2)",
        "DECIMAL(10,2)",
        "MONEY",
        "DATE",
        "TIMESTAMP",
        "TIMESTAMP WITH TIME ZONE",
        "DATETIME",
        "TIME",
        "INTERVAL",
        "BOOLEAN",
        "UUID",
        "INET",
    ],
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


# The ONE member of sqlglot's ``STRUCT_TYPES`` the denylist deliberately does
# not claim, and why. Keeping it as data (rather than a subtraction inlined in
# the assertion) means the next person to widen the exclusion has to write down
# a reason next to the name.
SQL_RECORD_TYPES_EXCLUDED_ON_PURPOSE = {
    "OBJECT": (
        "Snowflake's OBJECT — a VARIANT constrained to objects. Same wire "
        "shape as VARIANT (JSON text), and VARIANT is allowlisted, so "
        "denylisting OBJECT would hard-fail a project that renders today."
    )
}


def test_all_record_shaped_sqlglot_types_are_covered():
    """sqlglot's own record-type set must be fully claimed by the denylist,
    EXCEPT the members excluded on purpose — if sqlglot grows a record type we
    have neither denylisted nor written a reason for, this test says so."""
    record_type_names = {t.value for t in exp.DataType.STRUCT_TYPES}
    unclaimed = record_type_names - NON_PLOTTABLE_AXIS_TYPES
    assert unclaimed == set(SQL_RECORD_TYPES_EXCLUDED_ON_PURPOSE), sorted(unclaimed)


def test_the_excluded_record_types_are_allowlisted_not_merely_dropped():
    """An intentional exclusion belongs on the PLOTTABLE list, where the
    "did we just start rejecting something?" question is answerable by reading
    one list — not silently in the unknown middle."""
    for type_name in SQL_RECORD_TYPES_EXCLUDED_ON_PURPOSE:
        assert type_name in PLOTTABLE_AXIS_TYPES, type_name


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


@pytest.mark.parametrize("type_name", sorted(NON_PLOTTABLE_AXIS_TYPES))
def test_the_message_uses_the_right_indefinite_article(type_name):
    """ "a OBJECT" shipped once already. The article is derived, not hardcoded
    to the current denylist, so a later vowel-initial addition cannot
    reintroduce it."""
    diagnostic = check_positional_axis_plottability(
        insight_name="i", prop_path="props.x", sqlglot_dtype=_dtype(type_name)
    )
    article = "an" if type_name[0] in "AEIOU" else "a"
    wrong = "a" if article == "an" else "an"
    assert f"resolves to {article} {type_name}" in diagnostic.message, diagnostic.message
    assert f"cannot plot {article} {type_name}" in diagnostic.message, diagnostic.message
    assert f"{wrong} {type_name}" not in diagnostic.message, diagnostic.message


# ---------------------------------------------------------------------------
# 4. `props.value` — the indicator datum this module was written about
# ---------------------------------------------------------------------------


def test_value_is_a_positional_prop():
    """``value`` is the number an ``indicator`` displays and the 4th dimension
    of ``isosurface``/``volume`` — the datum itself, so a record there is the
    same silent blank an axis coordinate would be. It is also the example this
    module's own docstring opens with."""
    assert is_positional_axis_prop("props.value") is True
    # Still anchored to the top level: a nested leaf named `value` is not it.
    assert is_positional_axis_prop("props.link.value") is False


def test_value_is_the_only_top_level_value_prop_in_the_trace_schemas():
    """Claiming ``props.value`` is only safe because every trace schema that
    has a top-level ``value`` uses it as a numeric datum. If a new schema adds
    a ``value`` that legitimately carries a record, this test says so first."""
    import glob

    from visivo.query.insight.prop_type_validator import _load_trace_schema

    schemas_with_value = []
    for path in sorted(glob.glob("visivo/schema/*.schema.json")):
        trace_type = os.path.basename(path).replace(".schema.json", "")
        schema = _load_trace_schema(trace_type)
        if schema and "value" in (schema.get("properties") or {}):
            schemas_with_value.append(trace_type)
    assert schemas_with_value == ["indicator", "isosurface", "volume"], schemas_with_value


def test_struct_on_an_indicator_value_fails_the_build(build_insight):
    """The S5-14 shape on the one trace type this file was originally about."""
    insight = Insight(
        name="total",
        props=InsightProps(type="indicator", value="?{?{${ref(m).amt}}}"),
    )
    with pytest.raises(PositionalAxisTypeError) as excinfo:
        build_insight(insight)
    assert "props.value" in str(excinfo.value)


def test_an_ordinary_indicator_value_still_builds(build_insight):
    insight = Insight(
        name="total",
        props=InsightProps(type="indicator", value="?{sum(${ref(m).amt})}"),
    )
    query_info = build_insight(insight)
    assert query_info.props_mapping["props.value"]


# ---------------------------------------------------------------------------
# 5. Props that reference an INPUT — the dynamic lane the blank chart is on
# ---------------------------------------------------------------------------


def _column_picker(name, y_expression):
    from visivo.models.inputs.types.single_select import SingleSelectInput

    ycol = SingleSelectInput(name="ycol", label="Y", options=["site", "amt"])
    insight = Insight(
        name=name,
        props=InsightProps(type="scatter", x="?{${ref(m).site}}", y=y_expression),
    )
    return insight, [ycol]


def test_doubled_query_string_referencing_an_input_fails_the_build(build_insight):
    """A prop that references an input keeps its ``${ycol.value}`` placeholder
    in the resolved SQL, which SQLGlot cannot parse — so type inference used to
    return None and the gate fell open. That is the WORST place to fall open:
    an input-bearing insight is dynamic, so ``pre_query`` is None, ``build()``
    skips ``validate_query``, and NOTHING else looks at the post_query. The
    residual ``?{...}`` then reached DuckDB WASM and parsed as a struct exactly
    as it does server-side — blank chart, SUCCESS job.
    """
    insight, inputs = _column_picker("picker2", "?{?{${ref(ycol).value}}}")
    with pytest.raises(PositionalAxisTypeError) as excinfo:
        build_insight(insight, inputs=inputs)
    assert "props.y" in str(excinfo.value)
    assert "STRUCT" in str(excinfo.value)


def test_the_input_column_picker_itself_still_builds(build_insight):
    """The other direction, and the reason the fix substitutes sample values
    only inside this gate: an ordinary input-driven column picker is a real,
    supported pattern and must keep building."""
    insight, inputs = _column_picker("picker1", "?{${ref(ycol).value}}")
    query_info = build_insight(insight, inputs=inputs)
    assert "${ycol.value}" in query_info.post_query


def test_other_input_shapes_on_a_positional_axis_still_build(build_insight):
    """The false-positive surface of the sample-value fallback. A multi-select
    ``.values`` substitutes to a COMMA-SEPARATED list (``'west', 'east'``),
    which turns the wrapper SELECT into two projections — the gate must read
    the first and classify it as the scalar it is, not choke or reject. An
    input wrapped in an expression must survive too."""
    from visivo.models.inputs.types.multi_select import MultiSelectInput
    from visivo.models.inputs.types.single_select import SingleSelectInput

    regions = MultiSelectInput(name="regions", label="R", options=["west", "east"])
    values_on_x = Insight(
        name="a",
        props=InsightProps(type="bar", x="?{${ref(regions).values}}", y="?{count(${ref(m).amt})}"),
    )
    assert build_insight(values_on_x, inputs=[regions]).props_mapping["props.x"]

    ycol = SingleSelectInput(name="ycol", label="Y", options=["site", "amt"])
    wrapped = Insight(
        name="b",
        props=InsightProps(
            type="bar", x="?{upper(${ref(ycol).value})}", y="?{count(${ref(m).amt})}"
        ),
    )
    assert build_insight(wrapped, inputs=[ycol]).props_mapping["props.x"]


def test_sample_substitution_does_not_leak_into_the_authored_message(build_insight):
    """The diagnostic must quote what the USER wrote, not the sample value the
    gate parsed with."""
    insight, inputs = _column_picker("picker2", "?{?{${ref(ycol).value}}}")
    with pytest.raises(PositionalAxisTypeError) as excinfo:
        build_insight(insight, inputs=inputs)
    detail = excinfo.value.diagnostic.detail
    assert "${ycol.value}" in detail, detail
    assert "__VISIVO_INPUT" not in detail, detail


def test_sample_substitution_is_not_applied_to_the_slice_class_check(make_builder):
    """``_infer_expression_type`` itself must stay placeholder-blind. A sample
    value carries the SAMPLE's type, not the runtime column's, so letting it
    leak into the slice-class check or the default-ordering decision would
    change two unrelated behaviours on a guess."""
    insight, inputs = _column_picker("picker1", "?{${ref(ycol).value}}")
    builder = make_builder(insight, inputs=inputs)
    resolved_y = dict(builder.resolved_query_statements)["props.y"]
    assert "${ycol.value}" in resolved_y
    assert builder._infer_expression_type(resolved_y) is None


def test_the_type_inference_schema_is_built_once_per_builder(make_builder, mocker):
    """The gate calls ``_infer_expression_type`` once per bound coordinate on
    EVERY build (before WB9 the slice check returned early and it essentially
    never ran), so the sqlglot ``MappingSchema`` — rebuilt from every dependent
    model's columns — must not be reconstructed per call. Both of its inputs
    (``self.models``, ``self.native_dialect``) are fixed for the builder's
    lifetime, so once is correct.
    """
    import sqlglot.schema

    spy = mocker.patch(
        "sqlglot.schema.MappingSchema", wraps=sqlglot.schema.MappingSchema, autospec=True
    )
    insight = Insight(
        name="i",
        props=InsightProps(type="scatter", x="?{${ref(m).site}}", y="?{count(${ref(m).amt})}"),
    )
    builder = make_builder(insight, resolve=False)
    builder.resolve()
    builder.build()
    # Three inferences over this insight (the default-sort probe on x, then
    # props.x and props.y through the gate) — one MappingSchema.
    assert spy.call_count == 1, spy.call_count
    first = builder._type_inference_schema()
    assert builder._type_inference_schema() is first
    assert spy.call_count == 1, spy.call_count


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
