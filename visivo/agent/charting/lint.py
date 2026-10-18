"""Valid-but-wrong configs, caught when the agent writes them.

A config that validates can still render wrong, and a skill only helps an
agent that reads it. Every client reads a write's result, so these checks
return their findings there as ``warnings``. Each one is a defect the agent
eval found repeatedly; none of them refuses the write.
"""

import re
from datetime import date

# Plotly's named scales that run dark to light: the highest values come out palest.
DARK_TO_LIGHT = {"Blues", "Greens", "Greys", "YlGnBu", "YlOrRd"}
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
# Plotly puts a `~` in front of a format that starts with a sign and holds an
# f, s or p, which d3 then rejects, so the number prints raw.
_UNREADABLE_FORMAT = re.compile(r"^[-+( #].*[fps]")
FORMAT_KEYS = {"valueformat", "tickformat", "hoverformat"}


def warnings(app, type_key, config):
    """Warnings for one config about to be written; ``[]`` when it reads right."""
    if type_key == "insights":
        return _insight(app, config)
    if type_key == "tables":
        return _table(config)
    if type_key == "charts":
        return _formats(config.get("layout"))
    return []


def _insight(app, config):
    found = []
    props = config.get("props") or {}
    text = str(props) + str(config.get("interactions") or "")
    if "?{" in text and not _REF.search(text):
        found.append(
            "The insight references no model, so it has nothing to run and its chart never "
            "loads. Name the model in a query, e.g. `?{ count(${ref(trips).trip_id}) }` instead "
            "of `?{ count(*) }`."
        )
    trace = props.get("type")
    scale = props.get("colorscale")
    if trace in COLOR_SCALED and scale in DARK_TO_LIGHT and not props.get("reversescale"):
        found.append(
            f"`colorscale: {scale}` runs dark to light in Plotly, so the highest values come out "
            "palest. Add `reversescale: true`, or use Reds or Viridis."
        )
    if trace == "indicator" and not (props.get("number") or {}).get("valueformat"):
        found.append(
            "The indicator has no `number.valueformat`; set one (`,.0f`, `$,.0f`, `.1%`) so the "
            "value does not print raw, e.g. 8.000414846174507."
        )
    for interaction in config.get("interactions") or []:
        for expression in interaction.values():
            for name, accessor in _RANGE_ACCESSOR.findall(str(expression)):
                if _is_date_range(app, name):
                    found.append(
                        f"`${{ref({name}).{accessor}}}` is a date and is substituted unquoted, so "
                        f"the database reads it as arithmetic. Write `'${{ref({name}).{accessor}}}'::date`."
                    )
    return found + _formats(props)


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


def _table(config):
    unaliased = [
        column
        for column in config.get("columns") or []
        if isinstance(column, str) and _REF.search(column) and " as " not in column.lower()
    ]
    if not unaliased:
        return []
    return [
        "Alias every column with a readable label and its unit "
        f'(`{unaliased[0]} as "Label"`); unaliased headers show raw or hashed names.'
    ]


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
