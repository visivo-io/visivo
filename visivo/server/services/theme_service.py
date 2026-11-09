"""The project's effective theme, as JSON-ready data.

A service rather than a view helper because the agent needs it too, and the
alternative was the tool registry importing `visivo.server.views.theme_views`
-- which runs the views package and pulls Flask, polars and the warehouse
drivers into any process that reads a theme. `tests/agent/test_import_order.py`
already pins the rule for services; this is the agent side of it.
"""


def current_theme_config(flask_app):
    """The draft theme if one is cached, otherwise the published one.

    Both are optional and ``{}`` is a real answer. The cloud agent is handed a
    stand-in with no parsed project at all, so neither attribute is assumed to
    exist -- reaching for them directly raised ``AttributeError`` there and
    turned "this project has no theme" into a failed tool call.
    """
    project = getattr(flask_app, "project", None)
    theme = getattr(flask_app, "_cached_theme", None) or getattr(project, "theme", None)
    return theme.model_dump(mode="json", exclude_none=True) if theme else {}
