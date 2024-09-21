from visivo.models.chart import Chart
from visivo.models.selector import Selector
from visivo.models.trace import Trace
from visivo.parsers.serializer import Serializer
from tests.factories.model_factories import (
    DashboardFactory,
    DefaultsFactory,
    ItemFactory,
    ProjectFactory,
    RowFactory,
    SelectorFactory,
    TraceFactory,
    ChartFactory,
    SqlModelFactory,
)


def test_Serializer_with_basic_project():
    project = ProjectFactory()
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.cli_version


def test_Serializer_with_trace_ref():
    project = ProjectFactory(trace_ref=True)
    assert project.dashboards[0].rows[0].items[0].chart.traces[0] == "ref(trace_name)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.traces == []
    assert project.dashboards[0].rows[0].items[0].chart.traces[0].name == "trace_name"


def test_Serializer_with_source_ref():
    project = ProjectFactory()
    project.dashboards[0].rows[0].items[0].chart.traces[0].model.source = "ref(source)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.sources == []
    assert (
        project.dashboards[0].rows[0].items[0].chart.traces[0].model.source.name
        == "source"
    )


def test_Serializer_with_default_source():
    project = ProjectFactory()
    project.defaults = DefaultsFactory(source_name="source")
    project.dashboards[0].rows[0].items[0].chart.traces[0].model.source = None
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.sources == []
    assert (
        project.dashboards[0].rows[0].items[0].chart.traces[0].model.source.name
        == "source"
    )


def test_Serializer_with_chart_ref():
    project = ProjectFactory(chart_ref=True)
    assert project.dashboards[0].rows[0].items[0].chart == "ref(chart_name)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.charts == []
    assert project.dashboards[0].rows[0].items[0].chart.name == "chart_name"


def test_Serializer_with_table_ref():
    project = ProjectFactory(table_ref=True)
    assert project.dashboards[0].rows[0].items[0].table == "ref(table_name)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.tables == []
    assert project.dashboards[0].rows[0].items[0].table.name == "table_name"


def test_Serializer_with_table_trace_ref():
    trace = TraceFactory(name="trace_name")
    trace.model.name = "second_model"
    dashboard = DashboardFactory(table_item=True)
    dashboard.rows[0].items[0].table.traces[0] = "ref(trace_name)"
    project = ProjectFactory(dashboards=[dashboard], traces=[trace])
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.traces == []
    assert project.dashboards[0].rows[0].items[0].table.traces[0].name == "trace_name"


def test_Serializer_with_model_ref():
    project = ProjectFactory(model_ref=True)
    project.dashboards[0].rows[0].items[0].chart.traces[0].model = "ref(model_name)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.traces == []
    assert (
        project.dashboards[0].rows[0].items[0].chart.traces[0].model.name
        == "model_name"
    )


def test_Serializer_with_table_model_ref():
    model = SqlModelFactory(name="model_name")
    project = ProjectFactory(table_item=True, models=[model])
    project.dashboards[0].rows[0].items[0].table.traces[0].model = "ref(model_name)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.traces == []
    assert (
        project.dashboards[0].rows[0].items[0].table.traces[0].model.name
        == "model_name"
    )


def test_Serializer_with_selector_model_ref():
    selector = Selector(name="selector_name")
    project = ProjectFactory(selectors=[selector])
    chart = project.dashboards[0].rows[0].items[0].chart
    chart.selector = "ref(selector_name)"
    selector.options = [f"ref({chart.traces[0].name})"]
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.selectors == []
    assert project.dashboards[0].rows[0].items[0].chart.selector.name == "selector_name"
    assert (
        project.dashboards[0].rows[0].items[0].chart.selector.options[0].name == "trace"
    )


def test_Serializer_with_refs_does_not_change_original():
    chart = ChartFactory(name="chart_name", traces=["ref(trace_name)"])
    trace = TraceFactory(name="trace_name")
    project = ProjectFactory(chart_ref=True, charts=[chart], traces=[trace])
    project.dashboards[0].rows[0].items[0].chart = "ref(chart_name)"
    Serializer(project=project).dereference()
    assert len(project.descendants_of_type(type=Chart)) == 1
    assert len(project.descendants_of_type(type=Trace)) == 1


def test_Serializer_with_item_selector():
    selector = SelectorFactory(name="selector_name", options=["ref(trace_name_1)"])
    chart1 = ChartFactory(
        name="chart_name_1", traces=["ref(trace_name_1)"], selector="ref(selector_name)"
    )
    chart2 = ChartFactory(
        name="chart_name_2", traces=["ref(trace_name_2)"], selector="ref(selector_name)"
    )
    model = SqlModelFactory()
    trace1 = TraceFactory(name="trace_name_1", model="ref(model)")
    trace2 = TraceFactory(name="trace_name_2", model="ref(model)")
    dashboard = DashboardFactory(
        rows=[
            RowFactory(
                items=[
                    ItemFactory(chart="ref(chart_name_1)"),
                    ItemFactory(name="item_2", chart="ref(chart_name_2)"),
                ]
            )
        ]
    )
    project = ProjectFactory(
        chart_ref=True,
        models=[model],
        selectors=[selector],
        charts=[chart1, chart2],
        traces=[trace1, trace2],
        dashboards=[dashboard],
    )
    project = Serializer(project=project).dereference()
    assert len(project.dashboards[0].rows[0].items[0].chart.traces) == 1
    assert len(project.dashboards[0].rows[0].items[1].chart.traces) == 1


def test_Serializer_with_item_row_selector():
    selector = SelectorFactory(name="selector_name", options=["ref(row)"])
    project = ProjectFactory()
    item = ItemFactory(chart=None, selector=selector)
    project.dashboards[0].rows[0].items.append(item)
    project = Serializer(project=project).dereference()
    assert project.dashboards[0].rows[0].items[1].selector.options[0].name == "row"


def test_Serializer_with_multiple_use_of_same_ref():
    model = SqlModelFactory(name="model_name")
    trace = TraceFactory(name="trace_name", model="ref(model_name)")
    chart = ChartFactory(name="chart_name", traces=["ref(trace_name)"])
    item_1 = ItemFactory(chart="ref(chart_name)", name="item_1")
    item_2 = ItemFactory(chart="ref(chart_name)", name="item_2")
    row = RowFactory(items=[item_1, item_2])
    dashboard = DashboardFactory(rows=[row])
    project = ProjectFactory(
        dashboards=[dashboard], models=[model], traces=[trace], charts=[chart]
    )
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.sources == []
    assert project.traces == []
    assert project.charts == []
    assert project.models == []
    assert project.dashboards[0].rows[0].items[0].chart.name == "chart_name"
    assert project.dashboards[0].rows[0].items[0].chart.traces[0].name == "trace_name"
    assert (
        project.dashboards[0].rows[0].items[0].chart.traces[0].model.name
        == "model_name"
    )
    assert project.dashboards[0].rows[0].items[1].chart.name == "chart_name"
    assert project.dashboards[0].rows[0].items[1].chart.traces[0].name == "trace_name"
    assert (
        project.dashboards[0].rows[0].items[1].chart.traces[0].model.name
        == "model_name"
    )
