from visivo.models.chart import Chart
from visivo.models.sources.source import Source
from visivo.models.insight import Insight
from visivo.models.table import Table
from visivo.parsers.serializer import Serializer
from tests.factories.model_factories import (
    DashboardFactory,
    DefaultsFactory,
    ItemFactory,
    ProjectFactory,
    RowFactory,
    SourceFactory,
    InsightFactory,
    ChartFactory,
    SqlModelFactory,
    CsvScriptModelFactory,
    LocalMergeModelFactory,
    DimensionFactory,
    MetricFactory,
    RelationFactory,
)


def test_Serializer_with_basic_project():
    project = ProjectFactory()
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.cli_version


def test_Serializer_with_insight_ref():
    insight = InsightFactory(name="insight_name")
    chart = ChartFactory(insights=["ref(insight_name)"])
    item = ItemFactory(chart=chart)
    row = RowFactory(items=[item])
    dashboard = DashboardFactory(rows=[row])
    source = SourceFactory()
    project = ProjectFactory(
        insights=[insight],
        dashboards=[dashboard],
        sources=[source],
    )
    assert project.dashboards[0].rows[0].items[0].chart.insights[0] == "ref(insight_name)"
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.insights == []
    assert project.dashboards[0].rows[0].items[0].chart.insights[0].name == "insight_name"


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


def test_Serializer_with_model_ref():
    model = SqlModelFactory(name="model_name")
    insight = InsightFactory(
        name="insight_name",
        model=model,
    )
    chart = ChartFactory(insights=[insight])
    item = ItemFactory(chart=chart)
    row = RowFactory(items=[item])
    dashboard = DashboardFactory(rows=[row])
    source = SourceFactory()
    project = ProjectFactory(
        models=[model],
        dashboards=[dashboard],
        sources=[source],
    )
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.models == []


def test_Serializer_with_refs_does_not_change_original():
    chart = ChartFactory(name="chart_name")
    project = ProjectFactory(chart_ref=True, charts=[chart])
    project.dashboards[0].rows[0].items[0].chart = "ref(chart_name)"
    Serializer(project=project).dereference()
    assert len(project.descendants_of_type(type=Chart)) == 1
    assert len(project.descendants_of_type(type=Insight)) == 1


def test_Serializer_with_multiple_use_of_same_ref():
    model = SqlModelFactory(name="model_name")
    insight = InsightFactory(name="insight_name", model=model)
    chart = ChartFactory(name="chart_name")
    item_1 = ItemFactory(chart="ref(chart_name)", name="item_1")
    item_2 = ItemFactory(chart="ref(chart_name)", name="item_2")
    row = RowFactory(items=[item_1, item_2])
    dashboard = DashboardFactory(rows=[row])
    project = ProjectFactory(dashboards=[dashboard], models=[model], charts=[chart])
    project = Serializer(project=project).dereference()
    assert project.name == "project"
    assert project.sources == []
    assert project.insights == []
    assert project.charts == []
    assert project.models == []
    assert project.dashboards[0].rows[0].items[0].chart.name == "chart_name"
    assert project.dashboards[0].rows[0].items[1].chart.name == "chart_name"


def test_dereference_to_dict_with_explicit_source():
    """dereference_to_dict inlines correctly."""
    project = ProjectFactory()
    project.invalidate_dag_cache()

    serializer = Serializer(project=project)
    result = serializer.dereference_to_dict()

    dashboard = result["dashboards"][0]
    chart_dict = dashboard["rows"][0]["items"][0]["chart"]
    assert "insights" in chart_dict
    assert len(chart_dict["insights"]) == 1


def test_dereference_to_dict_matches_dereference():
    """Both serialization paths must produce structurally equivalent output."""
    project = ProjectFactory()
    project.invalidate_dag_cache()

    serializer = Serializer(project=project)
    dict_result = serializer.dereference_to_dict()
    deref_project = serializer.dereference()

    dict_dashboard = dict_result["dashboards"][0]
    deref_dashboard = deref_project.dashboards[0]

    dict_insight = dict_dashboard["rows"][0]["items"][0]["chart"]["insights"][0]
    deref_insight = deref_dashboard.rows[0].items[0].chart.insights[0]

    assert dict_insight["name"] == deref_insight.name


def test_collect_deploy_resources_emits_all_deploy_types():
    """``collect_deploy_resources`` emits every named object the decomposed
    deploy posts — split by model subtype, references preserved — keyed by the
    cloud endpoint segment, so the cloud editor sees the full authored layer."""
    project = ProjectFactory(
        sources=[SourceFactory()],
        models=[
            SqlModelFactory(
                name="m1",
                dimensions=[DimensionFactory(name="d1")],
                metrics=[MetricFactory(name="mt1")],
            ),
            SqlModelFactory(name="m2"),
            CsvScriptModelFactory(name="csv_m"),
            LocalMergeModelFactory(name="merge_m"),
        ],
        relations=[RelationFactory(name="r1", condition="${ref(m1).id} = ${ref(m2).id}")],
        dashboards=[],
    )
    project.invalidate_dag_cache()

    layer = Serializer(project=project).collect_deploy_resources()

    # Every deploy endpoint segment is represented (the view-object buckets
    # exist even though this fixture authors none top-level).
    assert set(layer) == {
        "sources",
        "models",
        "csv-script-models",
        "local-merge-models",
        "dimensions",
        "metrics",
        "relations",
        "charts",
        "insights",
        "tables",
        "markdowns",
        "inputs",
    }

    assert {s["name"] for s in layer["sources"]} >= {"source"}
    assert {m["name"] for m in layer["models"]} >= {"m1", "m2"}
    assert {m["name"] for m in layer["csv-script-models"]} == {"csv_m"}
    assert {m["name"] for m in layer["local-merge-models"]} == {"merge_m"}
    assert {d["name"] for d in layer["dimensions"]} >= {"d1"}
    assert {m["name"] for m in layer["metrics"]} >= {"mt1"}
    assert {r["name"] for r in layer["relations"]} == {"r1"}

    # The SqlModel subtype bucket must not leak csv-script / local-merge models.
    assert "csv_m" not in {m["name"] for m in layer["models"]}
    assert "merge_m" not in {m["name"] for m in layer["models"]}

    # References stay as ${ref(...)} rather than being inlined, so editing a
    # deployed object matches editing it locally.
    m1 = next(m for m in layer["models"] if m["name"] == "m1")
    assert "ref(source)" in str(m1["source"])


def test_collect_deploy_resources_finds_objects_nested_in_other_objects():
    """The deploy must collect every named object, top-level AND nested inside
    another object — not just the project's top-level lists.

    Coverage here:
      * ``top_source``        — declared top-level
      * ``nested_source``     — inlined inside a model (``model.source``)
      * ``nested_dim`` /
        ``nested_metric``     — defined inside a model (``model.dimensions`` /
                                 ``model.metrics``)
      * ``nested_chart``      — inlined inside a dashboard item
      * ``nested_insight``    — inlined inside that chart

    The deploy walks the whole DAG, so nesting depth doesn't matter; this
    guards against a regression where only top-level lists get deployed."""
    top_source = SourceFactory(name="top_source")
    # Source / dimensions / metrics are authored INSIDE the model, not as
    # top-level project objects.
    model = SqlModelFactory(
        name="top_model",
        source=SourceFactory(name="nested_source"),
        dimensions=[DimensionFactory(name="nested_dim")],
        metrics=[MetricFactory(name="nested_metric")],
    )
    # Chart + insight are authored INSIDE the dashboard, not top-level.
    nested_insight = InsightFactory(name="nested_insight", model=model)
    nested_chart = ChartFactory(name="nested_chart", insights=[nested_insight])
    dashboard = DashboardFactory(
        name="dash", rows=[RowFactory(items=[ItemFactory(chart=nested_chart)])]
    )
    project = ProjectFactory(
        sources=[top_source],
        models=[model],
        insights=[],
        charts=[],
        dashboards=[dashboard],
    )
    project.invalidate_dag_cache()

    layer = Serializer(project=project).collect_deploy_resources()

    # Top-level and nested objects are both collected.
    assert {s["name"] for s in layer["sources"]} == {"top_source", "nested_source"}
    assert {m["name"] for m in layer["models"]} == {"top_model"}
    assert {d["name"] for d in layer["dimensions"]} == {"nested_dim"}
    assert {m["name"] for m in layer["metrics"]} == {"nested_metric"}
    assert {c["name"] for c in layer["charts"]} == {"nested_chart"}
    assert {i["name"] for i in layer["insights"]} == {"nested_insight"}
