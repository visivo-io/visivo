"""Score recorded runs with an LLM judge (Claude Code headless, read-only).

Reads every <run>/summary.json under --runs that has no judge.json yet, shows
the judge the prompt, the objects the agent wrote, its final message and the
screenshots, and writes <run>/judge.json.
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
RUBRIC = open(os.path.join(HERE, "rubric.md")).read()
JUDGE_TIMEOUT_SECONDS = 600
MAX_OBJECTS_CHARS = 60_000


def judge_prompt(run_dir, summary):
    objects = open(os.path.join(run_dir, "objects.json")).read()
    if len(objects) > MAX_OBJECTS_CHARS:
        objects = objects[:MAX_OBJECTS_CHARS] + "\n... (truncated)"
    shots = sorted(os.path.basename(p) for p in glob.glob(os.path.join(run_dir, "*.png")))
    facts = {name: {k: v for k, v in d.items()} for name, d in summary["dashboards"].items()}
    return f"""{RUBRIC}

## User prompt

{summary['prompt']}

Expected: {', '.join(summary['expects']) or 'nothing beyond the rubric'}.
Dashboard name asked for: {summary['expected_dashboard'] or 'agent chooses'}.

## Screenshots (in the current directory; Read each one)

{chr(10).join('- ' + s for s in shots) or '- none: no dashboard was built'}

## Render and validation facts measured by the harness

{json.dumps(facts, indent=1)}

## Objects the agent wrote (drafts)

{objects}

## The agent's final message

{summary['client'].get('final_message')}
"""


def parse(text):
    match = re.search(r"\{.*\}", text or "", re.S)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except ValueError:
        return None


def judge(run_dir, model):
    summary = json.load(open(os.path.join(run_dir, "summary.json")))
    command = [
        "claude",
        "-p",
        judge_prompt(run_dir, summary),
        "--tools",
        "Read",
        "--allowedTools",
        "Read",
        "--strict-mcp-config",
        "--output-format",
        "json",
        "--model",
        model,
        "--setting-sources",
        "",
        "--no-session-persistence",
    ]
    completed = subprocess.run(
        command, cwd=run_dir, capture_output=True, text=True, timeout=JUDGE_TIMEOUT_SECONDS
    )
    try:
        envelope = json.loads(completed.stdout)
    except ValueError:
        envelope = {"result": completed.stdout}
    verdict = parse(envelope.get("result")) or {"error": (envelope.get("result") or "")[:500]}
    if "scores" in verdict:
        verdict["total"] = sum(verdict["scores"].values())
    verdict["judge_model"] = model
    verdict["judge_cost_usd"] = envelope.get("total_cost_usd")
    with open(os.path.join(run_dir, "judge.json"), "w") as out:
        json.dump(verdict, out, indent=2)
    return run_dir, verdict


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", required=True)
    parser.add_argument("--model", default="opus")
    parser.add_argument("--parallel", type=int, default=4)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    pending = [
        os.path.dirname(p)
        for p in sorted(glob.glob(os.path.join(args.runs, "*", "summary.json")))
        if args.force or not os.path.exists(os.path.join(os.path.dirname(p), "judge.json"))
    ]
    with ThreadPoolExecutor(max_workers=args.parallel) as pool:
        for run_dir, verdict in pool.map(lambda d: judge(d, args.model), pending):
            print(
                os.path.basename(run_dir),
                verdict.get("total"),
                verdict.get("summary") or verdict.get("error"),
            )


if __name__ == "__main__":
    sys.exit(main())
