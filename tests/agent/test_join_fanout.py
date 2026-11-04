"""A relation that repeats one side's rows, and a chart that counts those
rows across it, are named at write time (VIS-1543)."""

import pytest

from visivo.agent.tools import TOOLS, call
from visivo.server.services.join_cardinality import join_keys

ACCOUNTS = (
    "select 1 as account_id, 'Retail' as industry, 10 as employees "
    "union all select 2, 'Retail', 20 union all select 3, 'Media', 30"
)
SUBSCRIPTIONS = (
    "select 1 as account_id, 'Free' as plan, 0 as mrr "
    "union all select 1, 'Free', 0 union all select 1, 'Team', 50 "
    "union all select 2, 'Free', 0 union all select 2, 'Free', 0 "
    "union all select 3, 'Team', 75"
)
ONE_TO_MANY = "${ref(accounts).account_id} = ${ref(subscriptions).account_id}"


def _source(app):
    return app.project.sources[0].name


@pytest.fixture
def models(integration_app):
    source = f"${{ref({_source(integration_app)})}}"
    for name, sql, metrics in (
        (
            "accounts",
            ACCOUNTS,
            [
                {"name": "account_count", "expression": "count(account_id)"},
                {"name": "distinct_accounts", "expression": "count(distinct account_id)"},
            ],
        ),
        ("subscriptions", SUBSCRIPTIONS, []),
    ):
        config = {"name": name, "sql": sql, "source": source, "metrics": metrics}
        call(integration_app, "write_model", {"config": config})
    return integration_app


def _relation(app, condition=ONE_TO_MANY, name="accounts_to_subscriptions"):
    return call(app, "write_relation", {"config": {"name": name, "condition": condition}})


def _insight(app, y, x="?{${ref(subscriptions).plan}}"):
    config = {"name": "accounts_by_plan", "props": {"type": "bar", "x": x, "y": y}}
    return call(app, "write_insight", {"config": config})


def _fanout(result):
    return [w for w in result.get("warnings", []) if "fan-out" in w]


class TestJoinKeys:
    def test_an_equality_names_one_key_per_model(self):
        assert join_keys(ONE_TO_MANY) == {
            "accounts": ["account_id"],
            "subscriptions": ["account_id"],
        }

    def test_a_composite_key_keeps_every_column(self):
        condition = "${ref(a).x} = ${ref(b).x} AND ${ref(a).y} = ${ref(b).y} AND ${ref(b).z} > 0"
        assert join_keys(condition) == {"a": ["x", "y"], "b": ["x", "y"]}

    def test_a_condition_with_no_column_equality_has_no_keys(self):
        assert join_keys("${ref(a).x} > ${ref(b).y}") == {}


class TestWriteRelationMeasuresCardinality:
    def test_one_to_many_is_named_with_the_repeating_side(self, models):
        result = _relation(models)

        assert result["cardinality"] == {
            "kind": "one_to_many",
            "accounts": "one",
            "subscriptions": "many",
        }
        [warning] = result["warnings"]
        assert warning.startswith("Relation `accounts_to_subscriptions` is one-to-many")
        assert "up to 3 `subscriptions` rows (2.0 on average)" in warning
        assert "COUNT(DISTINCT accounts.account_id)" in warning
        assert "join-models-safely" in warning

    def test_many_to_many_is_warned(self, models):
        result = _relation(models, "${ref(accounts).industry} = ${ref(subscriptions).plan}")

        assert result["cardinality"]["kind"] == "many_to_many"
        assert "is many-to-many" in result["warnings"][0]

    def test_one_to_one_carries_no_warning(self, models):
        source = f"${{ref({_source(models)})}}"
        profiles = {"name": "profiles", "sql": ACCOUNTS, "source": source}
        call(models, "write_model", {"config": profiles})

        result = _relation(models, "${ref(accounts).account_id} = ${ref(profiles).account_id}")

        assert result["cardinality"]["kind"] == "one_to_one"
        assert "warnings" not in result

    def test_a_relation_that_cannot_be_measured_is_not_judged(self, models):
        result = _relation(models, "${ref(accounts).account_id} > ${ref(subscriptions).mrr}")

        assert "cardinality" not in result
        assert "warnings" not in result

    def test_a_key_that_is_not_a_column_is_not_judged(self, models):
        result = _relation(models, "${ref(accounts).nope} = ${ref(subscriptions).account_id}")

        assert "cardinality" not in result

    def test_the_tool_description_asks_for_a_unique_key(self):
        assert "unique on one side" in TOOLS["write_relation"].description
        assert "join-models-safely" in TOOLS["write_relation"].description


class TestInsightFanOut:
    @pytest.fixture(autouse=True)
    def relation(self, models):
        _relation(models)

    def test_the_inflated_count_is_what_the_query_returns(self, models):
        result = call(
            models,
            "preview_insight",
            {
                "config": {
                    "name": "accounts_by_plan",
                    "props": {
                        "type": "bar",
                        "x": "?{${ref(subscriptions).plan}}",
                        "y": "?{count(${ref(accounts).account_id})}",
                    },
                }
            },
        )

        x, y = result["props_mapping"]["props.x"], result["props_mapping"]["props.y"]
        assert {row[x]: row[y] for row in result["rows"]} == {"Free": 4, "Team": 2}
        assert any("fan-out" in warning for warning in result["warnings"])

    def test_a_count_of_the_one_side_grouped_by_the_many_side(self, models):
        [warning] = _fanout(_insight(models, "?{count(${ref(accounts).account_id})}"))

        assert warning.startswith("`props.y` takes COUNT over `accounts` rows")
        assert "relation `accounts_to_subscriptions`" in warning
        assert "COUNT(DISTINCT ${ref(accounts).account_id})" in warning

    def test_a_metric_on_the_one_side_is_read_through(self, models):
        assert _fanout(_insight(models, "?{${ref(accounts).account_count}}"))

    def test_a_sum_of_the_one_side_is_flagged(self, models):
        [warning] = _fanout(_insight(models, "?{sum(${ref(accounts).employees})}"))

        assert "takes SUM over `accounts` rows" in warning

    def test_count_distinct_is_safe(self, models):
        assert not _fanout(_insight(models, "?{count(distinct ${ref(accounts).account_id})}"))

    def test_a_distinct_metric_is_safe(self, models):
        assert not _fanout(_insight(models, "?{${ref(accounts).distinct_accounts}}"))

    def test_a_sum_of_the_many_side_by_a_one_side_column_is_safe(self, models):
        result = _insight(
            models, "?{sum(${ref(subscriptions).mrr})}", x="?{${ref(accounts).industry}}"
        )

        assert not _fanout(result)

    def test_one_model_alone_is_not_judged(self, models):
        result = _insight(
            models, "?{count(${ref(accounts).account_id})}", x="?{${ref(accounts).industry}}"
        )

        assert not _fanout(result)

    def test_a_filter_on_the_many_side_still_fans_out(self, models):
        config = {
            "name": "accounts_on_team",
            "props": {
                "type": "bar",
                "x": "?{${ref(accounts).industry}}",
                "y": "?{count(${ref(accounts).account_id})}",
            },
            "interactions": [{"filter": "?{${ref(subscriptions).plan} = 'Free'}"}],
        }

        assert _fanout(call(models, "write_insight", {"config": config}))

    def test_a_standalone_metric_is_read_through(self, models):
        metric = {"name": "all_accounts", "expression": "count(${ref(accounts).account_id})"}
        call(models, "write_metric", {"config": metric})

        assert _fanout(_insight(models, "?{${ref(all_accounts)}}"))

    def test_a_slow_key_probe_is_not_judged(self, models, monkeypatch):
        from visivo.jobs.run_model_data_job import QueryTimeout
        from visivo.server.services import join_cardinality

        def slow(*args, **kwargs):
            raise QueryTimeout("slow")

        monkeypatch.setattr(join_cardinality, "execute_and_get_result", slow)

        assert not _fanout(_insight(models, "?{count(${ref(accounts).account_id})}"))

    def test_a_metric_scoped_to_the_model_is_read_through(self, models):
        metric = {"name": "scoped_count", "model": "accounts", "expression": "count(account_id)"}
        call(models, "write_metric", {"config": metric})

        assert _fanout(_insight(models, "?{${ref(accounts).scoped_count}}"))

    def test_metrics_nested_past_the_limit_are_not_judged(self, models, monkeypatch):
        from visivo.server.services import join_cardinality

        monkeypatch.setattr(join_cardinality, "MAX_EXPANSION_DEPTH", 0)

        assert not _fanout(_insight(models, "?{${ref(accounts).account_count}}"))

    def test_a_prop_that_is_not_sql_is_skipped(self, models):
        result = _insight(models, "?{count(${ref(accounts).account_id}}")

        assert not _fanout(result)


class TestUnmeasurableKeys:
    def test_a_key_compared_with_an_expression_is_not_a_key(self):
        assert join_keys("${ref(a).x} = lower(${ref(b).y})") == {}

    def test_a_model_compared_with_itself_is_not_a_key(self):
        assert join_keys("${ref(a).x} = ${ref(a).y} AND ${ref(b).z} = 1") == {}

    def test_an_empty_model_is_not_judged(self, integration_app):
        from visivo.server.services.join_cardinality import key_stats

        source = f"${{ref({_source(integration_app)})}}"
        empty = {"name": "empty", "sql": "select 1 as k where 1 = 0", "source": source}
        call(integration_app, "write_model", {"config": empty})

        assert key_stats(integration_app, "empty", ["k"]) is None
        assert key_stats(integration_app, "missing", ["k"]) is None
