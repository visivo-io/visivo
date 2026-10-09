"""Rank chart families for a request (VIS-1407 scaffold; VIS-1428 fills it in).

Three stages, each explained in the response: hard gates reject a family
outright, limits try repair transforms in order until the series count fits,
and score adjustments rank what survives. Deterministic by construction —
the same request always ranks the same way — so the golden table in
``tests/agent/charting/test_recommend.py`` is the regression harness for
every rule edit.
"""

from visivo.agent.charting.rules import load_families
from visivo.agent.charting.schema import (
    Recommendation,
    RecommendRequest,
    RecommendResponse,
    Rejection,
)

# Roles whose values a reader looks up by name. A time axis or a continuous
# measure is "high cardinality" too, but that is what a chart is for.
_LOOKUP_ROLES = ("categorical", "text", "geo_region", "geo_point")


def _window(min_max):
    upper = "∞" if min_max.max is None else min_max.max
    return f"{min_max.min}–{upper}"


def _axis(request):
    """The dimension drawn along the x axis: the first ordered one (time
    before numbers), else the first dimension, else ``None``."""
    ordered = [d for d in request.dimensions if d.is_ordered()]
    if ordered:
        return next((d for d in ordered if d.role == "time"), ordered[0])
    return request.dimensions[0] if request.dimensions else None


def _series_count(request):
    """One series per value of the largest non-axis dimension, or one when
    the axis is the only dimension."""
    axis = _axis(request)
    others = [d for d in request.dimensions if d is not axis]
    if not others:
        return 1
    return max(max(d.cardinality, 1) for d in others)


def _gate(rule, request):
    """``None`` if the family is allowed, else the reason it is not."""
    gates = rule.hard_gates
    axis = _axis(request)
    if gates.ordered_axis_required and not (axis and axis.is_ordered()):
        return "needs an ordered axis (time, a number, or a dimension marked ordered)"
    if not gates.metrics.admits(len(request.metrics)):
        return f"takes {_window(gates.metrics)} metrics"
    if not gates.dimensions.admits(len(request.dimensions)):
        return f"takes {_window(gates.dimensions)} dimensions"
    if axis and gates.axis_roles and axis.role not in gates.axis_roles:
        return f"{axis.column} cannot be the axis; needs {', '.join(gates.axis_roles)}"
    if gates.dimension_roles:
        off_role = [
            d.column
            for d in request.dimensions
            if d is not axis and d.role not in gates.dimension_roles
        ]
        if off_role:
            return f"{off_role[0]} is not one of {', '.join(gates.dimension_roles)}"
    if axis and not gates.axis_points.admits(axis.axis_points()):
        return f"needs {_window(gates.axis_points)} axis points, has {axis.axis_points()}"
    if gates.intents and request.intent is not None and request.intent not in gates.intents:
        return f"only for intents {', '.join(gates.intents)}"
    return None


def _repair(rule, series):
    """``(transforms, warning)`` needed to bring ``series`` within limits."""
    limits = rule.limits
    if limits.series_max is None or series <= (limits.series_ideal or limits.series_max):
        return [], None
    if series <= limits.series_max:
        return [], f"{series} series is readable but above the ideal of {limits.series_ideal}"
    if limits.repair:
        return [limits.repair[0]], f"{series} series exceeds {limits.series_max}; repaired"
    return None, f"{series} series exceeds {limits.series_max} and nothing repairs it"


def _fires(when, request, series, ideal):
    """The small ``when`` vocabulary the scaffold needs; VIS-1428 widens it."""
    axis = _axis(request)
    axis_points = axis.axis_points() if axis else 0
    high_card = any(
        d.role == "identifier" or (d.role in _LOOKUP_ROLES and d.cardinality_bucket == "high")
        for d in request.dimensions
    )
    few_dims = [d for d in request.dimensions if d.cardinality_bucket in ("one", "few")]
    if when == f"intent == {request.intent}":
        return True
    if when.startswith("intent in ("):
        return request.intent in when[len("intent in (") : -1].split(", ")
    if when == "series <= ideal":
        return ideal is not None and series <= ideal
    if when == "two few dimensions":
        return len(few_dims) == 2
    if when == "identifier or high cardinality":
        return high_card
    if when == "axis is time":
        return axis is not None and axis.role == "time"
    if when.startswith("axis_points > "):
        return axis_points > int(when[len("axis_points > ") :])
    if when.startswith("dimensions == "):
        return len(request.dimensions) == int(when[len("dimensions == ") :])
    return False


def _score(rule, request, series):
    """Additive adjustments, each with its reason."""
    total, why = 0.0, []
    for adjustment in rule.score:
        if _fires(adjustment.when, request, series, rule.limits.series_ideal):
            total += adjustment.delta
            why.append(adjustment.reason)
    return total, why


def recommend(request, rules=None):
    """Rank the families that admit ``request``, explaining every decision."""
    if not isinstance(request, RecommendRequest):
        request = RecommendRequest(**request)
    rules = rules if rules is not None else load_families()
    series = _series_count(request)
    recommendations, rejected, suggested = [], [], []
    for rule in rules:
        reason = _gate(rule, request)
        if reason:
            rejected.append(Rejection(family=rule.name, reason=reason))
            continue
        transforms, warning = _repair(rule, series)
        if transforms is None:
            rejected.append(Rejection(family=rule.name, reason=warning))
            continue
        score, why = _score(rule, request, series)
        if not why:
            why.append("admitted by its gates")
        warnings = list(rule.warnings) + ([warning] if warning else [])
        if transforms:
            why.append(f"after {transforms[0]}")
            suggested.extend(t for t in transforms if t not in suggested)
        recommendations.append(
            Recommendation(
                family=rule.name,
                trace_type=rule.trace_types[0] if rule.trace_types else None,
                score=round(score - 0.1 * len(transforms), 3),
                why=why,
                encodings=rule.encodings,
                transforms=transforms,
                warnings=warnings,
                pairings=rule.pairings,
                layout=rule.layout,
                skill=rule.skill,
            )
        )
    recommendations.sort(key=lambda r: (-r.score, r.family))
    return RecommendResponse(
        recommendations=recommendations[: request.context.max_results],
        rejected=rejected,
        transforms_suggested=suggested,
    )
