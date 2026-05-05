from visivo.parsers.mkdocs import Mkdocs

TEST_MKDOCS_OBJECT = {
    "nav": [
        {"getting started": "index.md"},
        {"including": "index.md"},
        {
            "reference": [
                {"Configuration": {"insight": [], "chart": []}},
                {"cli": "index.md"},
            ]
        },
    ],
    "extra_css": [{"Configuration": "something"}],
}

mkdocs = Mkdocs()


def test_nav_configuration():
    nav_config = mkdocs.get_nav_configuration()
    assert len(nav_config) > 5


def test_docs_content_from_pydantic_model():
    chart_md = mkdocs.get_md_content("Chart")
    assert len(chart_md) > 50

    dashboard_md = mkdocs.get_md_content("Dashboard")
    assert len(dashboard_md) > 50

    source_md = mkdocs.get_md_content("SqliteSource")
    assert len(source_md) > 50

    source_md = mkdocs.get_md_content("PostgresqlSource")
    assert len(source_md) > 50

    source_md = mkdocs.get_md_content("MysqlSource")
    assert len(source_md) > 50

    source_md = mkdocs.get_md_content("SnowflakeSource")
    assert len(source_md) > 50


def test_docs_content_from_insightprops_model():
    bar_md = mkdocs.get_md_content("Bar")
    assert len(bar_md) > 50

    scatter_md = mkdocs.get_md_content("Scatter")
    assert len(scatter_md) > 50


def test_update_mkdocs_yaml_configuration():
    updated_mkdocs_object = mkdocs.update_mkdocs_yaml_configuration(TEST_MKDOCS_OBJECT)
    assert updated_mkdocs_object


def test__get_insight_prop_models():
    insight_prop_models = mkdocs._get_insight_prop_models()
    assert "Bar" in insight_prop_models
    assert "Waterfall" in insight_prop_models
    assert "Scattergl" in insight_prop_models
