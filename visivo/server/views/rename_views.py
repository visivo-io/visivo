"""Rename a resource and rewrite every `${ref()}` that pointed at it.

Mirrors the cloud endpoints (`core`'s `ProjectRenameView` /
`ProjectRenameImpactView`) so the viewer talks to one shape in both modes:

    POST /api/rename/         {type, old_name, new_name}  -> apply
    POST /api/rename/impact/  {type, old_name, new_name}  -> preview only

Both answer with the same `{target, references}` body, so a caller can show
what a rename will change before doing it.
"""

from flask import jsonify, request

from visivo.server.rename_service import RenameError, rename_impact, rename_object


def _args():
    """(type_key, old_name, new_name), or an error response."""
    body = request.get_json(silent=True) or {}
    type_key = body.get("type")
    old_name = body.get("old_name")
    new_name = body.get("new_name")
    if not (type_key and old_name and new_name):
        return None, (jsonify({"error": "type, old_name and new_name are required."}), 400)
    return (type_key, old_name, new_name), None


def register_rename_views(app, flask_app):
    @app.route("/api/rename/impact/", methods=["POST"])
    def rename_impact_view():
        args, error = _args()
        if error is not None:
            return error
        type_key, old_name, new_name = args
        try:
            return jsonify(
                rename_impact(flask_app, type_key=type_key, old_name=old_name, new_name=new_name)
            )
        except RenameError as exc:
            return jsonify({"error": exc.message}), exc.status

    @app.route("/api/rename/", methods=["POST"])
    def rename_view():
        args, error = _args()
        if error is not None:
            return error
        type_key, old_name, new_name = args
        try:
            applied = rename_object(
                flask_app, type_key=type_key, old_name=old_name, new_name=new_name
            )
        except RenameError as exc:
            return jsonify({"error": exc.message}), exc.status
        return jsonify({"renamed": True, **applied})
