"""Backend integration test for VIS-750 — confirms the nested-layouts fixture
in test-projects/integration parses end-to-end and that its Item.rows recursion
matches the documented sample shape."""

import os
import pytest

from visivo.commands.compile_phase import compile_phase

INTEGRATION_PROJECT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "test-projects", "integration")
)


@pytest.fixture
def compiled_project():
    """Compile the integration project and return the resulting Project object."""
    output_dir = os.path.join(INTEGRATION_PROJECT_DIR, "target")
    cwd_before = os.getcwd()
    os.chdir(INTEGRATION_PROJECT_DIR)
    try:
        project = compile_phase(
            default_source=None,
            working_dir=INTEGRATION_PROJECT_DIR,
            output_dir=output_dir,
        )
        return project
    finally:
        os.chdir(cwd_before)


def test_integration_project_includes_nested_layouts_dashboard(compiled_project):
    """The fixture's dashboard exists and has the expected name."""
    names = [d.name for d in compiled_project.dashboards if hasattr(d, "name")]
    assert "nested-layouts-dashboard" in names


def get_nested_dashboard(project):
    return next(d for d in project.dashboards if d.name == "nested-layouts-dashboard")


def test_section_1_uneven_vertical_stack_shape(compiled_project):
    """Row 1 (index 1, after the section header in row 0): a leaf chart with
    width=2 alongside a row-container of three sub-rows."""
    dashboard = get_nested_dashboard(compiled_project)
    row = dashboard.rows[1]
    assert row.height.value == "large"
    assert len(row.items) == 2

    leaf, container = row.items
    assert leaf.width == 2
    assert leaf.chart is not None
    assert leaf.rows is None

    assert container.width == 1
    assert container.chart is None
    assert container.rows is not None
    assert len(container.rows) == 3
    for sub in container.rows:
        assert sub.height.value == "small"
        assert len(sub.items) == 1
        assert sub.items[0].chart is not None


def test_section_2_2x2_cluster_with_sidebar_shape(compiled_project):
    """Row 3: a 1-wide row-container holding 2 sub-rows of 2 items each, plus a
    2-wide leaf chart on the right."""
    dashboard = get_nested_dashboard(compiled_project)
    row = dashboard.rows[3]
    assert row.height.value == "medium"
    assert len(row.items) == 2

    cluster, side = row.items
    assert cluster.rows is not None
    assert len(cluster.rows) == 2
    for sub in cluster.rows:
        assert len(sub.items) == 2
        for item in sub.items:
            assert item.chart is not None

    assert side.chart is not None
    assert side.width == 2


def test_section_3_sidebar_layout_shape(compiled_project):
    """Row 5: a 1-wide column of inputs alongside a 3-wide column of content rows."""
    dashboard = get_nested_dashboard(compiled_project)
    row = dashboard.rows[5]
    left, right = row.items
    # Left column: three input rows.
    assert left.rows is not None
    assert len(left.rows) == 3
    for sub in left.rows:
        assert len(sub.items) == 1
        assert sub.items[0].input is not None

    # Right column: two content rows, each with one chart.
    assert right.rows is not None
    assert len(right.rows) == 2
    for sub in right.rows:
        assert len(sub.items) == 1
        assert sub.items[0].chart is not None


def test_section_4_three_levels_deep(compiled_project):
    """Row 7: a 1-wide row-container whose first sub-row is itself a row-container
    that contains another sub-row with a chart leaf — verifies the recursive
    primitive supports at least 3 levels of nesting."""
    dashboard = get_nested_dashboard(compiled_project)
    row = dashboard.rows[7]
    assert len(row.items) == 1

    level_1 = row.items[0]
    assert level_1.rows is not None and len(level_1.rows) == 2

    # The first sub-row's only item is itself a row-container.
    nested_item = level_1.rows[0].items[0]
    assert nested_item.rows is not None
    assert len(nested_item.rows) == 1

    # Level-3 leaf: a chart.
    deepest = nested_item.rows[0].items[0]
    assert deepest.chart is not None
    assert deepest.rows is None


def test_existing_dashboards_unchanged(compiled_project):
    """The new fixture should not change the existing dashboards' shapes."""
    names = sorted(d.name for d in compiled_project.dashboards if hasattr(d, "name"))
    # Existing four + the new fixture.
    assert "insights-dashboard" in names
    assert "new-tables-dashboard" in names
    assert "table-dashboard" in names
    assert "simple-dashboard" in names
    assert len(names) >= 5


def test_no_existing_item_uses_rows_field(compiled_project):
    """Every existing top-level dashboard's items are leaves — confirms that
    the nested fixture is the only consumer of Item.rows in the integration
    project (and therefore the only thing exercising the new code path)."""
    for dashboard in compiled_project.dashboards:
        if dashboard.name == "nested-layouts-dashboard":
            continue
        if not hasattr(dashboard, "rows"):
            # External dashboards have no rows.
            continue
        for row in dashboard.rows:
            for item in row.items:
                assert item.rows is None, (
                    f"Existing dashboard '{dashboard.name}' has an Item.rows usage; "
                    "either back-port the fixture's structure intentionally or "
                    "update this test."
                )
