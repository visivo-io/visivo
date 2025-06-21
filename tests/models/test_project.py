from visivo.models.project import Project
from visivo.models.item import Item
from pydantic import HttpUrl
from ..factories.model_factories import (
    AlertFactory,
    TraceFactory,
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

    ref = "ref(trace_name)"
    chart = ChartFactory(traces=[ref])
    source = SourceFactory()
    item = Item(chart=chart)
    trace = TraceFactory(name="trace_name")
    row = RowFactory(items=[item])
    dashboard = DashboardFactory(rows=[row])

    data = {
        "name": "development",
        "traces": [trace],
        "dashboards": [external_dashboard, dashboard],
        "sources": [source],
    }
    project = Project(**data)
    assert project.dashboards[0].type == "external"
    assert project.dashboards[0].href == HttpUrl("https://example.com")
    assert project.dashboards[1].type == "internal"
    assert hasattr(project.dashboards[1], "rows")
    assert not (hasattr(project.dashboards[0], "rows"))


def test_Project_validate_project_trace_refs():
    ref = "ref(trace_name)"
    chart = ChartFactory(traces=[ref])
    item = Item(chart=chart)
    row = RowFactory(items=[item])
    dashboard = DashboardFactory(rows=[row])
    data = {"name": "development", "traces": [], "dashboards": [dashboard]}

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == f'The reference "ref(trace_name)" on item "chart" does not point to an object.'
    )
    assert error["type"] == "bad_reference"

    trace = TraceFactory(name="trace_name")
    source = SourceFactory()
    data = {
        "name": "development",
        "traces": [trace],
        "dashboards": [dashboard],
        "sources": [source],
    }
    project = Project(**data)
    assert project.traces[0].name == "trace_name"
    assert project.dashboards[0].rows[0].items[0].chart.traces[0] == "ref(trace_name)"


def test_Project_validate_chart_refs():
    ref = "ref(trace_name)"
    chart = ChartFactory(traces=[ref])
    data = {"name": "development", "traces": [], "charts": [chart], "dashboards": []}

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"]
        == f'The reference "ref(trace_name)" on item "chart" does not point to an object.'
    )
    assert error["type"] == "bad_reference"

    trace = TraceFactory(name="trace_name")
    source = SourceFactory()
    data = {
        "name": "development",
        "traces": [trace],
        "charts": [chart],
        "sources": [source],
        "dashboards": [],
    }
    project = Project(**data)
    assert project.traces[0].name == "trace_name"
    assert project.charts[0].traces[0] == "ref(trace_name)"


def test_Project_validate_dashboard_names():
    data = {
        "name": "development",
        "traces": [],
        "charts": [],
        "dashboards": [{"name": "dashboard"}, {"name": "dashboard"}],
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"Value error, Dashboard name 'dashboard' is not unique in the project"
    assert error["type"] == "value_error"


def test_Project_validate_chart_names():
    chart_orig = ChartFactory(traces=[])
    chart_dup = ChartFactory(name=chart_orig.name, traces=[])
    data = {
        "name": "development",
        "traces": [],
        "charts": [chart_orig, chart_dup],
        "dashboards": [],
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"Value error, Chart name 'chart' is not unique in the project"
    assert error["type"] == "value_error"


def test_Project_validate_trace_names():
    trace_orig = TraceFactory()
    trace_dup = TraceFactory(name=trace_orig.name)
    source = SourceFactory(name="source")
    data = {
        "name": "development",
        "defaults": {"source_name": "source"},
        "sources": [source],
        "traces": [trace_orig, trace_dup],
        "charts": [],
        "dashboards": [],
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"Value error, Trace name 'trace' is not unique in the project"
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


def test_Project_validate_default_source_does_not_exists():
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


def test_Project_validate_table_single():
    source = SourceFactory()
    data = {
        "name": "development",
        "tables": [{"name": "Table", "selector": {"name": "selector", "type": "multiple"}}],
    }
    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == "Value error, Table must reference a trace or a model for data."
    assert error["type"] == "value_error"


def test_Project_validate_set_path_on_named_models():
    table = {
        "name": "Table",
        "traces": [
            {
                "name": "Trace",
                "model": {"sql": "select 1"},
                "props": {"type": "scatter", "x": "?{x}", "y": "?{y}"},
            }
        ],
    }
    data = {"tables": [table]}
    project = Project(**data)
    assert project.tables[0].path == "project.tables[0]"

    data = {"name": "project name", "tables": [table]}
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
    assert "traces" in project_children_fields
    assert "charts" in project_children_fields
    assert "tables" in project_children_fields
    assert "models" in project_children_fields
    assert "traces" in project_children_fields
    assert "tables" in project_children_fields


def test_named_child_nodes():
    ref = "ref(trace_name)"
    chart = ChartFactory(traces=[ref])
    source = SourceFactory()
    item = Item(chart=chart)
    trace = TraceFactory(name="trace_name")
    row = RowFactory(items=[item])
    dashboard = DashboardFactory(rows=[row])

    data = {
        "name": "development",
        "traces": [trace],
        "dashboards": [dashboard],
        "sources": [source],
    }
    project = Project(**data)
    named_nodes = project.named_child_nodes()

    assert len(named_nodes) == 7
    assert trace.name in named_nodes.keys()
    assert dashboard.name in named_nodes.keys()
    assert source.name in named_nodes.keys()
