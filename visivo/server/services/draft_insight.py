"""Compile and execute a draft insight against its source.

The agent's ``preview_insight`` tool and ``/api/insight-execute-draft/`` run
this same code; the view maps a ``DraftInsightError`` to its HTTP status, the
tool maps it to a refusal. ``substitute_inputs`` fills an insight's input
references with concrete values so a dynamic insight can be previewed
server-side; the view does not call it yet and still answers 409
``requires_client_lane``.
"""

from visivo.constants import DEFAULT_RUN_ID
from visivo.jobs.run_model_data_job import execute_and_get_result
from visivo.jobs.utils import get_source_for_model
from visivo.logger.logger import Logger
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.query.accessor_validator import get_accessor_sample_value
from visivo.query.insight.draft_overlay import DraftOverlayError, build_draft_overlay
from visivo.query.insight.insight_query_builder import get_sample_value_for_input
from visivo.query.input_validator import get_input_options
from visivo.query.patterns import extract_input_accessors, replace_input_accessors
from visivo.server.source_resolution import find_input
from visivo.server.services.insight_draft_helpers import (
    build_schema_overrides,
    extract_model_not_run_name,
    is_model_not_run_error,
)


class DraftInsightError(Exception):
    """The preview cannot run, with the HTTP status and payload the view sends."""

    def __init__(self, status, payload):
        super().__init__(payload.get("error", "draft insight failed"))
        self.status = status
        self.payload = payload


def execute_draft_insight(
    flask_app,
    output_dir,
    insight_config,
    draft_models=(),
    draft_metrics=(),
    draft_dimensions=(),
    model_schemas=None,
    max_rows=None,
    timeout_s=None,
):
    """``{columns, rows, row_count, truncated, execution_time_ms, props_mapping,
    static_props, props_slices, split_key, type, models}`` or ``DraftInsightError``."""
    try:
        project, dag, insight = build_draft_overlay(
            flask_app,
            insight_config,
            draft_models=list(draft_models or []),
            draft_metrics=list(draft_metrics or []),
            draft_dimensions=list(draft_dimensions or []),
        )
    except DraftOverlayError as e:
        raise DraftInsightError(400, {"error": str(e)})
    except Exception as e:
        Logger.instance().error(f"execute-draft: overlay build failed: {e}")
        raise DraftInsightError(400, {"error": str(e)})

    schema_overrides = build_schema_overrides(dag, model_schemas or {})
    run_output_dir = f"{output_dir}/{DEFAULT_RUN_ID}"

    # A relation-join insight spans more than one model; the built pre_query
    # embeds every model's CTE, so they must all resolve to ONE source.
    try:
        dependent_models = insight.get_all_dependent_models(dag)
        source_names = {
            src.name
            for src in (get_source_for_model(m, dag, run_output_dir) for m in dependent_models)
            if src
        }
    except Exception as e:
        raise DraftInsightError(400, {"error": str(e)})
    if len(source_names) > 1:
        raise DraftInsightError(
            400,
            {
                "error": (
                    f"Insight '{insight.name}' references models from more than one "
                    f"source ({', '.join(sorted(source_names))}) and cannot be "
                    "previewed server-side."
                ),
                "error_type": "multi_source",
            },
        )

    try:
        query_info = insight.get_query_info(
            dag,
            run_output_dir,
            schema_overrides=schema_overrides or None,
            force_dynamic=False,
        )
    except Exception as e:
        message = str(e)
        if is_model_not_run_error(message):
            raise DraftInsightError(
                422,
                {
                    "error": message,
                    "error_type": "model_not_run",
                    "model": extract_model_not_run_name(message),
                },
            )
        Logger.instance().error(f"execute-draft: query build failed: {e}")
        raise DraftInsightError(400, {"error": message})

    # A dynamic insight (one that still references an Input) has no
    # pre_query: its placeholders are filled in the browser.
    if query_info.pre_query is None:
        raise DraftInsightError(
            409,
            {
                "error": "Insight query is dynamic (references an input); cannot execute server-side",
                "error_type": "requires_client_lane",
            },
        )

    try:
        source = insight.get_dependent_source(dag, run_output_dir)
    except Exception as e:
        raise DraftInsightError(400, {"error": str(e)})

    try:
        result = execute_and_get_result(
            source=source, sql=query_info.pre_query, max_rows=max_rows, timeout_s=timeout_s
        )
    except Exception as e:
        Logger.instance().error(f"execute-draft: source execution failed: {e}")
        raise DraftInsightError(400, {"error": str(e)})

    insight_type = insight.props.type.value if insight.props and insight.props.type else None

    return {
        **result,
        "props_mapping": query_info.props_mapping,
        "static_props": query_info.static_props,
        "props_slices": query_info.props_slices,
        "split_key": query_info.split_key,
        "type": insight_type,
        "models": [{"name": m.name, "name_hash": m.name_hash()} for m in dependent_models],
    }


def sql_literal(value):
    """Numbers bare, text quoted — the rule the query builder's own sample
    values follow, so "5" from a string-valued option compares to a numeric
    column the way it does in the viewer."""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    try:
        float(text)
        return text
    except ValueError:
        return "'" + text.replace("'", "''") + "'"


def render_input_value(value, accessor):
    """A selection as it appears in SQL, the way the viewer substitutes it:
    ``.value`` and ``.values`` quoted, ``.min``/``.max``/``.first``/``.last``
    raw. A date range is written ``'${ref(dates).min}'::date`` for that reason,
    and a preview has to fail where the dashboard would."""
    if not isinstance(value, (list, tuple)):
        return sql_literal(value)
    if accessor == "values":
        return ", ".join(sql_literal(v) for v in value)
    if not value:
        return "NULL"
    element = get_accessor_sample_value(accessor, list(value), list(value))
    if accessor in ("min", "max", "first", "last"):
        return element
    return sql_literal(element)


def all_options(input_obj, output_dir):
    """Every option of a list-based multi-select, or ``None`` when they cannot be
    read (a range input, or a query whose options have not been run)."""
    if isinstance(input_obj.options, list) and input_obj.options:
        return list(input_obj.options)
    if output_dir is None or getattr(input_obj, "range", None):
        return None
    try:
        return get_input_options(input_obj, output_dir) or None
    except (FileNotFoundError, ValueError):
        return None


def default_selection(input_obj, output_dir=None):
    """What the viewer selects on first load, when the input states it as
    literals: a single-select's ``value``, a multi-select's ``values``, or a
    range's ``[start, end]``. A multi-select whose default is ``values: all``,
    or that has none, selects every option. ``None`` when the default is a
    query or absent.

    The parse-time sampler is not a stand-in for this: it exists to make SQL
    parse, so it returns the default ``start`` for both ``.min`` and ``.max`` of
    a date range, and a preview filtered on it returned the wrong window.
    """

    def literal(value):
        return isinstance(value, (str, int, float, bool)) and not (
            isinstance(value, str) and value.lstrip().startswith("?{")
        )

    default = getattr(getattr(input_obj, "display", None), "default", None)
    if isinstance(input_obj, MultiSelectInput) and (
        default is None or getattr(default, "values", None) == "all"
    ):
        return all_options(input_obj, output_dir)
    if default is None:
        return None
    value = getattr(default, "value", None)
    if literal(value):
        return value
    values = getattr(default, "values", None)
    if isinstance(values, list) and all(literal(v) for v in values):
        return values
    start, end = getattr(default, "start", None), getattr(default, "end", None)
    if literal(start) and literal(end):
        return [start, end]
    return None


def substitute_inputs(flask_app, node, input_values, substituted):
    """``node`` with every ``${ref(input).accessor}`` replaced by a concrete
    value: the caller's, else the input's default, else its first option.
    ``substituted`` collects ``{input: {accessor: rendered}}``; references to
    anything that is not an input are left alone."""
    rendered_for = {}

    def rendered(name, accessor):
        key = (name, accessor)
        if key not in rendered_for:
            input_obj = find_input(flask_app, name)
            if input_obj is None:
                rendered_for[key] = None
            elif name in input_values:
                rendered_for[key] = render_input_value(input_values[name], accessor)
            elif default_selection(input_obj, flask_app.output_dir) is not None:
                rendered_for[key] = render_input_value(
                    default_selection(input_obj, flask_app.output_dir), accessor
                )
            else:
                rendered_for[key] = str(
                    get_sample_value_for_input(input_obj, flask_app.output_dir, accessor)
                )
        return rendered_for[key]

    def walk(node):
        if isinstance(node, dict):
            return {k: walk(v) for k, v in node.items()}
        if isinstance(node, list):
            return [walk(v) for v in node]
        if not isinstance(node, str) or not extract_input_accessors(node):
            return node
        hits = []

        def replacer(name, accessor):
            value = rendered(name, accessor)
            if value is None:
                return "${ref(" + name + ")." + accessor + "}"
            hits.append(name)
            substituted.setdefault(name, {})[accessor] = value
            return value

        replaced = replace_input_accessors(node, replacer)
        whole = node.strip()
        # A prop that IS the placeholder (mode: ${ref(t).value}) wants the bare
        # value, not a SQL literal.
        if hits and whole.startswith("${") and whole.endswith("}") and len(hits) == 1:
            return replaced.strip().strip("'")
        return replaced

    return walk(node)
