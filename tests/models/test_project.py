from visivo.models.base.parent_model import ParentModel
from visivo.models.models.model import Model
from visivo.models.project import Project
from visivo.models.item import Item
from visivo.models.selector import Selector
from visivo.models.targets.target import Target
from visivo.models.trace import Trace
from visivo.models.table import Table
from visivo.models.chart import Chart
from ..factories.model_factories import (
    DefaultsFactory,
    ItemFactory,
    SqlModelFactory,
    TraceFactory,
    TargetFactory,
    ChartFactory,
    DashboardFactory,
    RowFactory,
    AlertFactory,
    ProjectFactory,
)
from pydantic import ValidationError
import pytest
import networkx


def test_Project_simple_data():
    data = {"name": "development"}
    project = Project(**data)
    assert project.name == "development"


def test_Project_find_target():
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
    assert (
        error["msg"]
        == f'The reference "ref(trace_name)" on item "Chart - chart" does not point to an object.'
    )
    assert error["type"] == "bad_reference"

    trace = TraceFactory(name="trace_name")
    target = TargetFactory()
    data = {
        "name": "development",
        "traces": [trace],
        "dashboards": [dashboard],
        "targets": [target],
    }
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
    assert (
        error["msg"]
        == f'The reference "ref(trace_name)" on item "Chart - chart" does not point to an object.'
    )
    assert error["type"] == "bad_reference"

    trace = TraceFactory(name="trace_name")
    target = TargetFactory()
    data = {
        "name": "development",
        "traces": [trace],
        "charts": [chart],
        "targets": [target],
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
    assert (
        error["msg"]
        == f"Value error, Dashboard name 'dashboard' is not unique in the project"
    )
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
    assert (
        error["msg"] == f"Value error, Chart name 'chart' is not unique in the project"
    )
    assert error["type"] == "value_error"


def test_Project_validate_trace_names():
    trace_orig = TraceFactory()
    trace_dup = TraceFactory(name=trace_orig.name)
    target = TargetFactory(name="target")
    data = {
        "name": "development",
        "defaults": {"target_name": "target"},
        "targets": [target],
        "traces": [trace_orig, trace_dup],
        "charts": [],
        "dashboards": [],
    }

    with pytest.raises(ValidationError) as exc_info:
        Project(**data)

    error = exc_info.value.errors()[0]
    assert (
        error["msg"] == f"Value error, Trace name 'trace' is not unique in the project"
    )
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
    assert error["msg"] == f"Value error, default target '{target.name}' does not exist"
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
    assert error["msg"] == f"Value error, default alert '{alert.name}' does not exist"
    assert error["type"] == "value_error"


def test_simple_Project_dag():
    project = ProjectFactory()
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 9
    assert project.descendants_of_type(type=Trace) == [
        project.dashboards[0].rows[0].items[0].chart.traces[0]
    ]


def test_ref_trace_Project_dag():
    project = ProjectFactory(trace_ref=True)
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 9
    assert project.descendants_of_type(type=Trace) == [project.traces[0]]


def test_ref_chart_Project_dag():
    project = ProjectFactory(chart_ref=True)
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 9
    assert project.descendants_of_type(type=Trace) == [project.charts[0].traces[0]]
    assert project.descendants_of_type(type=Chart) == [project.charts[0]]
    assert project.descendants_of_type(type=Selector) == [project.charts[0].selector]


def test_ref_table_Project_dag():
    project = ProjectFactory(table_ref=True)
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 9
    assert project.descendants_of_type(type=Trace) == [project.tables[0].traces[0]]
    assert project.descendants_of_type(type=Table) == [project.tables[0]]
    assert project.descendants_of_type(type=Selector) == [project.tables[0].selector]


def test_ref_selector_Project_dag():
    project = ProjectFactory(table_ref=True)
    item = ItemFactory()
    item.chart.selector = "ref(selector)"
    project.dashboards[0].rows[0].items = [item]
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 10
    assert project.descendants_of_type(type=Selector) == [project.tables[0].selector]
    assert project.descendants_of_type(type=Trace) == [project.tables[0].traces[0]]
    assert project.descendants_of_type(type=Table) == [project.tables[0]]


def test_invalid_ref_Project_dag():
    project = ProjectFactory(table_ref=True)

    with pytest.raises(ValueError) as exc_info:
        # It is an incomplete reference from the level of dashboards.
        project.dashboards[0].descendants()

    assert 'The reference "ref(table_name)" on item "Item -' in str(exc_info.value)


def test_sub_dag_including_dashboard_name_Project_dag():
    project = ProjectFactory()
    dashboard = project.dashboards[0]
    additional_dashboard = DashboardFactory(name="Other Dashboard", rows=[])
    project.dashboards.append(additional_dashboard)

    included_nodes = project.nodes_including_named_node_in_graph(name=dashboard.name)

    assert dashboard in included_nodes
    assert additional_dashboard not in included_nodes


def test_trace_with_default_target_Project_dag():
    model = SqlModelFactory(target=None)
    target = TargetFactory()
    project = ProjectFactory(
        dashboards=[],
        targets=[target],
        models=[model],
        defaults=DefaultsFactory(target_name=target.name),
    )
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 3
    assert project.descendants_of_type(type=Model) == [project.models[0]]
    assert project.descendants_of_type(type=Target) == [project.targets[0]]
