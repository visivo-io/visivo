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


def _time_dims(request):
    return [d for d in request.dimensions if d.role == "time"]


def _series_count(request):
    """One series per value of the smallest non-axis categorical dimension,
    or one when every dimension is the axis."""
    others = [d for d in request.dimensions if d.role != "time"]
    if _time_dims(request):
        candidates = others
    else:
        candidates = others[1:]
    if not candidates:
        return 1
    return max(max(d.cardinality, 1) for d in candidates)


def _gate(rule, request):
    """``None`` if the family is allowed, else the reason it is not."""
    gates = rule.hard_gates
    time_dims = _time_dims(request)
    if gates.time_required and not time_dims:
        return "needs a time dimension"
    if gates.time_forbidden and time_dims:
        return "a time axis belongs on a line"
    if not gates.metrics.admits(len(request.metrics)):
        return f"takes {gates.metrics.min}–{gates.metrics.max or '∞'} metrics"
    if not gates.dimensions.admits(len(request.dimensions)):
        return f"takes {gates.dimensions.min}–{gates.dimensions.max or '∞'} dimensions"
    if gates.dimension_roles:
        off_role = [
            d.column
            for d in request.dimensions
            if d.role != "time" and d.role not in gates.dimension_roles
        ]
        if off_role:
            return f"{off_role[0]} is not one of {', '.join(gates.dimension_roles)}"
    if gates.min_time_points and time_dims:
        points = time_dims[0].time_span_points or time_dims[0].cardinality
        if points < gates.min_time_points:
            return f"fewer than {gates.min_time_points} time points"
    if gates.intents and request.intent not in gates.intents:
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


def _score(rule, request, series):
    """Additive adjustments, each with its reason. The ``when`` strings are
    the small vocabulary the scaffold needs; VIS-1428 widens it."""
    total, why = 0.0, []
    ideal = rule.limits.series_ideal
    high_card = any(
        d.role == "identifier" or (d.role in _LOOKUP_ROLES and d.cardinality_bucket == "high")
        for d in request.dimensions
    )
    few_dims = [d for d in request.dimensions if d.cardinality_bucket in ("one", "few")]
    for adjustment in rule.score:
        when = adjustment.when
        fires = (
            when == f"intent == {request.intent}"
            or (when.startswith("intent in (") and request.intent in when[11:-1].split(", "))
            or (when == "series <= ideal" and ideal is not None and series <= ideal)
            or (when == "two few dimensions" and len(few_dims) == 2)
            or (when == "identifier or high cardinality" and high_card)
        )
        if fires:
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
