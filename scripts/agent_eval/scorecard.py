"""Score runs against a dataset's pass bar, with credit percentiles per route.

python scripts/agent_eval/scorecard.py --runs <dir> [--runs <dir> ...]

A run reaches a working dashboard when it built the dashboard the prompt
named, every visual rendered with no console error or empty table, the turn
did not end on a failed build, and, on the file route, the imported source is
unchanged. A prompt passes when at least half of its valid runs reach one.
The pass bar is `pass_bar` in the dataset's prompts.yml: passing prompts
needed per route. Prints a markdown table for a PR description.
"""

import argparse
import glob
import json
import math
import os
import sys

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
FILE_KEYS = ("database", "file")


def _path(value):
    return os.path.normpath(value) if isinstance(value, str) else value


def _same_path(a, b):
    a, b = _path(a), _path(b)
    if not isinstance(a, str) or not isinstance(b, str):
        return a == b
    return a == b or a.endswith(os.sep + b) or b.endswith(os.sep + a)


def file_reference(setup, objects):
    """Whether the sources a prompt's setup imported kept their file reference.

    ``{"kept": bool, "problems": [str]}``. A problem is a setup source that is
    gone, changed type or points at another file, or a second source that
    reads the same file.
    """
    sources = (objects or {}).get("sources") or {}
    problems = []
    imported = [i["config"] for i in setup or [] if i.get("type") == "sources"]
    for config in imported:
        name = config["name"]
        current = sources.get(name)
        if current is None:
            problems.append(f"source {name} is gone")
            continue
        if current.get("type") != config.get("type"):
            problems.append(f"source {name} changed type to {current.get('type')}")
        for key in FILE_KEYS:
            if key in config and not _same_path(current.get(key), config[key]):
                problems.append(f"source {name} now points at {current.get(key)}")
        for other_name, other in sources.items():
            if other_name == name:
                continue
            if any(key in config and _same_path(other.get(key), config[key]) for key in FILE_KEYS):
                problems.append(f"source {other_name} reads the same file as {name}")
    return {"kept": not problems, "problems": problems}


def rendered(run):
    dashboards = (run.get("dashboards") or {}).values()
    if not dashboards:
        return False
    for dashboard in dashboards:
        desktop = dashboard.get("desktop") or {}
        drawn = desktop.get("plots", 0) + desktop.get("tables", 0)
        if drawn < dashboard.get("expected_visuals", 0) or drawn == 0:
            return False
        if desktop.get("console_errors") or desktop.get("empty_tables"):
            return False
    return True


def working(run):
    """Whether one run reached a working dashboard (see the module docstring)."""
    if not run.get("expected_dashboard_built"):
        return False
    if (run.get("final_run") or {}).get("left_failed"):
        return False
    if run.get("route") == "file" and not (run.get("file_reference") or {}).get("kept"):
        return False
    expected = run.get("expected_dashboard")
    dashboards = run.get("dashboards") or {}
    scoped = {expected: dashboards[expected]} if expected in dashboards else dashboards
    return rendered({**run, "dashboards": scoped})


def percentile(values, q):
    """The ``q``-th percentile (0-100) by linear interpolation, or ``None``."""
    values = sorted(v for v in values if v is not None)
    if not values:
        return None
    rank = (len(values) - 1) * q / 100
    low, high = math.floor(rank), math.ceil(rank)
    return values[low] + (values[high] - values[low]) * (rank - low)


def load(runs_dirs):
    """Every run's summary under the given directories, invalid runs included."""
    runs = []
    for runs_dir in runs_dirs:
        for path in sorted(glob.glob(os.path.join(runs_dir, "*", "summary.json"))):
            with open(path) as handle:
                runs.append(json.load(handle))
    return runs


def pass_bars(datasets, datasets_dir=None):
    """``{(dataset, route): passing prompts needed}`` from each prompts.yml."""
    bars = {}
    for dataset in datasets:
        path = os.path.join(datasets_dir or os.path.join(HERE, "datasets"), dataset, "prompts.yml")
        if not os.path.exists(path):
            continue
        with open(path) as handle:
            spec = yaml.safe_load(handle) or {}
        for route, needed in (spec.get("pass_bar") or {}).items():
            bars[(dataset, route)] = needed
    return bars


def score(runs, bars):
    """One row per (dataset, route): prompts, passes, the bar and credit."""
    groups = {}
    for run in runs:
        key = (run.get("dataset"), run.get("route") or "all")
        groups.setdefault(key, []).append(run)
    rows = []
    for (dataset, route), group in sorted(groups.items(), key=lambda kv: tuple(map(str, kv[0]))):
        valid = [r for r in group if not (r.get("client") or {}).get("invalid")]
        by_prompt = {}
        for run in valid:
            by_prompt.setdefault(run["prompt_id"], []).append(working(run))
        passed = sorted(p for p, results in by_prompt.items() if 2 * sum(results) >= len(results))
        failed = sorted(set(by_prompt) - set(passed))
        costs = [(r.get("client") or {}).get("cost_usd") for r in valid]
        needed = bars.get((dataset, route))
        rows.append(
            {
                "dataset": dataset,
                "route": route,
                "runs": len(valid),
                "invalid_runs": len(group) - len(valid),
                "prompts": len(by_prompt),
                "passed": passed,
                "failed": failed,
                "working_runs": sum(working(r) for r in valid),
                "needed": needed,
                "meets_bar": None if needed is None else len(passed) >= needed,
                "credit_p50": percentile(costs, 50),
                "credit_p90": percentile(costs, 90),
            }
        )
    return rows


def _money(value):
    return "–" if value is None else f"${value:.2f}"


def markdown(rows):
    lines = [
        "| Dataset | Route | Prompts passed | Bar | Working runs | Credit p50 | Credit p90 | Failed prompts |",
        "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ]
    for row in rows:
        bar = (
            "–"
            if row["needed"] is None
            else f"{row['needed']} ({'met' if row['meets_bar'] else 'missed'})"
        )
        lines.append(
            f"| {row['dataset']} | {row['route']} | {len(row['passed'])} of {row['prompts']} | {bar} "
            f"| {row['working_runs']} of {row['runs']} | {_money(row['credit_p50'])} "
            f"| {_money(row['credit_p90'])} | {', '.join(row['failed']) or 'none'} |"
        )
    return "\n".join(lines)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--runs", action="append", required=True)
    parser.add_argument("--json", action="store_true", help="print the rows as JSON")
    args = parser.parse_args(argv)
    runs = load(args.runs)
    rows = score(runs, pass_bars({r.get("dataset") for r in runs if r.get("dataset")}))
    print(json.dumps(rows, indent=2) if args.json else markdown(rows))
    return 0 if all(row["meets_bar"] is not False for row in rows) else 1


if __name__ == "__main__":
    sys.exit(main())
