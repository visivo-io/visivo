import factory
from visivo.models.trace import Trace
from visivo.models.chart import Chart
from visivo.models.dashboard import Dashboard
from visivo.models.item import Item
from visivo.models.project import Project
from visivo.models.trace_props import TraceProps
from visivo.models.alert import ConsoleAlert
from visivo.models.row import Row, HeightEnum
from visivo.models.target import Target, TypeEnum


class AlertFactory(factory.Factory):
    class Meta:
        model = ConsoleAlert

    name = "alert"
    type = "console"


class TargetFactory(factory.Factory):
    class Meta:
        model = Target

    name = "target"
    database = "tmp/test.db"
    type = TypeEnum.sqlite


class TracePropsFactory(factory.Factory):
    class Meta:
        model = TraceProps

    x = "x"
    y = "y"


class TraceFactory(factory.Factory):
    class Meta:
        model = Trace

    name = "trace"
    base_sql = "select * from test_table"
    tests = None
    props = factory.SubFactory(TracePropsFactory)

    class Params:
        include_tests = factory.Trait(
            tests=[
                {"coordinate_exists": {"coordinates": {"x": 2, "y": 1}}},
                {"not_null": {"attributes": ["y", "x"]}},
            ]
        )


class ChartFactory(factory.Factory):
    class Meta:
        model = Chart

    name = "chart"
    traces = factory.List([factory.SubFactory(TraceFactory) for _ in range(1)])

    class Params:
        trace_ref = factory.Trait(traces=["ref(trace_name)"])


class ItemFactory(factory.Factory):
    class Meta:
        model = Item

    width = 1
    chart = factory.SubFactory(ChartFactory)

    class Params:
        trace_ref = factory.Trait(
            chart=factory.SubFactory(ChartFactory, trace_ref=True)
        )
        chart_ref = factory.Trait(chart="ref(chart_name)")


class RowFactory(factory.Factory):
    class Meta:
        model = Row

    height = HeightEnum.medium
    items = factory.List([factory.SubFactory(ItemFactory) for _ in range(1)])

    class Params:
        trace_ref = factory.Trait(
            items=factory.List(
                [factory.SubFactory(ItemFactory, trace_ref=True) for _ in range(1)]
            )
        )
        chart_ref = factory.Trait(
            items=factory.List(
                [factory.SubFactory(ItemFactory, chart_ref=True) for _ in range(1)]
            )
        )


class DashboardFactory(factory.Factory):
    class Meta:
        model = Dashboard

    rows = factory.List([factory.SubFactory(RowFactory) for _ in range(1)])

    class Params:
        trace_ref = factory.Trait(
            rows=factory.List(
                [factory.SubFactory(RowFactory, trace_ref=True) for _ in range(1)]
            )
        )
        chart_ref = factory.Trait(
            rows=factory.List(
                [factory.SubFactory(RowFactory, chart_ref=True) for _ in range(1)]
            )
        )


class ProjectFactory(factory.Factory):
    class Meta:
        model = Project

    data = {}
    name = "project"
    targets = factory.List([factory.SubFactory(TargetFactory) for _ in range(1)])
    dashboards = factory.List([factory.SubFactory(DashboardFactory) for _ in range(1)])
    traces = []
    alerts = []

    class Params:
        trace_ref = factory.Trait(
            traces=factory.List(
                [factory.SubFactory(TraceFactory, name="trace_name") for _ in range(1)]
            ),
            dashboards=factory.List(
                [factory.SubFactory(DashboardFactory, trace_ref=True) for _ in range(1)]
            ),
        )
        chart_ref = factory.Trait(
            charts=factory.List(
                [factory.SubFactory(ChartFactory, name="chart_name") for _ in range(1)]
            ),
            dashboards=factory.List(
                [factory.SubFactory(DashboardFactory, chart_ref=True) for _ in range(1)]
            ),
        )
