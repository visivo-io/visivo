import yaml

from visivo.models.project import Project
from visivo.models.item import Item
from visivo.models.test import Test
from pydantic import HttpUrl
from tests.factories.model_factories import (
    AlertFactory,
    InsightFactory,
    SourceFactory,
    ChartFactory,
    DashboardFactory,
    RowFactory,
    ExternalDashboardFactory,
)
from pydantic import ValidationError

import pytest


class TestProjectTestsWiring:
    """Smoke-test bug #5: `visivo test` was non-functional because the Project
    model had no `tests` field — a top-level `tests:` key was rejected
    ("Extra inputs are not permitted") and, since nothing wired Test into the
    DAG, `descendants_of_type(Test)` (what test_phase.py runs) always found
    zero tests."""

    def test_project_accepts_a_top_level_tests_key(self):
        project = Project(name="p", tests=[Test(name="t1", assertions=[">{ 1 == 1 }"])])
        assert [t.name for t in project.tests] == ["t1"]

    def test_tests_are_discoverable_via_descendants_of_type(self):
        # This is the exact call test_phase.py makes to collect tests to run.
        project = Project(
            name="p",
            tests=[
                Test(name="t1", assertions=[">{ 1 == 1 }"]),
                Test(name="t2", assertions=[">{ 2 == 2 }"]),
            ],
        )
        found = project.descendants_of_type(type=Test)
        assert sorted(t.name for t in found) == ["t1", "t2"]

    def test_a_top_level_tests_key_was_rejected_before_the_field_existed(self):
        # Guards the wiring: an UNKNOWN top-level key still raises, so the
        # `tests` acceptance above is due to the real field, not lax config.
        with pytest.raises(ValidationError, match="Extra inputs are not permitted"):
            Project(name="p", not_a_real_key=[])

    def test_documented_assertion_yaml_must_be_quoted(self):
        # The Test docstring example quotes each `>{ ... }` assertion. Unquoted,
        # YAML reads the leading `>` as a folded block-scalar indicator and the
        # eval string never survives — the doc bug this fix also corrected.
        quoted = yaml.safe_load('assertions:\n  - ">{ 1 == 1 }"\n')
        assert quoted["assertions"] == [">{ 1 == 1 }"]
        # Unquoted, the leading `>` makes YAML try to read a folded block scalar
        # and it fails outright — the eval string never even reaches the parser.
        with pytest.raises(yaml.YAMLError):
            yaml.safe_load("assertions:\n  - >{ 1 == 1 }\n")

    def test_a_name_only_test_does_not_crash_validation(self):
        # Review-found HIGH regression: because tests are now wired into the DAG,
        # Test.child_items runs during project validation on EVERY command. A
        # stub test with no assertions must default to [] (not None) so it does
        # not raise `TypeError: 'NoneType' object is not iterable`.
        project = Project(name="p", tests=[Test(name="stub")])
        assert project.tests[0].assertions == []
        assert project.descendants_of_type(type=Test)[0].name == "stub"

    def test_empty_tests_key_coerces_to_empty_list(self):
        # A comment-only `tests:` parses as None; it must coerce to [] like every
        # sibling list field (coerce_null_list_fields must include "tests").
        assert Project(name="p", tests=None).tests == []

    def test_documented_test_docstring_example_actually_validates(self):
        # Guards the docstring fix (both the quoted `>{ }` assertions AND the
        # `if:` eval string) against drift — build the exact example from the
        # Test docstring.
        import re
        import textwrap

        block = re.search(r"``` yaml\n(.*?)\n\s*```", Test.__doc__, re.DOTALL).group(1)
        parsed = yaml.safe_load(textwrap.dedent(block))
        built = [Test(**t) for t in parsed["tests"]]
        assert [t.name for t in built] == ["Test One"]
        assert len(built[0].assertions) == 2
        assert built[0].if_ is not None


def test_Project_simple_data():
    data = {"name": "development"}
    project = Project(**data)
    assert project.name == "development"


def test_Project_dashboard_parsing():
    external_dashboard = ExternalDashboardFactory(href="https://example.com")

    ref = "ref(insight_name)"
    chart = ChartFactory(insights=[ref])
    source = SourceFactory()
    item = Item(chart=chart)
    insight = InsightFactory(name="insight_name")
    row = RowFactory(items=[item])
    dashboard = DashboardFactory(rows=[row])

    data = {
        "name": "development",
        "insights": [insight],
        "dashboards": [external_dashboard, dashboard],
        "sources": [source],
    }
    project = Project(**data)
    assert project.dashboards[0].type == "external"
    assert project.dashboards[0].href == HttpUrl("https://example.com")
    assert project.dashboards[1].type == "internal"
    assert hasattr(project.dashboards[1], "rows")
    assert not (hasattr(project.dashboards[0], "rows"))


def test_Project_validate_project_insight_refs():
    ref = "ref(insight_name)"
    chart = ChartFactory(insights=[ref])
    item = Item(chart=chart)
    row = RowFactory(items=[item])
    dashboard = DashboardFactory(rows=[row])
    data = {"name": "development", "insights": [], "dashboards": [dashboard]}

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == f'The reference "ref(insight_name)" on item "chart" does not point to an object.'
    )
    assert error["type"] == "bad_reference"

    insight = InsightFactory(name="insight_name")
    source = SourceFactory()
    data = {
        "name": "development",
        "insights": [insight],
        "dashboards": [dashboard],
        "sources": [source],
    }
    project = Project(**data)
    assert project.insights[0].name == "insight_name"
    assert project.dashboards[0].rows[0].items[0].chart.insights[0] == "ref(insight_name)"


def test_Project_validate_chart_refs():
    ref = "ref(insight_name)"
    chart = ChartFactory(insights=[ref])
    data = {"name": "development", "insights": [], "charts": [chart], "dashboards": []}

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == f'The reference "ref(insight_name)" on item "chart" does not point to an object.'
    )
    assert error["type"] == "bad_reference"

    insight = InsightFactory(name="insight_name")
    source = SourceFactory()
    data = {
        "name": "development",
        "insights": [insight],
        "charts": [chart],
        "sources": [source],
        "dashboards": [],
    }
    project = Project(**data)
    assert project.insights[0].name == "insight_name"
    assert project.charts[0].insights[0] == "ref(insight_name)"


def test_Project_validate_dashboard_names():
    data = {
        "name": "development",
        "charts": [],
        "dashboards": [{"name": "dashboard"}, {"name": "dashboard"}],
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"Value error, Dashboard name 'dashboard' is not unique in the project"
    assert error["type"] == "value_error"


def test_Project_validate_chart_names():
    chart_orig = ChartFactory()
    chart_dup = ChartFactory(name=chart_orig.name)
    data = {
        "name": "development",
        "charts": [chart_orig, chart_dup],
        "dashboards": [],
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"Value error, Chart name 'chart' is not unique in the project"
    assert error["type"] == "value_error"


def test_Project_validate_insight_names():
    insight_orig = InsightFactory()
    insight_dup = InsightFactory(name=insight_orig.name)
    source = SourceFactory(name="source")
    data = {
        "name": "development",
        "defaults": {"source_name": "source"},
        "sources": [source],
        "insights": [insight_orig, insight_dup],
        "charts": [],
        "dashboards": [],
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"Value error, Insight name 'insight' is not unique in the project"
    assert error["type"] == "value_error"


def _semantic_layer_project_data(models):
    """Minimal project data with a shared source for semantic-layer name tests."""
    source = SourceFactory(name="ss")
    return {
        "name": "development",
        "sources": [source],
        "models": models,
        "charts": [],
        "dashboards": [],
    }


def test_Project_allows_same_metric_name_on_two_models():
    """Smoke-test bug #6: a model-scoped metric name is a MODEL-LOCAL alias, so
    two different models may each define `avg_total` (identity is <model>.<name>)."""
    from visivo.models.models.sql_model import SqlModel
    from visivo.models.metric import Metric

    model_a = SqlModel(
        name="model_a",
        sql="SELECT * FROM a",
        source="ref(ss)",
        metrics=[Metric(name="avg_total", expression="AVG(total)")],
    )
    model_b = SqlModel(
        name="model_b",
        sql="SELECT * FROM b",
        source="ref(ss)",
        metrics=[Metric(name="avg_total", expression="AVG(total)")],
    )
    project = Project(**_semantic_layer_project_data([model_a, model_b]))
    assert project.models[0].metrics[0].name == "avg_total"
    assert project.models[1].metrics[0].name == "avg_total"


def test_Project_allows_same_dimension_name_on_two_models():
    """Smoke-test bug #6: same for dimensions (`fed` on two models)."""
    from visivo.models.models.sql_model import SqlModel
    from visivo.models.dimension import Dimension

    model_a = SqlModel(
        name="model_a",
        sql="SELECT * FROM a",
        source="ref(ss)",
        dimensions=[Dimension(name="fed", expression="UPPER(federation)")],
    )
    model_b = SqlModel(
        name="model_b",
        sql="SELECT * FROM b",
        source="ref(ss)",
        dimensions=[Dimension(name="fed", expression="LOWER(federation)")],
    )
    project = Project(**_semantic_layer_project_data([model_a, model_b]))
    assert len(project.models) == 2


def test_Project_rejects_duplicate_metric_name_within_one_model():
    """Two metrics with the same name on the SAME model is still invalid —
    within-model uniqueness must hold (the alias would be ambiguous)."""
    from visivo.models.models.sql_model import SqlModel
    from visivo.models.metric import Metric

    model = SqlModel(
        name="model_a",
        sql="SELECT * FROM a",
        source="ref(ss)",
        metrics=[
            Metric(name="avg_total", expression="AVG(total)"),
            Metric(name="avg_total", expression="AVG(other)"),
        ],
    )
    with pytest.raises(ValidationError) as exc_info:
        Project(**_semantic_layer_project_data([model]))
    assert "not unique in model 'model_a'" in exc_info.value.errors()[0]["msg"]


def test_Project_rejects_duplicate_project_level_metric_name():
    """Project-level (cross-model) metrics stay GLOBALLY unique."""
    from visivo.models.metric import Metric

    data = {
        "name": "development",
        "sources": [SourceFactory(name="ss")],
        "metrics": [
            Metric(name="revenue", expression="1"),
            Metric(name="revenue", expression="2"),
        ],
        "charts": [],
        "dashboards": [],
    }
    with pytest.raises(ValidationError) as exc_info:
        Project(**data)
    assert "not unique in the project" in exc_info.value.errors()[0]["msg"]


def test_Project_rejects_model_scoped_alias_shadowing_a_global_name():
    """A model-scoped alias must not shadow a GLOBAL name (a project-level
    metric here) — otherwise a bare `${ref(name)}` / model lookup is ambiguous."""
    from visivo.models.models.sql_model import SqlModel
    from visivo.models.metric import Metric

    model = SqlModel(
        name="model_a",
        sql="SELECT * FROM a",
        source="ref(ss)",
        metrics=[Metric(name="revenue", expression="SUM(amount)")],
    )
    data = {
        "name": "development",
        "sources": [SourceFactory(name="ss")],
        "models": [model],
        "metrics": [Metric(name="revenue", expression="1")],
        "charts": [],
        "dashboards": [],
    }
    with pytest.raises(ValidationError) as exc_info:
        Project(**data)
    assert "revenue" in exc_info.value.errors()[0]["msg"]


def test_Project_validate_default_source_exists():
    source = SourceFactory()
    data = {
        "name": "development",
        "sources": [source],
        "defaults": {"source_name": source.name},
    }

    Project(**data)


def test_Project_validate_default_source_does_not_exists():
    source = SourceFactory()
    data = {
        "name": "development",
        "defaults": {"source_name": source.name},
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"Value error, default source '{source.name}' does not exist"
    assert error["type"] == "value_error"


def test_Project_validate_default_alerts_exists():
    alert = AlertFactory()
    data = {
        "name": "development",
        "alerts": [alert],
        "defaults": {"alert_name": alert.name},
    }

    Project(**data)


def test_Project_validate_default_alert_does_not_exists():
    alert = SourceFactory()
    data = {
        "name": "development",
        "defaults": {"alert_name": alert.name},
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"Value error, default alert '{alert.name}' does not exist"
    assert error["type"] == "value_error"


def test_Project_validate_set_path_on_named_models():
    data = {"tables": [{}]}
    project = Project(**data)
    assert project.tables[0].path == "project.tables[0]"

    data = {"name": "project name", "tables": [{}]}
    project = Project(**data)
    assert project.tables[0].path == "project.tables[0]"


def test_set_paths_on_models():
    project_data = {
        "name": "test_project",
        "dashboards": [
            {
                "name": "dashboard1",
                "rows": [{"items": []}],
            }
        ],
    }

    project = Project(**project_data)

    assert project.path == "project"
    assert project.dashboards[0].path == "project.dashboards[0]"
    assert project.dashboards[0].rows[0].path == "project.dashboards[0].rows[0]"


def test_get_child_objects():
    project_children_fields = Project.get_child_objects()
    assert "dashboards" in project_children_fields
    assert "insights" in project_children_fields
    assert "charts" in project_children_fields
    assert "tables" in project_children_fields
    assert "models" in project_children_fields


def test_named_child_nodes():
    ref = "ref(insight_name)"
    chart = ChartFactory(insights=[ref])
    source = SourceFactory()
    item = Item(chart=chart)
    insight = InsightFactory(name="insight_name")
    row = RowFactory(items=[item])
    dashboard = DashboardFactory(rows=[row])

    data = {
        "name": "development",
        "insights": [insight],
        "dashboards": [dashboard],
        "sources": [source],
    }
    project = Project(**data)
    named_nodes = project.named_child_nodes()

    assert len(named_nodes) == 5
    assert insight.name in named_nodes.keys()
    assert dashboard.name in named_nodes.keys()
    assert source.name in named_nodes.keys()


def test_named_child_nodes_keeps_duplicate_model_scoped_names_distinct():
    """Smoke-test bug #6 editor follow-up: two models each define a metric
    `avg_total`. `named_child_nodes()` keys by NAME, so it used to collapse the
    two into one entry — one metric silently vanished from the editor/lineage
    surface. Model-scoped metrics/dimensions must key by `<model>.<name>` so both
    appear, each edged to its own parent model."""
    from visivo.models.models.sql_model import SqlModel
    from visivo.models.metric import Metric

    source = SourceFactory(name="ss")
    model_a = SqlModel(
        name="model_a",
        sql="SELECT * FROM a",
        source="ref(ss)",
        metrics=[Metric(name="avg_total", expression="SUM(amount)")],
    )
    model_b = SqlModel(
        name="model_b",
        sql="SELECT * FROM b",
        source="ref(ss)",
        metrics=[Metric(name="avg_total", expression="AVG(weight)")],
    )
    project = Project(
        name="development",
        sources=[source],
        models=[model_a, model_b],
        dashboards=[],
    )
    named_nodes = project.named_child_nodes()

    # Both model-scoped metrics survive, keyed by qualified <model>.<name>.
    assert "model_a.avg_total" in named_nodes
    assert "model_b.avg_total" in named_nodes
    assert named_nodes["model_a.avg_total"]["type"] == "Metric"
    # Each metric's parent edge points at its own model (also qualified-safe:
    # a plain model name has no parent, so it stays bare).
    assert named_nodes["model_a.avg_total"]["direct_parents"] == ["model_a"]
    assert named_nodes["model_b.avg_total"]["direct_parents"] == ["model_b"]
    # The models themselves keep bare-name keys and list the qualified metric.
    assert "model_a" in named_nodes
    assert "model_a.avg_total" in named_nodes["model_a"]["direct_children"]
    assert "model_b.avg_total" not in named_nodes["model_a"]["direct_children"]


def test_cli_version_mismatch_does_not_block_construction_or_run():
    """A run uses whatever visivo is installed, so a project recorded at another
    CLI version must still construct (and run). Version match is deploy-only —
    the cloud runner runs projects deployed by older CLIs."""
    from visivo.version import VISIVO_VERSION

    assert VISIVO_VERSION != "0.0.1"
    project = Project(name="p", cli_version="0.0.1")  # must not raise
    assert project.cli_version == "0.0.1"


def test_cli_version_validator_still_rejects_on_demand_for_deploy():
    """Deploy calls CliVersionValidator explicitly, so a mismatch is still
    rejected there — just not on every construction."""
    from click import ClickException
    from visivo.models.validators import CliVersionValidator

    project = Project(name="p", cli_version="0.0.1")
    with pytest.raises(ClickException):
        CliVersionValidator().validate(project)
