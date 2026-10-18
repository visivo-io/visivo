from visivo.models.table import Table
from pydantic import ValidationError
import pytest


def test_Table_simple_data():
    data = {"name": "development"}
    table = Table(**data)
    assert table.name == "development"


def test_Table_with_data_insight_ref():
    data = {
        "name": "revenue-table",
        "data": "ref(monthly-revenue)",
    }
    table = Table(**data)
    assert table.data == "ref(monthly-revenue)"
    assert table.name == "revenue-table"


def test_Table_with_data_model_ref():
    data = {
        "name": "model-table",
        "data": "ref(my-model)",
    }
    table = Table(**data)
    assert table.data == "ref(my-model)"


def test_Table_with_data_inline_model():
    data = {
        "name": "inline-model-table",
        "data": {"sql": "select * from orders", "name": "inline-model"},
    }
    table = Table(**data)
    assert table.data.name == "inline-model"


def test_Table_data_and_columns_mutually_exclusive():
    data = {
        "name": "bad-table",
        "data": "ref(my-insight)",
        "columns": ["${ref(my-insight).x}"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)
    assert "cannot be combined" in str(exc_info.value).lower()


def test_Table_with_columns_only():
    data = {
        "name": "select-table",
        "columns": [
            "${ref(sales-insight).region} as Region",
            "${ref(sales-insight).revenue} as Revenue",
        ],
    }
    table = Table(**data)
    assert len(table.columns) == 2


def test_Table_with_pivot_config():
    data = {
        "name": "pivot-table",
        "columns": ["${ref(sales-insight).region}"],
        "rows": ["${ref(sales-insight).product}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
    }
    table = Table(**data)
    assert table.columns == ["${ref(sales-insight).region}"]
    assert table.rows == ["${ref(sales-insight).product}"]
    assert table.values == ["sum(${ref(sales-insight).revenue})"]


def test_Table_rows_requires_values():
    data = {
        "name": "bad-pivot",
        "columns": ["${ref(sales-insight).region}"],
        "rows": ["${ref(sales-insight).product}"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)
    assert "together" in str(exc_info.value).lower()


def test_Table_values_requires_rows():
    data = {
        "name": "bad-pivot",
        "columns": ["${ref(sales-insight).region}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)
    assert "together" in str(exc_info.value).lower()


def test_Table_rows_values_require_columns():
    data = {
        "name": "bad-pivot",
        "rows": ["${ref(sales-insight).product}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
    }
    with pytest.raises(ValidationError) as exc_info:
        Table(**data)
    assert "columns" in str(exc_info.value).lower()


def test_Table_with_format_cells():
    data = {
        "name": "formatted-table",
        "data": "ref(my-insight)",
        "format_cells": {
            "scope": "column",
            "min_color": "#ff0000",
            "max_color": "#00ff00",
        },
    }
    table = Table(**data)
    assert table.format_cells.scope.value == "column"
    assert table.format_cells.min_color == "#ff0000"
    assert table.format_cells.max_color == "#00ff00"


def test_Table_with_pivot_and_format_cells():
    data = {
        "name": "pivot-formatted",
        "columns": ["${ref(sales-insight).region}"],
        "rows": ["${ref(sales-insight).product}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
        "format_cells": {
            "scope": "table",
            "min_color": "#000000",
            "max_color": "#ffffff",
        },
    }
    table = Table(**data)
    assert table.columns is not None
    assert table.format_cells is not None


def test_Table_data_no_pivot_fields():
    data = {
        "name": "simple-table",
        "data": "ref(my-insight)",
    }
    table = Table(**data)
    assert table.columns is None
    assert table.rows is None
    assert table.values is None


def test_Table_serialization_with_pivot():
    data = {
        "name": "pivot-table",
        "columns": ["${ref(sales-insight).region}"],
        "rows": ["${ref(sales-insight).product}"],
        "values": ["sum(${ref(sales-insight).revenue})"],
        "format_cells": {
            "scope": "column",
            "min_color": "#ff0000",
            "max_color": "#00ff00",
        },
    }
    table = Table(**data)
    serialized = table.model_dump(exclude_none=True, mode="json")
    assert serialized["columns"] == ["${ref(sales-insight).region}"]
    assert serialized["rows"] == ["${ref(sales-insight).product}"]
    assert serialized["values"] == ["sum(${ref(sales-insight).revenue})"]
    assert serialized["format_cells"]["scope"] == "column"


def test_Table_child_items_with_data():
    table = Table(name="test", data="ref(my-insight)")
    items = table.child_items()
    assert "ref(my-insight)" in items


def test_Table_child_items_with_columns():
    table = Table(
        name="test",
        columns=["${ref(insight-a).x}", "${ref(insight-b).y}"],
    )
    items = table.child_items()
    ref_items = [i for i in items if isinstance(i, str) and i.startswith("ref(")]
    ref_names = {r.replace("ref(", "").replace(")", "") for r in ref_items}
    assert "insight-a" in ref_names
    assert "insight-b" in ref_names


def test_Table_child_items_with_pivot():
    table = Table(
        name="test",
        columns=["${ref(insight).region}"],
        rows=["${ref(insight).product}"],
        values=["sum(${ref(insight).revenue})"],
    )
    items = table.child_items()
    ref_items = [i for i in items if isinstance(i, str) and i.startswith("ref(")]
    assert len(ref_items) == 1
    assert "ref(insight)" in ref_items


def test_Table_with_invalid_generated_sql_still_constructs():
    """Smoke-test bug #7 (relocated): a column-select table whose config compiles
    to invalid SQL no longer blocks project LOAD — the generated-SQL check moved
    from the Table model validator to the COMPILE phase (see
    tests/commands/test_compile_table_sql.py), so the model itself constructs and
    the server can still load a project with a broken table."""
    table = Table(name="broken", columns=['${ref(i).sex} as ""Sex""'])
    assert table.name == "broken"


def test_Table_with_valid_columns_still_loads():
    table = Table(name="ok", columns=["${ref(i).sex} as Sex", '${ref(i).total} as "Total Kg"'])
    assert table.name == "ok"


def test_Table_pivot_with_empty_columns_is_rejected():
    """bug #7 review (M2): `columns: []` with rows/values would build an invalid
    empty-`ON` pivot; an empty list now counts as unspecified columns."""
    with pytest.raises(ValidationError, match="columns"):
        Table(name="p", columns=[], rows=["${ref(i).p}"], values=["sum(${ref(i).v})"])


# ---------------------------------------------------------------------------
# VIS-1463 T3: pivot `values` must be a single aggregate (checked with SQLGlot)
# ---------------------------------------------------------------------------


def _pivot(values):
    return Table(
        name="p",
        columns=["${ref(sales-insight).region}"],
        rows=["${ref(sales-insight).product}"],
        values=values,
    )


@pytest.mark.parametrize(
    "value",
    [
        "sum(${ref(sales-insight).revenue})",
        "SUM(${ref(sales-insight).revenue})",
        "count(*)",
        "count(${ref(sales-insight).revenue})",
        "count(distinct ${ref(sales-insight).revenue})",
        "avg(${ref(sales-insight).revenue})",
        "min(${ref(sales-insight).revenue})",
        "max(${ref(sales-insight).revenue})",
        "sum(case when ${ref(sales-insight).revenue} > 0 then 1 else 0 end)",
        "median(${ref(sales-insight).revenue})",
        "arg_max(${ref(sales-insight).revenue}, ${ref(sales-insight).region})",
        "quantile_cont(${ref(sales-insight).revenue}, 0.5)",
        # SQLGlot wraps these in IgnoreNulls — the aggregate underneath still counts.
        "any_value(${ref(sales-insight).revenue})",
        "first(${ref(sales-insight).revenue} ignore nulls)",
        # DuckDB aggregates SQLGlot does not model (parsed as Anonymous): a single
        # unknown call is left for DuckDB to type-check, not rejected here.
        "mode(${ref(sales-insight).revenue})",
        "product(${ref(sales-insight).revenue})",
    ],
)
def test_Table_pivot_values_accepts_aggregates(value):
    table = _pivot([value])
    assert table.values == [value]


@pytest.mark.parametrize(
    "value",
    [
        "${ref(sales-insight).revenue}",  # bare column
        "sum(${ref(sales-insight).revenue}) + 1",  # arithmetic around the aggregate
        "sum(${ref(sales-insight).revenue}) over (partition by ${ref(sales-insight).region})",
        "coalesce(sum(${ref(sales-insight).revenue}), 0)",  # scalar wrapping the aggregate
        "upper(${ref(sales-insight).region})",  # scalar function
        "cast(sum(${ref(sales-insight).revenue}) as int)",  # cast around the aggregate
        "1",  # literal
    ],
)
def test_Table_pivot_values_rejects_non_aggregates(value):
    with pytest.raises(ValidationError) as exc_info:
        _pivot([value])
    message = str(exc_info.value)
    assert "is not an aggregate" in message
    # The error names the offending value so the user can find it.
    assert value in message


@pytest.mark.parametrize(
    "value",
    [
        # Part of the aggregate call's own syntax — accepted.
        "sum(${ref(sales-insight).revenue}) filter (where ${ref(sales-insight).revenue} > 0)",
        "count(*) filter (where ${ref(sales-insight).revenue} > 0)",
        "percentile_cont(0.5) within group (order by ${ref(sales-insight).revenue})",
    ],
)
def test_Table_pivot_values_accepts_filter_and_within_group(value):
    assert _pivot([value]).values == [value]


@pytest.mark.parametrize(
    "value",
    [
        # SQLGlot types these as AggFunc, DuckDB only has them as window functions.
        "lag(${ref(sales-insight).revenue})",
        "lead(${ref(sales-insight).revenue})",
        "first_value(${ref(sales-insight).revenue})",
        "nth_value(${ref(sales-insight).revenue}, 1)",
    ],
)
def test_Table_pivot_values_rejects_window_only_functions(value):
    with pytest.raises(ValidationError, match="is a window function"):
        _pivot([value])


def test_Table_pivot_values_rejects_multiple_statements():
    with pytest.raises(ValidationError, match="must be a single expression"):
        _pivot(["sum(${ref(sales-insight).revenue}); select 1"])


def test_Table_pivot_values_parse_error_shows_the_users_ref_not_a_placeholder():
    with pytest.raises(ValidationError) as exc_info:
        _pivot(["sum(${ref(sales-insight).revenue}) +"])
    message = str(exc_info.value)
    assert "could not be parsed as SQL" in message
    assert "__visivo_ref_" not in message


def test_Table_pivot_values_non_list_is_left_to_field_validation():
    with pytest.raises(ValidationError) as exc_info:
        Table(
            name="p",
            columns=["${ref(sales-insight).region}"],
            rows=["${ref(sales-insight).product}"],
            values="sum(${ref(sales-insight).revenue})",
        )
    message = str(exc_info.value)
    assert "Input should be a valid list" in message
    assert "is not an aggregate" not in message


def test_Table_pivot_values_rejects_unparseable_sql():
    with pytest.raises(ValidationError, match="could not be parsed as SQL"):
        _pivot(["sum(${ref(sales-insight).revenue}"])


def test_Table_pivot_values_rejects_blank_entry():
    with pytest.raises(ValidationError, match="not a valid expression"):
        _pivot(["sum(${ref(sales-insight).revenue})", "   "])


def test_Table_pivot_values_error_names_only_the_bad_value():
    """A good value followed by a bad one: the bad one is named, the good one is not."""
    with pytest.raises(ValidationError) as exc_info:
        _pivot(["sum(${ref(sales-insight).revenue})", "${ref(sales-insight).cost}"])
    message = str(exc_info.value)
    assert "'${ref(sales-insight).cost}' is not an aggregate" in message
    assert "'sum(${ref(sales-insight).revenue})' is not" not in message


# ---------------------------------------------------------------------------
# VIS-1463 T4: format_cells colours must be hex (the viewer parses hex only)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("color", ["#713b57", "#FFAA00", "#abc", "#ABC"])
def test_Table_format_cells_accepts_hex_colors(color):
    table = Table(
        name="f",
        data="ref(my-insight)",
        format_cells={"scope": "table", "min_color": color, "max_color": "#000000"},
    )
    assert table.format_cells.min_color == color


@pytest.mark.parametrize("color", ["red", "rgb(255, 0, 0)", "713b57", "#gggggg", "#12345", ""])
def test_Table_format_cells_rejects_non_hex_colors(color):
    with pytest.raises(ValidationError) as exc_info:
        Table(
            name="f",
            data="ref(my-insight)",
            format_cells={"scope": "table", "min_color": "#000000", "max_color": color},
        )
    assert "max_color" in str(exc_info.value)


# ---------------------------------------------------------------------------
# VIS-1463 T5: rows_per_page enum — `ten` is 10 and every documented size loads
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("size", [3, 5, 10, 25, 50, 100, 500, 1000])
def test_Table_rows_per_page_accepts_every_enum_size(size):
    table = Table(name="t", rows_per_page=size)
    assert int(table.rows_per_page) == size


def test_Table_rows_per_page_ten_is_ten():
    from visivo.models.table import RowsPerPageEnum

    assert RowsPerPageEnum.ten == 10
    assert sorted(int(m) for m in RowsPerPageEnum) == [3, 5, 10, 25, 50, 100, 500, 1000]


def test_Table_rows_per_page_rejects_unlisted_size():
    with pytest.raises(ValidationError, match="rows_per_page"):
        Table(name="t", rows_per_page=15)


# ---------------------------------------------------------------------------
# `data` discriminator — object inputs (Insight / SqlModel instances) and the
# unrecognised fallthrough
# ---------------------------------------------------------------------------


def test_get_data_discriminator_value_handles_model_instances_and_unknowns():
    from visivo.models.table import get_data_discriminator_value
    from tests.factories.model_factories import InsightFactory, SqlModelFactory

    assert get_data_discriminator_value(InsightFactory()) == "Insight"
    assert get_data_discriminator_value(SqlModelFactory()) == "Sql"
    assert get_data_discriminator_value({"interactions": []}) == "Insight"
    assert get_data_discriminator_value({"sql": "select 1"}) == "Sql"
    assert get_data_discriminator_value({"unrelated": 1}) is None
    assert get_data_discriminator_value(42) is None


def test_Table_with_data_insight_instance():
    from tests.factories.model_factories import InsightFactory

    insight = InsightFactory(name="inline-insight")
    table = Table(name="t", data=insight)
    assert table.data.name == "inline-insight"
    assert table.child_items() == [insight]


# --- VIS-1462 T7a: a table reads from ONE source ------------------------------
# The Table model itself cannot know whether two referenced models are related
# (that needs the project DAG), so the check lives in the compile phase; these
# tests pin the contract at the table level through that validator.


def _project_with(tables, relations=None):
    from tests.factories.model_factories import (
        ProjectFactory,
        SourceFactory,
        SqlModelFactory,
    )

    source = SourceFactory(name="s")
    return ProjectFactory(
        sources=[source],
        models=[
            SqlModelFactory(name="model_a", source="ref(s)"),
            SqlModelFactory(name="model_b", source="ref(s)"),
        ],
        relations=relations or [],
        tables=tables,
        dashboards=[],
    )


def test_Table_refs_to_two_unrelated_models_are_rejected_naming_both():
    from visivo.query.table_source_validator import validate_project_table_sources

    table = Table(name="mixed", columns=["${ref(model_a).x}", "${ref(model_b).y}"])
    error = validate_project_table_sources(_project_with([table]))
    assert error is not None
    assert "Table 'mixed'" in error
    assert "'model_a'" in error and "'model_b'" in error


def test_Table_refs_to_one_model_are_accepted():
    from visivo.query.table_source_validator import validate_project_table_sources

    table = Table(
        name="single",
        columns=["${ref(model_a).region}"],
        rows=["${ref(model_a).product}"],
        values=["sum(${ref(model_a).revenue})"],
    )
    assert validate_project_table_sources(_project_with([table])) is None


def test_Table_refs_to_two_related_models_are_accepted():
    from tests.factories.model_factories import RelationFactory
    from visivo.query.table_source_validator import validate_project_table_sources

    relation = RelationFactory(name="a_to_b", condition="${ref(model_a).id} = ${ref(model_b).a_id}")
    table = Table(name="joined", columns=["${ref(model_a).x}", "${ref(model_b).y}"])
    assert validate_project_table_sources(_project_with([table], [relation])) is None


def test_Table_column_formats_accept_d3_formats():
    formats = {"Revenue ($)": "$,.0f", "Tip share": ".1%", "Year": "d", "Change": "+.1f", "*": "~s"}
    table = Table(name="t", columns=['${ref(m).zone} as "Zone"'], column_formats=formats)
    assert table.column_formats == formats


@pytest.mark.parametrize("spec", ["$%,.2f", "#,##0.00", "dollars", ".1f%"])
def test_Table_column_formats_reject_non_d3_strings(spec):
    with pytest.raises(ValidationError, match="is not a d3-format string"):
        Table(name="t", data="ref(m)", column_formats={"Revenue": spec})
