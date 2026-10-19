"""Load a recorded run's draft objects back into a serve, to debug what it built.

python scripts/agent_eval/replay.py <run dir> [--backend http://localhost:8011]
python scripts/agent_eval/replay.py <runs dir> --recapture   # re-render every run
"""

import argparse
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import Serve, inspect_dashboards  # noqa: E402

ORDER = [
    "models",
    "dimensions",
    "metrics",
    "relations",
    "inputs",
    "insights",
    "charts",
    "tables",
    "markdowns",
    "dashboards",
]


def load(serve, run_dir):
    serve.discard()
    objects = json.load(open(os.path.join(run_dir, "objects.json")))
    for type_key in ORDER:
        for name, config in objects.get(type_key, {}).items():
            result = serve.tool(f"write_{type_key[:-1]}", {"config": config})
            if isinstance(result, dict) and result.get("error"):
                print(f"{type_key[:-1]} {name}: {result['error'][:200]}")
    return objects


def recapture(serve, run_dir):
    for old in os.listdir(run_dir):
        if old.endswith(".png"):
            os.remove(os.path.join(run_dir, old))
    objects = load(serve, run_dir)
    time.sleep(3)
    summary_path = os.path.join(run_dir, "summary.json")
    summary = json.load(open(summary_path))
    summary["dashboards"] = inspect_dashboards(serve, objects, run_dir)
    with open(summary_path, "w") as out:
        json.dump(summary, out, indent=2, default=str)
    print(os.path.basename(run_dir), {n: d["desktop"] for n, d in summary["dashboards"].items()})


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("path")
    parser.add_argument("--backend", default="http://localhost:8011")
    parser.add_argument("--frontend", default="http://localhost:3011")
    parser.add_argument("--recapture", action="store_true")
    args = parser.parse_args()
    serve = Serve(args.backend, args.frontend)
    if args.recapture:
        for summary in sorted(os.listdir(args.path)):
            run_dir = os.path.join(args.path, summary)
            if os.path.exists(os.path.join(run_dir, "objects.json")):
                recapture(serve, run_dir)
        return
    objects = load(serve, args.path)
    print("dashboards:", list(objects.get("dashboards", {})))


if __name__ == "__main__":
    sys.exit(main())
