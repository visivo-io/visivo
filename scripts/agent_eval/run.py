"""Run fixed prompts against a live Visivo serve and record what the agent did.

The serve must already be running on the eval project (see README.md). Every
run starts from a clean draft state, drives one agent client with one prompt,
then captures the transcript, the objects it wrote, validation, input wiring
and a full-page screenshot of each dashboard it built.

Clients ("conditions"):
  mcp          Claude Code headless, connected only to the serve's MCP endpoint.
  mcp+skills   The same, with the skills the built-in loop gets in its prompt
               appended to the system prompt.
  builtin      The built-in loop, through POST /api/agent/.
"""

import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request

import yaml

HERE = os.path.dirname(os.path.abspath(__file__))
OBJECT_TYPES = [
    "models",
    "dimensions",
    "metrics",
    "relations",
    "insights",
    "charts",
    "tables",
    "markdowns",
    "inputs",
    "dashboards",
]
DATA_TOOLS = {
    "describe_source",
    "preview_table",
    "query_source",
    "profile_columns",
    "profile_model",
    "infer_columns",
    "preview_insight",
    "list_tables",
    "get_table",
}
# Looking at the build at all. The defect this measures is an agent that writes
# a model, the build fails, and it reports success without ever asking.
RUN_TOOLS = {
    "check_runs",
    "list_runs",
    "get_run",
}
GUIDANCE_TOOLS = {
    "read_skill",
    "recommend_layout",
    "recommend_inputs",
    "check_input_wiring",
    "recommend_charts",
    "score_candidates",
}
CLIENT_TIMEOUT_SECONDS = 1500
RESET_RUN_TIMEOUT_SECONDS = 300
SETTLE_TIMEOUT_MS = 120_000
# Charts fetch data and then compute in DuckDB-WASM, and a spinner-free page can
# also be one whose charts have not mounted yet. Settled = every visual drawn,
# no spinner, and still true 1.5s later.
DASHBOARD_BOTTOM_SCRIPT = """() => {
    const root = document.querySelector('[data-testid^="dashboard_"]');
    const edge = root ? root.getBoundingClientRect().bottom + window.scrollY : document.body.scrollHeight;
    return Math.ceil(edge) + 24;
}"""
# What is on the page, as the settle loop and the facts read it. A data table
# has no <table>: it is drawn once its "N total rows" footer shows, and "No data
# available" is its terminal empty state.
MEASURE = """
    const texts = [...document.querySelectorAll('span')].map(s => s.textContent.trim());
    const m = {
        plots: document.querySelectorAll('.js-plotly-plot .main-svg').length
            ? document.querySelectorAll('.js-plotly-plot').length : 0,
        tables: texts.filter(t => /^[\\d,]+ total rows$/.test(t)).length,
        empty_tables: texts.filter(t => t === 'No data available').length,
        busy: document.querySelectorAll('.loading-spinner').length
            + texts.filter(t => t === 'Loading data...').length,
    };
"""
SETTLE_SCRIPT = f"""async (expected) => {{
    const deadline = Date.now() + {SETTLE_TIMEOUT_MS};
    let stable = 0;
    while (Date.now() < deadline) {{
        {MEASURE}
        const drawn = m.plots + m.tables + m.empty_tables;
        stable = drawn >= expected && m.busy === 0 ? stable + 1 : 0;
        if (stable >= 3) return true;
        await new Promise(r => setTimeout(r, 500));
    }}
    return false;
}}"""
FACTS_SCRIPT = f"""() => {{
    {MEASURE}
    return {{...m, horizontal_overflow: document.documentElement.scrollWidth > window.innerWidth + 1}};
}}"""


class Serve:
    def __init__(self, backend, frontend):
        self.backend = backend
        self.frontend = frontend
        self._id = 0

    def http(self, method, path, body=None, timeout=60):
        request = urllib.request.Request(
            self.backend + path,
            method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"content-type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.status, json.loads(response.read() or b"{}")
        except urllib.error.HTTPError as error:
            return error.code, json.loads(error.read() or b"{}")

    def tool(self, name, arguments=None):
        self._id += 1
        _, reply = self.http(
            "POST",
            "/api/mcp/",
            {
                "jsonrpc": "2.0",
                "id": self._id,
                "method": "tools/call",
                "params": {"name": name, "arguments": arguments or {}},
            },
        )
        result = reply.get("result") or {}
        text = (result.get("content") or [{}])[0].get("text", "")
        if result.get("isError"):
            return {"error": text}
        try:
            return json.loads(text)
        except ValueError:
            return {"text": text}

    def discard(self):
        return self.http("POST", "/api/commit/discard/", {})

    def reset(self):
        """Discard every draft, then build the committed project once.

        Run history lives in the serve's memory and a discard leaves it alone,
        so without the rebuild the newest run the next agent finds with
        `list_runs` is the previous agent's failure.
        """
        self.discard()
        deadline = time.time() + RESET_RUN_TIMEOUT_SECONDS
        while time.time() < deadline:
            status, _ = self.http("POST", "/api/projects/local/run/", {"dag_filter": ""})
            if status != 409:
                break
            time.sleep(2)
        while time.time() < deadline:
            _, runs = self.http("GET", "/api/projects/local/run/")
            if runs and runs[0]["state"] not in ("queued", "running"):
                return runs[0]["state"]
            time.sleep(2)
        raise RuntimeError("The reset run did not finish.")

    def snapshot(self):
        objects = {}
        for type_key in OBJECT_TYPES:
            listed = self.tool(f"list_{type_key}")
            items = listed if isinstance(listed, list) else []
            objects[type_key] = {
                item["name"]: item for item in items if isinstance(item, dict) and item.get("name")
            }
        return objects


def stale_viewer_bundle():
    """Why the serve's built viewer is older than the viewer source, or ``None``.

    The agent's `screenshot_dashboard` loads the page from the serve, which
    serves the bundle in `visivo/viewers/local`. Releases rebuild it; a
    checkout does not. The eval renders from the dev server instead, so with a
    stale bundle the agent and the judge look at two different viewers.
    """
    repo = os.path.dirname(os.path.dirname(HERE))

    def git(*command):
        return subprocess.run(
            ["git", *command], cwd=repo, capture_output=True, text=True
        ).stdout.strip()

    if git("status", "--porcelain", "--", "visivo/viewers/local"):
        return None
    source = git("log", "-1", "--format=%ct", "--", "viewer/src")
    built = git("log", "-1", "--format=%ct", "--", "visivo/viewers/local")
    if not source or not built or int(built) >= int(source):
        return None
    return (
        "visivo/viewers/local is older than the last viewer/src commit, so "
        "screenshot_dashboard would show the agent an older viewer than the judge "
        "sees. Run `yarn deploy:local` in viewer/ first, or pass --allow-stale-viewer."
    )


def skills_prompt():
    from visivo.agent import skills

    return skills.always_on_prompt()


def run_claude(serve, prompt, model, run_dir, with_skills):
    config = os.path.join(run_dir, "mcp.json")
    with open(config, "w") as out:
        json.dump(
            {"mcpServers": {"visivo": {"type": "http", "url": serve.backend + "/api/mcp/"}}}, out
        )
    cwd = os.path.join(run_dir, "cwd")
    os.makedirs(cwd, exist_ok=True)
    command = [
        "claude",
        "-p",
        prompt,
        "--tools",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        config,
        "--allowedTools",
        "mcp__visivo",
        "--output-format",
        "stream-json",
        "--verbose",
        "--model",
        model,
        "--setting-sources",
        "",
        "--no-session-persistence",
    ]
    if with_skills:
        command += ["--append-system-prompt", skills_prompt()]
    started = time.time()
    with open(os.path.join(run_dir, "transcript.jsonl"), "w") as out:
        try:
            subprocess.run(
                command,
                cwd=cwd,
                stdout=out,
                stderr=subprocess.STDOUT,
                timeout=CLIENT_TIMEOUT_SECONDS,
            )
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
    shutil.rmtree(cwd, ignore_errors=True)
    return parse_claude(os.path.join(run_dir, "transcript.jsonl"), time.time() - started, timed_out)


def parse_claude(path, elapsed, timed_out):
    calls, results, final = [], {}, {}
    for line in open(path):
        try:
            event = json.loads(line)
        except ValueError:
            continue
        kind = event.get("type")
        if kind == "assistant":
            for block in event["message"]["content"]:
                if block.get("type") == "tool_use":
                    calls.append(
                        {
                            "id": block["id"],
                            "tool": block["name"].replace("mcp__visivo__", ""),
                            "input": block.get("input"),
                        }
                    )
        elif kind == "user":
            for block in event["message"].get("content", []):
                if isinstance(block, dict) and block.get("type") == "tool_result":
                    text = json.dumps(block.get("content"))
                    results[block["tool_use_id"]] = (
                        bool(block.get("is_error")) or '\\"valid\\": false' in text
                    )
        elif kind == "result":
            final = event
    for call in calls:
        call["error"] = results.get(call.pop("id"), False)
    return {
        "calls": calls,
        "final_message": final.get("result"),
        "elapsed_s": round(elapsed, 1),
        "timed_out": timed_out,
        "cost_usd": final.get("total_cost_usd"),
        "turns": final.get("num_turns"),
        "client_error": final.get("is_error", True),
        # A run the client could not finish (a usage limit, a crash) says
        # nothing about the agent; the judge and the report leave it out.
        "invalid": final.get("is_error", True) or not calls,
    }


def run_builtin(serve, prompt, run_dir):
    started = time.time()
    _, before = serve.http("GET", "/api/agent/actions/")
    seen = len(before.get("actions", before if isinstance(before, list) else []))
    status, session = serve.http("POST", "/api/agent/", {"prompt": prompt})
    if status != 201:
        return {
            "calls": [],
            "final_message": None,
            "elapsed_s": 0,
            "timed_out": False,
            "client_error": session,
        }
    while time.time() - started < CLIENT_TIMEOUT_SECONDS:
        time.sleep(3)
        _, session = serve.http("GET", f"/api/agent/{session['id']}/")
        if session.get("state") not in ("running", "queued"):
            break
    else:
        serve.http("POST", f"/api/agent/{session['id']}/cancel/")
    _, after = serve.http("GET", "/api/agent/actions/")
    actions = after.get("actions", after if isinstance(after, list) else [])[seen:]
    with open(os.path.join(run_dir, "transcript.json"), "w") as out:
        json.dump({"session": session, "actions": actions}, out, indent=2, default=str)
    return {
        "calls": builtin_calls(session) or builtin_calls({"transcript": [{"actions": actions}]}),
        "final_message": session.get("output") or session.get("error"),
        "elapsed_s": round(time.time() - started, 1),
        "timed_out": time.time() - started >= CLIENT_TIMEOUT_SECONDS,
        "client_error": session.get("state") != "succeeded",
    }


def builtin_calls(session):
    """The tool calls a built-in session made, from its own transcript: the
    process-wide action log is shared with MCP clients and capped."""
    return [
        {"tool": a.get("tool"), "error": a.get("outcome") == "error"}
        for turn in session.get("transcript") or []
        for a in turn.get("actions") or []
    ]


def screenshot(serve, dashboard, path, width, expected):
    from playwright.sync_api import sync_playwright

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            page = browser.new_page(viewport={"width": width, "height": 900})
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)[:300]))
            page.on("console", lambda m: m.type == "error" and errors.append(m.text[:300]))
            page.goto(
                f"{serve.frontend}/project/{dashboard}", wait_until="networkidle", timeout=60000
            )
            settled = page.evaluate(SETTLE_SCRIPT, expected)
            if not settled:
                errors.append(f"not settled after {SETTLE_TIMEOUT_MS // 1000}s")
            page.wait_for_timeout(1000)
            facts = page.evaluate(FACTS_SCRIPT)
            # Playwright's full_page capture re-lays out the page mid-shot and
            # photographs a transient frame: at 390 px, rows the DOM has stacked
            # come out side by side. Grow the viewport to the dashboard's bottom
            # edge instead (the document itself stretches to the viewport), then
            # take a plain shot.
            bottom = page.evaluate(DASHBOARD_BOTTOM_SCRIPT)
            page.set_viewport_size({"width": width, "height": max(bottom, 900)})
            if not page.evaluate(SETTLE_SCRIPT, expected):
                errors.append("not settled after resizing to the dashboard")
            page.wait_for_timeout(500)
            facts = {**page.evaluate(FACTS_SCRIPT), "page_height": max(bottom, 900)}
            page.screenshot(path=path)
            return {**facts, "console_errors": errors}
        finally:
            browser.close()


def count_visuals(node):
    if isinstance(node, dict):
        own = 1 if (node.get("chart") or node.get("table")) else 0
        return own + sum(count_visuals(v) for k, v in node.items() if k in ("rows", "items"))
    if isinstance(node, list):
        return sum(count_visuals(v) for v in node)
    return 0


def final_run(serve):
    """The state the turn left the project in — the measurement that matters.

    A turn that ends on a failed run told the user it was done over a build
    that does not work.
    """
    try:
        listed = serve.tool("list_runs", {})
    except Exception as error:
        return {"error": str(error)}
    latest = (listed or {}).get("latest") or {}
    return {
        "state": latest.get("state"),
        "left_failed": latest.get("state") == "failed",
        "error_json": latest.get("error_json"),
    }


def tool_stats(calls):
    names = [c["tool"] for c in calls]
    first_write = next((i for i, n in enumerate(names) if n.startswith("write_")), None)
    first_data = next((i for i, n in enumerate(names) if n in DATA_TOOLS), None)
    counts = {}
    for name in names:
        counts[name] = counts.get(name, 0) + 1
    return {
        "tool_calls": len(names),
        "tool_errors": sum(1 for c in calls if c.get("error")),
        "by_tool": counts,
        "data_before_write": first_data is not None
        and (first_write is None or first_data < first_write),
        "guidance_tools_used": sorted(set(names) & GUIDANCE_TOOLS),
        "skills_read": [
            c["input"].get("name") for c in calls if c["tool"] == "read_skill" and c.get("input")
        ],
        "validated": any(n.startswith("validate_") for n in names),
        "checked_runs": sorted(set(names) & RUN_TOOLS),
    }


def inspect_dashboards(serve, objects, run_dir):
    found = {}
    for name in objects.get("dashboards", {}):
        entry = {
            "validation": serve.tool("validate_dashboard", {"config": objects["dashboards"][name]}),
            "input_wiring": (
                serve.tool(
                    "check_input_wiring",
                    {
                        "inputs": list(objects["inputs"].values()),
                        "insights": list(objects["insights"].values()),
                    },
                )
                if objects.get("inputs")
                else None
            ),
        }
        expected = count_visuals(objects["dashboards"][name])
        entry["expected_visuals"] = expected
        for label, width in (("desktop", 1280), ("mobile", 390)):
            shot = os.path.join(run_dir, f"{name}-{label}.png")
            try:
                entry[label] = screenshot(serve, name, shot, width, expected)
            except Exception as error:
                entry[label] = {"error": str(error)[:300]}
        found[name] = entry
    return found


def run_one(serve, condition, item, model, run_dir, dataset):
    os.makedirs(run_dir, exist_ok=True)
    serve.reset()
    if condition == "builtin":
        client = run_builtin(serve, item["prompt"], run_dir)
    else:
        client = run_claude(
            serve, item["prompt"], model, run_dir, with_skills=condition == "mcp+skills"
        )
    objects = serve.snapshot()
    with open(os.path.join(run_dir, "objects.json"), "w") as out:
        json.dump(objects, out, indent=2, default=str)
    summary = {
        "dataset": dataset["name"],
        "dataset_description": dataset["description"],
        "prompt_id": item["id"],
        "prompt": item["prompt"],
        "expected_dashboard": item.get("dashboard"),
        "expects": item.get("expects", []),
        "condition": condition,
        "model": model if condition != "builtin" else "builtin",
        "client": {k: v for k, v in client.items() if k != "calls"},
        "stats": tool_stats(client["calls"]),
        "calls": client["calls"],
        "object_counts": {k: len(v) for k, v in objects.items()},
        "dashboards": inspect_dashboards(serve, objects, run_dir),
        "final_run": final_run(serve),
    }
    expected = item.get("dashboard")
    summary["expected_dashboard_built"] = (
        bool(summary["dashboards"]) if expected is None else expected in summary["dashboards"]
    )
    with open(os.path.join(run_dir, "summary.json"), "w") as out:
        json.dump(summary, out, indent=2, default=str)
    return summary


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--backend", default="http://localhost:8011")
    parser.add_argument("--frontend", default="http://localhost:3011")
    parser.add_argument("--dataset", default="taxi", help="a directory under datasets/")
    parser.add_argument("--conditions", default="mcp")
    parser.add_argument("--prompts", default="all", help="comma-separated prompt ids, or 'all'")
    parser.add_argument("--model", default="sonnet")
    parser.add_argument("--repeats", type=int, default=1)
    parser.add_argument("--out", required=True)
    parser.add_argument("--allow-stale-viewer", action="store_true")
    args = parser.parse_args()
    stale = None if args.allow_stale_viewer else stale_viewer_bundle()
    if stale:
        sys.exit(stale)

    dataset = yaml.safe_load(open(os.path.join(HERE, "datasets", args.dataset, "prompts.yml")))
    suite = dataset["prompts"]
    if args.prompts != "all":
        wanted = args.prompts.split(",")
        suite = [p for p in suite if p["id"] in wanted]
    serve = Serve(args.backend, args.frontend)
    stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    for condition in args.conditions.split(","):
        for item in suite:
            for repeat in range(args.repeats):
                run_dir = os.path.join(
                    args.out, f"{args.dataset}__{condition}__{item['id']}__{repeat}"
                )
                print(f"[{stamp}] {condition} {item['id']} #{repeat} ...", flush=True)
                summary = run_one(serve, condition, item, args.model, run_dir, dataset)
                stats = summary["stats"]
                print(
                    f"    {summary['client']['elapsed_s']}s, {stats['tool_calls']} calls, "
                    f"{stats['tool_errors']} errors, dashboards={list(summary['dashboards'])}",
                    flush=True,
                )


if __name__ == "__main__":
    sys.exit(main())
