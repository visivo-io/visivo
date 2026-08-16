"""Per-object un-delete.

Deleting is soft: a published object is tombstoned (``None`` in the cache) and
only leaves the YAML when a commit runs. Until then the deletion is a pending
change like any other — and every other pending change can be reverted. This one
could not. The single escape was ``POST /api/commit/discard/``, which throws
away *every* pending edit, so recovering one accidental delete cost the user all
their unrelated work.

``ObjectManager.delete_from_cache`` was already exactly the primitive — its
docstring reads "revert to published version" — and had no caller outside its
own tests.

Registered once, driven by ``RESOURCE_META``, rather than as eleven
near-identical views in eleven files. The delete endpoints ARE written that way
and they have already drifted from one another; a rule with one implementation
cannot.
"""

from flask import jsonify

from visivo.logger.logger import Logger
from visivo.server.views.run_views import RESOURCE_META


def register_restore_views(app, flask_app):
    @app.route("/api/<resource_segment>/<name>/restore/", methods=["POST"])
    def restore_resource(resource_segment, name):
        """Undo a pending deletion, leaving every other pending change alone."""
        meta = RESOURCE_META.get(resource_segment)
        if meta is None:
            return jsonify({"error": f"Unknown resource type '{resource_segment}'"}), 404

        manager_attr = meta[0]
        manager = getattr(flask_app, manager_attr, None)
        if manager is None:
            return jsonify({"error": f"Unknown resource type '{resource_segment}'"}), 404

        singular = resource_segment[:-1]
        try:
            # Only a tombstone is restorable. A live object has nothing to undo,
            # and saying so is better than a silent 200 that changes nothing —
            # the caller would have no way to tell the two apart.
            if manager.get(name) is not None:
                return (
                    jsonify({"error": f"{singular.capitalize()} '{name}' is not deleted"}),
                    409,
                )

            # Dropping the cache entry IS the restore: `get` falls back to the
            # published object, and `get_status` stops reporting DELETED.
            restored = manager.delete_from_cache(name)
            if not restored:
                return jsonify({"error": f"{singular.capitalize()} '{name}' not found"}), 404

            status = manager.get_status(name)
            return (
                jsonify(
                    {
                        "message": f"{singular.capitalize()} '{name}' restored",
                        singular: name,
                        "status": status.value if status else None,
                    }
                ),
                200,
            )
        except Exception as e:
            Logger.instance().error(f"Error restoring {singular} '{name}': {str(e)}")
            return jsonify({"error": str(e)}), 500
