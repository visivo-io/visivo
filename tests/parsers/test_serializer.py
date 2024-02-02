from visivo.parsers.serializer import Serializer
from tests.factories.model_factories import (
    DashboardFactory,
    DefaultsFactory,
    ItemFactory,
    ProjectFactory,
    RowFactory,
    TraceFactory,
    ChartFactory,
    ModelFactory,
)


def test_Serializer_with_basic_project():
    project = ProjectFactory()
    project = Serializer(project=project).dereference()
    assert project.name == "project"


def test_Serializer_with_trace_ref():
    project = ProjectFactory(trace_ref=True)
    assert project.dashboards[0].rows[0].items[0].chart.traces[0] == "ref(trace_name)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.traces == []
    assert project.dashboards[0].rows[0].items[0].chart.traces[0].name == "trace_name"


def test_Serializer_with_target_ref():
    project = ProjectFactory()
    assert (
        project.dashboards[0].rows[0].items[0].chart.traces[0].target == "ref(target)"
    )
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.targets == []
    assert (
        project.dashboards[0].rows[0].items[0].chart.traces[0].target.name == "target"
    )


def test_Serializer_with_default_target():
    project = ProjectFactory()
    project.defaults = DefaultsFactory(target_name="target")
    assert project.dashboards[0].rows[0].items[0].chart.traces[0].target == None
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.targets == []
    assert (
        project.dashboards[0].rows[0].items[0].chart.traces[0].target.name == "target"
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
    dashboard.rows[0].items[0].table.trace = "ref(trace_name)"
    project = ProjectFactory(dashboards=[dashboard], traces=[trace])
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.traces == []
    assert project.dashboards[0].rows[0].items[0].table.trace.name == "trace_name"


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
    model = ModelFactory(name="model_name")
    project = ProjectFactory(table_item=True, models=[model])
    project.dashboards[0].rows[0].items[0].table.trace.model = "ref(model_name)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.traces == []
    assert project.dashboards[0].rows[0].items[0].table.trace.model.name == "model_name"


def test_Serializer_with_refs_does_not_change_original():
    chart = ChartFactory(name="chart_name", traces=["ref(trace_name)"])
    trace = TraceFactory(name="trace_name")
    project = ProjectFactory(chart_ref=True, charts=[chart], traces=[trace])
    project.dashboards[0].rows[0].items[0].chart = "ref(chart_name)"
    Serializer(project=project).dereference()
    assert len(project.chart_objs) == 1
    assert len(project.trace_objs) == 1


def test_Serializer_with_multiple_use_of_same_ref():
    model = ModelFactory(name="model_name")
    trace = TraceFactory(name="trace_name", model="ref(model_name)")
    chart = ChartFactory(name="chart_name", traces=["ref(trace_name)"])
    item_1 = ItemFactory(chart="ref(chart_name)")
    item_2 = ItemFactory(chart="ref(chart_name)")
    row = RowFactory(items=[item_1, item_2])
    dashboard = DashboardFactory(rows=[row])
    project = ProjectFactory(
        dashboards=[dashboard], models=[model], traces=[trace], charts=[chart]
    )
    project = Serializer(project=project).dereference()
    assert project.name == "project"
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
