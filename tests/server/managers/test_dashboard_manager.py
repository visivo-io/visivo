"""Behavioral tests for DashboardManager.

Regression coverage for the bug where the new project view's listing
endpoint (``GET /api/dashboards/``) silently dropped every external
dashboard: ``extract_from_dag`` was narrowed to ``Dashboard`` (the
internal subclass) instead of ``BaseDashboard``, so ``ExternalDashboard``
instances never landed in ``_published_objects`` and never appeared in
``get_all_dashboards_with_status``.
"""

import networkx as nx

from visivo.models.dashboard import Dashboard
from visivo.models.dashboards.external_dashboard import ExternalDashboard
import pytest

from tests.factories.model_factories import TemplateDashboardFactory
from visivo.models.dashboards.template_dashboard import TemplateDashboard
from visivo.server.managers.dashboard_manager import DashboardManager, TemplateDashboardReadOnly


def _make_internal(name: str) -> Dashboard:
    return Dashboard.model_validate({"name": name, "type": "internal", "rows": []})


def _make_external(name: str, href: str = "https://example.com") -> ExternalDashboard:
    return ExternalDashboard.model_validate({"name": name, "type": "external", "href": href})


def _dag_with(*nodes) -> nx.DiGraph:
    """Build a minimal DAG containing the given nodes (no edges needed —
    ``all_descendants_of_type`` just enumerates and isinstance-filters
    when ``from_node`` is unset, which is how DashboardManager uses it)."""
    dag = nx.DiGraph()
    for node in nodes:
        dag.add_node(node)
    return dag


class TestDashboardManagerExtractFromDag:
    """The walker must collect BOTH internal Dashboard and ExternalDashboard
    instances — both inherit from BaseDashboard. Limiting to ``Dashboard``
    drops every external from the project listing.
    """

    def test_extract_from_dag_includes_internal_and_external(self):
        manager = DashboardManager()
        internal = _make_internal("Sales")
        external = _make_external("Docs Link", href="https://docs.example.com")

        manager.extract_from_dag(dag=_dag_with(internal, external))

        published = manager._published_objects
        assert "Sales" in published, "internal dashboard must be published"
        assert "Docs Link" in published, "external dashboard must be published too"
        assert published["Docs Link"] is external

    def test_get_all_dashboards_includes_external_with_full_config(self):
        """``get_all_dashboards_with_status`` is the actual API surface
        the viewer's listing calls. External dashboards must appear
        with their type=external and href preserved so the
        ``DashboardCard`` can render the External badge and link out."""
        manager = DashboardManager()
        manager.extract_from_dag(
            dag=_dag_with(
                _make_internal("Sales"),
                _make_external("Docs Link", href="https://docs.example.com"),
            )
        )

        results = manager.get_all_dashboards_with_status()
        by_name = {d["name"]: d for d in results}

        assert set(by_name.keys()) == {"Sales", "Docs Link"}
        external = by_name["Docs Link"]
        assert external["config"]["type"] == "external"
        assert external["config"]["href"] == "https://docs.example.com/"


class TestDashboardManagerValidate:
    """``validate_object`` must accept both internal and external configs
    via the DashboardField discriminator — the manager is the entry
    point for both save_from_config and validate_config."""

    def test_validate_object_accepts_internal_config(self):
        manager = DashboardManager()
        dashboard = manager.validate_object({"name": "Sales", "type": "internal", "rows": []})
        assert isinstance(dashboard, Dashboard)

    def test_validate_object_accepts_external_config(self):
        manager = DashboardManager()
        dashboard = manager.validate_object(
            {"name": "Docs", "type": "external", "href": "https://example.com"}
        )
        assert isinstance(dashboard, ExternalDashboard)
        assert str(dashboard.href).rstrip("/") == "https://example.com"


class TestDashboardManagerTemplates:
    """Template dashboards are listed like any other, but serve never writes them —
    they are edited as HTML files."""

    def test_template_dashboard_is_listed_with_its_html_and_slots(self):
        manager = DashboardManager()
        manager.extract_from_dag(dag=_dag_with(TemplateDashboardFactory(name="Review")))

        [listed] = manager.get_all_dashboards_with_status()

        assert listed["config"]["type"] == "template"
        assert 'data-visivo-item="chart_name"' in listed["config"]["template"]
        assert listed["child_item_names"] == ["chart_name"]

    def test_validate_object_accepts_template_config(self):
        dashboard = DashboardManager().validate_object({"name": "R", "template": "<p></p>"})
        assert isinstance(dashboard, TemplateDashboard)

    def test_saving_a_template_dashboard_is_refused(self):
        manager = DashboardManager()
        with pytest.raises(TemplateDashboardReadOnly, match="edit its YAML file instead"):
            manager.save_from_config({"name": "R", "template": "<p></p>"})
        assert manager._cached_objects == {}


class TestChildItemNamesAreTheLeavesADashboardPlaces:
    """``child_item_names`` is what the lineage graph draws edges from, in the
    viewer and in core. It has to be the OBJECTS a dashboard places, whatever
    layout holds them — so these cover the shapes that reported something else.
    """

    def _children(self, config):
        manager = DashboardManager()
        dashboard = manager.validate_object(config)
        return manager._serialize_object(config["name"], dashboard, None)["child_item_names"]

    @pytest.mark.parametrize("field", ["chart", "table", "input", "markdown"])
    def test_every_item_field_reports_its_ref(self, field):
        # `markdown` used to report nothing: Item.__get_child returned it only
        # when it was an INLINE Markdown, so a referenced one was not a child
        # at all and was missing from the DAG.
        config = {"name": "d", "rows": [{"items": [{field: "${ref(x)}"}]}]}

        assert self._children(config) == ["x"]

    def test_a_named_row_does_not_replace_its_contents(self):
        # A row may carry a name for the canvas to label it with, but it is not
        # a resource anything depends on. Reporting it stopped the walk, so a
        # dashboard listed "r" where the chart it holds should have been.
        config = {"name": "d", "rows": [{"name": "r", "items": [{"chart": "${ref(c)}"}]}]}

        assert self._children(config) == ["c"]

    def test_nested_container_rows_are_walked_to_the_leaves(self):
        # VIS-826. The viewer used to do this walk; it now reads this list, so
        # the guarantee lives here.
        config = {
            "name": "d",
            "rows": [
                {
                    "items": [
                        {"chart": "${ref(top)}"},
                        {"rows": [{"items": [{"chart": "${ref(deep)}"}]}]},
                    ]
                }
            ],
        }

        assert self._children(config) == ["top", "deep"]

    def test_a_template_dashboard_reports_its_slots(self):
        config = {
            "name": "d",
            "template": '<div data-visivo-item="a"></div><div data-visivo-item="b"></div>',
        }

        assert self._children(config) == ["a", "b"]

    def test_both_kinds_agree_when_they_place_the_same_items(self):
        # The point of the whole change: a template dashboard and a rows one
        # placing the same charts are the same node in the graph.
        rows = self._children(
            {
                "name": "d",
                "rows": [{"items": [{"chart": "${ref(a)}"}, {"table": "${ref(b)}"}]}],
            }
        )
        template = self._children(
            {
                "name": "d",
                "template": '<div data-visivo-item="a"></div><div data-visivo-item="b"></div>',
            }
        )

        assert rows == template == ["a", "b"]
