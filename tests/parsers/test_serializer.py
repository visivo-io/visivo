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


def test_create_flattened_project():
    """Test the create_flattened_project method"""
    project = ProjectFactory()

    model = SqlModelFactory(name="test_model")
    insight = InsightFactory(name="test_insight", model=model)
    chart = ChartFactory(name="test_chart")
    dashboard = DashboardFactory(
        name="Test Dashboard", level="L1", tags=["test", "metrics"], description="A test dashboard"
    )
    dashboard.rows[0].items[0].chart = chart
    project.dashboards.append(dashboard)

    project.invalidate_dag_cache()

    serializer = Serializer(project=project)
    flattened = serializer.create_flattened_project()

    assert isinstance(flattened, dict)
    assert "name" in flattened
    assert "cli_version" in flattened
    assert "sources" in flattened
    assert "models" in flattened
    assert "insights" in flattened
    assert "charts" in flattened
    assert "tables" in flattened

    assert flattened["name"] == project.name
    assert len(flattened["sources"]) > 0


def test_create_flattened_project_with_default_source():
    """Test flattened project with default source"""
    project = ProjectFactory()

    source = project.sources[0]
    source.name = "default_source"
    project.defaults = DefaultsFactory(source_name="default_source")

    project.invalidate_dag_cache()

    serializer = Serializer(project=project)
    flattened = serializer.create_flattened_project()

    assert "default_source" in flattened
    assert flattened["default_source"] == "default_source"


def test_create_flattened_project_maintains_references():
    """Test that the flattened project maintains proper references between objects"""
    project = ProjectFactory()

    model = SqlModelFactory(name="ref_model")
    chart = ChartFactory(name="ref_chart")
    dashboard = DashboardFactory(name="ref_dashboard")
    dashboard.rows[0].items[0].chart = chart
    project.dashboards = [dashboard]

    project.invalidate_dag_cache()

    serializer = Serializer(project=project)
    flattened = serializer.create_flattened_project()

    chart_data = next(c for c in flattened["charts"] if c["name"] == "ref_chart")
    assert chart_data is not None


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
