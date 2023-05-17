from visivo.models.project import Project
from visivo.models.item import Item
from ..factories.model_factories import (
    TraceFactory,
    TargetFactory,
    ChartFactory,
    DashboardFactory,
    RowFactory,
    AlertFactory,
    TableFactory,
)
from pydantic import ValidationError
import pytest


def test_Project_simple_data():
    data = {"name": "development"}
    project = Project(**data)
    assert project.name == "development"


def test_Project_filter_trace():
    project = Project(traces=[])
    assert project.filter_traces(pattern="trace") == []

    cat_trace = TraceFactory(name="cat")
    bobcat_trace = TraceFactory(name="bobcat")
    project = Project(traces=[cat_trace, bobcat_trace])
    assert project.filter_traces(pattern="cat") == [cat_trace, bobcat_trace]

    cat_trace = TraceFactory(name="cat")
    bobcat_trace = TraceFactory(name="bobcat")
    project = Project(traces=[cat_trace, bobcat_trace])
    assert project.filter_traces(pattern="^cat") == [cat_trace]


def test_Project_find_trace():
    project = Project(traces=[])
    assert project.find_trace(name="trace") == None

    trace = TraceFactory()
    project = Project(traces=[trace])
    assert project.find_trace(name=trace.name) == trace

    chart = ChartFactory()
    project = Project(charts=[chart])
    assert project.find_trace(name=chart.traces[0].name) == trace

    table = TableFactory()
    project = Project(tables=[table])
    assert project.find_trace(name=table.trace.name) == trace

    dashboard = DashboardFactory()
    project = Project(dashboards=[dashboard])
    assert project.find_trace(name=dashboard.all_traces[0].name) == trace

    dashboard = DashboardFactory(table_item=True)
    project = Project(dashboards=[dashboard])
    assert project.find_trace(name=dashboard.all_traces[0].name) == trace


def test_Project_find_target():
    project = Project(traces=[])
    assert project.find_trace(name="trace") == None

    target = TargetFactory()
    project = Project(targets=[target])
    assert project.find_target(name=target.name) == target


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
    assert error["msg"] == f"trace 'ref(trace_name)' does not reference a trace"
    assert error["type"] == "value_error"

    trace = TraceFactory(name="trace_name")
    data = {"name": "development", "traces": [trace], "dashboards": [dashboard]}
    project = Project(**data)
    assert project.traces[0].name == "trace_name"
    assert project.dashboards[0].all_traces[0] == "ref(trace_name)"


def test_Project_validate_chart_refs():
    ref = "ref(trace_name)"
    chart = ChartFactory(traces=[ref])
    data = {"name": "development", "traces": [], "charts": [chart], "dashboards": []}

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"trace 'ref(trace_name)' does not reference a trace"
    assert error["type"] == "value_error"

    trace = TraceFactory(name="trace_name")
    data = {
        "name": "development",
        "traces": [trace],
        "charts": [chart],
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
    assert error["msg"] == f"dashboard name 'dashboard' is not unique in the project"
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
    assert error["msg"] == f"chart name 'chart' is not unique in the project"
    assert error["type"] == "value_error"


def test_Project_validate_trace_names():
    trace_orig = TraceFactory()
    trace_dup = TraceFactory(name=trace_orig.name)
    data = {
        "name": "development",
        "traces": [trace_orig, trace_dup],
        "charts": [],
        "dashboards": [],
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"trace name 'trace' is not unique in the project"
    assert error["type"] == "value_error"


def test_Project_validate_default_target_exists():
    target = TargetFactory()
    data = {
        "name": "development",
        "targets": [target],
        "defaults": {"target_name": target.name},
    }

    Project(**data)


def test_Project_validate_default_target_does_not_exists():
    target = TargetFactory()
    data = {
        "name": "development",
        "defaults": {"target_name": target.name},
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"default target '{target.name}' does not exist"
    assert error["type"] == "value_error"


def test_Project_validate_default_alerts_exists():
    alert = AlertFactory()
    data = {
        "name": "development",
        "alerts": [alert],
        "defaults": {"alert_name": alert.name},
    }

    Project(**data)


def test_Project_validate_default_target_does_not_exists():
    alert = TargetFactory()
    data = {
        "name": "development",
        "defaults": {"alert_name": alert.name},
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert error["msg"] == f"default alert '{alert.name}' does not exist"
    assert error["type"] == "value_error"
