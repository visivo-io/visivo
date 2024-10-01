import factory
from visivo.models.alert import Alert
from visivo.models.defaults import Defaults
from visivo.models.destinations.console_destination import ConsoleDestination
from visivo.models.models.csv_script_model import CsvScriptModel
from visivo.models.models.local_merge_model import LocalMergeModel
from visivo.models.models.sql_model import SqlModel
from visivo.models.selector import Selector
from visivo.models.sources.snowflake_source import SnowflakeSource
from visivo.models.sources.sqlite_source import SqliteSource
from visivo.models.trace import Trace
from visivo.models.chart import Chart
from visivo.models.dashboard import Dashboard
from visivo.models.item import Item
from visivo.models.project import Project
from visivo.models.table import Table
from visivo.models.trace_props.scatter import Scatter
from visivo.models.trace_props.surface import Surface
from visivo.models.row import Row, HeightEnum
from visivo.query.jobs.job import Job


class DestinationFactory(factory.Factory):
    class Meta:
        model = ConsoleDestination

    name = "destination"
    type = "console"


class AlertFactory(factory.Factory):
    class Meta:
        model = Alert

    name = "alert"
    if_ = ">{ True }"
    destinations = factory.List(
        [factory.SubFactory(DestinationFactory) for _ in range(1)]
    )


class SnowflakeSourceFactory(factory.Factory):
    class Meta:
        model = SnowflakeSource

    name = "source"
    database = "tmp/test.db"
    type = "snowflake"


class SourceFactory(factory.Factory):
    class Meta:
        model = SqliteSource

    name = "source"
    database = "tmp/test.sqlite"
    type = "sqlite"


class ScatterTracePropsFactory(factory.Factory):
    class Meta:
        model = Scatter

    type = "scatter"
    x = "query(x)"
    y = "query(y)"


class SurfaceTracePropsFactory(factory.Factory):
    class Meta:
        model = Surface

    type = "surface"
    z = ["query(x+10)", "query(y+15)"]


class SqlModelFactory(factory.Factory):
    class Meta:
        model = SqlModel

    name = "model"
    sql = "select * from test_table"
    source = "ref(source)"

    class Params:
        source_include = factory.Trait(source=factory.SubFactory(SourceFactory))
        source_default = factory.Trait(source=None)


class CsvScriptModelFactory(factory.Factory):
    class Meta:
        model = CsvScriptModel

    name = "model"
    table_name = "model"
    args = ["echo", "row_number,value\n1,1\n2,1\n3,2\n4,3\n5,5\n6,8"]


class LocalMergeModelFactory(factory.Factory):
    class Meta:
        model = LocalMergeModel

    name = "local_merge_model"
    sql = "select * from test_table"
    models = factory.List([factory.SubFactory(SqlModelFactory) for _ in range(1)])


class TraceFactory(factory.Factory):
    class Meta:
        model = Trace

    name = "trace"
    model = factory.SubFactory(SqlModelFactory)
    tests = None
    props = factory.SubFactory(ScatterTracePropsFactory)

    class Params:
        model_ref = factory.Trait(model="ref(model_name)")
        include_tests = factory.Trait(
            tests=[
                {"coordinate_exists": {"coordinates": {"x": 2, "y": 1}}},
                {"not_null": {"attributes": ["y", "x"]}},
            ]
        )
        surface_props = factory.Trait(
            props=factory.SubFactory(SurfaceTracePropsFactory)
        )


class JobFactory(factory.Factory):
    class Meta:
        model = Job

    item = factory.SubFactory(TraceFactory)
    source = factory.SubFactory(SourceFactory)
    action = None


class SelectorFactory(factory.Factory):
    class Meta:
        model = Selector

    name = "selector"
    type = "single"
    options = []


class ChartFactory(factory.Factory):
    class Meta:
        model = Chart

    name = "chart"
    traces = factory.List([factory.SubFactory(TraceFactory) for _ in range(1)])
    selector = factory.SubFactory(SelectorFactory)

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
    column_defs = []
    traces = factory.List([factory.SubFactory(TraceFactory) for _ in range(1)])
    selector = factory.SubFactory(SelectorFactory)


class ItemFactory(factory.Factory):
    class Meta:
        model = Item

    width = 1
    chart = factory.SubFactory(ChartFactory)
    table = None
    name = "item"

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

    name = "row"
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
    source_name = "source"

    class Meta:
        model = Defaults


class ProjectFactory(factory.Factory):
    class Meta:
        model = Project

    name = "project"
    sources = factory.List([factory.SubFactory(SourceFactory) for _ in range(1)])
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
