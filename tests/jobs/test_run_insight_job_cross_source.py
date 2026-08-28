"""The runtime half: what happens to a cross-source insight that got past compile.

``CrossSourceValidator`` refuses to let such a project exist, so everything here
reaches the invalid state the way the code paths that skip project validation do
— an in-memory overlay, a project assembled in code, a mutation after
construction. The point of the guard is that those paths fail with the SAME
sentence rather than executing a query whose CTEs name tables the chosen source
has never heard of.
"""

import json

import pytest

from tests.factories.model_factories import (
    DuckdbSourceFactory,
    InsightFactory,
    ProjectFactory,
    SqlModelFactory,
)
from visivo.jobs.run_insight_job import action
from visivo.models.props.insight_props import InsightProps
from visivo.query.insight.insight_query_builder import InsightQueryBuilder
from visivo.query.source_scope import CrossSourceError


def _write_schema(schema_base, model, columns):
    """Mirror the on-disk schema layout the FieldResolver reads from."""
    schema_base.join(f"{model.name}.json").write(json.dumps({model.name_hash(): columns}))


def _project(cross_source: bool):
    """orders + users + an insight over both. ``cross_source`` moves users onto
    a second source AFTER validation, which is the only way to get one now."""
    insight = InsightFactory(
        name="cross",
        props=InsightProps(
            type="scatter",
            x="?{ ${ ref(orders).amount } }",
            y="?{ ${ ref(users).age } }",
        ),
    )
    project = ProjectFactory(
        sources=[
            DuckdbSourceFactory(name="source_a", database="a.duckdb"),
            DuckdbSourceFactory(name="source_b", database="b.duckdb"),
        ],
        models=[
            SqlModelFactory(name="orders", sql="SELECT * FROM orders", source="ref(source_a)"),
            SqlModelFactory(name="users", sql="SELECT * FROM users", source="ref(source_a)"),
        ],
        insights=[insight],
        dashboards=[],
    )
    if cross_source:
        for model in project.models:
            if model.name == "users":
                model.source = "ref(source_b)"
        project.invalidate_dag_cache()
    return project, insight


def _seed_schemas(tmpdir, project, run_id="main"):
    run_dir = tmpdir.mkdir(run_id)
    schema_base = run_dir.mkdir("schemas")
    for model in project.models:
        _write_schema(schema_base, model, {"amount": "INTEGER", "age": "INTEGER"})


class TestInsightQueryBuilder:
    def test_it_refuses_to_build_across_sources(self, tmpdir):
        project, insight = _project(cross_source=True)
        _seed_schemas(tmpdir, project)

        with pytest.raises(CrossSourceError) as excinfo:
            InsightQueryBuilder(insight, project.dag(), f"{tmpdir}/main")

        assert str(excinfo.value) == (
            "Insight 'cross' references models from more than one source: "
            "source_a, source_b.\n"
            "\n"
            "  Model 'orders' uses source: source_a\n"
            "  Model 'users' uses source: source_b\n"
            "\n"
            "Cross-source insights are not currently supported. "
            "Every model an insight references must use the same source."
        )

    def test_a_single_source_insight_still_builds(self, tmpdir):
        project, insight = _project(cross_source=False)
        _seed_schemas(tmpdir, project)

        builder = InsightQueryBuilder(insight, project.dag(), f"{tmpdir}/main")
        assert {model.name for model in builder.models} == {"orders", "users"}
        assert builder.source_dialect == "duckdb"

    def test_a_file_source_without_db_schema_does_not_raise_attribute_error(self, tmpdir):
        """A CSVFileSource is a DuckDB source over a file and carries neither
        ``db_schema`` nor ``database``; the plain attribute reads used to blow
        up on the way to a query that never needed either value."""
        from visivo.models.sources.csv_source import CSVFileSource

        insight = InsightFactory(
            name="from_csv",
            props=InsightProps(
                type="scatter",
                x="?{ ${ ref(products).amount } }",
                y="?{ ${ ref(products).age } }",
            ),
        )
        project = ProjectFactory(
            sources=[CSVFileSource(name="products_csv", type="csv", file="products.csv")],
            models=[
                SqlModelFactory(
                    name="products", sql="SELECT * FROM products", source="ref(products_csv)"
                )
            ],
            insights=[insight],
            dashboards=[],
        )
        _seed_schemas(tmpdir, project)

        builder = InsightQueryBuilder(insight, project.dag(), f"{tmpdir}/main")
        assert builder.default_schema is None
        assert builder.default_database is None


class TestRunInsightJob:
    def test_the_job_fails_with_the_message_and_typed_details(self, tmpdir):
        project, insight = _project(cross_source=True)
        _seed_schemas(tmpdir, project)

        result = action(insight, project.dag(), str(tmpdir), run_id="main")

        assert result.success is False
        # e.message, not repr(e) — the run output shows the sentence, not a
        # quoted exception with escaped newlines.
        assert "references models from more than one source: source_a, source_b" in result.message
        assert "ValueError(" not in result.message

        assert result.error_details["error_type"] == "multi_source"
        assert result.error_details["error_models"] == ["orders", "users"]
        assert result.error_details["error_sources"] == ["source_a", "source_b"]
        diagnostic = result.error_details["diagnostic"]
        assert diagnostic["code"] == "cross_source"
        assert diagnostic["phase"] == "run"
        assert diagnostic["object"] == {"type": "insight", "name": "cross"}

    def test_a_single_source_insight_keeps_its_ordinary_failure_shape(self, tmpdir):
        """The guard must not swallow every other failure into a cross-source
        one: this insight has no relation between its two models, so it still
        fails as ``missing_relation`` with no cross-source details."""
        project, insight = _project(cross_source=False)
        _seed_schemas(tmpdir, project)

        result = action(insight, project.dag(), str(tmpdir), run_id="main")

        assert result.success is False
        assert result.error_details["error_type"] == "missing_relation"
