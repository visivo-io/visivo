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

import os
import tempfile
from functools import partial

from visivo.cloud_api import CloudApi, CloudApiError

from visivo.logger.logger import Logger
from visivo.server.model_sql_validation import dialect_for_model
from visivo.server.rename_service import TYPE_TO_MANAGER

# A project's whole object set, once, at session start. Long enough for a big
# project on a slow link, short enough that a wedged core fails the turn rather
# than holding a runner open.
FETCH_TIMEOUT_SECONDS = 30
SAVE_TIMEOUT_SECONDS = 30

# Core marks anything that is not this as a draft.
PUBLISHED = "published"


# The agent's name for it. `CloudApi` raises `CloudApiError`; everything that
# already catches `RemoteProjectError` keeps working, because they are the
# same class.
RemoteProjectError = CloudApiError


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
        # Read by the screenshot tool, which needs core itself rather than a
        # manager. Named so `getattr(app, "core_client", None)` is how a tool
        # asks "am I in cloud?" without importing this module.
        self.core_client = client
        self._working_dir = working_dir
        # Somewhere for the tools that take a target directory — profile
        # caches, and resolving a source that reads a local file. A cloud turn
        # has no built artifacts on disk, so this starts empty and the tools
        # that need data say so; what it stops is `AttributeError:
        # 'RemoteProject' object has no attribute 'output_dir'`, which was
        # every data tool and every model or insight write.
        #
        # Per turn, under the runner's own working dir when it gave us one so
        # the run's cleanup takes it, otherwise a temp dir.
        self.output_dir = (
            os.path.join(working_dir, "target")
            if working_dir
            else (tempfile.mkdtemp(prefix="visivo-agent-"))
        )
        os.makedirs(self.output_dir, exist_ok=True)
        # There is no parsed Project in cloud — the objects live in core and
        # arrive as managers, not as a file this process read. Explicitly None
        # rather than absent, so the callers that already reach for it
        # defensively (`getattr(app.project, "defaults", None)`) get a None
        # they handle instead of an AttributeError they do not.
        #
        # The cost is real and worth naming: no project defaults, so a model
        # whose source is only implied by `defaults.source_name` cannot be
        # resolved here. That degrades the SQL probe to "not judged", which is
        # a documented outcome of it, rather than failing the write.
        self.project = None
        self.run_manager = RemoteRunManager(client)
        self._managers = {}
        for type_key, attribute in TYPE_TO_MANAGER.items():
            manager = _hydrated(client, type_key)
            self._managers[type_key] = manager
            setattr(self, attribute, manager)
        self.model_manager.dialect_lookup = partial(dialect_for_model, self)

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
    for envelope in client.objects(type_key):
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
        client.save_object(type_key, name, obj.model_dump(exclude_none=True, mode="json"))

    manager.save = save


def build(base_url, token, project_id, working_dir=None, session=None, host_header=None):
    return RemoteProject(
        CloudApi(base_url, token, project_id, session=session, host_header=host_header),
        working_dir=working_dir,
    )
