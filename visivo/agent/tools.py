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
        # Into the draft tier, never the filesystem. See the module docstring.
        manager.save(name, obj)
        return {"name": name, "status": "draft"}

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


_SPECIAL_TOOLS = {
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
}


# Hand-written, and named so the "generated from the type map" property can be
# checked against the generated ones alone. Keep this list short: 133 routes is
# a menu, not a toolset, and a wide surface makes agents worse.
SPECIAL_TOOL_NAMES = frozenset(_SPECIAL_TOOLS)

TOOLS: Dict[str, Tool] = {**_generated_tools(), **_SPECIAL_TOOLS}


def tool_names():
    """Every tool name, sorted — what a transport advertises."""
    return sorted(TOOLS)


def call(app, name, arguments=None):
    """Invoke a tool by name.

    Raises ``ToolError`` for anything the agent could have avoided, so a
    transport can hand the reason back as a result rather than a stack trace.
    """
    tool = TOOLS.get(name)
    if tool is None:
        raise ToolError(f"No tool named '{name}'.")
    return tool.handler(app, arguments or {})
