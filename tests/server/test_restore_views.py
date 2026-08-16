"""Per-object un-delete: ``POST /api/<segment>/<name>/restore/``.

Deleting is soft — a published object is tombstoned and only leaves the YAML on
commit — so until then it is a pending change like any other. Every other
pending change could be reverted; this one could not. The single escape was
``POST /api/commit/discard/``, which throws away EVERY pending edit, so undoing
one accidental delete cost the user all their unrelated work (VIS-1234).
"""

import pytest

from visivo.server.managers.object_manager import ObjectStatus


def _published(manager, name, obj):
    """Put an object in the published set, as a parsed project would."""
    manager._published_objects[name] = obj


class TestRestore:
    def test_restores_a_deleted_published_object(self, integration_app, integration_client):
        manager = integration_app.source_manager
        name = next(iter(manager._published_objects), None)
        assert name is not None, "integration project should publish at least one source"

        integration_client.delete(f"/api/sources/{name}/")
        assert manager.get_status(name) == ObjectStatus.DELETED

        response = integration_client.post(f"/api/sources/{name}/restore/")

        assert response.status_code == 200
        assert manager.get(name) is not None
        assert manager.get_status(name) != ObjectStatus.DELETED

    def test_other_pending_changes_survive(self, integration_app, integration_client):
        """The whole point. `discard` could already bring a deleted object back —
        by throwing away every other edit with it."""
        sources = integration_app.source_manager
        charts = integration_app.chart_manager
        source_name = next(iter(sources._published_objects))
        chart_name = next(iter(charts._published_objects))

        # An unrelated pending edit, then a delete.
        edited = charts.get(chart_name)
        charts.save_from_config({**edited.model_dump(exclude_none=True), "name": chart_name})
        assert chart_name in charts._cached_objects
        integration_client.delete(f"/api/sources/{source_name}/")

        integration_client.post(f"/api/sources/{source_name}/restore/")

        # The source came back AND the chart edit is still staged — which is what
        # `discard` could never do.
        assert sources.get(source_name) is not None
        assert chart_name in charts._cached_objects

    def test_restoring_something_that_is_not_deleted_is_a_conflict(
        self, integration_app, integration_client
    ):
        """A silent 200 would be indistinguishable from a real restore."""
        name = next(iter(integration_app.source_manager._published_objects))

        response = integration_client.post(f"/api/sources/{name}/restore/")

        assert response.status_code == 409
        assert "not deleted" in response.get_json()["error"]

    def test_unknown_name_is_404(self, integration_client):
        response = integration_client.post("/api/sources/no-such-source/restore/")
        assert response.status_code == 404

    def test_unknown_resource_type_is_404(self, integration_client):
        response = integration_client.post("/api/wombats/anything/restore/")
        assert response.status_code == 404

    @pytest.mark.parametrize(
        "segment",
        [
            "sources",
            "models",
            "dimensions",
            "metrics",
            "relations",
            "inputs",
            "insights",
            "charts",
            "tables",
            "markdowns",
            "dashboards",
        ],
    )
    def test_every_resource_type_has_the_route(self, integration_client, segment):
        """One generic route rather than eleven copies — so prove it covers all
        eleven. A missing type would 404 as an unknown resource; a present one
        reaches the name lookup and 404s on the NAME instead."""
        response = integration_client.post(f"/api/{segment}/definitely-not-here/restore/")

        assert response.status_code == 404
        assert "Unknown resource type" not in response.get_json()["error"]
