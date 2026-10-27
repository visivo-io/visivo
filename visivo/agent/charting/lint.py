"""Valid-but-wrong configs, caught when the agent writes them.

A config that validates can still render wrong, and a skill only helps an
agent that reads it. Every client reads a write's result, so these checks
return their findings there as ``warnings``. Each one is a defect the agent
eval found repeatedly; none of them refuses the write.
"""

import re
from datetime import date, datetime

import sqlglot
from sqlglot import exp

from visivo.query.patterns import extract_ref_names

# Plotly's named scales that run dark to light: the highest values come out palest.
DARK_TO_LIGHT = {"Blues", "Greens", "Greys", "YlGnBu", "YlOrRd"}
# The one single-hue scale that already runs light to dark, so reversing it inverts it.
LIGHT_TO_DARK = {"Reds"}
COLOR_SCALED = {
    "heatmap",
    "contour",
    "histogram2d",
    "histogram2dcontour",
    "choropleth",
    "choroplethmap",
    "choroplethmapbox",
    "densitymap",
    "densitymapbox",
}
_RANGE_ACCESSOR = re.compile(r"(?<!')\$\{\s*ref\(\s*([\w-]+)\s*\)\.(min|max)\s*\}(?!')")
_REF = re.compile(r"\$\{\s*ref\(")
_COLUMN_IN_REF = re.compile(r"\$\{\s*ref\(\s*([\w-]+)\.([\w.-]+)\s*\)")
_BARE_COLUMN = re.compile(r"\s*\$\{\s*ref\(\s*([\w-]+)\s*\)\.[\w.-]+\s*\}\s*")
_WORD = re.compile(r"[A-Za-z]{4,}")
_QUERY = re.compile(r"\s*\?\{\s*(.*?)\s*\}\s*", re.DOTALL)
_TIMES_100 = re.compile(r"\*\s*100(?:\.0*)?(?![\w.])|(?<![\w.])100(?:\.0*)?\s*\*")
_FIELD_REF = re.compile(r"\$\{\s*ref\(\s*([\w-]+)\s*\)(?:\.([\w-]+))?\s*\}")
# A d3 number format that ends in %, as opposed to a date format such as %Y.
_PERCENT_FORMAT = re.compile(r"[^%]*%")
# The viewer's date expressions (utils/dateExpressions.js): an anchor, then an optional offset.
_UNITS = r"(?:days?|weeks?|months?|quarters?|years?)"
_DATE_EXPRESSION = re.compile(
    r"(?:today|now|(?:start|end)_of_(?:week|month|quarter|year))" rf"(?:\s*[+-]\s*\d+\s*{_UNITS})?",
    re.IGNORECASE,
)
_STEP = re.compile(rf"\d+\s*{_UNITS}", re.IGNORECASE)
# Plotly puts a `~` in front of a format that starts with a sign and holds an
# f, s or p, which d3 then rejects, so the number prints raw.
_UNREADABLE_FORMAT = re.compile(r"^[-+( #].*[fps]")
FORMAT_KEYS = {"valueformat", "tickformat", "hoverformat"}
# Traces whose value axis (y, or x when horizontal) needs a title with its unit.
# A category axis reads from its labels, and a heatmap's measure is its colour bar.
AXIS_TRACES = {"bar", "scatter", "scattergl", "histogram", "box", "violin", "waterfall"}


def warnings(app, type_key, config):
    """Warnings for one config about to be written; ``[]`` when it reads right."""
    if type_key == "insights":
        return _insight(app, config)
    if type_key == "tables":
        return _table(app, config)
    if type_key == "models" and _REF.search(str(config.get("sql") or "")):
        return [
            "A model's SQL runs on its source exactly as written, so `${ref(...)}` does not "
            "resolve there and the model fails to build. Query the source's tables directly, "
            "and join them in this model's SQL."
        ]
    if type_key in ("metrics", "dimensions"):
        return _columns_in_refs(str(config.get("expression") or ""), _singular(type_key))
    if type_key == "dashboards":
        return _dashboard_refs(app, config)
    if type_key == "inputs":
        return _date_range(config)
    if type_key == "charts":
        return (
            _axis_titles(app, config)
            + _formats(config.get("layout"))
            + _layout_inputs(app, config.get("layout"))
        )
    return []


def _insight(app, config):
    found = []
    props = config.get("props") or {}
    text = str(props) + str(config.get("interactions") or "")
    found += _columns_in_refs(text, "insight")
    for key, value in _strings(props):
        bare = _BARE_COLUMN.fullmatch(value)
        if bare and not _is_input(app, bare.group(1)):
            found.append(
                f"`{key}: {value}` sits outside a query, so it is a plain string, the insight "
                f"runs nothing and its chart never loads. Write `{key}: ?{{ {value.strip()} }}`."
            )
    if "?{" in text and not _REF.search(text):
        found.append(
            "The insight references no model, so it has nothing to run and its chart never "
            "loads. Name the model in a query, e.g. `?{ count(${ref(trips).trip_id}) }` instead "
            "of `?{ count(*) }`."
        )
    trace = props.get("type")
    found += _line_order(trace, props, config.get("interactions"))
    scale = props.get("colorscale")
    if trace in COLOR_SCALED and scale in DARK_TO_LIGHT and not props.get("reversescale"):
        found.append(
            f"`colorscale: {scale}` runs dark to light in Plotly, so the highest values come out "
            "palest. Add `reversescale: true`, or use Reds or Viridis."
        )
    if trace in COLOR_SCALED and scale in LIGHT_TO_DARK and props.get("reversescale"):
        found.append(
            f"`colorscale: {scale}` already runs light to dark in Plotly, so `reversescale: "
            "true` makes the highest values palest. Remove `reversescale`."
        )
    if (
        trace in COLOR_SCALED
        and not _title_text(props.get("colorbar"))
        and props.get("showscale") is not False
    ):
        found.append(
            "The colour bar has no title. Name it with its unit (`colorbar.title.text: "
            "'t CO2 per person'`). If one or two values dwarf the rest, cap the scale with "
            "`zmax` near a high percentile so the others stay distinguishable."
        )
    if trace == "indicator":
        found += _indicator(props)
    found += _insight_percent(app, props)
    for interaction in config.get("interactions") or []:
        for expression in interaction.values():
            for name, accessor in _RANGE_ACCESSOR.findall(str(expression)):
                if _is_date_range(app, name):
                    found.append(
                        f"`${{ref({name}).{accessor}}}` is a date and is substituted unquoted, so "
                        f"the database reads it as arithmetic. Write `'${{ref({name}).{accessor}}}'::date`."
                    )
    return found + _formats(props)


def _indicator(props):
    found = []
    number = props.get("number") or {}
    delta = props.get("delta") or {}
    cells = {
        "value": props.get("value"),
        "delta.reference": delta.get("reference"),
        "gauge.threshold.value": ((props.get("gauge") or {}).get("threshold") or {}).get("value"),
    }
    for key, value in cells.items():
        if isinstance(value, str) and _QUERY.fullmatch(value):
            found.append(
                f"`{key}: {value.strip()}` passes the whole column, so the indicator shows a dash. "
                f"Pick one cell: `{key}: {value.strip()}[0]`."
            )
    if not number.get("valueformat"):
        found.append(
            "The indicator has no `number.valueformat`; set one (`,.0f`, `$,.0f`, `.1%`) so the "
            "value does not print raw, e.g. 8.000414846174507."
        )
    prefix = str(number.get("prefix") or "")
    if _WORD.search(prefix):
        found.append(
            f"`number.prefix: {prefix}` prints against the value with no gap (`{prefix}12,541`). "
            f"Put the label in `title.text: {prefix.strip()}` and keep the prefix for a unit "
            "such as `$`."
        )
    if delta.get("relative") and not delta.get("valueformat"):
        found.append(
            "`delta.relative: true` with no `delta.valueformat` prints the change unrounded "
            "(1.300485%). Set `delta.valueformat: '.1%'`."
        )
    return found


def _line_order(trace, props, interactions):
    mode = str(props.get("mode") or "")
    query = _QUERY.fullmatch(str(props.get("x") or ""))
    sorted_ = any(isinstance(i, dict) and "sort" in i for i in interactions or [])
    if trace not in ("scatter", "scattergl") or "lines" not in mode or not query or sorted_:
        return []
    return [
        f"`mode: {mode}` joins the points in row order, not x order, so the line zig-zags. "
        f"Add `- sort: ?{{ {query.group(1)} ASC }}` under `interactions`."
    ]


def _formats(node):
    if isinstance(node, list):
        return [w for item in node for w in _formats(item)]
    if not isinstance(node, dict):
        return []
    found = []
    for key, value in node.items():
        if key in FORMAT_KEYS and isinstance(value, str) and _UNREADABLE_FORMAT.match(value):
            found.append(
                f"Plotly cannot read `{key}: '{value}'` (a sign before an f, s or p format) and "
                f"prints the raw number, e.g. 8.000414846174507. Drop the sign (`{value[1:]}`), "
                "or show a change as the indicator's `delta` against a `reference`."
            )
        else:
            found.extend(_formats(value))
    return found


def _layout_inputs(app, layout):
    if getattr(app, "input_manager", None) is None:
        return []
    found = []
    for path, value in _strings(layout, "layout"):
        for name in sorted(extract_ref_names(value)):
            if not _is_input(app, name):
                found.append(
                    f"`{path}` refers to `${{ref({name})}}`, but no input named `{name}` exists, "
                    "so the text shows the raw reference. Write the input first with "
                    "write_input, or fix the name."
                )
    return found


def _axis_titles(app, config):
    manager = getattr(app, "insight_manager", None)
    if manager is None:
        return []
    names = set()
    for ref in config.get("insights") or []:
        names |= extract_ref_names(ref if isinstance(ref, str) else str(ref))
    value_axes = set()
    for name in names:
        props = getattr(manager.get(name), "props", None)
        if _plain(getattr(props, "type", None)) in AXIS_TRACES:
            horizontal = _plain(getattr(props, "orientation", None)) == "h"
            value_axes.add("xaxis" if horizontal else "yaxis")
    layout = config.get("layout") or {}
    missing = sorted(axis for axis in value_axes if not _title_text(layout.get(axis)))
    if not missing:
        return []
    return [
        f"The chart's value axis ({' and '.join(missing)}) has no title. Name it with its unit, "
        f"e.g. `layout.{missing[0]}.title.text: 'Revenue ($)'`, so the reader knows what is measured."
    ]


def _plain(value):
    return getattr(value, "value", value)


def _title_text(axis):
    title = (axis or {}).get("title") if isinstance(axis, dict) else None
    text = title.get("text") if isinstance(title, dict) else title
    return isinstance(text, str) and text.strip() != ""


ITEM_MANAGERS = {
    "chart": "chart_manager",
    "table": "table_manager",
    "input": "input_manager",
    "markdown": "markdown_manager",
}


def _dashboard_refs(app, config):
    found = []
    for kind, name in dict.fromkeys(_item_refs(config.get("rows") or [])):
        manager = getattr(app, ITEM_MANAGERS[kind], None)
        if manager is None or manager.get(name) is not None:
            continue
        insights = getattr(app, "insight_manager", None)
        if kind == "chart" and insights is not None and insights.get(name) is not None:
            found.append(
                f"`{name}` is an insight, not a chart, so its slot shows 'Chart not found'. "
                f"Wrap it with write_chart (`insights: ['${{ref({name})}}']`) and place the chart."
            )
        else:
            found.append(f"The dashboard places {kind} `{name}`, which does not exist.")
    return found


def _item_refs(rows):
    for row in rows:
        for item in (row or {}).get("items") or []:
            for kind in ITEM_MANAGERS:
                value = item.get(kind)
                if isinstance(value, str):
                    for name in extract_ref_names(value):
                        yield kind, name
            yield from _item_refs(item.get("rows") or [])


def _table(app, config):
    entries = [entry for key in ("columns", "rows", "values") for entry in config.get(key) or []]
    found = []
    unaliased = [
        value
        for value in map(field_value, config.get("columns") or [])
        if isinstance(value, str) and _REF.search(value) and " as " not in value.lower()
    ]
    if unaliased:
        found.append(
            "Alias every column with a readable label and its unit "
            f'(`{unaliased[0]} as "Label"`); unaliased headers show raw or hashed names.'
        )
    for entry in entries:
        if not isinstance(entry, dict) or not _PERCENT_FORMAT.fullmatch(str(entry.get("format"))):
            continue
        source = _times_100(app, str(entry.get("value") or ""))
        if source:
            found.append(_double_percent(f"`format: '{entry['format']}'`", source))
    return found


def _insight_percent(app, props):
    formats = [
        f"`{key}: '{value}'`"
        for key, value in _strings(props)
        if key.rsplit(".", 1)[-1] in FORMAT_KEYS and _PERCENT_FORMAT.fullmatch(value)
    ]
    if not formats:
        return []
    for _key, value in _strings(props):
        source = "?{" in value and _times_100(app, value)
        if source:
            return [_double_percent(formats[0], source)]
    return []


def _date_range(config):
    display = config.get("display") or {}
    if display.get("type") != "date-range":
        return []
    bounds = {f"range.{key}": (config.get("range") or {}).get(key) for key in ("start", "end")} | {
        f"display.default.{key}": (display.get("default") or {}).get(key)
        for key in ("start", "end")
    }
    found = [
        f"`{path}: {value}` is not a date, so the input offers no dates and every insight "
        "it filters fails. Write an ISO date (`2024-01-01`), a date expression "
        "(`today - 30 days`, `start_of_month`) or a query."
        for path, value in bounds.items()
        if value is not None and not _date_bound(value)
    ]
    step = (config.get("range") or {}).get("step")
    if isinstance(step, str) and "?{" not in step and not _STEP.fullmatch(step.strip()):
        found.append(
            f"`range.step: {step}` is not a step the date picker reads. Write a count and a "
            "unit, e.g. `1 day` or `1 week`."
        )
    return found


def _date_bound(value):
    if not isinstance(value, str):
        return False
    text = value.strip()
    if "?{" in text or _DATE_EXPRESSION.fullmatch(text):
        return True
    try:
        datetime.fromisoformat(text)
        return True
    except ValueError:
        return False


def field_value(entry):
    """A table entry's expression: the string, or a formatted entry's `value`."""
    return entry.get("value") if isinstance(entry, dict) else entry


def _double_percent(fmt, source):
    return (
        f"{fmt} multiplies by 100, and {source} already does, so 0.21 shows as 2100%. Drop "
        "the `* 100` and keep the value a fraction, or keep it and format with `.1f` and a "
        "`%` label."
    )


def _times_100(app, expression):
    """Where an expression is already scaled to a percentage, or ``None``."""
    if _TIMES_100.search(expression):
        return "the expression"
    for name, column in _FIELD_REF.findall(expression):
        model = _get(app, "model_manager", name) if column else None
        if model is not None and _column_times_100(str(getattr(model, "sql", "") or ""), column):
            return f"the SQL of model `{name}` for `{column}`"
        field_name = column or name
        for manager in ("metric_manager", "dimension_manager"):
            field = _get(app, manager, field_name)
            if field is not None and _TIMES_100.search(str(getattr(field, "expression", "") or "")):
                return f"`{field_name}`"
    return None


def _column_times_100(sql, column):
    try:
        tree = sqlglot.parse_one(sql)
    except sqlglot.errors.SqlglotError:
        return False
    return any(
        alias.alias.lower() == column.lower() and _TIMES_100.search(alias.this.sql())
        for alias in tree.find_all(exp.Alias)
    )


def _get(app, manager, name):
    manager = getattr(app, manager, None)
    return manager.get(name) if manager is not None else None


def _columns_in_refs(text, kind):
    return [
        f"`${{ref({model}.{column})}}` puts the column inside the ref, so it names no object "
        f"and the {kind} never runs. Write `${{ref({model}).{column}}}`."
        for model, column in dict.fromkeys(_COLUMN_IN_REF.findall(text))
    ]


def _singular(type_key):
    return type_key[:-1]


def _strings(node, path=""):
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for key, value in node.items():
            yield from _strings(value, f"{path}.{key}" if path else str(key))
    elif isinstance(node, list):
        for value in node:
            yield from _strings(value, path)


def _is_input(app, name):
    manager = getattr(app, "input_manager", None)
    return manager is not None and manager.get(name) is not None


def _is_date_range(app, name):
    manager = getattr(app, "input_manager", None)
    input_obj = manager.get(name) if manager is not None else None
    if input_obj is None:
        return False
    bounds = [
        getattr(getattr(input_obj, "range", None), "start", None),
        getattr(getattr(getattr(input_obj, "display", None), "default", None), "start", None),
    ]
    return any(_iso_date(b) for b in bounds)


def _iso_date(value):
    if not isinstance(value, str):
        return False
    try:
        date.fromisoformat(value[:10])
        return True
    except ValueError:
        return False
