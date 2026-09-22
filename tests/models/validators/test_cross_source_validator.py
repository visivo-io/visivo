"""The cross-source rule is actually asked, at compile, before anything runs —
and asked ONLY of the lane it is true for.

Everything below builds a real project through the ordinary constructor —
``Project``'s ``mode="after"`` validator runs ``ProjectValidator``, so a project
whose STATIC insight spans sources cannot be brought into existence at all.
Before this the same project parsed clean and died much later inside a driver.

The other half of the contract matters just as much: a DYNAMIC insight (one with
an ``Input`` descendant) has no ``pre_query``. Its models are materialised
against their own sources and its DuckDB ``post_query`` joins the parquet files
client-side, which is the multi-source chart ``mkdocs/topics/sources.md``
advertises. Those projects must still construct, and so must a relation that no
static insight ever compiles.
"""

import pytest
from pydantic import ValidationError

from tests.factories.model_factories import (
    DimensionFactory,
    DuckdbSourceFactory,
    InputFactory,
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


def _dynamic_joining_insight(name="revenue_by_user"):
    """The same join, but reading an Input — so ``is_dynamic`` is True, there is
    no ``pre_query``, and the join happens in DuckDB over the two models' own
    parquet files instead of inside one database."""
    return InsightFactory(
        name=name,
        props=InsightProps(
            type="scatter",
            x="?{ ${ ref(orders).amount } }",
            y="?{ ${ ref(users).age } }",
        ),
        interactions=[{"filter": "?{ ${ref(orders).region} = ${ref(region_pick).value} }"}],
    )


def _region_input():
    return InputFactory(name="region_pick", label="Region", options=["east", "west"])


def _orders_to_users():
    return RelationFactory(
        name="orders_to_users",
        condition="${ref(orders).user_id} = ${ref(users).id}",
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
    def test_a_cross_source_relation_a_static_insight_compiles_fails_the_project(self):
        """The relation is reported, not the insight: a static insight over both
        models compiles this JOIN into one statement, and the join the author
        wrote is the more local thing to name."""
        with pytest.raises(ValidationError) as excinfo:
            _project(
                relations=[_orders_to_users()],
                insights=[_joining_insight()],
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
            relations=[_orders_to_users()],
            insights=[_joining_insight()],
            dashboards=[],
        )
        assert [relation.name for relation in project.relations] == ["orders_to_users"]

    def test_a_relation_no_static_insight_compiles_is_left_alone(self):
        """A relation is a join CONDITION, not an executable thing. Nothing
        compiles this one — which is the state every relation is in while it is
        being authored — so there is no wrong query to refuse yet."""
        project = _project(relations=[_orders_to_users()], dashboards=[])
        assert [relation.name for relation in project.relations] == ["orders_to_users"]

    def test_a_relation_only_a_dynamic_insight_uses_is_left_alone(self):
        """The dynamic lane joins the two models' parquet files in DuckDB, so
        this relation IS compiled — into a query where two sources is correct.
        Refusing it here would break a chart that runs today."""
        project = _project(
            relations=[_orders_to_users()],
            inputs=[_region_input()],
            insights=[_dynamic_joining_insight()],
            dashboards=[],
        )
        assert [relation.name for relation in project.relations] == ["orders_to_users"]

    def test_a_relation_whose_models_never_share_a_static_insight_is_left_alone(self):
        """orders and users each appear in a static insight, but never in the
        SAME one, so neither statement ever contains this JOIN. A union of the
        two model sets would wrongly fire here."""
        project = _project(
            relations=[_orders_to_users()],
            insights=[
                InsightFactory(
                    name="orders_only",
                    props=InsightProps(
                        type="scatter",
                        x="?{ ${ ref(orders).amount } }",
                        y="?{ ${ ref(orders).total } }",
                    ),
                ),
                InsightFactory(
                    name="users_only",
                    props=InsightProps(
                        type="scatter",
                        x="?{ ${ ref(users).age } }",
                        y="?{ ${ ref(users).id } }",
                    ),
                ),
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

    def test_a_dynamic_cross_source_insight_is_allowed(self):
        """The regression this validator must never cause. The SAME two models
        on the SAME two sources, but the insight reads an Input, so
        ``is_dynamic`` is True and there is no ``pre_query``: run_sql_model_job
        materialises each model against its own source and the DuckDB
        ``post_query`` joins the parquet files. mkdocs/topics/sources.md sells
        exactly this ("bring data together in a single chart with insights whose
        models originate from different sources"), and refusing it inside
        Project's mode="after" validator would stop the WHOLE project loading —
        every other dashboard in it included."""
        insight = _dynamic_joining_insight()
        project = _project(
            inputs=[_region_input()],
            insights=[insight],
            dashboards=[],
        )
        assert [i.name for i in project.insights] == ["revenue_by_user"]
        # Not vacuous: the insight really is on the dynamic lane, and it really
        # does depend on models across both sources.
        dag = project.dag()
        assert insight.is_dynamic(dag) is True
        assert {model.name for model in insight.get_all_dependent_models(dag)} == {
            "orders",
            "users",
        }

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
