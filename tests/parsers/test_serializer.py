from visivo.parsers.serializer import Serializer
from tests.factories.model_factories import ProjectFactory, TraceFactory, ChartFactory


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
    project = ProjectFactory(table_item=True, traces=[trace])
    project.dashboards[0].rows[0].items[0].table.trace = "ref(trace_name)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.traces == []
    assert project.dashboards[0].rows[0].items[0].table.trace.name == "trace_name"


def test_Serializer_with_refs_does_not_change_original():
    chart = ChartFactory(name="chart_name", traces=["ref(trace_name)"])
    trace = TraceFactory(name="trace_name")
    project = ProjectFactory(chart_ref=True, charts=[chart], traces=[trace])
    project.dashboards[0].rows[0].items[0].chart = "ref(chart_name)"
    Serializer(project=project).dereference()
    assert len(project.chart_objs) == 1
    assert len(project.trace_objs) == 1
