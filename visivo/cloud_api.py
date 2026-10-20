"""Visivo Cloud, as the CLI calls it.

One place that knows **where core is, who we are to it, and what it exposes**.
Callers ask for a thing — `put_screenshot`, `render_permit`, `objects` — and
never see a path, a header or a status code.

That matters because the CLI reaches core from several unrelated places: the
agent hydrating a project, `visivo deploy` uploading artifacts, the inference
proxy. Each had been spelling out paths, re-deriving auth headers and
re-interpreting statuses on its own, so "what does the CLI depend on core
having?" could only be answered by grepping for f-strings — and a route that
moved in core failed at runtime in whichever caller happened to use it.

## The host is not in here

``base_url`` is given to the client, not chosen by it. Which deployment a
process talks to is already one decision, made in
``visivo.server.constants.resolve_host`` and carried on ``app.host``. A second
answer here could disagree with the first about which deployment you were on,
which is a bug that reads as "my token stopped working".

## Multi-step operations are one method

``put_screenshot`` asks core to sign a PUT, uploads to it, and returns the URL
the capture can be read back from. Three steps and an object name the caller
should not have to invent. The point of this module is that a caller says what
it wants, not how core happens to want it this month.
"""

import uuid

import requests

FETCH_TIMEOUT_SECONDS = 30
SAVE_TIMEOUT_SECONDS = 30

# Core mounts an OpenAI-compatible completions path under this prefix, so a
# provider client appends `/chat/completions` itself. No version segment: one
# client, one server, both ours, released together.
INFERENCE_PATH = "/api/inference"

# Asked before assuming a deployment serves inference at all — Visivo runs
# without Visivo Cloud.
CAPABILITY_PATH = "/api/inference/"

# --- the routes core exposes, and the only place any of them is written -----
#
# Core takes the project two ways: a query parameter on the per-type endpoints
# the viewer uses, and a path segment on the agent and run ones. Both shapes
# are real, so both are here, and the methods below pick one rather than
# spelling a path.
TYPE_LIST = "/api/{type_key}/"
TYPE_DETAIL = "/api/{type_key}/{name}/"
PROJECT = "/api/projects/{project_id}"
PROJECT_RUNS = "/run/"
AGENT_RENDER_TOKEN = "/agent/render-token/"
AGENT_CAPTURES = "/agent/captures/"


class CloudApiError(Exception):
    """Core would not answer, or answered something the caller cannot use."""


def _why(what, url, response):
    """A failure someone can act on.

    "Could not read sources from core (400)" says a status and nothing about
    which request produced it — and the interesting part of a 400 is always the
    URL and what the server said about it. Both go in, because this message is
    often the only thing that reaches whoever is looking at the Agent tab.
    """
    detail = ""
    try:
        body = response.json()
        detail = body.get("error") or body.get("detail") or ""
    except Exception:
        detail = (response.text or "")[:200]
    where = url.split("?")[0]
    query = url.split("?", 1)[1] if "?" in url else "(no query string)"
    return (
        f"Could not {what} from core: {response.status_code} at {where} "
        f"[{query}]{' — ' + str(detail) if detail else ''}"
    )


class CloudApi:
    """Core's API for one project, as one object.

    Deliberately the same endpoints the viewer uses — `/api/<type>/` with a
    `project_id` — because those already exist, already enforce account scope,
    and already put a write in the draft tier. An agent-specific write path
    would be a second way to edit a project.
    """

    def __init__(self, base_url, token, project_id, session=None, host_header=None):
        """``base_url`` is what we CONNECT to; ``host_header`` is what core is
        told it is.

        They differ in-cluster. A pod cannot reach its own cluster's external
        ingress, so the connection goes to the web Service's DNS name — and
        core's ALLOWED_HOSTS knows the public hostname, rejecting anything else
        with a 400 (``DisallowedHost``, which arrives as an HTML error page
        rather than anything an agent can read). Sending the public name as
        ``Host`` satisfies that, and ``X-Forwarded-Proto: https`` stops the
        http->https redirect bouncing a plain-HTTP call.

        The same pair the runner's own client sends, for the same reason.
        """
        self.base_url = str(base_url).rstrip("/")
        self.project_id = project_id
        self.session = session or requests.Session()
        headers = {"Authorization": f"Api-Key {token}"}
        if host_header:
            headers["Host"] = host_header
            headers["X-Forwarded-Proto"] = "https"
        self.session.headers.update(headers)

    def _typed(self, route, **parts):
        """A per-type endpoint, with the project as a query parameter."""
        return f"{self.base_url}{route.format(**parts)}?project_id={self.project_id}"

    def _scoped(self, route):
        """A project-scoped endpoint, with the project in the path."""
        return f"{self.base_url}{PROJECT.format(project_id=self.project_id)}{route}"

    # --- the project's objects --------------------------------------------

    def objects(self, type_key):
        """Every object of one type, published and draft."""
        url = self._typed(TYPE_LIST, type_key=type_key)
        response = self.session.get(url, timeout=FETCH_TIMEOUT_SECONDS)
        if response.status_code != 200:
            raise CloudApiError(_why(f"read {type_key}", url, response))
        return (response.json() or {}).get(type_key) or []

    def save_object(self, type_key, name, config):
        """Write one object into core's draft tier."""
        url = self._typed(TYPE_DETAIL, type_key=type_key, name=name)
        response = self.session.post(url, json=config, timeout=SAVE_TIMEOUT_SECONDS)
        if response.status_code not in (200, 201):
            raise CloudApiError(_why(f"save {type_key[:-1]} '{name}'", url, response))
        return response.json()

    def runs(self):
        """Recent runs. Empty on failure: the Runs list is context, and a turn
        should not die because core was slow to describe its history."""
        response = self.session.get(self._scoped(PROJECT_RUNS), timeout=FETCH_TIMEOUT_SECONDS)
        if response.status_code != 200:
            return []
        return response.json() or []

    # --- screenshots (VIS-1485/1486) ---------------------------------------

    def render_permit(self, dashboard):
        """``(token, path)`` for screenshotting ``dashboard``.

        The token is short-lived, read-only and account-locked — not a user
        JWT, which carries no account and would let the page's own fetches
        resolve whatever account they asked for.

        The PATH comes from core too. Core knows the account slug, the stage
        and the project name; assembling them here would be three more strings
        a prompt-injected agent could influence, to build the one URL a
        credentialed browser then loads. A dashboard core does not have is a
        404, before any browser starts.
        """
        url = self._scoped(AGENT_RENDER_TOKEN)
        response = self.session.post(
            url, json={"dashboard": dashboard}, timeout=SAVE_TIMEOUT_SECONDS
        )
        if response.status_code not in (200, 201):
            raise CloudApiError(_why(f"get a render token for '{dashboard}'", url, response))
        body = response.json() or {}
        return body.get("token"), body.get("path")

    def put_screenshot(self, png, dashboard):
        """Store one capture and return where it can be read back.

        Core signs a PUT and the bytes go straight to storage, so the runner
        can neither choose where they land nor reach another account's prefix.
        The object name is minted here rather than by the caller: it is an
        implementation detail of storing a capture, not a decision an agent
        tool should be making.
        """
        name = f"{dashboard}-{uuid.uuid4().hex[:8]}.png"
        url = self._scoped(AGENT_CAPTURES)
        response = self.session.post(url, json=[{"filename": name}], timeout=SAVE_TIMEOUT_SECONDS)
        if response.status_code not in (200, 201):
            raise CloudApiError(_why("get an upload URL for a screenshot", url, response))
        slots = response.json() or []
        if not slots:
            raise CloudApiError("Core signed no upload URL for the screenshot.")

        upload_url = slots[0]["upload_url"]
        uploaded = self.session.put(
            upload_url,
            data=png,
            headers={"Content-Type": "image/png"},
            timeout=SAVE_TIMEOUT_SECONDS,
        )
        if uploaded.status_code not in (200, 201, 204):
            raise CloudApiError(_why("upload the screenshot", upload_url, uploaded))

        # The signed PUT and the readable GET are the same object; the query
        # string is the signature, which is not ours to hand on.
        return upload_url.split("?")[0]
