"""The API Visivo Cloud exposes, as the CLI sees it.

One catalogue of core's routes, because the CLI reaches core from several
unrelated places — the agent hydrating a project, `visivo deploy` uploading
artifacts, the inference proxy — and each had been spelling the paths out
inline. Nothing listed the surface, so "what does the CLI depend on core
having?" could only be answered by grepping for f-strings, and a route that
moved in core failed at runtime in whichever caller happened to use it.

## Paths, not URLs

Every function here returns a PATH. The host is deliberately not part of it:
which deployment a process talks to is one decision, made in
``visivo.server.constants.resolve_host`` and carried on ``app.host`` or a
client's ``base_url``. Baking a host in here would be a second answer to that
question, and the two could disagree about which deployment you were on.

## Why the project scoping is in here

Core takes the project two ways — a query parameter on the per-type endpoints
the viewer uses, and a path segment on the agent and run endpoints — and
forgetting it is a 400 or, worse, a 404 that reads like a bug in the tool.
Putting both shapes behind named functions means a caller picks an endpoint
rather than remembering which spelling that endpoint wants.
"""


def _scoped(path, project_id):
    return f"{path}?project_id={project_id}"


# --- the per-type endpoints the viewer and the agent share ------------------


def typed_list(type_key, project_id):
    """``/api/models/?project_id=...`` — every object of one type."""
    return _scoped(f"/api/{type_key}/", project_id)


def typed_detail(type_key, name, project_id):
    """``/api/models/orders/?project_id=...`` — one object, read or written."""
    return _scoped(f"/api/{type_key}/{name}/", project_id)


# --- project-scoped, with the project in the path ---------------------------


def project_runs(project_id):
    return f"/api/projects/{project_id}/run/"


def agent_render_token(project_id):
    """Mints the short-lived, read-only credential the agent's screenshot
    browser loads a dashboard with (VIS-1485)."""
    return f"/api/projects/{project_id}/agent/render-token/"


def agent_captures(project_id):
    """Signs a PUT for one screenshot, so bytes go straight to storage."""
    return f"/api/projects/{project_id}/agent/captures/"


# --- not project-scoped -----------------------------------------------------

# Core mounts an OpenAI-compatible completions path under this prefix, so the
# provider client appends `/chat/completions` itself. No version segment:
# one client, one server, both ours, released together.
INFERENCE = "/api/inference"


def inference_capability():
    """What a deployment offers — asked before assuming it serves inference
    at all, since Visivo runs without Visivo Cloud."""
    return "/api/inference/"
