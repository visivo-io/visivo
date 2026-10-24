"""A filter that does not parse is an error naming the insight and the filter,
never a filter left out of the query (VIS-1635)."""

import json
import os

import pytest

from tests.factories.model_factories import SourceFactory
from visivo.jobs.run_insight_job import action
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.insight import Insight
from visivo.models.interaction import InsightInteraction
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.props.insight_props import InsightProps
from visivo.query.accessor_validator import get_accessor_sample_value
from visivo.query.insight.filter_syntax import (
    InsightFilterError,
    check_filter,
    insight_filter_error,
    reads_input,
)
from visivo.query.insight.insight_query_builder import InsightQueryBuilder

UNWRAPPED = (
    "${ref(sales).region} IN ${ref(regions).values} AND ${ref(sales).month} = ${ref(month).value}"
)
WRAPPED = (
    "${ref(sales).region} IN (${ref(regions).values}) AND ${ref(sales).month} = ${ref(month).value}"
)
HINT = "wrap the values in parentheses: IN (${ref(regions).values})"
INPUTS = {"regions", "month"}.__contains__


def _insight(filter_text, name="sales-by-month"):
    return Insight(
        name=name,
        props=InsightProps(type="bar", x="?{ ${ref(sales).month} }", y="?{ ${ref(sales).amount} }"),
        interactions=[InsightInteraction(filter=f"?{{ {filter_text} }}")],
    )


def _project(insight, region_options=("North", "South"), with_inputs=True):
    source = SourceFactory()
    model = SqlModel(
        name="sales", sql="SELECT region, month, amount FROM t", source=f"ref({source.name})"
    )
    inputs = []
    if with_inputs:
        inputs = [
            MultiSelectInput(name="regions", label="Regions", options=list(region_options)),
            SingleSelectInput(name="month", label="Month", options=["1", "2"]),
        ]
    project = Project(
        name="p",
        sources=[source],
        models=[model],
        inputs=inputs,
        insights=[insight],
        dashboards=[],
    )
    return project.dag(), model


def _write_schema(model, directory):
    os.makedirs(os.path.join(directory, "schemas"), exist_ok=True)
    columns = {"region": "VARCHAR", "month": "INTEGER", "amount": "DECIMAL"}
    with open(os.path.join(directory, "schemas", f"{model.name}.json"), "w") as f:
        json.dump({model.name_hash(): columns}, f)


def _build(insight, tmpdir, **kwargs):
    dag, model = _project(insight, **kwargs)
    _write_schema(model, str(tmpdir))
    builder = InsightQueryBuilder(insight, dag, str(tmpdir))
    builder.resolve()
    return builder.build()


class TestCheckFilter:
    def test_in_over_unwrapped_values_is_refused_with_the_hint(self):
        with pytest.raises(InsightFilterError) as raised:
            check_filter("sales-by-month", UNWRAPPED, INPUTS, None)

        message = str(raised.value)
        assert "Insight 'sales-by-month'" in message
        assert UNWRAPPED in message
        assert HINT in message

    def test_wrapped_values_pass(self):
        check_filter("sales-by-month", WRAPPED, INPUTS, None)

    def test_the_frontend_form_of_an_input_is_judged_too(self):
        with pytest.raises(InsightFilterError, match=r"IN \(\$\{ref\(regions\)\.values\}\)"):
            check_filter("i", "region IN ${regions.values}", INPUTS, None)

    def test_a_broken_filter_without_values_has_no_hint(self):
        with pytest.raises(InsightFilterError) as raised:
            check_filter("i", "${ref(sales).region} IN (", INPUTS, None)

        assert raised.value.hint is None
        assert "Hint" not in str(raised.value)

    def test_values_compared_with_equals_gets_no_in_hint(self):
        with pytest.raises(InsightFilterError) as raised:
            check_filter("i", "${ref(sales).region} = ${ref(regions).values}", INPUTS, None)

        assert raised.value.hint is None

    def test_a_model_column_named_values_is_not_an_input(self):
        check_filter("i", "${ref(sales).values} > 3", INPUTS, None)

    def test_a_reference_it_cannot_model_is_left_to_the_build(self):
        check_filter("i", "${env.REGION} IN", INPUTS, None)

    def test_a_quoted_model_name_is_a_column(self):
        check_filter("i", "${ref('sales').region} = 'North'", INPUTS, None)


class TestInsightFilterError:
    def test_names_the_filter_with_the_hint(self):
        message = insight_filter_error(_insight(UNWRAPPED), INPUTS, None)

        assert "Insight 'sales-by-month'" in message
        assert HINT in message

    def test_interactions_without_a_filter_are_skipped(self):
        insight = Insight(
            name="i",
            props=InsightProps(type="bar", x="?{ ${ref(sales).month} }"),
            interactions=[
                InsightInteraction(split="?{ ${ref(sales).region} }"),
                InsightInteraction(filter="?{ ${ref(sales).month} > 1 }"),
            ],
        )
        assert insight_filter_error(insight, INPUTS, None) is None

    def test_an_insight_without_interactions_passes(self):
        insight = Insight(name="i", props=InsightProps(type="bar", x=[1]))
        assert insight_filter_error(insight, INPUTS, None) is None


BACKTICKS = "`region` = 'North'"


class TestTheFilterParsesInTheDialectItIsBuiltIn:
    """One parse, in the dialect the build uses. A filter that only another
    dialect accepts is refused, because the build would fail on it."""

    def test_a_static_filter_parses_in_its_source_dialect(self):
        insight = _insight(BACKTICKS)

        assert insight_filter_error(insight, INPUTS, "mysql") is None
        assert "not valid SQL" in insight_filter_error(insight, INPUTS, "postgres")

    def test_no_source_dialect_is_the_generic_parse(self):
        assert "not valid SQL" in insight_filter_error(_insight(BACKTICKS), INPUTS, None)

    def test_an_insight_that_reads_an_input_parses_in_duckdb(self):
        insight = _insight(f"{BACKTICKS} AND ${{ref(sales).month}} = ${{ref(month).value}}")

        assert reads_input(insight, INPUTS)
        assert "not valid SQL" in insight_filter_error(insight, INPUTS, "mysql")

    def test_an_input_in_the_props_makes_it_dynamic_too(self):
        insight = Insight(
            name="i",
            props=InsightProps(type="bar", x="?{ ${ref(month).value} }"),
            interactions=[InsightInteraction(filter=f"?{{ {BACKTICKS} }}")],
        )

        assert reads_input(insight, INPUTS)
        assert not reads_input(_insight(BACKTICKS), INPUTS)

    def test_the_frontend_form_of_an_input_is_read_too(self):
        assert reads_input(_insight("region IN (${regions.values})"), INPUTS)


class TestTheBuildNeverDropsAFilter:
    def test_unwrapped_values_raise_naming_the_insight_and_filter(self, tmpdir):
        with pytest.raises(InsightFilterError) as raised:
            _build(_insight(UNWRAPPED), tmpdir)

        assert raised.value.insight_name == "sales-by-month"
        assert raised.value.filter_text == UNWRAPPED
        assert raised.value.hint == HINT

    def test_a_single_option_multi_select_is_caught_too(self, tmpdir):
        """One option samples as `IN 'North'`, which parses; two selected
        values would not."""
        with pytest.raises(InsightFilterError, match="wrap the values"):
            _build(_insight(UNWRAPPED), tmpdir, region_options=("North",))

    def test_wrapped_values_keep_both_conditions(self, tmpdir):
        query = _build(_insight(WRAPPED), tmpdir).post_query

        assert "IN (${regions.values})" in query
        assert "${month.value}" in query

    def test_a_static_filter_that_does_not_parse_raises(self, tmpdir):
        broken = "${ref(sales).month} IN ("
        with pytest.raises(InsightFilterError) as raised:
            _build(_insight(broken), tmpdir, with_inputs=False)

        assert raised.value.filter_text == broken

    def test_the_second_filter_is_the_one_named(self, tmpdir):
        insight = Insight(
            name="two-filters",
            props=InsightProps(type="bar", x="?{ ${ref(sales).month} }"),
            interactions=[
                InsightInteraction(filter="?{ ${ref(sales).month} > 1 }"),
                InsightInteraction(filter=f"?{{ {UNWRAPPED} }}"),
            ],
        )
        with pytest.raises(InsightFilterError) as raised:
            _build(insight, tmpdir)

        assert raised.value.filter_text == UNWRAPPED


class TestADynamicWindowFilterIsKept:
    """The dynamic query runs in DuckDB, which has QUALIFY. A window filter
    used to be left out of it with no error."""

    def _insight(self):
        return Insight(
            name="top-months",
            props=InsightProps(type="bar", x="?{ ${ref(sales).month} }"),
            interactions=[
                InsightInteraction(filter="?{ ${ref(sales).month} = ${ref(month).value} }"),
                InsightInteraction(
                    filter="?{ ROW_NUMBER() OVER (ORDER BY ${ref(sales).amount} DESC) <= 3 }"
                ),
            ],
        )

    def test_it_lands_in_qualify(self, tmpdir):
        query = _build(self._insight(), tmpdir).post_query

        assert "QUALIFY" in query
        qualify = query.split("QUALIFY", 1)[1]
        assert "ROW_NUMBER() OVER" in qualify
        assert "${month.value}" in query.split("QUALIFY", 1)[0]

    def test_the_query_runs_in_duckdb(self, tmpdir):
        import duckdb

        query = _build(self._insight(), tmpdir).post_query
        _, model = _project(self._insight())
        table = model.name_hash()
        sql = query.replace("${month.value}", "1")
        connection = duckdb.connect()
        connection.execute(
            f'CREATE TABLE "{table}" AS SELECT * FROM (VALUES '
            "('North', 1, 5), ('South', 1, 9), ('East', 1, 7), ('West', 1, 1), "
            "('North', 2, 3)) t(region, month, amount)"
        )

        assert len(connection.execute(sql).fetchall()) == 3


class TestARunReportsItAsAnInsightError:
    def test_the_insight_job_fails_with_the_message_and_does_not_raise(self, tmpdir):
        insight = _insight(UNWRAPPED)
        dag, model = _project(insight)
        _write_schema(model, os.path.join(str(tmpdir), "main"))

        result = action(insight, dag, str(tmpdir))

        assert result.success is False
        assert "sales-by-month" in result.message
        assert HINT in result.message
        assert result.diagnostic.object.name == "sales-by-month"


class TestValuesSample:
    def test_one_option_still_samples_two_values(self):
        assert get_accessor_sample_value("values", ["North"]) == "'North', 'North'"

    def test_no_options_samples_two_values(self):
        assert get_accessor_sample_value("values", []) == "'sample_value', 'sample_value'"

    def test_a_quote_in_an_option_is_escaped(self):
        assert get_accessor_sample_value("values", ["O'Reilly", "B"]) == "'O''Reilly', 'B'"
