"""Static insights (VIS-1464 P4): an insight with nothing bound to a query
(no ``?{...}`` prop, no interactions) has no data job — the artifact carries
only its static props and the viewer renders the trace from them."""

import json
import os

from tests.factories.model_factories import DuckdbSourceFactory, SourceFactory
from tests.support.utils import temp_folder
from visivo.jobs.run_insight_job import action, job, static_action
from visivo.jobs.filtered_runner import FilteredRunner
from visivo.models.insight import Insight
from visivo.models.models.sql_model import SqlModel
from visivo.models.project import Project
from visivo.models.props.insight_props import InsightProps

IMAGE_Z = [[[255, 0, 0], [0, 255, 0]], [[0, 0, 255], [0, 0, 0]]]


def _image_project():
    insight = Insight(name="pixels", props=InsightProps(type="image", z=IMAGE_Z))
    return Project(name="p", insights=[insight], dashboards=[]), insight


def _read_artifact(output_dir, name, run_id="main"):
    with open(os.path.join(output_dir, run_id, "insights", f"{name}.json")) as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# is_static
# ---------------------------------------------------------------------------
def test_an_inlined_image_is_static():
    _, insight = _image_project()
    assert insight.is_static() is True


def test_a_query_bound_prop_is_not_static():
    insight = Insight(name="lonely", props=InsightProps(type="scatter", x="?{ 1 }"))
    assert insight.is_static() is False


def test_an_interaction_is_not_static():
    from visivo.models.interaction import InsightInteraction

    insight = Insight(
        name="i",
        props=InsightProps(type="scatter", x=[1, 2]),
        interactions=[InsightInteraction(filter="?{ x > 1 }")],
    )
    assert insight.is_static() is False


def test_no_props_is_not_static():
    """Nothing to render: a props-less insight still reports missing_model."""
    assert Insight(name="bare").is_static() is False


# ---------------------------------------------------------------------------
# Job wiring
# ---------------------------------------------------------------------------
def test_job_for_a_static_insight_uses_the_static_action():
    project, insight = _image_project()
    created = job(project.dag(), temp_folder(), insight)
    assert created.action is static_action
    assert created.source is None


def test_job_for_a_static_insight_threads_the_run_id():
    project, insight = _image_project()
    created = job(project.dag(), temp_folder(), insight, run_id="preview-1")
    assert created.kwargs["run_id"] == "preview-1"


def test_a_query_bound_model_less_insight_still_reports_missing_model():
    """The B9 guard is untouched: `?{ 1 }` has a binding but no model."""
    insight = Insight(name="lonely", props=InsightProps(type="scatter", x="?{ 1 }"))
    project = Project(name="p", insights=[insight], dashboards=[])
    created = job(project.dag(), temp_folder(), insight)
    result = created.action(**created.kwargs)
    assert result.success is False
    assert result.diagnostic.code == "missing_model"


# ---------------------------------------------------------------------------
# Artifact
# ---------------------------------------------------------------------------
def test_static_action_writes_an_artifact_with_only_static_props():
    project, insight = _image_project()
    output_dir = temp_folder()

    result = static_action(insight, project.dag(), output_dir)

    assert result.success is True, result.message
    artifact = _read_artifact(output_dir, "pixels")
    assert artifact == {
        "name": "pixels",
        "files": [],
        "query": None,
        "props_mapping": {},
        "static_props": {"z": IMAGE_Z},
        "props_slices": {},
        "split_key": None,
        "type": "image",
    }


def test_static_action_honours_a_custom_run_id():
    project, insight = _image_project()
    output_dir = temp_folder()
    static_action(insight, project.dag(), output_dir, run_id="draft")
    assert _read_artifact(output_dir, "pixels", run_id="draft")["type"] == "image"


def test_a_full_run_builds_a_static_insight():
    project, insight = _image_project()
    output_dir = temp_folder()
    runner = FilteredRunner(project=project, output_dir=output_dir, soft_failure=True)
    runner.run()
    assert runner.diagnostics == []
    assert _read_artifact(output_dir, "pixels")["static_props"] == {"z": IMAGE_Z}


def test_static_carpet_pair_resolves_insight_refs():
    carpet = Insight(
        name="static-carpet",
        props=InsightProps(type="carpet", a=[0, 1, 0, 1], b=[0, 0, 1, 1], y=[1, 2, 3, 4]),
    )
    contour = Insight(
        name="static-contour",
        props=InsightProps(type="contourcarpet", carpet="${ref(static-carpet)}", z=[1, 2, 3, 4]),
    )
    project = Project(name="p", insights=[carpet, contour], dashboards=[])
    dag = project.dag()
    output_dir = temp_folder()

    assert static_action(carpet, dag, output_dir).success
    assert static_action(contour, dag, output_dir).success
    assert _read_artifact(output_dir, "static-carpet")["static_props"]["carpet"] == "static-carpet"
    assert _read_artifact(output_dir, "static-contour")["static_props"]["carpet"] == "static-carpet"


def test_static_action_reports_a_broken_insight_ref_as_a_diagnostic():
    contour = Insight(
        name="static-contour",
        props=InsightProps(type="contourcarpet", carpet="${ref(missing)}", z=[1, 2]),
    )
    # Build the DAG from a project that does not validate refs for this node
    # by handing the action a dag lacking the target.
    other = Insight(name="other", props=InsightProps(type="scatter", x=[1]))
    dag = Project(name="p", insights=[other], dashboards=[]).dag()

    result = static_action(contour, dag, temp_folder())

    assert result.success is False
    assert result.diagnostic.code == "broken_reference"
    assert "no insight named 'missing' could be resolved" in result.diagnostic.message
    assert result.diagnostic.object.name == "static-contour"


def test_model_bound_insight_action_still_resolves_insight_refs(tmpdir):
    """The regular (query) path resolves the ref too — the docs contourcarpet
    examples bind `z` to a model and `carpet` to a sibling insight."""
    source = SourceFactory()
    model = SqlModel(name="grid", sql="SELECT 1 as a, 1 as b, 2 as z", source=f"ref({source.name})")
    carpet = Insight(
        name="carpet-plot",
        props=InsightProps(type="carpet", a="?{${ref(grid).a}}", b="?{${ref(grid).b}}"),
    )
    contour = Insight(
        name="contour",
        props=InsightProps(
            type="contourcarpet", carpet="${ref(carpet-plot)}", z="?{${ref(grid).z}}"
        ),
    )
    project = Project(
        name="p", sources=[source], models=[model], insights=[carpet, contour], dashboards=[]
    )
    dag = project.dag()
    schema_dir = tmpdir.mkdir("main").mkdir("schemas")
    schema_dir.join("grid.json").write(
        json.dumps({model.name_hash(): {"a": "INTEGER", "b": "INTEGER", "z": "INTEGER"}})
    )

    result = action(contour, dag, str(tmpdir))

    assert result.success is True, result.message
    assert _read_artifact(str(tmpdir), "contour")["static_props"] == {"carpet": "carpet-plot"}


def _model_backed_carpet_project():
    source = SourceFactory()
    model = SqlModel(name="grid", sql="SELECT 1 as a, 1 as b", source=f"ref({source.name})")
    carpet = Insight(
        name="carpet-plot",
        props=InsightProps(type="carpet", a="?{${ref(grid).a}}", b="?{${ref(grid).b}}"),
    )
    contour = Insight(
        name="static-contour",
        props=InsightProps(type="contourcarpet", carpet="${ref(carpet-plot)}", z=[[1, 2], [3, 4]]),
    )
    return (
        Project(
            name="p", sources=[source], models=[model], insights=[carpet, contour], dashboards=[]
        ),
        contour,
    )


def test_a_static_contour_that_refs_a_model_backed_carpet_is_still_static():
    """The ref edge reaches the carpet's model, but the contour binds nothing
    to a query — it must take the static lane, not the query action."""
    project, contour = _model_backed_carpet_project()
    created = job(project.dag(), temp_folder(), contour)
    assert created.action is static_action


def test_static_contour_over_model_backed_carpet_runs_clean(tmpdir):
    project, contour = _model_backed_carpet_project()
    output_dir = str(tmpdir)
    tmpdir.mkdir("main").mkdir("schemas").join("grid.json").write(
        json.dumps({project.models[0].name_hash(): {"a": "INTEGER", "b": "INTEGER"}})
    )
    runner = FilteredRunner(project=project, output_dir=output_dir, soft_failure=True)
    runner.run()
    assert [d.code for d in runner.diagnostics] == []
    assert _read_artifact(output_dir, "static-contour")["static_props"]["carpet"] == "carpet-plot"


def test_static_action_write_failure_is_not_labelled_a_broken_reference(tmpdir):
    _, insight = _image_project()
    dag = Project(name="p", insights=[insight], dashboards=[]).dag()
    blocker = tmpdir.join("main")
    blocker.write("not a directory")  # os.makedirs raises underneath it
    result = static_action(insight, dag, str(tmpdir))
    assert result.success is False
    assert result.diagnostic.code == "unexpected_error"


def test_an_insight_whose_filter_matches_no_rows_writes_an_empty_table(tmpdir):
    """A zero-row result keeps its columns, so the viewer loads an empty table
    instead of failing on a parquet with no columns."""
    import duckdb
    from visivo.models.interaction import InsightInteraction

    database = str(tmpdir.join("db.duckdb"))
    duckdb.connect(database).close()
    source = DuckdbSourceFactory(database=database)
    model = SqlModel(
        name="sales", sql="SELECT 'BEV' AS powertrain, 3 AS units", source=f"ref({source.name})"
    )
    insight = Insight(
        name="split",
        props=InsightProps(
            type="pie", labels="?{${ref(sales).powertrain}}", values="?{sum(${ref(sales).units})}"
        ),
        interactions=[InsightInteraction(filter="?{${ref(sales).powertrain} = 'bev'}")],
    )
    project = Project(name="p", sources=[source], models=[model], insights=[insight], dashboards=[])
    tmpdir.mkdir("main").mkdir("schemas").join("sales.json").write(
        json.dumps({model.name_hash(): {"powertrain": "VARCHAR", "units": "INTEGER"}})
    )

    result = action(insight, project.dag(), str(tmpdir))

    assert result.success is True, result.message
    artifact = _read_artifact(str(tmpdir), "split")
    table = duckdb.sql(
        f"SELECT * FROM read_parquet('{artifact['files'][0]['signed_data_file_url']}')"
    )
    assert sorted(table.columns) == sorted(artifact["props_mapping"].values())
    assert table.fetchall() == []


def test_selected_column_names_reads_the_aliases():
    from visivo.jobs.run_insight_job import _selected_column_names

    assert _selected_column_names('SELECT a AS x, "b" AS y FROM t', "duckdb") == ["x", "y"]


def test_selected_column_names_is_none_for_a_star_select():
    from visivo.jobs.run_insight_job import _selected_column_names

    assert _selected_column_names("SELECT * FROM t", "duckdb") is None
