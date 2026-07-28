"""Tests for server-side table SQL validation (smoke-test bug #7)."""

import pytest

from visivo.query.table_sql_validator import validate_table_sql


def test_plain_data_table_is_skipped():
    # No columns -> no generated SQL -> nothing to validate.
    assert validate_table_sql("t", None, None, None) is None


def test_valid_column_select_passes():
    assert validate_table_sql("t", ["${ref(i).sex} as Sex", "${ref(i).total}"], None, None) is None


def test_valid_quoted_alias_passes():
    # The documented `as "Two Words"` form (bug #4 strips the user's quotes).
    assert validate_table_sql("t", ['${ref(i).total} as "Total Revenue"'], None, None) is None


def test_valid_pivot_passes():
    assert (
        validate_table_sql(
            "t", ["${ref(i).region}"], ["${ref(i).product}"], ["sum(${ref(i).revenue})"]
        )
        is None
    )


def test_valid_pivot_without_rows_passes():
    # NOTE: the Table model forbids `values` without `rows`, so this shape isn't
    # reachable from persisted YAML — it exercises the builder's no-rows branch
    # defensively (bug #7 review, M3).
    assert validate_table_sql("t", ["${ref(i).region}"], None, ["sum(${ref(i).revenue})"]) is None


@pytest.mark.parametrize(
    "columns,rows,values",
    [
        # H1 coupling invariant (bug #7 review): common DuckDB aggregate / pivot
        # shapes must stay ACCEPTED — if a SQLGlot bump starts rejecting one of
        # these, it would make a valid table unloadable. Lock them in.
        (["region"], None, None),  # plain non-ref column
        (["${ref(i).region}", "${ref(i).seg}"], ["${ref(i).p}"], ["count(*)"]),
        (["${ref(i).region}"], ["${ref(i).p}"], ["count(distinct ${ref(i).id})"]),
        (["${ref(i).region}"], ["${ref(i).p}"], ["arg_max(${ref(i).a}, ${ref(i).b})"]),
        (["${ref(i).region}"], ["${ref(i).p}"], ["quantile_cont(${ref(i).x}, 0.5)"]),
        # realistic rich pivot: multiple ON + multiple USING
        (
            ["${ref(i).region}", "${ref(i).seg}"],
            ["${ref(i).p}"],
            ["sum(${ref(i).revenue})", "avg(${ref(i).margin})"],
        ),
    ],
)
def test_common_duckdb_shapes_are_not_rejected(columns, rows, values):
    assert validate_table_sql("t", columns, rows, values) is None


def test_double_wrapped_alias_is_caught():
    # The exact bug-#4 pre-fix shape: `AS ""Sex""` is a zero-length delimited
    # identifier — invalid SQL that only surfaced client-side before.
    err = validate_table_sql("leaderboard", ['${ref(i).sex} as ""Sex""'], None, None)
    assert err is not None
    assert "leaderboard" in err
    assert "invalid SQL" in err


def test_structurally_invalid_pivot_value_is_caught():
    # A value expression that isn't an aggregate call breaks the USING clause.
    err = validate_table_sql(
        "t", ["${ref(i).region}"], ["${ref(i).product}"], ["${ref(i).revenue} +"]
    )
    assert err is not None
