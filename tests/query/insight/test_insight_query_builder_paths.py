"""InsightQueryBuilder paths the feature-level tests do not reach: sample
values for range inputs, multi-model joins, HAVING/QUALIFY on a static
insight, and the guards that keep an unresolved builder from being read."""

import json
import os

import pytest

from tests.factories.model_factories import (
    DuckdbSourceFactory,
    SnowflakeSourceFactory,
    SourceFactory,
)
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.inputs.types.single_select import SingleSelectInput
from visivo.models.insight import Insight
from visivo.models.interaction import InsightInteraction
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.props.insight_props import InsightProps
from visivo.models.relation import Relation
from visivo.query.insight.insight_query_builder import (
    InsightQueryBuilder,
    get_sample_value_for_input,
    replace_input_placeholders_for_parsing,
)

ORDERS = {"id": "INTEGER", "user_id": "INTEGER", "amount": "DECIMAL", "region": "VARCHAR"}
USERS = {"id": "INTEGER", "name": "VARCHAR"}


def _builder(tmpdir, insight, models, source, inputs=(), relations=(), schemas=None):
    project = Project(
        name="p",
        sources=[source],
        models=models,
        inputs=list(inputs),
        relations=list(relations),
        insights=[insight],
        dashboards=[],
    )
    os.makedirs(os.path.join(str(tmpdir), "schemas"), exist_ok=True)
    for model in models:
        columns = (schemas or {}).get(model.name, ORDERS)
        path = os.path.join(str(tmpdir), "schemas", f"{model.name}.json")
        with open(path, "w") as f:
            json.dump({model.name_hash(): columns}, f)
    return InsightQueryBuilder(insight, project.dag(), str(tmpdir))


def _orders(source, sql="SELECT * FROM orders"):
    return SqlModel(name="orders", sql=sql, source=f"ref({source.name})")


def _users(source):
    return SqlModel(name="users", sql="SELECT * FROM users", source=f"ref({source.name})")


class TestSampleValuesForInputs:
    def test_a_single_select_default_wins_over_the_first_option(self):
        region = SingleSelectInput(
            name="region",
            label="Region",
            options=["North", "South"],
            display={"type": "dropdown", "default": {"value": "South"}},
        )
        assert get_sample_value_for_input(region) == "South"

    def test_a_numeric_range_samples_its_steps(self):
        amount = MultiSelectInput(
            name="amount", label="Amount", range={"start": 0, "end": 100, "step": 10}
        )
        assert get_sample_value_for_input(amount, accessor="values") == "0.0, 10.0"
        assert get_sample_value_for_input(amount, accessor="max") == "100.0"

    def test_a_query_bound_range_samples_zero_to_one_hundred(self):
        amount = MultiSelectInput(
            name="amount",
            label="Amount",
            range={
                "start": "?{ SELECT min(amount) FROM ${ref(orders)} }",
                "end": "?{ SELECT max(amount) FROM ${ref(orders)} }",
                "step": 25,
            },
        )
        assert get_sample_value_for_input(amount, accessor="max") == "100"

    def test_a_date_range_falls_back_to_a_numeric_sample(self):
        dates = MultiSelectInput(
            name="dates",
            label="Dates",
            range={"start": "2024-01-01", "end": "2024-12-31", "step": "1 month"},
        )
        assert get_sample_value_for_input(dates, accessor="first") == "0"

    def test_a_range_default_start_is_the_min_sample(self):
        amount = MultiSelectInput(
            name="amount",
            label="Amount",
            range={"start": 0, "end": 100, "step": 10},
            display={"type": "range-slider", "default": {"start": 20, "end": 80}},
        )
        assert get_sample_value_for_input(amount, accessor="min") == "20"

    def test_query_options_without_their_json_say_to_run_the_input_first(self, tmpdir):
        region = SingleSelectInput(
            name="region", label="Region", options="?{ SELECT region FROM ${ref(orders)} }"
        )
        with pytest.raises(ValueError, match="Run the input job first"):
            get_sample_value_for_input(region, output_dir=str(tmpdir))


class TestPlaceholdersThatAreNotInputs:
    def test_a_frontend_placeholder_that_names_no_input_is_left_alone(self, tmpdir):
        source = SourceFactory()
        insight = Insight(name="i", props=InsightProps(type="bar", x="?{ ${ref(orders).id} }"))
        builder = _builder(tmpdir, insight, [_orders(source)], source)

        sql, replacements = replace_input_placeholders_for_parsing(
            "x = ${other.value}", dag=builder.dag, insight=insight
        )

        assert sql == "x = ${other.value}" and replacements == {}


class TestAnUnresolvedBuilderCannotBeRead:
    @pytest.mark.parametrize("attribute", ["props_mapping", "split_key", "pre_query", "post_query"])
    def test_reading_before_resolve_raises(self, tmpdir, attribute):
        source = SourceFactory()
        insight = Insight(name="i", props=InsightProps(type="bar", x="?{ ${ref(orders).id} }"))
        builder = _builder(tmpdir, insight, [_orders(source)], source)

        with pytest.raises(Exception, match="Need to resolve"):
            getattr(builder, attribute)

    def test_building_before_resolve_raises(self, tmpdir):
        source = SourceFactory()
        insight = Insight(name="i", props=InsightProps(type="bar", x="?{ ${ref(orders).id} }"))
        builder = _builder(tmpdir, insight, [_orders(source)], source)

        with pytest.raises(Exception, match="Need to resolve before running build"):
            builder.build()


class TestDynamicInsights:
    def _region_input(self):
        return SingleSelectInput(name="region", label="Region", options=["North", "South"])

    def test_without_a_query_prop_there_is_nothing_to_select(self, tmpdir):
        source = SourceFactory()
        insight = Insight(
            name="i",
            props=InsightProps(type="bar", x=[1, 2]),
            interactions=[
                InsightInteraction(filter="?{ ${ref(orders).region} = '${ref(region).value}' }")
            ],
        )
        builder = _builder(tmpdir, insight, [_orders(source)], source, [self._region_input()])
        builder.resolve()

        with pytest.raises(ValueError, match="at least one prop"):
            builder.post_query

    def test_two_models_join_through_their_relation(self, tmpdir):
        source = SourceFactory()
        relation = Relation(
            name="orders_to_users",
            condition="${ref(orders).user_id} = ${ref(users).id}",
            join_type="left",
        )
        insight = Insight(
            name="i",
            props=InsightProps(
                type="bar", x="?{ ${ref(users).name} }", y="?{ sum(${ref(orders).amount}) }"
            ),
            interactions=[
                InsightInteraction(filter="?{ ${ref(orders).region} = '${ref(region).value}' }"),
                InsightInteraction(sort="?{ ${ref(users).name} ASC }"),
            ],
        )
        builder = _builder(
            tmpdir,
            insight,
            [_orders(source), _users(source)],
            source,
            [self._region_input()],
            [relation],
            {"orders": ORDERS, "users": USERS},
        )
        builder.resolve()
        query = builder.post_query

        assert "LEFT JOIN" in query
        assert "'${region.value}'" in query
        assert "GROUP BY" in query and "ORDER BY" in query


class TestStaticInsights:
    def test_aggregate_and_window_filters_land_in_having_and_qualify(self, tmpdir):
        source = DuckdbSourceFactory()
        insight = Insight(
            name="i",
            props=InsightProps(
                type="bar", x="?{ ${ref(orders).region} }", y="?{ sum(${ref(orders).amount}) }"
            ),
            interactions=[
                InsightInteraction(filter="?{ sum(${ref(orders).amount}) > 10 }"),
                InsightInteraction(
                    filter="?{ row_number() OVER (ORDER BY ${ref(orders).region}) = 1 }"
                ),
                InsightInteraction(sort="?{ ${ref(orders).region} DESC }"),
            ],
        )
        builder = _builder(tmpdir, insight, [_orders(source)], source)
        builder.resolve()
        query = builder.pre_query

        assert "HAVING\n  SUM(" in query
        assert "QUALIFY\n  ROW_NUMBER() OVER" in query
        assert "ORDER BY" in query and "DESC" in query

    def test_two_models_join_through_their_relation(self, tmpdir):
        source = DuckdbSourceFactory()
        relation = Relation(
            name="orders_to_users", condition="${ref(orders).user_id} = ${ref(users).id}"
        )
        insight = Insight(
            name="i",
            props=InsightProps(
                type="bar", x="?{ ${ref(users).name} }", y="?{ sum(${ref(orders).amount}) }"
            ),
            interactions=[InsightInteraction(sort="?{ ${ref(users).name} ASC }")],
        )
        builder = _builder(
            tmpdir,
            insight,
            [_orders(source), _users(source)],
            source,
            relations=[relation],
            schemas={"orders": ORDERS, "users": USERS},
        )
        builder.resolve()
        query = builder.pre_query

        assert "JOIN" in query and "GROUP BY" in query

    def test_a_stored_source_schema_qualifies_the_model_sql(self, tmpdir):
        source = DuckdbSourceFactory()
        model = _orders(source, sql="SELECT id, amount FROM orders")
        insight = Insight(name="i", props=InsightProps(type="bar", x="?{ ${ref(orders).id} }"))
        builder = _builder(tmpdir, insight, [model], source)
        source_schema = os.path.join(str(tmpdir), "main", "schemas")
        os.makedirs(source_schema)
        with open(os.path.join(source_schema, "orders.json"), "w") as f:
            json.dump(
                {"tables": {"orders": {"columns": {"id": {"type": "INTEGER"}, "amount": {}}}}}, f
            )
        builder.resolve()

        assert '"orders"."id"' in builder.pre_query

    def test_snowflake_model_aliases_are_uppercased(self, tmpdir):
        source = SnowflakeSourceFactory()
        model = _orders(source, sql="SELECT id AS order_id FROM orders")
        insight = Insight(
            name="i", props=InsightProps(type="bar", x="?{ ${ref(orders).order_id} }")
        )
        builder = _builder(
            tmpdir, insight, [model], source, schemas={"orders": {"ORDER_ID": "INTEGER"}}
        )
        builder.resolve()

        assert '"ORDER_ID"' in builder.pre_query


class TestQueryBasedInputValueType:
    """A query-bound input's value type comes from its options query; anything
    this cannot resolve is ``unknown``, which leaves the placeholder bare."""

    def _builder(self, tmpdir):
        source = SourceFactory()
        users = _users(source)
        insight = Insight(name="i", props=InsightProps(type="bar", x="?{ ${ref(orders).id} }"))
        project = Project(
            name="p",
            sources=[source],
            models=[_orders(source), users],
            insights=[insight],
            dashboards=[],
        )
        os.makedirs(os.path.join(str(tmpdir), "schemas"), exist_ok=True)
        for name, payload in (
            ("orders", {_orders(source).name_hash(): ORDERS}),
            ("users", {"some-other-hash": USERS}),
        ):
            with open(os.path.join(str(tmpdir), "schemas", f"{name}.json"), "w") as f:
                json.dump(payload, f)
        return InsightQueryBuilder(insight, project.dag(), str(tmpdir)), source

    def _input(self, query):
        return SingleSelectInput(name="pick", label="Pick", options=query)

    def test_a_single_column_options_query_has_its_column_type(self, tmpdir):
        builder, _ = self._builder(tmpdir)
        found = builder._query_based_input_value_type(
            self._input("?{ SELECT region FROM ${ref(orders)} }")
        )
        assert found == "string"

    @pytest.mark.parametrize(
        "query",
        [
            "?{ SELECT region, id FROM ${ref(orders)} }",
            "?{ SELECT name FROM ${ref(users)} }",
            "?{ SELECT region FROM ${ref(missing)} }",
        ],
        ids=["two-columns", "schema-without-the-model", "unknown-ref"],
    )
    def test_what_it_cannot_resolve_is_unknown(self, tmpdir, query):
        builder, _ = self._builder(tmpdir)
        assert builder._query_based_input_value_type(self._input(query)) == "unknown"

    def test_an_options_query_over_a_source_is_unknown(self, tmpdir):
        builder, source = self._builder(tmpdir)
        query = f"?{{ SELECT region FROM ${{ref({source.name})}} }}"
        assert builder._query_based_input_value_type(self._input(query)) == "unknown"

    def test_a_model_without_a_schema_file_is_unknown(self, tmpdir):
        builder, _ = self._builder(tmpdir)
        os.remove(os.path.join(str(tmpdir), "schemas", "users.json"))
        query = "?{ SELECT name FROM ${ref(users)} }"
        assert builder._query_based_input_value_type(self._input(query)) == "unknown"
