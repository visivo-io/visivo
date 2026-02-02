from visivo.models.base.context_string import ContextString
from visivo.models.base.project_dag import ProjectDag
from visivo.models.models.model import Model
from visivo.models.row import Row
from visivo.models.selector import Selector
from visivo.models.sources.source import Source
from visivo.models.test import Test
from visivo.models.trace import Trace
from visivo.models.table import Table
from visivo.models.chart import Chart
from tests.factories.model_factories import (
    ChartFactory,
    DefaultsFactory,
    ItemFactory,
    SelectorFactory,
    SqlModelFactory,
    SourceFactory,
    DashboardFactory,
    RowFactory,
    ProjectFactory,
    TestFactory,
    TraceFactory,
)
import pytest
import networkx
from visivo.models.project import Project


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


def test_context_model_Project_dag():
    project = ProjectFactory(model_ref=True)
    model = project.models[0]
    model.path = "project.models[0]"
    trace = project.dashboards[0].rows[0].items[0].chart.traces[0]
    trace.model = ContextString("${ project.models[0] }")

    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 9
    assert model in trace.descendants_of_type(type=Model, dag=dag)


def test_context_source_Project_dag():
    project = ProjectFactory()
    source = project.sources[0]
    source.path = "project.sources[0]"
    model = project.dashboards[0].rows[0].items[0].chart.traces[0].model
    model.source = ContextString("${ project.sources[0] }")

    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 9
    assert source in model.descendants_of_type(type=Source, dag=dag)


def test_ref_selector_Project_dag_has_one_selector():
    project = ProjectFactory(table_ref=True)
    item = ItemFactory()
    item.chart.selector = "ref(selector)"
    item.chart.traces[0].name = "trace 2"
    project.dashboards[0].rows[0].items = [item]

    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 11
    assert project.descendants_of_type(type=Selector) == [project.tables[0].selector]
    assert set(project.descendants_of_type(type=Trace)) == {
        project.tables[0].traces[0],
        item.chart.traces[0],
    }
    assert project.descendants_of_type(type=Table) == [project.tables[0]]
    assert project.descendants_of_type(type=Chart) == [item.chart]


def test_ref_selector_item_Project_dag():
    project = ProjectFactory(table_ref=True)
    item = ItemFactory()
    item.chart.selector = "ref(selector)"
    item.chart.traces[0].name = "trace 2"
    project.dashboards[0].rows[0].items = [item]
    project.tables[0].selector = "ref(selector)"
    selector = SelectorFactory()
    project.selectors = [selector]
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 11
    assert project.descendants_of_type(type=Selector) == project.selectors
    assert set(project.descendants_of_type(type=Trace)) == {
        project.tables[0].traces[0],
        item.chart.traces[0],
    }
    assert project.descendants_of_type(type=Table) == [project.tables[0]]
    assert project.descendants_of_type(type=Chart) == [project.dashboards[0].rows[0].items[0].chart]


def test_ref_selector_row_item_Project_dag():
    row = RowFactory()
    selector = SelectorFactory(name="row selector", options=["ref(row)"])
    project = ProjectFactory(selectors=[selector])
    project.dashboards[0].rows = [row]
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 10
    assert selector in project.descendants_of_type(type=Selector)


def test_context_selector_row_item_Project_dag():
    row = RowFactory()
    selector = SelectorFactory(name="row selector", options=["${ref(row)}"])
    project = ProjectFactory(selectors=[selector])
    project.dashboards[0].rows = [row]
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 10
    assert selector in project.descendants_of_type(type=Selector)
    assert row in selector.descendants_of_type(type=Row, dag=dag)


def test_invalid_ref_Project_dag():
    project = ProjectFactory(table_ref=True)
    project.dashboards[0].rows[0].items[0].name = "item"

    with pytest.raises(ValueError) as exc_info:
        # It is an incomplete reference from the level of dashboards.
        project.dashboards[0].descendants()

    assert 'The reference "ref(table_name)" on item "item" does not point to an object.' in str(
        exc_info.value
    )


def test_ambiguous_ref_Project_dag():
    project = ProjectFactory(chart_ref=True)
    project.charts.append(ChartFactory(name="chart_name"))

    with pytest.raises(ValueError) as exc_info:
        Project(**project.model_dump())

    assert (
        'The reference "${ref(chart_name)}" on item "item" points to multiple objects. Check for the duplicated name '
        in str(exc_info.value)
    )


def test_sub_dag_including_dashboard_name_Project_dag():
    project = ProjectFactory()
    dashboard = project.dashboards[0]
    additional_dashboard = DashboardFactory(name="Other Dashboard", rows=[])
    project.dashboards.append(additional_dashboard)

    included_nodes = project.nodes_including_named_node_in_graph(name=dashboard.name)

    assert dashboard in included_nodes
    assert additional_dashboard not in included_nodes


def test_trace_with_default_source_Project_dag():
    model = SqlModelFactory(source=None)
    source = SourceFactory()
    project = ProjectFactory(
        dashboards=[],
        sources=[source],
        models=[model],
        defaults=DefaultsFactory(source_name=source.name),
    )
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 3
    assert project.descendants_of_type(type=Model) == [project.models[0]]
    assert project.descendants_of_type(type=Source) == [project.sources[0]]


def test_dag_with_context_string():
    trace = TraceFactory()
    dashboard = DashboardFactory()
    dashboard.rows[0].items[0].chart.traces[0] = ContextString("${ project.traces[0] }")
    trace.path = "project.traces[0]"
    project = ProjectFactory(
        traces=[trace],
        dashboards=[dashboard],
    )

    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 9
    assert project.descendants_of_type(type=Trace) == [project.traces[0]]


def test_circular_references_Project_dag():
    trace = TraceFactory(name="circular_trace")
    trace.model = ContextString("${ project }")

    with pytest.raises(ValueError) as exc_info:
        ProjectFactory(traces=[trace], dashboards=[])

    assert "Project contains a circular reference: " in str(exc_info.value)


def test_trace_with_test_Project_dag():
    test = TestFactory()
    trace = TraceFactory(tests=[test])
    project = ProjectFactory(
        traces=[trace],
        dashboards=[],
    )

    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 5
    assert project.descendants_of_type(type=Test) == [test]


def test_filter_dag():
    dag = ProjectDag()

    grandparent1 = Model(name="grandparent1")
    grandparent2 = Model(name="grandparent2")
    parent = Model(name="parent")
    model = Model(name="model")
    child = Model(name="child")
    grandchild1 = Model(name="grandchild1")
    grandchild2 = Model(name="grandchild2")
    dag.add_node(grandparent1)
    dag.add_edge(grandparent1, parent)
    dag.add_edge(grandparent2, parent)
    dag.add_edge(parent, model)
    dag.add_edge(model, child)
    dag.add_edge(child, grandchild1)
    dag.add_edge(child, grandchild2)

    filtered_dag = dag.filter_dag("1+model+1")
    assert len(filtered_dag) == 1
    assert len(filtered_dag[0].nodes) == 3
    assert len(filtered_dag[0].edges) == 2

    filtered_dag = dag.filter_dag("2+model+1")
    assert len(filtered_dag) == 1
    assert len(filtered_dag[0].nodes) == 5
    assert len(filtered_dag[0].edges) == 4

    filtered_dag = dag.filter_dag("+model+1")
    assert len(filtered_dag) == 1
    assert len(filtered_dag[0].nodes) == 5
    assert len(filtered_dag[0].edges) == 4

    filtered_dag = dag.filter_dag("1+model+")
    assert len(filtered_dag) == 1
    assert len(filtered_dag[0].nodes) == 5
    assert len(filtered_dag[0].edges) == 4

    filtered_dag = dag.filter_dag("model+")
    assert len(filtered_dag) == 1
    assert len(filtered_dag[0].nodes) == 4
    assert len(filtered_dag[0].edges) == 3

    filtered_dag = dag.filter_dag("model")
    assert len(filtered_dag) == 1
    assert len(filtered_dag[0].nodes) == 1
    assert len(filtered_dag[0].edges) == 0

    filtered_dag = dag.filter_dag("grandparent1, grandparent2")
    assert len(filtered_dag) == 2
    assert len(filtered_dag[0].nodes) == 1
    assert len(filtered_dag[0].edges) == 0
    assert len(filtered_dag[1].nodes) == 1
    assert len(filtered_dag[1].edges) == 0

    filtered_dag = dag.filter_dag("1+grandparent1, 1+grandparent2, parent")
    assert len(filtered_dag) == 1
    assert len(filtered_dag[0].nodes) == 3
    assert len(filtered_dag[0].edges) == 2

    filtered_dag = dag.filter_dag("grandparent1, grandparent2, parent, model+2")
    assert len(filtered_dag) == 1
    assert len(filtered_dag[0].nodes) == 4
    assert len(filtered_dag[0].edges) == 3


def test_get_diff_dag_filter():
    existing_project = ProjectFactory()
    new_project = ProjectFactory()
    other_dashboard = DashboardFactory(name="other_dashboard", rows=[])
    existing_filter = f"+{existing_project.dashboards[0].name}+"

    project_dag = new_project.dag()
    diff_filter = project_dag.get_diff_dag_filter(existing_project, existing_filter)
    assert diff_filter == ""

    new_project.dashboards.append(other_dashboard)
    project_dag = new_project.dag()
    diff_filter = project_dag.get_diff_dag_filter(existing_project, existing_filter)
    assert diff_filter == ""

    new_project.dashboards[0].rows[0].items[0].chart.traces[0].model.sql = "updated sql"
    project_dag = new_project.dag()
    diff_filter = project_dag.get_diff_dag_filter(existing_project, existing_filter)
    assert diff_filter == "dashboard+,row+,item+,chart+,trace+,model+"


def test_get_descendant_by_name_single_node():
    """Test getting a single descendant by name."""
    project = ProjectFactory()
    dag = project.dag()

    # Should find the single dashboard
    dashboard = dag.get_descendant_by_name("dashboard")
    assert dashboard == project.dashboards[0]


def test_get_descendant_by_name_with_from_node():
    """Test getting a descendant from a specific starting node."""
    project = ProjectFactory()
    dag = project.dag()

    # Should find the trace from the dashboard
    trace = dag.get_descendant_by_name("trace", from_node=project.dashboards[0])
    assert trace == project.dashboards[0].rows[0].items[0].chart.traces[0]


def test_get_descendant_by_name_not_found():
    """Test that ValueError is raised when no node is found."""
    project = ProjectFactory()
    dag = project.dag()

    with pytest.raises(ValueError) as exc_info:
        dag.get_descendant_by_name("nonexistent")

    assert "No node found with name 'nonexistent'" in str(exc_info.value)


def test_get_descendant_by_name_not_found_from_node():
    """Test that ValueError is raised when no descendant is found from a node."""
    project = ProjectFactory()
    model = project.dashboards[0].rows[0].items[0].chart.traces[0].model
    dag = project.dag()

    # Model has no descendants with name "dashboard"
    with pytest.raises(ValueError) as exc_info:
        dag.get_descendant_by_name("dashboard", from_node=model)

    assert "No descendant found with name 'dashboard'" in str(exc_info.value)
