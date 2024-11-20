from visivo.models.base.context_string import ContextString
from visivo.models.models.model import Model
from visivo.models.selector import Selector
from visivo.models.sources.source import Source
from visivo.models.trace import Trace
from visivo.models.table import Table
from visivo.models.chart import Chart
from ..factories.model_factories import (
    DefaultsFactory,
    ItemFactory,
    SelectorFactory,
    SqlModelFactory,
    SourceFactory,
    DashboardFactory,
    RowFactory,
    ProjectFactory,
    TraceFactory,
)
import pytest
import networkx


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


def test_ref_selector_item_Project_dag():
    project = ProjectFactory(table_ref=True)
    item = ItemFactory()
    item.chart.selector = "ref(selector)"
    project.dashboards[0].rows[0].items = [item]
    project.tables[0].selector = "ref(selector)"
    selector = SelectorFactory()
    project.selectors = [selector]
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 10
    assert project.descendants_of_type(type=Selector) == project.selectors
    assert project.descendants_of_type(type=Trace) == project.tables[0].traces
    assert project.descendants_of_type(type=Table) == project.tables
    assert project.descendants_of_type(type=Chart) == [
        project.dashboards[0].rows[0].items[0].chart
    ]


def test_ref_selector_row_item_Project_dag():
    row = RowFactory()
    selector = SelectorFactory(name="row selector", options=["ref(row)"])
    project = ProjectFactory(selectors=[selector])
    project.dashboards[0].rows = [row]
    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 10
    assert selector in project.descendants_of_type(type=Selector)


def test_invalid_ref_Project_dag():
    project = ProjectFactory(table_ref=True)
    project.dashboards[0].rows[0].items[0].name = "item"

    with pytest.raises(ValueError) as exc_info:
        # It is an incomplete reference from the level of dashboards.
        project.dashboards[0].descendants()

    assert (
        'The reference "ref(table_name)" on item "item" does not point to an object.'
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
    project = ProjectFactory(
        traces=[trace],
        dashboards=[dashboard],
    )
    trace.path = "project.traces[0]"

    dag = project.dag()

    assert networkx.is_directed_acyclic_graph(dag)
    assert len(project.descendants()) == 9
    assert project.descendants_of_type(type=Trace) == [project.traces[0]]
