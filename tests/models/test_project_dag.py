from visivo.models.base.context_string import ContextString
from visivo.models.base.project_dag import ProjectDag
from visivo.models.models.model import Model
from visivo.models.row import Row
from visivo.models.sources.source import Source
from visivo.models.insight import Insight
from visivo.models.table import Table
from visivo.models.chart import Chart
from tests.factories.model_factories import (
    ChartFactory,
    DefaultsFactory,
    InsightFactory,
    ItemFactory,
    SqlModelFactory,
    SourceFactory,
    DashboardFactory,
    RowFactory,
    ProjectFactory,
)
import pytest
import networkx
from visivo.models.project import Project


def test_simple_Project_dag():
    project = ProjectFactory()
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 7
    assert project.descendants_of_type(type=Insight) == [
        project.dashboards[0].rows[0].items[0].chart.insights[0]
    ]


def test_ref_chart_Project_dag():
    project = ProjectFactory(chart_ref=True)
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 7
    assert project.descendants_of_type(type=Insight) == [project.charts[0].insights[0]]
    assert project.descendants_of_type(type=Chart) == [project.charts[0]]


def test_ref_table_Project_dag():
    project = ProjectFactory(table_ref=True)
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    descendants = project.descendants()
    assert networkx.is_directed_acyclic_graph(dag)
    assert project.descendants_of_type(type=Table) == [project.tables[0]]


def test_invalid_ref_Project_dag():
    project = ProjectFactory(table_ref=True)
    project.dashboards[0].rows[0].items[0].name = "item"
    project.invalidate_dag_cache()

    with pytest.raises(ValueError) as exc_info:
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
    project.invalidate_dag_cache()

    included_nodes = project.nodes_including_named_node_in_graph(name=dashboard.name)

    assert dashboard in included_nodes
    assert additional_dashboard not in included_nodes


def test_model_with_default_source_Project_dag():
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
    insight = InsightFactory()
    dashboard = DashboardFactory()
    dashboard.rows[0].items[0].chart.insights[0] = ContextString("${ project.insights[0] }")
    insight.path = "project.insights[0]"
    project = ProjectFactory(
        insights=[insight],
        dashboards=[dashboard],
    )

    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert project.descendants_of_type(type=Insight) == [project.insights[0]]


def test_circular_references_Project_dag():
    insight = InsightFactory(name="circular_insight")
    insight.props.x = "?{ ${ref(circular_insight).x} }"

    with pytest.raises(ValueError) as exc_info:
        ProjectFactory(insights=[insight], dashboards=[])

    assert "Project contains a circular reference: " in str(exc_info.value)


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

    new_project.dashboards[0].rows[0].items[0].chart.insights[0].props.x = "?{updated_field}"
    project_dag = new_project.dag()
    diff_filter = project_dag.get_diff_dag_filter(existing_project, existing_filter)
    assert diff_filter == "dashboard+,row+,item+,chart+,insight+"


def test_get_descendant_by_name_single_node():
    """Test getting a single descendant by name."""
    project = ProjectFactory()
    dag = project.dag()

    dashboard = dag.get_descendant_by_name("dashboard")
    assert dashboard == project.dashboards[0]


def test_get_descendant_by_name_with_from_node():
    """Test getting a descendant from a specific starting node."""
    project = ProjectFactory()
    dag = project.dag()

    insight = dag.get_descendant_by_name("insight", from_node=project.dashboards[0])
    assert insight == project.dashboards[0].rows[0].items[0].chart.insights[0]


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
    insight = project.dashboards[0].rows[0].items[0].chart.insights[0]
    dag = project.dag()

    with pytest.raises(ValueError) as exc_info:
        dag.get_descendant_by_name("dashboard", from_node=insight)

    assert "No descendant found with name 'dashboard'" in str(exc_info.value)
