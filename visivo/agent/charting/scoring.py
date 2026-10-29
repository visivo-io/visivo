"""How interesting a candidate insight is, from GROUP BY results the caller
fetched. Pure and total: ``None``, NaN, infinities and non-numbers are
ignored, never raised on. Thresholds come from ``insight_design.yml``."""

import math
import statistics

from visivo.agent.charting.inputs import BUCKET_ORDER
from visivo.agent.charting.rules import load_insight_design, load_interactivity

# Statistical floors, not design thresholds: a line needs three points to be
# fitted, and a lag means nothing until the series holds two cycles of it.
MIN_FIT_POINTS = 3
MIN_CYCLES = 2
# The MAD of a normal sample is 0.6745 standard deviations.
MAD_TO_SD = 0.6745


def _scoring(rules):
    return rules or load_insight_design().scoring


def numbers(values):
    """The finite floats in ``values``, in order; everything else dropped."""
    out = []
    for value in values or []:
        if isinstance(value, bool):
            value = float(value)
        try:
            number = float(value)
        except (TypeError, ValueError):
            continue
        if math.isfinite(number):
            out.append(number)
    return out


def _mean(xs):
    return sum(xs) / len(xs) if xs else 0.0


def _stddev(xs):
    if len(xs) < 2:
        return 0.0
    mean = _mean(xs)
    return math.sqrt(sum((x - mean) ** 2 for x in xs) / len(xs))


def coefficient_of_variation(values):
    """Population stddev over the mean absolute value, in ``[0, ∞)``.
    0 for fewer than two values or all zeros. High when the groups differ."""
    xs = numbers(values)
    scale = _mean([abs(x) for x in xs])
    if len(xs) < 2 or scale == 0:
        return 0.0
    return _stddev(xs) / scale


def variance_score(values):
    """``cov / (1 + cov)``, in ``[0, 1)``: a CoV of 1 scores 0.5."""
    cov = coefficient_of_variation(values)
    return cov / (1 + cov)


def _moments(xs, ys):
    mx, my = _mean(xs), _mean(ys)
    sxx = sum((x - mx) ** 2 for x in xs)
    syy = sum((y - my) ** 2 for y in ys)
    sxy = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    return mx, my, sxx, syy, sxy


def linear_fit(values):
    """``(slope, intercept, r2)`` of the values against their position.
    ``r2`` is in ``[0, 1]``; ``(0, mean, 0)`` for fewer than three values or
    a constant series."""
    ys = numbers(values)
    if len(ys) < MIN_FIT_POINTS:
        return 0.0, _mean(ys), 0.0
    mx, my, sxx, syy, sxy = _moments(range(len(ys)), ys)
    if syy == 0:
        return 0.0, my, 0.0
    slope = sxy / sxx
    r2 = (sxy * sxy) / (sxx * syy)
    return slope, my - slope * mx, max(0.0, min(1.0, r2))


def longest_monotonic_run(values):
    """The longest strictly rising or falling stretch as a share of the
    series, in ``[0, 1]``; 0 for fewer than two values."""
    ys = numbers(values)
    if len(ys) < 2:
        return 0.0
    best = run = 1
    direction = 0
    for prev, cur in zip(ys, ys[1:]):
        step = (cur > prev) - (cur < prev)
        if step and step == direction:
            run += 1
        else:
            run = 2 if step else 1
        direction = step
        best = max(best, run)
    return best / len(ys)


def smoothing_window(grain, points, rules=None):
    """The moving-average width for ``points`` values at ``grain``: about
    the square root of the length, so noise averages out while a V or a
    step survives, rounded up to whole cycles of the grain's seasonality
    lag so a weekly or yearly rhythm averages out too. At least the fewest
    points a fit needs."""
    lag = _scoring(rules).seasonality_lags.get(grain) or 1
    root = math.ceil(math.sqrt(max(points, 0)))
    return max(MIN_FIT_POINTS, lag * math.ceil(root / lag))


def moving_average(values, width):
    """The centred moving average of ``values`` over ``width`` points,
    narrowed at the ends; empty for an empty series."""
    ys = numbers(values)
    half = width // 2
    out = []
    for i in range(len(ys)):
        window = ys[max(0, i - half) : i - half + width]
        out.append(_mean(window))
    return out


def _seasonal(ys, smooth, lag):
    """The mean departure from ``smooth`` at each phase of ``lag``, centred."""
    phases = [_mean([y - m for y, m in list(zip(ys, smooth))[k::lag]]) for k in range(lag)]
    centre = _mean(phases)
    return [phases[i % lag] - centre for i in range(len(ys))]


def level_change(values, width, lag=None):
    """``{strength, swing, low, high}``: how much of the deseasonalised
    variance a ``width``-point moving average holds, corrected so white
    noise scores 0 (``strength`` in ``[0, 1]``), and that average's range
    relative to the mean absolute value (``swing`` in ``[0, ∞)``) with the
    positions of its lowest and highest points. With ``lag`` the cycle is
    taken out first, so a rise under a weekly rhythm still counts. Reads a
    V, a U or a step that a straight line misses; all 0 for a series shorter
    than two windows or flat."""
    ys = numbers(values)
    none = {"strength": 0.0, "swing": 0.0, "low": None, "high": None}
    if width < 2 or len(ys) < MIN_CYCLES * width:
        return none
    smooth = moving_average(ys, width)
    noise = 1 / width
    if lag and len(ys) >= MIN_CYCLES * lag:
        ys = [y - c for y, c in zip(ys, _seasonal(ys, smooth, lag))]
        noise *= len(ys) / (len(ys) - lag)
    mean = _mean(ys)
    total = sum((y - mean) ** 2 for y in ys)
    if total <= 1e-12 * max(1.0, sum(y * y for y in ys)):
        return none
    held = 1 - sum((y - m) ** 2 for y, m in zip(ys, smooth)) / total
    scale = _mean([abs(y) for y in ys])
    low = min(range(len(smooth)), key=smooth.__getitem__)
    high = max(range(len(smooth)), key=smooth.__getitem__)
    return {
        "strength": max(0.0, min(1.0, (held - noise) / (1 - noise))),
        "swing": (smooth[high] - smooth[low]) / scale if scale else 0.0,
        "low": low,
        "high": high,
    }


def trend(values, grain=None, rules=None):
    """``{slope, r2, change, run, strength, swing, low, high, shape, score}``
    for an ordered series, fitted on ``bridged`` values: outliers annotate a
    trend, they do not rank one. ``change``
    is the fitted rise across the series relative to its mean absolute
    value; ``low`` and ``high`` are positions in the numeric values. ``score`` is in ``[0, 1]``,
    the better of a straight line, ``r2 × min(1, |change|)``, and a level
    change, ``strength × min(1, swing / material_change)`` over
    ``smoothing_window``; ``shape`` says which (``linear`` or ``level``). 0
    for a flat or patternless series, near 1 for a steady doubling or a V."""
    scoring = _scoring(rules)
    first, ys = bridged(values, scoring)
    slope, _, r2 = linear_fit(ys)
    scale = _mean([abs(y) for y in ys])
    change = slope * (len(ys) - 1) / scale if scale else 0.0
    linear = r2 * min(1.0, abs(change))
    lag = scoring.seasonality_lags.get(grain)
    level = level_change(ys, smoothing_window(grain, len(ys), scoring), lag)
    for end in ("low", "high"):
        if level[end] is not None:
            level[end] += first
    moved = level["strength"] * min(1.0, level["swing"] / scoring.material_change)
    return {
        "slope": slope,
        "r2": r2,
        "change": change,
        "run": longest_monotonic_run(ys),
        **level,
        "shape": "level" if moved > linear else "linear",
        "score": max(linear, moved),
    }


def gini(values):
    """The Gini coefficient of non-negative totals, corrected for sample size
    so one value holding everything scores 1, in ``[0, 1]``. 0 for fewer than
    two values, a zero total, or any negative value (a share of a signed
    total means nothing)."""
    xs = numbers(values)
    n = len(xs)
    total = sum(xs)
    if n < 2 or total <= 0 or any(x < 0 for x in xs):
        return 0.0
    ordered = sorted(xs)
    weighted = sum((i + 1) * x for i, x in enumerate(ordered))
    raw = (2 * weighted) / (n * total) - (n + 1) / n
    return max(0.0, min(1.0, raw * n / (n - 1)))


def top_share(values, k):
    """The share of the total held by the ``k`` largest values, in ``[0, 1]``.
    0 for an empty, zero-total or signed series."""
    xs = numbers(values)
    total = sum(xs)
    if not xs or total <= 0 or any(x < 0 for x in xs):
        return 0.0
    return sum(sorted(xs, reverse=True)[:k]) / total


def concentration(values, rules=None):
    """``{top_share, gini, score}``: how much a few values dominate. ``score``
    is the Gini, in ``[0, 1]``; ``top_share`` counts the YAML's
    ``top_share_of`` largest values."""
    coefficient = gini(values)
    return {
        "top_share": top_share(values, _scoring(rules).top_share_of),
        "gini": coefficient,
        "score": coefficient,
    }


def _pairs(xs, ys):
    pairs = []
    for a, b in zip(xs or [], ys or []):
        x, y = numbers([a]), numbers([b])
        if x and y:
            pairs.append((x[0], y[0]))
    return pairs


def _pearson(pairs):
    if len(pairs) < MIN_FIT_POINTS:
        return 0.0
    _, _, sxx, syy, sxy = _moments([p[0] for p in pairs], [p[1] for p in pairs])
    if sxx == 0 or syy == 0:
        return 0.0
    return max(-1.0, min(1.0, sxy / math.sqrt(sxx * syy)))


def correlation(xs, ys):
    """Pearson's r over the pairs where both values are numbers, in
    ``[-1, 1]``; 0 for fewer than three pairs or a constant column."""
    return _pearson(_pairs(xs, ys))


def _ranks(values):
    order = sorted(range(len(values)), key=values.__getitem__)
    ranks = [0.0] * len(values)
    start = 0
    while start < len(order):
        end = start
        while end + 1 < len(order) and values[order[end + 1]] == values[order[start]]:
            end += 1
        for k in range(start, end + 1):
            ranks[order[k]] = (start + end) / 2
        start = end + 1
    return ranks


def rank_correlation(xs, ys):
    """Spearman's rho: Pearson's r on the ranks (ties share the mean rank),
    in ``[-1, 1]``. An outlier moves one rank, not the whole fit, so a few
    extreme rows cannot hide or fake a relationship. 0 as ``correlation``."""
    pairs = _pairs(xs, ys)
    xr, yr = _ranks([p[0] for p in pairs]), _ranks([p[1] for p in pairs])
    return _pearson(list(zip(xr, yr)))


def is_derived(r, rules=None):
    """Whether ``|r|`` is high enough that one column is likely computed from
    the other (fare and total amount), which makes a scatter of them a line."""
    found = numbers([r])
    return bool(found) and abs(found[0]) >= _scoring(rules).derived_r


def correlation_score(r, derived=False, rules=None):
    """``|r|``, discounted when the columns are derived from each other, in
    ``[0, 1]``. ``derived`` forces the discount; a near-perfect ``r`` implies it."""
    scoring = _scoring(rules)
    found = numbers([r])
    if not found:
        return 0.0
    magnitude = min(1.0, abs(found[0]))
    if derived or is_derived(magnitude, scoring):
        return magnitude * scoring.penalties.derived_correlation
    return magnitude


def autocorrelation(values, lag):
    """The lag-``lag`` autocorrelation of the detrended series, in
    ``[-1, 1]``. Detrending keeps a steady rise from reading as a cycle. 0
    when the series holds fewer than ``MIN_CYCLES`` cycles or is flat."""
    ys = numbers(values)
    if lag < 1 or len(ys) < MIN_CYCLES * lag:
        return 0.0
    slope, intercept, _ = linear_fit(ys)
    residuals = [y - (slope * i + intercept) for i, y in enumerate(ys)]
    mean = _mean(residuals)
    centred = [r - mean for r in residuals]
    denominator = sum(c * c for c in centred)
    if denominator <= 1e-12 * max(1.0, sum(y * y for y in ys)):
        return 0.0
    numerator = sum(centred[i] * centred[i + lag] for i in range(len(centred) - lag))
    return max(-1.0, min(1.0, numerator / denominator))


def seasonality(values, grain, rules=None):
    """``{lag, acf, score}`` at the YAML's lag for ``grain``. ``score =
    max(0, acf)`` is in ``[0, 1]``; all 0 and no lag for a grain without one."""
    lag = _scoring(rules).seasonality_lags.get(grain)
    if lag is None:
        return {"lag": None, "acf": 0.0, "score": 0.0}
    acf = autocorrelation(values, lag)
    return {"lag": lag, "acf": acf, "score": max(0.0, acf)}


def anomalies(values, rules=None):
    """``{count, indexes}`` of the points whose modified z-score, distance
    from the median in MADs scaled to a standard deviation, exceeds the
    YAML's ``anomaly_z``. The median and MAD ignore the outliers they find,
    so a cluster of bad days cannot hide itself the way it does from a mean
    and SD; with a MAD of 0 (most points equal) the ordinary z-score is
    used. ``count`` is in ``[0, n]``; indexes are positions among the
    numeric values. Outliers annotate a trend; they do not rank one."""
    z = _scoring(rules).anomaly_z
    xs = numbers(values)
    if len(xs) < 2:
        return {"count": 0, "indexes": []}
    centre = statistics.median(xs)
    mad = statistics.median([abs(x - centre) for x in xs])
    if mad > 0:
        scores = [MAD_TO_SD * abs(x - centre) / mad for x in xs]
    else:
        sd, mean = _stddev(xs), _mean(xs)
        scores = [abs(x - mean) / sd if sd else 0.0 for x in xs]
    indexes = [i for i, score in enumerate(scores) if score > z]
    return {"count": len(indexes), "indexes": indexes}


def _table(cells):
    """``{(a, b): value}`` from ``(a, b, value)`` cells, NULL keys and
    non-numbers dropped; ``None`` when a value is negative."""
    table = {}
    for cell in cells or []:
        if not isinstance(cell, (list, tuple)) or not cell:
            continue
        *key, value = cell
        found = numbers([value])
        if len(key) != 2 or None in key or not found:
            continue
        if found[0] < 0:
            return None
        key = tuple(key)
        table[key] = table.get(key, 0.0) + found[0]
    return table


def _margins(table):
    rows, cols = {}, {}
    for (a, b), value in table.items():
        rows[a] = rows.get(a, 0.0) + value
        cols[b] = cols.get(b, 0.0) + value
    return rows, cols


def cramers_v(cells):
    """Cramér's V of a two-way table of non-negative values, in ``[0, 1]``:
    how far the cells sit from the product of their margins, 0 when every
    row splits the same way. Scale-free, so sums work as well as counts. 0
    for a signed metric, a total of 0 or fewer than two rows or columns."""
    table = _table(cells)
    if not table:
        return 0.0
    rows, cols = _margins(table)
    total = sum(rows.values())
    k = min(len(rows), len(cols))
    if k < 2 or total <= 0:
        return 0.0
    chi = 0.0
    for a, row in rows.items():
        for b, col in cols.items():
            expected = row * col / total
            if expected > 0:
                chi += (table.get((a, b), 0.0) - expected) ** 2 / expected
    return max(0.0, min(1.0, math.sqrt(chi / total / (k - 1))))


def _lambda(table, flip):
    best, other = {}, {}
    for (a, b), value in table.items():
        key, target = (b, a) if flip else (a, b)
        best[key] = max(best.get(key, 0.0), value)
        other[target] = other.get(target, 0.0) + value
    total, modal = sum(other.values()), max(other.values())
    return (sum(best.values()) - modal) / (total - modal) if total > modal else 0.0


def dependence(cells):
    """Goodman and Kruskal's lambda, the larger of its two directions, in
    ``[0, 1]``: how much knowing one column's value cuts the error of
    guessing the other's. 1 when one determines the other (a zone and its
    borough), so the grid is one cell per row. 0 as ``cramers_v``."""
    table = _table(cells)
    if not table or len(_margins(table)[0]) < 2 or len(_margins(table)[1]) < 2:
        return 0.0
    return max(_lambda(table, False), _lambda(table, True))


def interaction(cells, rules=None):
    """``{v, dependence, dependent, score}`` for a cross-tab's cells: the
    score is Cramér's V, times the YAML's ``dependent_pair`` penalty when
    ``dependence`` reaches ``dependent_lambda``. In ``[0, 1]``."""
    scoring = _scoring(rules)
    v, lam = cramers_v(cells), dependence(cells)
    dependent = lam >= scoring.dependent_lambda
    score = v * scoring.penalties.dependent_pair if dependent else v
    return {"v": v, "dependence": lam, "dependent": dependent, "score": score}


def bridged(values, rules=None):
    """``(first, kept)``: the numeric values with the points ``anomalies``
    flags trimmed from either end and bridged by a straight line between
    their neighbours inside, so positions keep their spacing; ``first`` is
    the position of ``kept[0]`` among the numeric values."""
    xs = numbers(values)
    flagged = set(anomalies(xs, rules)["indexes"])
    good = [i for i in range(len(xs)) if i not in flagged]
    if not good:
        return 0, xs
    out = []
    for i in range(good[0], good[-1] + 1):
        if i not in flagged:
            out.append(xs[i])
            continue
        before = max(g for g in good if g < i)
        after = min(g for g in good if g > i)
        out.append(xs[before] + (xs[after] - xs[before]) * (i - before) / (after - before))
    return good[0], out


def skew_score(skew):
    """``|skew| / (1 + |skew|)``, in ``[0, 1)``: a lopsided distribution is
    worth a histogram, a symmetric one rarely."""
    found = numbers([skew])
    if not found:
        return 0.0
    return abs(found[0]) / (1 + abs(found[0]))


def is_constant(values):
    """Whether two or more numeric values are all equal."""
    xs = numbers(values)
    return len(xs) >= 2 and max(xs) == min(xs)


def penalty(cards, values=None, rules=None):
    """``(factor, reasons)`` for a candidate over ``cards`` whose metric took
    ``values``. ``factor`` is in ``[0, 1]``: the product of the YAML's
    penalties for a mostly-null column, a constant metric and a
    single-valued column."""
    scoring = _scoring(rules)
    factor, reasons = 1.0, []
    for card in cards or []:
        if card.null_pct > scoring.high_nulls:
            factor *= scoring.penalties.high_nulls
            reasons.append(f"{card.column} is {card.null_pct:.0%} null")
        if card.bucket() == "one":
            factor *= scoring.penalties.cardinality_one
            reasons.append(f"{card.column} has one value")
    if is_constant(values):
        factor *= scoring.penalties.constant_metric
        reasons.append("the metric is the same for every group")
    return factor, reasons


def tag_dimension(card, rules=None, interactivity=None):
    """``(tag, transform)``: ``axis``, ``key`` (the detail table's, never a
    chart's), ``measure``, ``dropped``, ``split_candidate`` or
    ``input_candidate``. At the input bucket ``top_n_other`` keeps a
    concentrated column a split."""
    doc = rules or load_insight_design()
    threshold = (interactivity or load_interactivity()).design_rules.input_over_split_min_bucket
    if card.role == "time":
        return "axis", None
    if card.role == "identifier":
        return "key", None
    if card.role in ("text", "geo_point") or card.bucket() == "one":
        return "dropped", None
    if card.role == "numeric_continuous":
        return "measure", None
    rank, at = BUCKET_ORDER[card.bucket()], BUCKET_ORDER[threshold]
    if rank < at:
        return "split_candidate", None
    if rank == at and top_n_keep(card, doc) is not None:
        return "split_candidate", "top_n_other"
    return "input_candidate", None


def top_n_keep(card, rules=None):
    """How many top values ``top_n_other`` keeps: the smallest N from the
    YAML's ``n`` to ``n_max`` whose shares reach ``top_n_min_share``, else
    ``None``."""
    doc = rules or load_insight_design()
    top = doc.reductions.top_n_other
    shares = [t.share for t in card.top_n]
    for n in range(top.n, top.n_max + 1):
        if len(shares) >= n and sum(shares[:n]) >= doc.split_vs_input.top_n_min_share:
            return n
    return None
