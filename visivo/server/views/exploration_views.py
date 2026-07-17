"""Exploration CRUD endpoints (Explore 2.0, Phase 1) — S3 wire contract.

Deliberately absent from ``run_views.RESOURCE_META`` / ``_RESOURCE_ROUTE_RE``:
explorations are workbench drafts, never DAG/YAML config, so saving or
deleting one must never schedule a run (regression-tested in
``tests/server/test_run_views.py``).

400 is reserved for a malformed top-level body shape (not a JSON object, or a
field with the wrong type/structure) — draft CONTENT (``insights``/``chart``/
``computed_columns``) is intentionally never validated at rest; a draft is
allowed to be semantically invalid until promote.
"""

from flask import jsonify, request
from pydantic import ValidationError

from visivo.logger.logger import Logger


def _as_body_dict(silent_json):
    """``None``/omitted body -> ``{}``; a JSON object -> itself; anything else
    (a list, string, number) -> ``None`` to signal a malformed top-level shape."""
    if silent_json is None:
        return {}
    return silent_json if isinstance(silent_json, dict) else None


def register_exploration_views(app, flask_app, output_dir):
    @app.route("/api/explorations/", methods=["GET"])
    def list_explorations():
        try:
            explorations = flask_app.exploration_repo.list()
            return jsonify([e.model_dump(mode="json") for e in explorations])
        except Exception as e:
            Logger.instance().error(f"Error listing explorations: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/explorations/", methods=["POST"])
    def create_exploration():
        body = _as_body_dict(request.get_json(silent=True))
        if body is None:
            return jsonify({"error": "Request body must be a JSON object"}), 400
        try:
            exploration = flask_app.exploration_repo.create(
                name=body.get("name"),
                seeded_from=body.get("seeded_from"),
                return_to=body.get("return_to"),
                draft=body.get("draft"),
            )
            return jsonify(exploration.model_dump(mode="json")), 201
        except ValidationError as e:
            return jsonify({"error": f"Invalid exploration payload: {e}"}), 400
        except Exception as e:
            Logger.instance().error(f"Error creating exploration: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/explorations/<exploration_id>/", methods=["GET"])
    def get_exploration(exploration_id):
        try:
            exploration = flask_app.exploration_repo.get(exploration_id)
            if exploration is None:
                return jsonify({"error": "Exploration not found"}), 404
            return jsonify(exploration.model_dump(mode="json"))
        except Exception as e:
            Logger.instance().error(f"Error getting exploration: {str(e)}")
            return jsonify({"error": str(e)}), 500

    # POST, not PUT — matches every sibling resource route in this codebase.
    @app.route("/api/explorations/<exploration_id>/", methods=["POST"])
    def update_exploration(exploration_id):
        raw_body = request.get_json(silent=True)
        if raw_body is None:
            # Unlike create (where an absent body just means "use defaults"),
            # an update with no body at all provides nothing to update.
            return jsonify({"error": "Update requires a JSON body"}), 400
        body = _as_body_dict(raw_body)
        if body is None:
            return jsonify({"error": "Request body must be a JSON object"}), 400
        try:
            exploration = flask_app.exploration_repo.update(exploration_id, body)
            if exploration is None:
                return jsonify({"error": "Exploration not found"}), 404
            return jsonify(exploration.model_dump(mode="json"))
        except ValidationError as e:
            return jsonify({"error": f"Invalid exploration payload: {e}"}), 400
        except Exception as e:
            Logger.instance().error(f"Error updating exploration: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/explorations/<exploration_id>/", methods=["DELETE"])
    def delete_exploration(exploration_id):
        try:
            deleted = flask_app.exploration_repo.delete(exploration_id)
            if not deleted:
                return jsonify({"error": "Exploration not found"}), 404
            return "", 204
        except Exception as e:
            Logger.instance().error(f"Error deleting exploration: {str(e)}")
            return jsonify({"error": str(e)}), 500

    @app.route("/api/explorations/<exploration_id>/consume-return-to/", methods=["POST"])
    def consume_return_to(exploration_id):
        try:
            exploration = flask_app.exploration_repo.consume_return_to(exploration_id)
            if exploration is None:
                return jsonify({"error": "Exploration not found"}), 404
            return jsonify(exploration.model_dump(mode="json"))
        except Exception as e:
            Logger.instance().error(f"Error consuming return_to: {str(e)}")
            return jsonify({"error": str(e)}), 500
