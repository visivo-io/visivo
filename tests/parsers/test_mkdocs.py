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


def test_props_index_content_is_card_grid():
    """The generated Props index page renders as a Material `.grid.cards` grid
    with one linked card per prop (chart) type, plus the Line/Area Scatter aliases."""
    content = mkdocs.get_props_index_content()
    assert '<div class="grid cards" markdown>' in content
    # A card per prop type links to its own generated page.
    assert "[:octicons-arrow-right-24: Bar props](Bar/)" in content
    assert "[:octicons-arrow-right-24: Waterfall props](Waterfall/)" in content
    # Line & Area are nav aliases of the Scatter page.
    assert "(Scatter/)" in content
    # One card per insight prop model + the Line/Area aliases.
    expected_cards = len(mkdocs._get_insight_prop_models()) + 2
    assert content.count("octicons-arrow-right-24") == expected_cards


def test_update_mkdocs_yaml_collapses_props_subtree():
    """The committed nav must collapse the ~49 per-prop leaves into a single
    Props index entry, while the per-prop pages still have generated paths so
    they keep being written and stay reachable via the index + search."""
    nav_with_props = {
        "nav": [
            {
                "reference": [
                    {
                        "Configuration": [
                            {
                                "Insight": [
                                    "reference/configuration/Insight/index.md",
                                    {
                                        "Props": [
                                            {
                                                "Bar": [
                                                    "reference/configuration/Insight/Props/Bar/index.md"
                                                ]
                                            },
                                            {
                                                "Scatter": [
                                                    "reference/configuration/Insight/Props/Scatter/index.md"
                                                ]
                                            },
                                            {
                                                "Waterfall": [
                                                    "reference/configuration/Insight/Props/Waterfall/index.md"
                                                ]
                                            },
                                        ]
                                    },
                                ]
                            }
                        ]
                    }
                ]
            }
        ]
    }
    updated = mkdocs.update_mkdocs_yaml_configuration(nav_with_props)

    def find_props(obj):
        if isinstance(obj, dict):
            for key, value in obj.items():
                if key == "Props":
                    return value
                found = find_props(value)
                if found is not None:
                    return found
        if isinstance(obj, list):
            for item in obj:
                found = find_props(item)
                if found is not None:
                    return found
        return None

    props_nav = find_props(updated["nav"])
    # Collapsed to exactly one entry: the generated card-grid index page.
    assert props_nav == ["reference/configuration/Insight/Props/index.md"]
    # The per-prop pages still have write paths (so they keep generating).
    assert mkdocs.model_to_path_map["Bar"].endswith("Insight/Props/Bar/index.md")
    assert mkdocs.model_to_path_map["Waterfall"].endswith("Insight/Props/Waterfall/index.md")
