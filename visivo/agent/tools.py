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

from typing import Dict, get_args

from visivo.agent import images
from visivo.agent.actions import caller, log as action_log
from visivo.agent.charting.schema import Intent
from visivo.agent.data_tools import DATA_TOOLS
from visivo.agent.schema import SchemaSlicer
from visivo.agent.screenshot import SCREENSHOT_TOOLS
from visivo.agent.tool_types import Tool, ToolError  # noqa: F401 — re-exported
from visivo.jobs.run_model_data_job import QueryTimeout
from visivo.server.names import NameTakenError
from visivo.server.rename_service import TYPE_TO_MANAGER


def _singular(type_key):
    """``sources`` -> ``source``. Every Visivo type key is a plain plural."""
    return type_key[:-1]


def _manager(app, type_key):
    manager = getattr(app, TYPE_TO_MANAGER[type_key], None)
    if manager is None:
        raise ToolError(f"This server has no manager for '{type_key}'.")
    return manager


def _rename_hint(type_key, name):
    return f"Choose another name, e.g. '{name}_{_singular(type_key)}'."


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
        manager = _manager(app, type_key)
        try:
            obj = manager.validate_object(config)
        except ToolError:
            raise
        except Exception as error:
            return {"valid": False, "error": str(error)}
        name = config.get("name")
        clash = manager.name_clash and isinstance(name, str) and manager.name_clash(name, obj)
        if clash:
            return {"valid": False, "error": f"{clash} {_rename_hint(type_key, name)}"}
        from visivo.agent.charting import lint

        found = lint.warnings(app, type_key, config) + manager.warnings_for(obj)
        return {"valid": True, "warnings": found} if found else {"valid": True}

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
            hints = "".join(f"\nHint: {hint}" for hint in _write_hints(type_key, error))
            raise ToolError(f"Invalid {_singular(type_key)}: {error}{hints}")

        # Local import: run_views reaches back into the server package, and the
        # tool registry is imported from it.
        from visivo.server.views.run_views import resource_fingerprint, stage_and_maybe_run

        before = resource_fingerprint(app, type_key, name)
        # Into the draft tier, never the filesystem. See the module docstring.
        try:
            manager.save(name, obj)
        except NameTakenError as error:
            raise ToolError(f"{error} {_rename_hint(type_key, name)}")
        # A person's edit reaches this through the after_request hook on
        # POST /api/<type>/<name>/. The agent saves in-process, so without this
        # its writes stage nothing (leaving the top bar on Deploy) and never
        # trigger a run, however run_trigger is set.
        #
        # In cloud there is no local staging to do: the manager wrote THROUGH
        # to core's per-name endpoint, and core's own handler stages the draft
        # and requests the auto-run. Calling this there raised
        # AttributeError('staged_manager') — after the save had already
        # landed, so every write reported failure, the model retried, and the
        # object was written twice.
        outcome = (
            stage_and_maybe_run(app, type_key, name, before)
            if getattr(app, "staged_manager", None) is not None
            else None
        )
        result = {"name": name, "status": "draft"}
        if outcome:
            result["change"] = outcome
        from visivo.agent.charting import lint

        found = lint.warnings(app, type_key, config)
        if type_key == "models":
            from visivo.agent.data_tools import probe_model_sql

            problem = probe_model_sql(app, obj)
            if problem:
                found.append(
                    f"The model's SQL fails on its source ({problem}). The model and "
                    "everything built on it will not build until it runs. Fix the SQL, "
                    "querying the source's own tables, and write the model again."
                )
        if type_key == "insights":
            from visivo.agent.data_tools import probe_insight

            problems = probe_insight(app, obj.model_dump(exclude_none=True, mode="json"))
            if problems:
                found += problems + [
                    "Call preview_insight to see the rows, fix the props, and write the "
                    "insight again."
                ]
        if found:
            result["warnings"] = found
        return result

    return handler


# Fixes for the config shapes agents get wrong most, keyed by the field Pydantic
# names. A bare "Extra inputs are not permitted" leaves the agent guessing where
# the field belongs.
_INTERACTION_FIELDS = ("filter", "split", "sort")


def _write_hints(type_key, error):
    errors = error.errors() if callable(getattr(error, "errors", None)) else []
    hints = []
    for problem in errors:
        loc = problem.get("loc") or ()
        field = loc[0] if loc else None
        if type_key == "insights" and field in _INTERACTION_FIELDS:
            hints.append(
                f"`{field}` goes inside `interactions`, e.g. "
                f'`interactions: [{{{field}: "?{{ ... }}"}}]`.'
            )
        elif field == "model" and problem.get("type") == "extra_forbidden":
            example = (
                "`expression: sum(${ref(trips).fare})`"
                if type_key in ("metrics", "dimensions")
                else "`?{ sum(${ref(trips).fare}) }`"
            )
            hints.append(
                f"A {_singular(type_key)} has no `model` field. Name the model inside its "
                f"expressions, e.g. {example}."
            )
        elif type_key == "models" and field == "source":
            hints.append("Write the source as a reference, e.g. `source: ${ref(taxi)}`.")
    return list(dict.fromkeys(hints))


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


def _recommend_layout_handler(app, arguments):
    from visivo.agent.charting.layout import LayoutError, recommend_layout

    items = arguments.get("items")
    if not isinstance(items, list) or not items:
        raise ToolError(
            "'items' must be a non-empty list of {name, kind, family?, row_role?, hints?}."
        )
    try:
        return recommend_layout(
            items,
            title=arguments.get("title"),
            inputs=arguments.get("inputs") or [],
            intent=arguments.get("intent"),
        )
    except LayoutError as error:
        raise ToolError(str(error))


def _theme_first_color(app):
    """The first colour of the theme's colorway (a list or a palette name), or None."""
    from visivo.models.color_palette import ColorPalette

    theme = _theme_config(app)
    colorway = theme.get("colorway") or theme.get(theme.get("mode"), {}).get("colorway")
    if isinstance(colorway, str):
        colorway = ColorPalette.PREDEFINED_PALETTES.get(colorway)
    return colorway[0] if colorway else None


def _recommend_charts_handler(app, arguments):
    from pydantic import ValidationError

    from visivo.agent.charting.recommend import compact, recommend
    from visivo.agent.charting.schema import RecommendRequest

    color = _theme_first_color(app)
    if color and isinstance(arguments.get("context", {}), dict):
        arguments = {**arguments, "context": {"theme_color": color, **arguments.get("context", {})}}
    try:
        request = RecommendRequest(**arguments)
    except ValidationError as error:
        problems = "; ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in error.errors()[:5]
        )
        raise ToolError(f"Invalid request: {problems}")
    return compact(recommend(request))


def _recommend_inputs_handler(app, arguments):
    from visivo.agent.charting.inputs import InputsError, recommend_inputs

    cards = arguments.get("cards")
    if not isinstance(cards, list) or not cards:
        raise ToolError("'cards' must be a non-empty list of shape cards, each with its 'model'.")
    try:
        return recommend_inputs(
            cards,
            candidate_insights=arguments.get("insights") or [],
            intent=arguments.get("intent"),
            max_inputs=arguments.get("max_inputs"),
        )
    except InputsError as error:
        raise ToolError(str(error))


def _check_input_wiring_handler(app, arguments):
    from visivo.agent.charting.inputs import check_wiring

    inputs, insights = arguments.get("inputs"), arguments.get("insights")
    if not isinstance(inputs, list) or not isinstance(insights, list):
        raise ToolError("'inputs' and 'insights' must both be lists.")
    gaps = check_wiring(inputs, insights)
    return {"complete": not gaps, "gaps": gaps}


def _model_dialects(app, cards, named):
    """``({model: dialect}, [models no source resolved for])``: each model's
    own source (draft first), else ``named``, else the project's default."""
    from visivo.server.source_resolution import find_model, find_source, source_for_model

    defaults = getattr(getattr(app, "project", None), "defaults", None)
    default = find_source(app, getattr(defaults, "source_name", None))
    dialects, unresolved = {}, []
    models = {c.get("model") for c in cards or [] if isinstance(c, dict) and c.get("model")}
    for name in sorted(models):
        model = find_model(app, name)
        source = source_for_model(app, model, app.output_dir) if model is not None else None
        source = source or named or default
        if source is None:
            unresolved.append(name)
        else:
            dialects[name] = source.get_sqlglot_dialect()
    return dialects, unresolved


def _score_candidates_handler(app, arguments):
    from pydantic import ValidationError

    from visivo.agent.charting.candidates import CandidatesError, score_candidates
    from visivo.agent.data_tools import MAX_QUERY_ROWS, _source_argument, model_cards

    named = _source_argument(app, arguments) if arguments.get("source") else None
    cards = arguments.get("cards")
    models = arguments.get("models")
    if models is not None:
        if not isinstance(models, list) or not all(isinstance(m, str) for m in models):
            raise ToolError("'models' is a list of model names.")
        if cards is not None and not isinstance(cards, list):
            raise ToolError("'cards' is a list of shape cards.")
        cards = list(cards or []) + [card for name in models for card in model_cards(app, name)]
    if cards is None:
        raise ToolError("Pass 'models' (the names of written models) or 'cards'.")
    dialects, unresolved = _model_dialects(app, cards if isinstance(cards, list) else [], named)
    try:
        result = score_candidates(
            cards,
            stats=arguments.get("stats"),
            intent=arguments.get("intent"),
            dialect=dialects,
            max_rows=MAX_QUERY_ROWS,
        )
    except CandidatesError as error:
        raise ToolError(str(error))
    except ValidationError as error:
        problems = [
            f"{'.'.join(str(p) for p in e['loc']) or 'input'}: {e['msg']}" for e in error.errors()
        ]
        raise ToolError("score_candidates: " + "; ".join(problems[:3]))
    if unresolved:
        result["warnings"].append(
            f"no source resolved for {', '.join(unresolved)} and the project has no default "
            "source, so its expressions are DuckDB SQL; pass 'source'"
        )
    return result


_HAND_WRITTEN = {
    "recommend_charts": Tool(
        name="recommend_charts",
        description=(
            "Choose the chart for an insight before writing it. Pass what you "
            "learned from profile_columns: the metrics (name, agg, unit), the "
            "dimensions as shape cards, an intent if the user has one, and "
            "semantics the question carries (part_of_whole, ordered_stages, "
            "exact_values, ...). Get back ranked families, each with why, the "
            "repairs its ranges need (top_n_other, regrain, input_filter, ...) "
            "and how to apply them, warnings, pairings, a layout hint, the skill "
            "to read, and for the top three a YAML skeleton built from your "
            "columns (example_yaml instead when the entry's example cannot carry "
            "them: a pattern to map, never to paste); plus every family it "
            "rejected and why."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "metrics": {
                    "type": "array",
                    "description": "{name, agg: sum|avg|count|count_distinct|min|max|median|rate, unit?, card?}.",
                    "items": {"type": "object"},
                },
                "dimensions": {
                    "type": "array",
                    "description": "Shape cards from profile_columns, in the order you want them: {column, role, cardinality, time_grain?, time_span_points?, geo_kind?, ordered?, stats?}.",
                    "items": {"type": "object"},
                },
                "intent": {
                    "type": "string",
                    "enum": list(get_args(Intent)),
                    "description": "A preference, never a gate; omit it when the user has none.",
                },
                "semantics": {
                    "type": "object",
                    "description": "Booleans no profile can infer: part_of_whole, cumulative, ordered_stages, signed_contributions, hierarchy, boundaries_available, exact_values, totals_required.",
                },
                "context": {
                    "type": "object",
                    "description": "{row_count?, model? (for the ${ref()}s in skeletons), max_results? (default 5), existing_inputs?}.",
                },
                "requested": {
                    "type": "string",
                    "description": "A family (bar, line, part_of_whole, ...) or trace type (pie, violin, ...) the user named. It ranks first with its repairs and warnings, so you can tell the user the trade-off; omit it otherwise.",
                },
            },
        },
        handler=_recommend_charts_handler,
    ),
    "recommend_inputs": Tool(
        name="recommend_inputs",
        description=(
            "Turn profiled columns into Inputs and the interactions that wire "
            "them. Pass the shape cards from profile_columns (each with its "
            "model) and the insights you plan, with the columns each reads; get "
            "back ready input YAML, a default per input, the filter/split/sort "
            "expression to put on EVERY insight that shares the column, and "
            "layout_inputs to hand to recommend_layout. Write the inputs before "
            "the insights that reference them."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "cards": {
                    "type": "array",
                    "description": "Shape cards with a 'model' field: {model, column, role, cardinality, top_n?, stats?, time_grain?, null_pct?}.",
                    "items": {"type": "object"},
                },
                "insights": {
                    "type": "array",
                    "description": "Planned insights: {name, model, columns: [..], chart?, family?, measure?}.",
                    "items": {"type": "object"},
                },
                "intent": {
                    "type": "string",
                    "description": "rank adds a sort-direction switch; trend adds a day/week/month grain switch.",
                },
                "max_inputs": {"type": "integer", "minimum": 1},
            },
            "required": ["cards"],
        },
        handler=_recommend_inputs_handler,
    ),
    "check_input_wiring": Tool(
        name="check_input_wiring",
        description=(
            "Find half-wired inputs before writing a dashboard: an input that "
            "filters some but not all insights sharing its column shows "
            "filtered and unfiltered numbers side by side. Pass the inputs "
            "({name, model, column}) and insights ({name, model, columns, "
            "interactions}) and get the gaps."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "inputs": {"type": "array", "items": {"type": "object"}},
                "insights": {"type": "array", "items": {"type": "object"}},
            },
            "required": ["inputs", "insights"],
        },
        handler=_check_input_wiring_handler,
    ),
    "score_candidates": Tool(
        name="score_candidates",
        description=(
            "Decide what is worth showing before choosing charts. Pass the names "
            "of the written models to score in `models` (the tool profiles them), "
            "or shape cards from profile_columns (each with its model), and, once "
            "you have them, GROUP BY stats from query_source; get back the "
            "Metrics, Dimensions and Relations to write first (semantic_layer), a "
            "varied portfolio of candidates (a KPI set, a trend, breakdowns, a "
            "distribution or relationship) each with a `request` for "
            "recommend_charts, the detail_table when an identifier exists, and "
            "stats_wanted: the queries that would sharpen the scores."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "models": {
                    "type": "array",
                    "description": "Names of written models; the tool profiles each into cards.",
                    "items": {"type": "string"},
                },
                "cards": {
                    "type": "array",
                    "description": "Shape cards with a 'model' field, for SQL no model holds yet.",
                    "items": {"type": "object"},
                },
                "stats": {
                    "type": "object",
                    "description": (
                        "groups: [{model, by (a column, or [a, b] for a cross-tab), metric "
                        "(a semantic_layer metric name), grain?, rows: [[key, value], ...], "
                        "[[a, b, value], ...] or query_source rows}]; correlations: [{model, "
                        "columns: [a, b], r, method}] as stats_wanted asked, or {model, "
                        "columns, pairs: [[a, b], ...]}."
                    ),
                },
                "intent": {
                    "type": "string",
                    "description": "What the user asked for, to lead with: trend, compare, rank, composition, geo, distribution, relationship, kpi.",
                },
                "source": {
                    "type": "string",
                    "description": (
                        "The source of models not written yet. A written model's "
                        "expressions use its own source's dialect, else the default source's."
                    ),
                },
            },
        },
        handler=_score_candidates_handler,
    ),
    "recommend_layout": Tool(
        name="recommend_layout",
        description=(
            "Arrange charts, tables and inputs into dashboard rows. Pass every "
            "chart, table and input you mean to place (name, kind, family); get "
            "back `dashboards[0].rows` YAML with the ${ref()}s in place, a why "
            "per row, and warnings. Call it once per dashboard before "
            "write_dashboard, then fill in the markdown headers."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": "Charts and tables to place.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string", "description": "The object's name."},
                            "kind": {"type": "string", "enum": ["chart", "table", "markdown"]},
                            "family": {
                                "type": "string",
                                "description": "Chart family from recommend_charts / the trace entries (kpi, line, bar, heatmap, geo_region, table, ...).",
                            },
                            "row_role": {
                                "type": "string",
                                "enum": [
                                    "header",
                                    "kpi",
                                    "hero",
                                    "breakdown",
                                    "relationship",
                                    "detail",
                                ],
                                "description": "Override the family's default row.",
                            },
                            "hints": {
                                "type": "object",
                                "description": "importance (number, higher first), rows (table row count), n_y_categories (heatmap), related_kpis (KPI names to place beside a hero chart), gauge (true for a KPI drawn as a gauge), header (one sentence on what to look for).",
                            },
                        },
                        "required": ["name", "kind"],
                    },
                },
                "inputs": {
                    "type": "array",
                    "description": "Inputs to place: {name, hints: {chart: <name>}} puts one beside that chart; otherwise it goes in the top row.",
                    "items": {"type": "object"},
                },
                "title": {"type": "string"},
                "intent": {
                    "type": "string",
                    "description": "Picks the hero: trend, change, geo, flow, distribution, relationship, compare, rank, composition, kpi, detail.",
                },
            },
            "required": ["items"],
        },
        handler=_recommend_layout_handler,
    ),
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
_SPECIAL_TOOLS = {**_HAND_WRITTEN, **DATA_TOOLS, **SCREENSHOT_TOOLS}
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


def _image_url_of(result):
    """Where a tool's picture can be seen, if it made one.

    Read off the result here rather than passed in by the handler: recording
    lives in this function, and a handler that had to remember to log its own
    image is a handler that eventually forgets.
    """
    value = result.return_value if images.is_image_result(result) else result
    return value.get("image_url") if isinstance(value, dict) else None


def _as_refusal(name, arguments, error):
    """Every handler failure reaches the agent as a ``ToolError``: a timeout
    as its own message, anything unexpected prefixed with the tool and the
    source it was running against."""
    if isinstance(error, ToolError):
        return error
    if isinstance(error, QueryTimeout):
        return ToolError(str(error))
    source = arguments.get("source")
    where = f" on '{source}'" if isinstance(source, str) else ""
    return ToolError(f"{name} failed{where}: {error}")


def call(app, name, arguments=None):
    """Invoke a tool by name, recording what happened.

    Raises ``ToolError`` for every failure, so a transport can hand the reason
    back as a result rather than a stack trace.

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

    # Recorded before the handler runs so the tab can show a call in progress.
    pending = action_log().record(name, obj=obj, outcome="pending")

    try:
        result = tool.handler(app, arguments)
    except Exception as error:
        refusal = _as_refusal(name, arguments, error)
        action_log().resolve(pending["id"], outcome="error", error=str(refusal))
        raise refusal

    # A validate tool answers `{"valid": False}` rather than raising — the
    # config was bad, which the log should say, but the call itself worked.
    if isinstance(result, dict) and result.get("valid") is False:
        action_log().resolve(pending["id"], outcome="error", error=result.get("error"))
    else:
        action_log().resolve(pending["id"], image_url=_image_url_of(result))
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
    attached = [{"name": s["name"], "body": s["text"]} for s in fresh]
    # An image result carries the picture in `content`, outside the JSON.
    # Wrapping it the way a plain result is wrapped would drop that — and drop
    # it silently, since the tool still answers and only the image goes
    # missing. So the skills go into its return value instead.
    if images.is_image_result(result):
        return images.with_extra_return_value(result, skills_attached=attached)
    return {"result": result, "skills_attached": attached}
