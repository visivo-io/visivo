import re
from flask import request, jsonify
from pydantic import ValidationError
from visivo.logger.logger import Logger


def _normalize_refs(obj):
    """Recursively normalize ref strings to a canonical form.

    Converts all variations like '${ ref( name ) }', '${ref(name)}', 'ref(name)'
    to a single form: 'ref(name)' — stripping ${ } wrapper and internal whitespace.
    """
    if isinstance(obj, str):
        # Strip ${ } wrapper and normalize whitespace
        normalized = re.sub(
            r"\$\{\s*ref\(\s*([^)]+?)\s*\)\s*\}",
            lambda m: f"ref({m.group(1).strip()})",
            obj,
        )
        return normalized
    elif isinstance(obj, dict):
        return {k: _normalize_refs(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_normalize_refs(v) for v in obj]
    return obj


def register_explorer_views(app, flask_app, output_dir):
    @app.route("/api/explorer/diff/", methods=["POST"])
    def explorer_diff():
        """Compare explorer context objects against published objects.

        Accepts a batch of context objects and returns the status of each
        by validating through Pydantic and comparing via model_dump().

        Request body:
        {
            "models": {"name": {"sql": "...", "source": "..."}},
            "insights": {"name": {"props": {...}, "interactions": [...]}},
            "chart": {"name": "...", "insights": [...], "layout": {...}},
            "metrics": {"name": {"expression": "...", "model": "..."}},
            "dimensions": {"name": {"expression": "...", "model": "..."}}
        }

        Response:
        {
            "models": {"name": "new"|"modified"|null},
            "insights": {"name": "new"|"modified"|null},
            "chart": "new"|"modified"|null,
            "metrics": {"name": "new"|"modified"|null},
            "dimensions": {"name": "new"|"modified"|null}
        }
        """
        data = request.get_json(silent=True)
        if data is None:
            return jsonify({"error": "Request body required"}), 400

        result = {}

        manager_map = {
            "models": flask_app.model_manager,
            "insights": flask_app.insight_manager,
            "metrics": flask_app.metric_manager,
            "dimensions": flask_app.dimension_manager,
        }

        for obj_type, manager in manager_map.items():
            context_objects = data.get(obj_type, {})
            if not context_objects:
                continue

            statuses = {}
            for name, config in context_objects.items():
                statuses[name] = _diff_object(manager, name, config)
            result[obj_type] = statuses

        # Handle chart separately (single object, not a dict of objects)
        chart_data = data.get("chart")
        if chart_data and chart_data.get("name"):
            result["chart"] = _diff_object(
                flask_app.chart_manager,
                chart_data["name"],
                chart_data,
            )

        return jsonify(result), 200


def _diff_object(manager, name, config):
    """Compare a single context object against the existing version (cached or published).

    Validates through Pydantic to normalize formats (ref strings, etc.),
    then compares only the fields present in the context config.

    Returns "new", "modified", or None (unchanged).
    """
    try:
        config_with_name = {**config, "name": name}
        context_obj = manager.validate_object(config_with_name)
    except (ValidationError, Exception) as e:
        Logger.instance().debug(f"Diff validation failed for {name}: {e}")
        return "modified"

    # Check against effective object (cached takes priority over published)
    existing = manager.get(name)
    if not existing:
        return "new"

    context_dump = _normalize_refs(context_obj.model_dump(exclude_none=True))
    existing_dump = _normalize_refs(existing.model_dump(exclude_none=True))

    skip_keys = {"name", "path", "file_path"}
    config_keys = set(config.keys()) - skip_keys

    for key in config_keys:
        context_val = context_dump.get(key)
        existing_val = existing_dump.get(key)
        if context_val != existing_val:
            return "modified"

    return None
