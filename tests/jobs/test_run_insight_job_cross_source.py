"""The runtime half: what happens to a cross-source insight that got past compile.

Two lanes, two opposite answers, and both of them are the point:

* **Static** — ``CrossSourceValidator`` refuses to let such a project exist, so
  the tests below reach the invalid state the way the code paths that skip
  project validation do (an in-memory overlay, a project assembled in code, a
  mutation after construction). Those paths must fail with the SAME sentence
  rather than executing a query whose CTEs name tables the chosen source has
  never heard of.
* **Dynamic** — ``TestTheDynamicLane`` runs the real jobs against two real
  DuckDB files and asserts the insight SUCCEEDS, because there the join is
  DuckDB's over each model's own parquet. Nothing about this test is a mock:
  if the guard ever fires on the dynamic lane again, the assertion that the
  post_query joins both model hashes and returns the joined row fails.
"""

import json

import duckdb
import pytest

from tests.factories.model_factories import (
    DuckdbSourceFactory,
    InputFactory,
    InsightFactory,
    ProjectFactory,
    RelationFactory,
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


class TestTheDynamicLane:
    """Two real DuckDB files, two real models, the real jobs — and it works.

    This is the shape ``mkdocs/topics/sources.md`` sells: "you can bring data
    together in a single chart with insights whose models originate from
    different sources". It works because a dynamic insight has NO ``pre_query``:
    ``run_sql_model_job`` materialises each model against ITS OWN source into
    ``models/<name>.parquet``, and the DuckDB-dialect ``post_query`` joins those
    parquet files. Guarding it would turn a working project into one that does
    not load at all.
    """

    @staticmethod
    def _two_databases(tmp_path):
        a_db = str(tmp_path / "a.duckdb")
        b_db = str(tmp_path / "b.duckdb")
        connection = duckdb.connect(a_db)
        connection.execute(
            "CREATE TABLE orders AS SELECT * FROM "
            "(VALUES (1, 10, 'east'), (2, 20, 'west')) t(id, amount, region)"
        )
        connection.close()
        connection = duckdb.connect(b_db)
        connection.execute(
            "CREATE TABLE users AS SELECT * FROM (VALUES (1, 30), (2, 40)) t(id, age)"
        )
        connection.close()
        return a_db, b_db

    @staticmethod
    def _project(a_db, b_db):
        insight = InsightFactory(
            name="cross_dynamic",
            props=InsightProps(
                type="scatter",
                x="?{ ${ ref(orders).amount } }",
                y="?{ ${ ref(users).age } }",
            ),
            interactions=[{"filter": "?{ ${ref(orders).region} = ${ref(region_pick).value} }"}],
        )
        project = ProjectFactory(
            sources=[
                DuckdbSourceFactory(name="source_a", database=a_db),
                DuckdbSourceFactory(name="source_b", database=b_db),
            ],
            models=[
                SqlModelFactory(name="orders", sql="SELECT * FROM orders", source="ref(source_a)"),
                SqlModelFactory(name="users", sql="SELECT * FROM users", source="ref(source_b)"),
            ],
            relations=[
                RelationFactory(
                    name="orders_to_users", condition="${ref(orders).id} = ${ref(users).id}"
                )
            ],
            inputs=[InputFactory(name="region_pick", label="Region", options=["east", "west"])],
            insights=[insight],
            dashboards=[],
        )
        return project, insight

    def test_the_project_loads_and_the_insight_job_succeeds_across_two_sources(self, tmp_path):
        from visivo.jobs.run_input_job import action as run_input
        from visivo.jobs.run_source_schema_job import action as run_source_schema
        from visivo.jobs.run_sql_model_job import model_query_and_schema_action

        a_db, b_db = self._two_databases(tmp_path)
        # Constructed through the ordinary constructor: CrossSourceValidator runs
        # here, and this project must survive it.
        project, insight = self._project(a_db, b_db)
        dag = project.dag()
        assert insight.is_dynamic(dag) is True

        output_dir = str(tmp_path / "target")
        # The real pipeline, in the real order: introspect each source, then
        # materialise each model AGAINST ITS OWN SOURCE, then the inputs.
        for source in project.sources:
            assert run_source_schema(source, output_dir=output_dir, run_id="main").success
        for model in project.models:
            assert model_query_and_schema_action(model, dag, output_dir, run_id="main").success
        for input_obj in project.inputs:
            assert run_input(input_obj, dag, output_dir, run_id="main").success

        result = action(insight, dag, output_dir, run_id="main")
        assert result.success is True, result.message

        with open(f"{output_dir}/main/insights/cross_dynamic.json") as file:
            insight_data = json.load(file)

        # Both models' OWN parquet, each written against its own database.
        hashes = {model.name: model.name_hash() for model in project.models}
        assert {file_entry["name_hash"] for file_entry in insight_data["files"]} == set(
            hashes.values()
        )
        # No pre_query result was written; the join is in the post_query.
        query = insight_data["query"]
        assert hashes["orders"] in query and hashes["users"] in query
        assert "JOIN" in query.upper()

        # And it is not just well-formed text: register both parquet files and
        # run it. Filtering region='east' leaves order 1 (amount 10) joined to
        # user 1 (age 30).
        connection = duckdb.connect()
        for file_entry in insight_data["files"]:
            connection.execute(
                f'CREATE VIEW "{file_entry["name_hash"]}" AS '
                f"SELECT * FROM read_parquet('{file_entry['signed_data_file_url']}')"
            )
        rows = connection.execute(query.replace("${region_pick.value}", "east")).fetchall()
        connection.close()
        assert rows == [(10, 30)]

    def test_the_builder_also_lets_a_forced_dynamic_draft_across_sources_through(self, tmp_path):
        """``force_dynamic=True`` is how /api/insight-compile-draft/ builds every
        draft — the DuckDB-over-parquet form. A draft that introduces a second
        source must not 400 there either."""
        a_db, b_db = self._two_databases(tmp_path)
        project, insight = self._project(a_db, b_db)
        dag = project.dag()
        output_dir = str(tmp_path / "target")

        from visivo.jobs.run_source_schema_job import action as run_source_schema
        from visivo.jobs.run_sql_model_job import model_query_and_schema_action

        for source in project.sources:
            assert run_source_schema(source, output_dir=output_dir, run_id="main").success
        for model in project.models:
            assert model_query_and_schema_action(model, dag, output_dir, run_id="main").success

        builder = InsightQueryBuilder(insight, dag, f"{output_dir}/main", force_dynamic=True)
        assert builder.is_dynamic is True
        assert {model.name for model in builder.models} == {"orders", "users"}
