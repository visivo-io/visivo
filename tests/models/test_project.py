from visivo.models.project import Project
from visivo.models.item import Item
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
