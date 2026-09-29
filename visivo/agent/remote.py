"""Running the agent against a project that lives somewhere else (VIS-1366).

Locally the tools reach a project through ``flask_app``'s object managers,
whose storage is two dicts: published objects and the draft tier on top. In
cloud that project is rows in core, and the agent runs in the runner.

## Hydrate the real managers, do not replace them

The managers are kept exactly as they are and filled from core instead. That
matters more than it sounds: ``get_status``, ``objects_equal``, rename tracking
and every per-type ``validate_object`` are manager behaviour, and a second
implementation of any of them would be a cloud agent that disagrees with the
local one about what changed.

So this is a loader and a write-through, not a new kind of manager.

## The draft tier survives the trip

Core's envelope carries ``status``, so a published row lands in
``_published_objects`` and a draft in ``_cached_objects`` — the same two tiers,
in the same order. A write goes to core's per-name endpoint, which is the
editor's draft path, so an agent's change arrives as an uncommitted edit a
person reviews. Nothing here can publish.
"""

import requests

from visivo.logger.logger import Logger
from visivo.server.rename_service import TYPE_TO_MANAGER

# A project's whole object set, once, at session start. Long enough for a big
# project on a slow link, short enough that a wedged core fails the turn rather
# than holding a runner open.
FETCH_TIMEOUT_SECONDS = 30
SAVE_TIMEOUT_SECONDS = 30

# Core marks anything that is not this as a draft.
PUBLISHED = "published"


class RemoteProjectError(Exception):
    """Core would not answer. The turn cannot run without the project."""


def _why(what, url, response):
    """A failure someone can act on.

    "Could not read sources from core (400)" says a status and nothing about
    which request produced it — and the interesting part of a 400 is always the
    URL and what the server said about it. Both go in, because this message is
    the only thing that reaches whoever is looking at the Agent tab.
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


class CoreClient:
    """The half-dozen calls an agent session makes against core.

    Deliberately the same endpoints the viewer uses — `/api/<type>/` with a
    `project_id` — because those already exist, already enforce account scope,
    and already put a write in the draft tier. An agent-specific write path
    would be a second way to edit a project.
    """

    def __init__(self, base_url, token, project_id, session=None):
        self.base_url = str(base_url).rstrip("/")
        self.project_id = project_id
        self.session = session or requests.Session()
        self.session.headers.update({"Authorization": f"Api-Key {token}"})

    def _url(self, path):
        return f"{self.base_url}{path}?project_id={self.project_id}"

    def list(self, type_key):
        url = self._url(f"/api/{type_key}/")
        response = self.session.get(url, timeout=FETCH_TIMEOUT_SECONDS)
        if response.status_code != 200:
            raise RemoteProjectError(_why(f"read {type_key}", url, response))
        return (response.json() or {}).get(type_key) or []

    def save(self, type_key, name, config):
        url = self._url(f"/api/{type_key}/{name}/")
        response = self.session.post(url, json=config, timeout=SAVE_TIMEOUT_SECONDS)
        if response.status_code not in (200, 201):
            raise RemoteProjectError(_why(f"save {type_key[:-1]} '{name}'", url, response))
        return response.json()

    def runs(self):
        response = self.session.get(
            f"{self.base_url}/api/projects/{self.project_id}/run/",
            timeout=FETCH_TIMEOUT_SECONDS,
        )
        if response.status_code != 200:
            return []
        return response.json() or []


class RemoteRunManager:
    """Enough of a run manager for `list_runs` / `get_run`.

    Read-only, like its local counterpart is for the agent: starting a run
    executes SQL and can run a source's seed subprocesses, which is the
    escalation path VIS-1340 identified.
    """

    def __init__(self, client):
        self._client = client

    def list(self, limit=20):
        return self._client.runs()[:limit]

    def get(self, run_id):
        for run in self._client.runs():
            if str(run.get("id")) == str(run_id):
                return _RemoteRun(run)
        return None


class _RemoteRun:
    """Core's run JSON, wearing the attribute names the tool reads."""

    def __init__(self, payload):
        self._payload = payload
        self.id = payload.get("id")
        self.logs = payload.get("logs") or ""
        self.error_json = payload.get("error_json")

    def to_dict(self, is_superseded=False):
        return dict(self._payload)


class RemoteProject:
    """What ``build_agent`` is handed instead of ``flask_app``.

    Presents ``<type>_manager`` for every registered type, so
    ``tools._manager(app, type_key)`` finds what it always finds.
    """

    def __init__(self, client, working_dir=None):
        self._client = client
        self._working_dir = working_dir
        self.run_manager = RemoteRunManager(client)
        self._managers = {}
        for type_key, attribute in TYPE_TO_MANAGER.items():
            manager = _hydrated(client, type_key)
            self._managers[type_key] = manager
            setattr(self, attribute, manager)

    @property
    def managers(self):
        return dict(self._managers)


def _manager_for(type_key):
    """A real manager instance, from its own module.

    By module rather than off the package: only some managers are re-exported
    from ``visivo.server.managers``, and the ones that are not would have
    silently gone missing — a cloud agent that could edit five of eleven types
    and say nothing about the rest.
    """
    import importlib

    attribute = TYPE_TO_MANAGER[type_key]
    module = importlib.import_module(f"visivo.server.managers.{attribute}")
    class_name = "".join(part.title() for part in attribute.split("_"))
    return getattr(module, class_name)()


def _hydrated(client, type_key):
    manager = _manager_for(type_key)
    for envelope in client.list(type_key):
        config = envelope.get("config") or {}
        name = envelope.get("name")
        if not name:
            continue
        try:
            obj = manager.validate_object({**config, "name": name})
        except Exception as error:
            # A row core stored that this visivo cannot parse — a newer field,
            # or something written by a different version. Skipping it beats
            # failing the whole session: the agent works with what it can read
            # and the object stays untouched.
            Logger.instance().debug(f"Skipping unreadable {type_key} '{name}': {error}")
            continue
        if envelope.get("status") == PUBLISHED:
            manager._published_objects[name] = obj
        else:
            manager._cached_objects[name] = obj

    _write_through(manager, client, type_key)
    return manager


def _write_through(manager, client, type_key):
    """Every save also reaches core, so the person watching the Workspace sees
    the agent's drafts appear as it works rather than at the end."""
    original_save = manager.save

    def save(name, obj):
        original_save(name, obj)
        client.save(type_key, name, obj.model_dump(exclude_none=True, mode="json"))

    manager.save = save


def build(base_url, token, project_id, working_dir=None, session=None):
    return RemoteProject(
        CoreClient(base_url, token, project_id, session=session), working_dir=working_dir
    )
