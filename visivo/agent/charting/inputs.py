"""Turn shape cards into Inputs and the interactions that wire them
(VIS-1441).

Deterministic over ``rules/interactivity.yml``: a card matches the first rule
that admits its role and cardinality; the input it yields is validated
against the Input models before it is returned; every insight that reads the
column gets the same interaction, because a half-wired filter is the failure
agents produce unaided. ``check_wiring`` finds that failure in a dashboard
after the fact.
"""

import datetime as _dt
import math
import re
from typing import Any, Dict, List, Optional

import yaml
from pydantic import BaseModel, ConfigDict, Field

from visivo.agent.charting.rules import load_interactivity
from visivo.agent.charting.schema import ShapeCard
from visivo.models.inputs.types.multi_select import MultiSelectInput
from visivo.models.inputs.types.single_select import SingleSelectInput

GRAIN_DAYS = {
    "second": 1 / 86400,
    "minute": 1 / 1440,
    "hour": 1 / 24,
    "day": 1,
    "week": 7,
    "month": 30,
    "quarter": 91,
    "year": 365,
}

# Which roles rank first when more inputs qualify than a page should carry.
ROLE_PRIORITY = {
    "time": 0,
    "categorical": 1,
    "geo_region": 1,
    "boolean": 2,
    "numeric_discrete": 3,
    "numeric_continuous": 4,
}


class InputsError(ValueError):
    """Input the caller can fix."""


class CandidateInsight(BaseModel):
    """What ``recommend_inputs`` needs to know about an insight: the model it
    reads, the columns it uses, and (optionally) the chart it is drawn in and
    the family, so pattern inputs can find their targets."""

    model_config = ConfigDict(extra="forbid")

    name: str
    model: str
    columns: List[str] = Field(default_factory=list)
    chart: Optional[str] = None
    family: Optional[str] = None
    measure: Optional[str] = None  # the y expression a sort_direction input orders by


class InputCard(ShapeCard):
    """A shape card plus the model it came from."""

    model: str


def snake(name):
    """``Order Region`` → ``order_region``: the viewer substitutes ``\\w+``
    names only, so a hyphen would reach the chart as literal text."""
    cleaned = re.sub(r"[^0-9a-zA-Z]+", "_", str(name)).strip("_").lower()
    if not cleaned:
        raise InputsError(f"cannot derive an input name from {name!r}")
    if cleaned[0].isdigit():
        cleaned = f"in_{cleaned}"
    return cleaned


def _nice_step(span, steps=50):
    if span <= 0:
        return 1
    raw = span / steps
    magnitude = 10 ** math.floor(math.log10(raw))
    for factor in (1, 2, 5, 10):
        if raw <= factor * magnitude:
            return factor * magnitude
    return 10 * magnitude  # pragma: no cover - the loop always returns


def _num(value):
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _fmt(value):
    """Numbers as the viewer stores option strings: no trailing .0."""
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def _date(value):
    if value is None:
        return None
    text = str(value)[:10]
    try:
        return _dt.date.fromisoformat(text)
    except ValueError:
        return None


def _top_values(card, limit):
    seen = []
    for top in card.top_n:
        text = _fmt(top.value) if top.value is not None else None
        if text is not None and text not in seen:
            seen.append(text)
        if len(seen) == limit:
            break
    return seen


class _Builder:
    def __init__(self, rules, insights, warnings):
        self.rules = rules
        self.insights = insights
        self.warnings = warnings

    # -- options and defaults ---------------------------------------------

    def options(self, card, shape):
        src = shape.options
        if src == "static":
            return {"options": list(shape.static_options)}
        if src in ("from_top_n", "sorted_distinct"):
            values = _top_values(card, limit=max(card.cardinality, 2))
            if len(values) < 2:
                return None
            if src == "sorted_distinct":
                values = sorted(values, key=lambda v: (_num(v) is None, _num(v) or 0, v))
            return {"options": values}
        if src == "query_distinct":
            return {"options": f"?{{ SELECT DISTINCT {card.column} FROM ${{ref({card.model})}} }}"}
        if src == "numeric_range":
            lo, hi = _num(card.stats and card.stats.min), _num(card.stats and card.stats.max)
            if lo is None or hi is None or hi <= lo:
                return None
            step = _nice_step(hi - lo)
            return {"range": {"start": _fmt(lo), "end": _fmt(hi), "step": _fmt(step)}}
        if src == "date_range":
            lo, hi = _date(card.stats and card.stats.min), _date(card.stats and card.stats.max)
            if lo is None or hi is None or hi < lo:
                return None
            return {"range": {"start": lo.isoformat(), "end": hi.isoformat(), "step": "1 day"}}
        return None  # pragma: no cover - every OptionsSource is handled above

    def default(self, card, rule, options):
        kind = rule.default
        if kind == "first_option":
            return {"value": options["options"][0]}
        if kind == "top_value":
            top = _top_values(card, limit=1)
            if top:
                return {"value": top[0]}
            return (
                {"value": options["options"][0]}
                if isinstance(options.get("options"), list)
                else None
            )
        if kind == "top_values":
            top = _top_values(card, limit=5)
            return {"values": top} if top else None
        if kind == "median":
            opts = options["options"]
            median = _num(card.stats and card.stats.median)
            if median is None:
                return {"value": opts[len(opts) // 2]}
            return {"value": min(opts, key=lambda v: abs((_num(v) or 0) - median))}
        if kind == "full_span":
            return {"start": options["range"]["start"], "end": options["range"]["end"]}
        if kind == "recent_window":
            end = _date(options["range"]["end"])
            start_all = _date(options["range"]["start"])
            days = (
                GRAIN_DAYS.get(card.time_grain or "day", 1)
                * self.rules.design_rules.time_default_min_points
            )
            start = max(start_all, end - _dt.timedelta(days=math.ceil(days)))
            return {"start": start.isoformat(), "end": end.isoformat()}
        return None  # pragma: no cover - every DefaultRule is handled above

    # -- one card → one input ----------------------------------------------

    def build(self, card, rule):
        shape = rule.input
        options = self.options(card, shape)
        if options is None:
            return None, f"{card.column}: not enough statistics to build a {shape.display} input"
        default = self.default(card, rule, options)
        if default is None:
            return None, f"{card.column}: no default could be derived, and every input needs one"
        name = snake(card.column)
        spec = {
            "name": name,
            "label": card.column.replace("_", " ").title(),
            "type": shape.type,
            **options,
            "display": {"type": shape.display, "default": default},
        }
        model_cls = SingleSelectInput if shape.type == "single-select" else MultiSelectInput
        model_cls(**spec)  # raises on a shape the project would refuse
        wired, unwired = self.wire(card, rule, name)
        return {
            "name": name,
            "column": card.column,
            "model": card.model,
            "input": spec,
            "input_yaml": yaml.safe_dump({"inputs": [spec]}, sort_keys=False, allow_unicode=True),
            "display": shape.display,
            "default": default,
            "accessor": rule.accessor,
            "wiring": wired,
            "why": rule.why,
            "warnings": list(rule.warnings) + unwired,
            "pattern": (
                "global_filter" if len(wired) > 1 else "chart_local_filter" if wired else "unwired"
            ),
        }, None

    def wire(self, card, rule, name):
        expression = rule.wiring.expression.replace(
            "${ref(M).C}", f"${{ref({card.model}).{card.column}}}"
        ).replace("${ref(I)", f"${{ref({name})")
        wired, unwired = [], []
        for insight in self.insights:
            if insight.model != card.model:
                continue
            if card.column in insight.columns:
                wired.append(
                    {
                        "insight": insight.name,
                        "interaction": rule.wiring.interaction,
                        "expression": expression,
                    }
                )
            else:
                unwired.append(
                    f"{insight.name} reads {card.model} but not {card.column}; it will show unfiltered totals beside filtered charts"
                )
        return wired, unwired


def _parse_cards(cards):
    parsed = []
    for raw in cards:
        if isinstance(raw, InputCard):
            parsed.append(raw)
            continue
        if not isinstance(raw, dict) or "model" not in raw:
            raise InputsError("each card needs a 'model' alongside its shape-card fields")
        parsed.append(InputCard(**raw))
    return parsed


def _parse_insights(insights):
    return [i if isinstance(i, CandidateInsight) else CandidateInsight(**i) for i in insights or []]


BUCKET_ORDER = {"one": 0, "few": 1, "some": 2, "many": 3, "high": 4}


def _priority(entry, card):
    """Time first, then categoricals (smaller lists first), then numbers;
    within a tie the input that drives more insights wins."""
    return (
        ROLE_PRIORITY.get(card.role, 9),
        BUCKET_ORDER.get(card.cardinality_bucket, 9),
        -len(entry["wiring"]),
        card.null_pct,
        card.column,
    )


def _pattern_inputs(rules, cards, insights, intent, warnings):
    """Inputs that come from the user's intent rather than from a column."""
    out = []
    if intent == "rank":
        ranked = [i for i in insights if i.family == "bar" and i.measure]
        if ranked:
            name = "sort_direction"
            spec = {
                "name": name,
                "label": "Sort",
                "type": "single-select",
                "options": ["DESC", "ASC"],
                "display": {"type": "tabs", "default": {"value": "DESC"}},
            }
            SingleSelectInput(**spec)
            out.append(
                {
                    "name": name,
                    "column": None,
                    "model": None,
                    "input": spec,
                    "input_yaml": yaml.safe_dump({"inputs": [spec]}, sort_keys=False),
                    "display": "tabs",
                    "default": {"value": "DESC"},
                    "accessor": "value",
                    "wiring": [
                        {
                            "insight": i.name,
                            "interaction": "sort",
                            "expression": f"{i.measure} ${{ref({name}).value}}",
                        }
                        for i in ranked
                    ],
                    "why": rules.pattern("sort_direction").trigger,
                    "warnings": [rules.pattern("sort_direction").note],
                    "pattern": "sort_direction",
                }
            )
    if intent == "trend":
        time_cards = [
            c for c in cards if c.role == "time" and c.time_grain in ("day", "hour", "week")
        ]
        trend_insights = [
            i
            for i in insights
            if i.family in ("line", "area") and any(c.column in i.columns for c in time_cards)
        ]
        if time_cards and trend_insights:
            card = time_cards[0]
            grains = [
                g for g in ("day", "week", "month") if GRAIN_DAYS[g] >= GRAIN_DAYS[card.time_grain]
            ]
            name = "grain"
            spec = {
                "name": name,
                "label": "Grain",
                "type": "single-select",
                "options": grains,
                "display": {"type": "tabs", "default": {"value": grains[0]}},
            }
            SingleSelectInput(**spec)
            out.append(
                {
                    "name": name,
                    "column": card.column,
                    "model": card.model,
                    "input": spec,
                    "input_yaml": yaml.safe_dump({"inputs": [spec]}, sort_keys=False),
                    "display": "tabs",
                    "default": {"value": grains[0]},
                    "accessor": "value",
                    "wiring": [
                        {
                            "insight": i.name,
                            "interaction": "prop",
                            "path": "x",
                            "expression": f"date_trunc('${{ref({name}).value}}', ${{ref({card.model}).{card.column}}})",
                        }
                        for i in trend_insights
                    ],
                    "why": "a trend at day grain reads differently by week and month; one chart serves all three",
                    "warnings": [
                        "an input inside `x` is unverified end to end; preview the insight with input_values before writing it"
                    ],
                    "pattern": "grain_switcher",
                }
            )
    return out


def recommend_inputs(cards, candidate_insights=None, intent=None, max_inputs=None, rules=None):
    """``{inputs, dropped, layout_inputs, warnings}`` for a set of shape
    cards (each with its ``model``) and the insights that might read them."""
    rules = rules or load_interactivity()
    cards = _parse_cards(cards)
    insights = _parse_insights(candidate_insights)
    warnings = []
    builder = _Builder(rules, insights, warnings)
    cap = max_inputs or rules.design_rules.max_inputs_per_dashboard
    built, dropped = [], []
    for card in cards:
        rule = rules.rule_for(card)
        if rule is None or rule.input == "none":
            dropped.append(
                {"column": card.column, "why": rule.why if rule else "no rule admits this card"}
            )
            continue
        entry, why_not = builder.build(card, rule)
        if entry is None:
            dropped.append({"column": card.column, "why": why_not})
            continue
        if insights and not entry["wiring"]:
            dropped.append(
                {
                    "column": card.column,
                    "why": "no candidate insight reads this column, so the input would control nothing",
                }
            )
            continue
        built.append((entry, card))
    built.sort(key=lambda pair: _priority(*pair))
    # Intent-driven controls first: the user asked for the thing they switch.
    inputs = _pattern_inputs(rules, cards, insights, intent, warnings) + [
        entry for entry, _ in built
    ]
    if len(inputs) > cap:
        for entry in inputs[cap:]:
            dropped.append(
                {
                    "column": entry["name"],
                    "why": f"over the {cap}-input cap; the page would push its charts below the fold",
                }
            )
        warnings.append(f"{len(inputs)} inputs qualified; kept the {cap} most useful")
        inputs = inputs[:cap]
    names = [i["name"] for i in inputs]
    if len(names) != len(set(names)):
        raise InputsError(
            f"two columns map to the same input name: {sorted({n for n in names if names.count(n) > 1})}"
        )
    if insights and not inputs:
        warnings.append(
            "no input qualified: a static dashboard should be a conscious choice, say so to the user"
        )
    layout_inputs = []
    for entry in inputs:
        charts = {
            i.chart
            for i in insights
            if i.name in {w["insight"] for w in entry["wiring"]} and i.chart
        }
        hints = (
            {"chart": next(iter(charts))} if len(charts) == 1 and len(entry["wiring"]) == 1 else {}
        )
        layout_inputs.append({"name": entry["name"], "hints": hints})
    return {
        "inputs": inputs,
        "dropped": dropped,
        "layout_inputs": layout_inputs,
        "warnings": warnings,
    }


def check_wiring(inputs, insights):
    """The half-wired-filter check: for each input that filters a column,
    every insight on that model which reads the column must reference the
    input. ``inputs`` are ``[{name, model, column}]``; ``insights`` are
    ``[{name, model, columns, interactions: [str]}]``. Returns the gaps."""
    gaps = []
    for input_ in inputs:
        model, column, name = input_.get("model"), input_.get("column"), input_["name"]
        if not model or not column:
            continue
        for insight in insights:
            if insight.get("model") != model or column not in insight.get("columns", []):
                continue
            text = " ".join(str(i) for i in insight.get("interactions", []) or [])
            if f"ref({name})" not in text:
                gaps.append(
                    {
                        "input": name,
                        "insight": insight["name"],
                        "reason": f"{insight['name']} reads {model}.{column} but has no interaction referencing ${{ref({name})}}; it will show unfiltered data beside filtered charts",
                    }
                )
    return gaps
