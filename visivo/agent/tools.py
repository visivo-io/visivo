"""One definition of what an agent may do, consumed by every transport.

A tool is a name, a description, an input schema and a handler. The handler
calls **the same manager the HTTP route calls**, so an agent and a person
editing in the browser go through one implementation rather than two that have
to be kept in step.

## Generated, not listed

The per-type tools are derived from ``TYPE_TO_MANAGER`` — the map the rename
service already maintains — so adding a Visivo object type requires no change
here. That is the test of whether this is a registry or a list: if a new type
needs an edit in this file, it is a list.

## The safety rule

Every write lands in the manager's ``cached_objects`` — the draft tier — and
**no tool touches the filesystem**. ``commit`` is deliberately absent:
promotion stays a human action in the commit panel, and turning drafts into
files is ``ProjectWriter``'s job, on the server, at commit time.

Said the other way round, both agents work through the API, so neither needs
filesystem access. "Draft-only" and "no filesystem" turn out to be the same
rule said twice, which is a sign the boundary is in the right place — and it
is what makes an autonomous loop safe to ship, because the blast radius of a
hijacked agent is a draft someone can discard.
"""

from dataclasses import dataclass
from typing import Any, Callable, Dict

from visivo.agent.actions import caller, log as action_log
from visivo.agent.schema import SchemaSlicer
from visivo.server.rename_service import TYPE_TO_MANAGER


@dataclass(frozen=True)
class Tool:
    """A callable an agent may invoke.

    ``handler`` takes the Flask app (which owns the managers) and the decoded
    arguments, so the registry itself is a module-level constant with no
    lifecycle of its own — a transport builds no state to serve it.
    """

    name: str
    description: str
    input_schema: Dict[str, Any]
    handler: Callable[[Any, Dict[str, Any]], Any]


class ToolError(Exception):
    """A tool refused, with a reason worth showing the agent.

    Separate from an unexpected exception: this one is part of the contract —
    a name that does not exist, a config that does not validate — and the
    transport turns it into a result the model can act on rather than a crash.
    """


def _singular(type_key):
    """``sources`` -> ``source``. Every Visivo type key is a plain plural."""
    return type_key[:-1]


def _manager(app, type_key):
    manager = getattr(app, TYPE_TO_MANAGER[type_key], None)
    if manager is None:
        raise ToolError(f"This server has no manager for '{type_key}'.")
    return manager


def _name_argument(arguments):
    name = (arguments or {}).get("name")
    if not isinstance(name, str) or not name.strip():
        raise ToolError("'name' is required.")
    return name


def _config_argument(arguments):
    config = (arguments or {}).get("config")
    if not isinstance(config, dict):
        raise ToolError("'config' is required and must be an object.")
    return config


def _dump(obj):
    """An object as JSON-ready data, refs preserved.

    ``model_dump(mode="json")`` keeps ``${ref(name)}`` as the string it is —
    the same form the object managers serve to the editor, so an agent reads
    what a person reads.
    """
    return obj.model_dump(exclude_none=True, mode="json") if obj is not None else None


# --- the generated per-type tools ------------------------------------------


def _list_handler(type_key):
    def handler(app, arguments):
        return [_dump(obj) for obj in _manager(app, type_key).get_all_objects_list()]

    return handler


def _get_handler(type_key):
    def handler(app, arguments):
        name = _name_argument(arguments)
        obj = _manager(app, type_key).get(name)
        if obj is None:
            raise ToolError(f"No {_singular(type_key)} named '{name}'.")
        return _dump(obj)

    return handler


def _validate_handler(type_key):
    def handler(app, arguments):
        config = _config_argument(arguments)
        try:
            _manager(app, type_key).validate_object(config)
        except ToolError:
            raise
        except Exception as error:
            return {"valid": False, "error": str(error)}
        return {"valid": True}

    return handler


def _write_handler(type_key):
    def handler(app, arguments):
        config = _config_argument(arguments)
        name = config.get("name")
        if not isinstance(name, str) or not name.strip():
            raise ToolError("The config must carry a 'name'.")
        manager = _manager(app, type_key)
        try:
            obj = manager.validate_object(config)
        except Exception as error:
            raise ToolError(f"Invalid {_singular(type_key)}: {error}")

        # Local import: run_views reaches back into the server package, and the
        # tool registry is imported from it.
        from visivo.server.views.run_views import resource_fingerprint, stage_and_maybe_run

        before = resource_fingerprint(app, type_key, name)
        # Into the draft tier, never the filesystem. See the module docstring.
        manager.save(name, obj)
        # A person's edit reaches this through the after_request hook on
        # POST /api/<type>/<name>/. The agent saves in-process, so without this
        # its writes stage nothing (leaving the top bar on Deploy) and never
        # trigger a run, however run_trigger is set.
        outcome = stage_and_maybe_run(app, type_key, name, before)
        result = {"name": name, "status": "draft"}
        if outcome:
            result["change"] = outcome
        return result

    return handler


_NAME_SCHEMA = {
    "type": "object",
    "properties": {"name": {"type": "string", "description": "The object's unique name."}},
    "required": ["name"],
}

_CONFIG_SCHEMA = {
    "type": "object",
    "properties": {
        "config": {
            "type": "object",
            "description": "The object's full configuration, including its 'name'.",
        }
    },
    "required": ["config"],
}

_EMPTY_SCHEMA = {"type": "object", "properties": {}}

# verb -> (schema, handler factory, description template)
_PER_TYPE = {
    "list": (
        _EMPTY_SCHEMA,
        _list_handler,
        "List every {plural} in the project, draft and published.",
    ),
    "get": (_NAME_SCHEMA, _get_handler, "Read one {singular}'s configuration by name."),
    "validate": (
        _CONFIG_SCHEMA,
        _validate_handler,
        "Check a {singular} configuration without saving it. Returns whether it is valid.",
    ),
    "write": (
        _CONFIG_SCHEMA,
        _write_handler,
        "Create or replace a {singular} in the draft tier. Never writes to a file — "
        "the change appears as an uncommitted edit for a person to review and commit.",
    ),
}


def _generated_tools():
    tools = {}
    for type_key in TYPE_TO_MANAGER:
        singular = _singular(type_key)
        for verb, (schema, factory, description) in _PER_TYPE.items():
            name = f"{verb}_{singular}" if verb != "list" else f"list_{type_key}"
            tools[name] = Tool(
                name=name,
                description=description.format(singular=singular, plural=type_key),
                input_schema=schema,
                handler=factory(type_key),
            )
    return tools


# --- the hand-written ones --------------------------------------------------

_slicer = None


def _schema_slicer():
    """Built once. Slicing the project schema means generating it, which is the
    expensive part; the slices themselves are cheap."""
    global _slicer
    if _slicer is None:
        _slicer = SchemaSlicer()
    return _slicer


def _get_schema_handler(app, arguments):
    slicer = _schema_slicer()
    requested = (arguments or {}).get("type")
    if not isinstance(requested, str) or not requested.strip():
        raise ToolError("'type' is required — one of: " + ", ".join(slicer.type_keys()))
    # Accept 'model' as readily as 'models'. An agent reading a tool named
    # get_model will reach for the singular.
    key = requested if requested in slicer.by_type else f"{requested}s"
    try:
        return slicer.for_type(key)
    except KeyError:
        raise ToolError(f"No type '{requested}'. Available: " + ", ".join(slicer.type_keys()))


# Run logs are the whole build output and an agent does not need the part that
# went well — a failure explains itself at the end.
RUN_LOG_TAIL = 4000


def _run_entry(app, run, with_logs=False):
    entry = run.to_dict(is_superseded=False)
    entry.pop("is_superseded", None)
    if with_logs:
        logs = run.logs or ""
        entry["logs"] = logs[-RUN_LOG_TAIL:]
        entry["logs_truncated"] = len(logs) > RUN_LOG_TAIL
    return entry


def _list_runs_handler(app, arguments):
    runs = app.run_manager.list()
    return {"runs": runs, "latest": runs[0] if runs else None}


def _get_run_handler(app, arguments):
    run_id = (arguments or {}).get("run_id")
    if run_id:
        run = app.run_manager.get(run_id)
        if run is None:
            raise ToolError(f"No run '{run_id}'.")
    else:
        # No id means "the one that just happened", which is what an agent
        # asking after its own write actually wants.
        listed = app.run_manager.list()
        if not listed:
            raise ToolError("No runs yet.")
        run = app.run_manager.get(listed[0]["id"])
    return _run_entry(app, run, with_logs=True)


def _theme_config(app):
    """The draft theme if one is cached, otherwise the published one."""
    from visivo.server.views.theme_views import current_theme_config

    return current_theme_config(app)


def _get_theme_handler(app, arguments):
    return _theme_config(app)


def _validate_theme_handler(app, arguments):
    from visivo.models.theme import Theme

    config = _config_argument(arguments)
    try:
        Theme(**config)
    except Exception as error:
        return {"valid": False, "error": str(error)}
    return {"valid": True}


def _write_theme_handler(app, arguments):
    """Replace the theme wholesale, as the editor's save does.

    A singleton has no name to merge on, so a partial config would silently
    drop whatever it omitted. The tool description says to read it first; this
    returns the stored result so an agent can see what it actually set.
    """
    from visivo.models.theme import Theme

    config = _config_argument(arguments)
    try:
        app._cached_theme = Theme(**config)
    except Exception as error:
        raise ToolError(f"Invalid theme: {error}")
    return {"status": "draft", "theme": _theme_config(app)}


def _read_skill_handler(app, arguments):
    from visivo.agent import skills

    name = _name_argument(arguments)
    try:
        return {"name": name, "body": skills.body(name)}
    except KeyError as missing:
        raise ToolError(str(missing).strip("'\""))


_SPECIAL_TOOLS = {
    "read_skill": Tool(
        name="read_skill",
        description=(
            "Read one of Visivo's skills — the short, task-shaped instructions "
            "for a job agents get wrong unaided. The system prompt lists them "
            "by name; call this before a task one covers and follow it."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "A skill name from the index, e.g. 'build-a-model'.",
                }
            },
            "required": ["name"],
        },
        handler=_read_skill_handler,
    ),
    "get_theme": Tool(
        name="get_theme",
        description=(
            "The project's theme — the colors, fonts and light/dark mode every "
            "dashboard is drawn with. Read this before writing it: a theme is "
            "one document, and write_theme replaces it."
        ),
        input_schema={"type": "object", "properties": {}},
        handler=_get_theme_handler,
    ),
    "validate_theme": Tool(
        name="validate_theme",
        description="Check a theme config without saving it.",
        input_schema={
            "type": "object",
            "properties": {"config": {"type": "object"}},
            "required": ["config"],
        },
        handler=_validate_theme_handler,
    ),
    "write_theme": Tool(
        name="write_theme",
        description=(
            "Save the project's theme as a draft. REPLACES it wholesale — a "
            "theme has no name to merge on, so send the whole document: read "
            "get_theme, change what you mean to, and write the result. "
            "get_schema('theme') has the vocabulary."
        ),
        input_schema={
            "type": "object",
            "properties": {"config": {"type": "object"}},
            "required": ["config"],
        },
        handler=_write_theme_handler,
    ),
    "get_schema": Tool(
        name="get_schema",
        description=(
            "The config vocabulary for one object type — what fields it takes "
            "and which are required. Ask for the type you are about to author; "
            "the whole project schema is megabytes and most of it is Plotly."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "description": "An object type, e.g. 'model' or 'models'.",
                }
            },
            "required": ["type"],
        },
        handler=_get_schema_handler,
    ),
    "list_runs": Tool(
        name="list_runs",
        description=(
            "Recent runs of this project, newest first, with the state of each "
            "and the structured error of any that failed. A write only becomes "
            "real data once a run builds it, so this is how you find out "
            "whether what you authored actually works."
        ),
        input_schema={"type": "object", "properties": {}},
        handler=_list_runs_handler,
    ),
    "get_run": Tool(
        name="get_run",
        description=(
            "One run in full, including the tail of its build log. Call this "
            "after list_runs shows a failure — the log is where a query error "
            "names the column or table it could not find."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "run_id": {
                    "type": "string",
                    "description": "Omit for the most recent run.",
                }
            },
        },
        handler=_get_run_handler,
    ),
}


# Hand-written, and named so the "generated from the type map" property can be
# checked against the generated ones alone. Keep this list short: 133 routes is
# a menu, not a toolset, and a wide surface makes agents worse.
SPECIAL_TOOL_NAMES = frozenset(_SPECIAL_TOOLS)

TOOLS: Dict[str, Tool] = {**_generated_tools(), **_SPECIAL_TOOLS}


def tool_names():
    """Every tool name, sorted — what a transport advertises."""
    return sorted(TOOLS)


def _object_of(name, arguments):
    """The object a call was about, as ``{type, name}``, or ``None``.

    Derived from the tool's own name and arguments rather than declared per
    tool: a generated tool is ``<verb>_<singular>`` and takes either a ``name``
    or a ``config`` carrying one, so the type and the target are both already
    there. This is what makes a log entry navigable — the tab addresses objects
    as ``type:name``.
    """
    if "_" not in name:
        return None
    _, singular = name.split("_", 1)
    type_key = singular if singular in TYPE_TO_MANAGER else f"{singular}s"
    if type_key not in TYPE_TO_MANAGER:
        return None
    arguments = arguments or {}
    target = arguments.get("name")
    if not isinstance(target, str):
        config = arguments.get("config")
        target = config.get("name") if isinstance(config, dict) else None
    return {"type": singular, "name": target} if isinstance(target, str) else None


def call(app, name, arguments=None):
    """Invoke a tool by name, recording what happened.

    Raises ``ToolError`` for anything the agent could have avoided, so a
    transport can hand the reason back as a result rather than a stack trace.

    The recording lives here rather than in a transport so every producer is
    captured by construction: an external client over MCP and the built-in loop
    both arrive through this function, and a log that only covered one of them
    would mean the registry was being bypassed.
    """
    arguments = arguments or {}
    obj = _object_of(name, arguments)
    tool = TOOLS.get(name)
    if tool is None:
        message = f"No tool named '{name}'."
        action_log().record(name, obj=obj, outcome="error", error=message)
        raise ToolError(message)

    try:
        result = tool.handler(app, arguments)
    except Exception as error:
        # Recorded on the way past, then re-raised unchanged: "what failed" is
        # half the value of the log, and the transport still decides how to
        # report it.
        action_log().record(name, obj=obj, outcome="error", error=str(error))
        raise

    # A validate tool answers `{"valid": False}` rather than raising — the
    # config was bad, which the log should say, but the call itself worked.
    if isinstance(result, dict) and result.get("valid") is False:
        action_log().record(name, obj=obj, outcome="error", error=result.get("error"))
    else:
        action_log().record(name, obj=obj)
    return _with_attached_skills(name, result)


# --- skills that ride along with a tool's first result ----------------------

# (source, session_id) -> skill names already delivered. Bounded because a
# serve process outlives any one session.
_attached = {}
MAX_ATTACHMENT_SESSIONS = 1000


def reset_attachments():
    _attached.clear()


def _with_attached_skills(name, result):
    """Wrap ``result`` with any skill that lists ``name`` in its ``tools:``,
    the first time this session calls it.

    Only the built-in loop gets this: an MCP client has resources and asked
    for none, and wrapping its result would change a shape it already parses.
    """
    source, session_id = caller()
    if source != "agent":
        return result
    from visivo.agent import skills

    candidates = skills.attached_to(name)
    if not candidates:
        return result
    if len(_attached) >= MAX_ATTACHMENT_SESSIONS:
        _attached.clear()
    delivered = _attached.setdefault((source, session_id), set())
    fresh = [s for s in candidates if s["name"] not in delivered]
    if not fresh:
        return result
    delivered.update(s["name"] for s in fresh)
    return {
        "result": result,
        "skills_attached": [{"name": s["name"], "body": s["text"]} for s in fresh],
    }
