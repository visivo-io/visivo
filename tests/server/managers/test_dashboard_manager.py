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
from visivo.server.managers.dashboard_manager import DashboardManager


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
