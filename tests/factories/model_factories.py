import factory
from visivo.models.defaults import Defaults
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.trace import Trace
from visivo.models.chart import Chart
from visivo.models.dashboard import Dashboard
from visivo.models.item import Item
from visivo.models.project import Project
from visivo.models.table import Table
from visivo.models.trace_props import Scatter
from visivo.models.alert import ConsoleAlert
from visivo.models.row import Row, HeightEnum
from visivo.models.target import Target, TypeEnum
from visivo.query.jobs.job import Job


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
        model = Scatter

    type = "scatter"
    x = "query(x)"
    y = "query(y)"


class SqlModelFactory(factory.Factory):
    class Meta:
        model = SqlModel

    name = "model"
    sql = "select * from test_table"
    target = "ref(target)"

    class Params:
        target_include = factory.Trait(target=factory.SubFactory(TargetFactory))
        target_default = factory.Trait(target=None)


class CsvScriptModelFactory(factory.Factory):
    class Meta:
        model = CsvScriptModel

    name = "model"
    table_name = "model"
    args = ["echo", "row_number,value\n1,1\n2,1\n3,2\n4,3\n5,5\n6,8"]


class TraceFactory(factory.Factory):
    class Meta:
        model = Trace

    name = "trace"
    model = factory.SubFactory(SqlModelFactory)
    tests = None
    props = factory.SubFactory(TracePropsFactory)

    class Params:
        model_ref = factory.Trait(model="ref(model_name)")
        include_tests = factory.Trait(
            tests=[
                {"coordinate_exists": {"coordinates": {"x": 2, "y": 1}}},
                {"not_null": {"attributes": ["y", "x"]}},
            ]
        )


class JobFactory(factory.Factory):
    class Meta:
        model = Job

    item = factory.SubFactory(TraceFactory)
    target = factory.SubFactory(TargetFactory)
    action = None


class ChartFactory(factory.Factory):
    class Meta:
        model = Chart

    name = "chart"
    traces = factory.List([factory.SubFactory(TraceFactory) for _ in range(1)])

    class Params:
        model_ref = factory.Trait(
            traces=factory.List(
                [factory.SubFactory(TraceFactory, model_ref=True) for _ in range(1)]
            )
        )
        trace_ref = factory.Trait(traces=["ref(trace_name)"])


class TableFactory(factory.Factory):
    class Meta:
        model = Table

    name = "table"
    columns = []
    trace = factory.SubFactory(TraceFactory)


class ItemFactory(factory.Factory):
    class Meta:
        model = Item

    width = 1
    chart = factory.SubFactory(ChartFactory)
    table = None

    class Params:
        model_ref = factory.Trait(
            chart=factory.SubFactory(ChartFactory, model_ref=True)
        )
        trace_ref = factory.Trait(
            chart=factory.SubFactory(ChartFactory, trace_ref=True)
        )
        chart_ref = factory.Trait(chart="ref(chart_name)")
        table_item = factory.Trait(chart=None, table=factory.SubFactory(TableFactory))
        table_ref = factory.Trait(chart=None, table="ref(table_name)")


class RowFactory(factory.Factory):
    class Meta:
        model = Row

    height = HeightEnum.medium
    items = factory.List([factory.SubFactory(ItemFactory) for _ in range(1)])

    class Params:
        model_ref = factory.Trait(
            items=factory.List(
                [factory.SubFactory(ItemFactory, model_ref=True) for _ in range(1)]
            )
        )
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
        table_ref = factory.Trait(
            items=factory.List(
                [factory.SubFactory(ItemFactory, table_ref=True) for _ in range(1)]
            )
        )
        table_item = factory.Trait(
            items=factory.List(
                [factory.SubFactory(ItemFactory, table_item=True) for _ in range(1)]
            )
        )


class DashboardFactory(factory.Factory):
    name = "dashboard"

    class Meta:
        model = Dashboard

    rows = factory.List([factory.SubFactory(RowFactory) for _ in range(1)])

    class Params:
        model_ref = factory.Trait(
            rows=factory.List(
                [factory.SubFactory(RowFactory, model_ref=True) for _ in range(1)]
            )
        )
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
        table_ref = factory.Trait(
            rows=factory.List(
                [factory.SubFactory(RowFactory, table_ref=True) for _ in range(1)]
            )
        )
        table_item = factory.Trait(
            rows=factory.List(
                [factory.SubFactory(RowFactory, table_item=True) for _ in range(1)]
            )
        )


class DefaultsFactory(factory.Factory):
    target_name = "target"

    class Meta:
        model = Defaults


class ProjectFactory(factory.Factory):
    class Meta:
        model = Project

    name = "project"
    targets = factory.List([factory.SubFactory(TargetFactory) for _ in range(1)])
    dashboards = factory.List([factory.SubFactory(DashboardFactory) for _ in range(1)])
    traces = []
    alerts = []
    tables = []
    charts = []
    models = []

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
        table_ref = factory.Trait(
            tables=factory.List(
                [factory.SubFactory(TableFactory, name="table_name") for _ in range(1)]
            ),
            dashboards=factory.List(
                [factory.SubFactory(DashboardFactory, table_ref=True) for _ in range(1)]
            ),
        )
        model_ref = factory.Trait(
            models=factory.List(
                [
                    factory.SubFactory(SqlModelFactory, name="model_name")
                    for _ in range(1)
                ]
            ),
            dashboards=factory.List(
                [factory.SubFactory(DashboardFactory, model_ref=True) for _ in range(1)]
            ),
        )
        table_item = factory.Trait(
            dashboards=factory.List(
                [
                    factory.SubFactory(DashboardFactory, table_item=True)
                    for _ in range(1)
                ]
            ),
        )
