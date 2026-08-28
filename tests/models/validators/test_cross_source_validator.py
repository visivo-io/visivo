"""The cross-source rule is actually asked, at compile, before anything runs.

Everything below builds a real project through the ordinary constructor —
``Project``'s ``mode="after"`` validator runs ``ProjectValidator``, so a project
that spans sources cannot be brought into existence at all. Before this the same
project parsed clean and died much later inside a driver.
"""

import pytest
from pydantic import ValidationError

from tests.factories.model_factories import (
    DimensionFactory,
    DuckdbSourceFactory,
    InsightFactory,
    MetricFactory,
    ProjectFactory,
    RelationFactory,
    SqlModelFactory,
)
from visivo.models.props.insight_props import InsightProps
from visivo.models.validators import CrossSourceValidator, ProjectValidator


def _sources():
    return [
        DuckdbSourceFactory(name="source_a", database="a.duckdb"),
        DuckdbSourceFactory(name="source_b", database="b.duckdb"),
    ]


def _models(users_source):
    return [
        SqlModelFactory(name="orders", sql="SELECT * FROM orders", source="ref(source_a)"),
        SqlModelFactory(name="users", sql="SELECT * FROM users", source=users_source),
    ]


def _project(users_source="ref(source_b)", **kwargs):
    return ProjectFactory(sources=_sources(), models=_models(users_source), **kwargs)


def _joining_insight(name="revenue_by_user"):
    return InsightFactory(
        name=name,
        props=InsightProps(
            type="scatter",
            x="?{ ${ ref(orders).amount } }",
            y="?{ ${ ref(users).age } }",
        ),
    )


class TestItIsRegistered:
    def test_it_runs_last(self):
        """After the reference and single-source validators: a broken ref or a
        metric that already spans sources is the more local mistake and should
        be the sentence the author reads first."""
        names = [validator.__class__.__name__ for validator in ProjectValidator().validators]
        assert names[-1] == "CrossSourceValidator"
        assert names.index("SingleSourceValidator") < names.index("CrossSourceValidator")


class TestRelations:
    def test_a_cross_source_relation_fails_the_project(self):
        with pytest.raises(ValidationError) as excinfo:
            _project(
                relations=[
                    RelationFactory(
                        name="orders_to_users",
                        condition="${ref(orders).user_id} = ${ref(users).id}",
                    )
                ],
                dashboards=[],
            )

        message = str(excinfo.value)
        # Names the relation, both models, and both sources — not "a table does
        # not exist" from whichever driver happened to be asked.
        assert "Relation 'orders_to_users' connects models from different sources." in message
        assert "Model 'orders' uses source: source_a" in message
        assert "Model 'users' uses source: source_b" in message
        assert "Cross-source relations are not currently supported." in message

    def test_a_same_source_relation_is_untouched(self):
        project = _project(
            users_source="ref(source_a)",
            relations=[
                RelationFactory(
                    name="orders_to_users",
                    condition="${ref(orders).user_id} = ${ref(users).id}",
                )
            ],
            dashboards=[],
        )
        assert [relation.name for relation in project.relations] == ["orders_to_users"]


class TestInsights:
    def test_a_cross_source_insight_fails_the_project(self):
        with pytest.raises(ValidationError) as excinfo:
            _project(insights=[_joining_insight()], dashboards=[])

        message = str(excinfo.value)
        assert (
            "Insight 'revenue_by_user' references models from more than one source: "
            "source_a, source_b." in message
        )
        assert "Model 'orders' uses source: source_a" in message
        assert "Model 'users' uses source: source_b" in message
        assert "Cross-source insights are not currently supported." in message

    def test_a_same_source_insight_is_untouched(self):
        project = _project(
            users_source="ref(source_a)", insights=[_joining_insight()], dashboards=[]
        )
        assert [insight.name for insight in project.insights] == ["revenue_by_user"]

    def test_a_single_model_insight_is_untouched_even_with_two_sources_present(self):
        """Two sources in a project is normal. Only an object that spans them is
        the problem, so the rule must not fire on a project that merely has
        more than one source declared."""
        project = _project(
            insights=[
                InsightFactory(
                    name="orders_only",
                    props=InsightProps(
                        type="scatter",
                        x="?{ ${ ref(orders).amount } }",
                        y="?{ ${ ref(orders).total } }",
                    ),
                )
            ],
            dashboards=[],
        )
        assert [insight.name for insight in project.insights] == ["orders_only"]


class TestItDefersToMoreLocalRules:
    def test_a_metric_spanning_sources_is_still_reported_as_a_metric(self):
        """SingleSourceValidator runs first and owns this wording — the author
        gets told about the metric they wrote, not about the insight that used
        it."""
        with pytest.raises(ValidationError) as excinfo:
            _project(
                metrics=[
                    MetricFactory(
                        name="mixed",
                        expression="sum(${ref(orders).amount}) + sum(${ref(users).age})",
                    )
                ],
                dashboards=[],
            )
        assert "ties back to multiple sources" in str(excinfo.value)

    def test_a_dimension_inside_one_source_still_passes(self):
        project = _project(
            users_source="ref(source_a)",
            dimensions=[DimensionFactory(name="region", expression="${ref(orders).region}")],
            dashboards=[],
        )
        assert [dimension.name for dimension in project.dimensions] == ["region"]


class TestTheValidatorInIsolation:
    def test_it_returns_the_project_when_there_is_nothing_to_say(self):
        project = _project(users_source="ref(source_a)", dashboards=[])
        assert CrossSourceValidator().validate(project) is project
