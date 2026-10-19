"""Render judged runs into one self-contained HTML report.

python scripts/agent_eval/report.py --runs <dir> --out report.html --title "Agent eval r1"
"""

import argparse
import base64
import glob
import html
import io
import json
import os
import statistics
import sys

CRITERIA = [
    "answers_prompt",
    "chart_fit",
    "cardinality",
    "metric_semantics",
    "non_triviality",
    "narrative_layout",
    "interactivity",
    "table_use",
    "polish",
    "honesty",
]
SEVERITY_ORDER = {"high": 0, "medium": 1, "low": 2}


def load(runs_dir):
    runs = []
    for path in sorted(glob.glob(os.path.join(runs_dir, "*", "summary.json"))):
        run_dir = os.path.dirname(path)
        summary = json.load(open(path))
        judge_path = os.path.join(run_dir, "judge.json")
        summary["judge"] = json.load(open(judge_path)) if os.path.exists(judge_path) else {}
        summary["dir"] = run_dir
        if not summary["client"].get("invalid"):
            runs.append(summary)
    return runs


def thumbnail(path, width=1000):
    from PIL import Image

    image = Image.open(path).convert("RGB")
    if image.width > width:
        image = image.resize((width, round(image.height * width / image.width)), Image.LANCZOS)
    out = io.BytesIO()
    image.save(out, format="JPEG", quality=72, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode()


def prompt_key(run):
    return f"{run.get('dataset', 'taxi')}/{run['prompt_id']}"


def rendered_ok(run):
    dashboards = run["dashboards"].values()
    return bool(dashboards) and all(
        (d.get("desktop") or {}).get("plots", 0) + (d.get("desktop") or {}).get("tables", 0)
        >= d.get("expected_visuals", 0)
        and not (d.get("desktop") or {}).get("console_errors")
        and not (d.get("desktop") or {}).get("empty_tables")
        for d in dashboards
    )


def pct(values):
    return f"{round(100 * sum(values) / len(values))}%" if values else "–"


def mean(values, digits=1):
    values = [v for v in values if v is not None]
    return f"{statistics.mean(values):.{digits}f}" if values else "–"


def condition_rows(runs, conditions):
    rows = []
    for condition in conditions:
        group = [r for r in runs if r["condition"] == condition]
        totals = [r["judge"].get("total") for r in group if "total" in r["judge"]]
        rows.append(
            "<tr>"
            f"<th scope='row'><span class='cond'>{html.escape(condition)}</span></th>"
            f"<td class='num'>{len(group)}</td>"
            f"<td class='num strong'>{mean(totals)}<span class='of'>/20</span></td>"
            f"<td class='num'>{pct([bool(r['judge'].get('would_ship')) for r in group])}</td>"
            f"<td class='num'>{pct([r['expected_dashboard_built'] for r in group])}</td>"
            f"<td class='num'>{pct([rendered_ok(r) for r in group])}</td>"
            f"<td class='num'>{pct([r['stats']['data_before_write'] for r in group])}</td>"
            f"<td class='num'>{pct([bool(r['stats']['guidance_tools_used']) for r in group])}</td>"
            f"<td class='num'>{pct([r['object_counts'].get('inputs', 0) > 0 for r in group])}</td>"
            f"<td class='num'>{mean([r['stats']['tool_calls'] for r in group], 0)}</td>"
            f"<td class='num'>{mean([r['client']['elapsed_s'] for r in group], 0)}s</td>"
            "</tr>"
        )
    return "\n".join(rows)


def criteria_block(runs, conditions):
    lines = []
    for key in CRITERIA:
        bars = []
        for index, condition in enumerate(conditions):
            scores = [
                r["judge"]["scores"].get(key)
                for r in runs
                if r["condition"] == condition and "scores" in r["judge"]
            ]
            scores = [s for s in scores if s is not None]
            value = statistics.mean(scores) if scores else 0
            bars.append(
                f"<div class='bar c{index}' style='--v:{value / 2:.3f}' title='{html.escape(condition)}: {value:.2f} of 2'>"
                f"<span>{value:.1f}</span></div>"
            )
        lines.append(
            f"<div class='crit'><div class='crit-name'>{key.replace('_', ' ')}</div><div class='bars'>{''.join(bars)}</div></div>"
        )
    return "\n".join(lines)


def run_cell(run, index):
    judge = run["judge"]
    stats = run["stats"]
    total = judge.get("total")
    tone = "good" if (total or 0) >= 16 else "warn" if (total or 0) >= 11 else "bad"
    shots = []
    for name in run["dashboards"]:
        for label in ("desktop", "mobile"):
            path = os.path.join(run["dir"], f"{name}-{label}.png")
            if os.path.exists(path):
                shots.append(
                    f"<figure class='shot {label}'><img loading='lazy' alt='{html.escape(name)} at {label} width' "
                    f"src='{thumbnail(path, 1000 if label == 'desktop' else 420)}'><figcaption>{html.escape(name)} · {label}</figcaption></figure>"
                )
    defects = sorted(
        judge.get("defects") or [], key=lambda d: SEVERITY_ORDER.get(d.get("severity"), 3)
    )
    defect_items = "".join(
        f"<li><span class='sev {html.escape(d.get('severity', 'low'))}'>{html.escape(d.get('severity', ''))}</span>"
        f"<div><p>{html.escape(d.get('what', ''))}</p><p class='prevent'>Prevent with: {html.escape(d.get('prevent_with', ''))}</p></div></li>"
        for d in defects
    )
    tools = ", ".join(stats["guidance_tools_used"]) or "none"
    return f"""
<article class='run c{index}'>
  <header>
    <span class='cond'>{html.escape(run['condition'])}</span>
    <span class='score {tone}'>{total if total is not None else '–'}<small>/20</small></span>
    {"<span class='ship'>would ship</span>" if judge.get('would_ship') else ''}
  </header>
  <p class='verdict'>{html.escape(judge.get('summary') or judge.get('error') or 'Not judged yet.')}</p>
  <dl class='facts'>
    <div><dt>Tool calls</dt><dd>{stats['tool_calls']} ({stats['tool_errors']} errors)</dd></div>
    <div><dt>Time</dt><dd>{run['client']['elapsed_s']}s</dd></div>
    <div><dt>Data first</dt><dd>{'yes' if stats['data_before_write'] else 'no'}</dd></div>
    <div><dt>Guidance tools</dt><dd>{html.escape(tools)}</dd></div>
    <div><dt>Objects</dt><dd>{', '.join(f"{v} {k}" for k, v in run['object_counts'].items() if v) or 'none'}</dd></div>
  </dl>
  <div class='shots'>{''.join(shots) or "<p class='empty'>No dashboard was built.</p>"}</div>
  <details><summary>{len(defects)} defects the judge found</summary><ul class='defects'>{defect_items}</ul></details>
</article>"""


def prompt_sections(runs, conditions, prompts):
    sections = []
    for prompt_id in prompts:
        group = [r for r in runs if prompt_key(r) == prompt_id]
        if not group:
            continue
        cells = "".join(
            run_cell(r, conditions.index(r["condition"]))
            for condition in conditions
            for r in group
            if r["condition"] == condition
        )
        sections.append(
            f"<section class='prompt' id='{html.escape(prompt_id)}'><h3><code>{html.escape(prompt_id)}</code></h3>"
            f"<blockquote>{html.escape(group[0]['prompt'])}</blockquote><div class='runs'>{cells}</div></section>"
        )
    return "\n".join(sections)


def top_defects(runs, limit=12):
    found = []
    for run in runs:
        for defect in run["judge"].get("defects") or []:
            found.append(
                (
                    SEVERITY_ORDER.get(defect.get("severity"), 3),
                    run["condition"],
                    prompt_key(run),
                    defect,
                )
            )
    found.sort(key=lambda item: item[0])
    return (
        "".join(
            f"<li><span class='sev {html.escape(d.get('severity', 'low'))}'>{html.escape(d.get('severity', ''))}</span>"
            f"<div><p><code>{html.escape(prompt_id)}</code> · {html.escape(condition)}: {html.escape(d.get('what', ''))}</p>"
            f"<p class='prevent'>Prevent with: {html.escape(d.get('prevent_with', ''))}</p></div></li>"
            for _, condition, prompt_id, d in found
            if d.get("severity") == "high"
        )
        or "<li>No high-severity defects.</li>"
    )


STYLE = """
:root {
  /* Lab notebook: summary table, then a per-prompt grid of runs side by side. */
  --bg: #fbf9fa; --surface: #ffffff; --ink: #221a1f; --muted: #6d6168; --line: #e6dfe3;
  --accent: #713b57; --c0: #3a6ea5; --c1: #b0563b; --c2: #4f8a5b;
  --good: #2f7a4a; --warn: #a16a0b; --bad: #b23a3a;
  --display: "Fraunces", Georgia, serif; --body: "Instrument Sans", system-ui, sans-serif; --mono: "JetBrains Mono", ui-monospace, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #17121a; --surface: #211a24; --ink: #efe8ec; --muted: #a99ca4; --line: #3a2f3c;
  --accent: #d08cb0; --c0: #7fb0e3; --c1: #e8957a; --c2: #8cc79a; --good: #7fd19c; --warn: #f0c060; --bad: #f08a8a; color-scheme: dark } }
:root[data-theme="dark"] {
  --bg: #17121a; --surface: #211a24; --ink: #efe8ec; --muted: #a99ca4; --line: #3a2f3c;
  --accent: #d08cb0; --c0: #7fb0e3; --c1: #e8957a; --c2: #8cc79a; --good: #7fd19c; --warn: #f0c060; --bad: #f08a8a; color-scheme: dark }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--ink); font: 15px/1.55 var(--body); }
main { max-width: 1240px; margin: 0 auto; padding-block: 32px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 40px; }
h1, h2, h3 { font-family: var(--display); font-weight: 600; text-wrap: balance; margin: 0; }
h1 { font-size: 2.1rem; letter-spacing: -0.01em; } h2 { font-size: 1.35rem; } h3 { font-size: 1.1rem; }
.lede { color: var(--muted); max-width: 70ch; margin: 8px 0 0; }
.meta { display: flex; flex-wrap: wrap; gap: 8px 20px; font: 12px var(--mono); color: var(--muted); margin-top: 12px; }
.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); }
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { padding: 10px 12px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
thead th { font: 600 11px var(--body); text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
tbody tr:last-child > * { border-bottom: 0; }
.num { text-align: right; font-family: var(--mono); font-size: 13px; } .strong { font-weight: 700; font-size: 15px; } .of { color: var(--muted); font-weight: 400; font-size: 11px; }
.cond { font: 600 12px var(--mono); }
.legend { display: flex; gap: 16px; flex-wrap: wrap; font: 12px var(--mono); color: var(--muted); }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: -1px; }
.criteria { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px 28px; }
.crit { display: grid; grid-template-columns: 9.5rem 1fr; gap: 10px; align-items: center; }
.crit-name { font-size: 13px; color: var(--muted); }
.bars { display: grid; gap: 3px; }
.bar { position: relative; height: 14px; background: color-mix(in srgb, var(--line) 60%, transparent); border-radius: 2px; }
.bar::before { content: ""; position: absolute; inset: 0 auto 0 0; width: calc(var(--v) * 100%); border-radius: 2px; background: var(--cc); }
.bar span { position: absolute; right: 4px; top: -1px; font: 10px var(--mono); color: var(--muted); }
.c0 { --cc: var(--c0); } .c1 { --cc: var(--c1); } .c2 { --cc: var(--c2); }
.prompt { display: grid; gap: 12px; padding-top: 8px; border-top: 1px solid var(--line); }
blockquote { margin: 0; padding: 0 0 0 12px; border-left: 3px solid var(--accent); color: var(--muted); max-width: 80ch; }
.runs { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 16px; }
.run { background: var(--surface); border: 1px solid var(--line); border-top: 3px solid var(--cc); border-radius: 8px; padding: 14px; display: grid; gap: 10px; min-width: 0; align-content: start; }
.run header { display: flex; align-items: baseline; gap: 10px; }
.score { margin-left: auto; font: 700 1.4rem var(--mono); } .score small { font-size: 11px; color: var(--muted); font-weight: 400; }
.score.good { color: var(--good); } .score.warn { color: var(--warn); } .score.bad { color: var(--bad); }
.ship { font: 600 11px var(--body); text-transform: uppercase; letter-spacing: 0.05em; color: var(--good); border: 1px solid currentColor; border-radius: 99px; padding: 1px 8px; }
.verdict { margin: 0; }
.facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px 14px; margin: 0; font-size: 12.5px; }
.facts dt { color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; } .facts dd { margin: 0; font-family: var(--mono); font-size: 12px; overflow-wrap: anywhere; }
.shots { display: flex; gap: 10px; align-items: flex-start; }
.shot { margin: 0; min-width: 0; } .shot.desktop { flex: 3; } .shot.mobile { flex: 1; }
.shot img { display: block; width: 100%; border: 1px solid var(--line); border-radius: 4px; cursor: zoom-in; max-height: 520px; object-fit: cover; object-position: top; }
.shot img.open { max-height: none; cursor: zoom-out; }
figcaption { font: 11px var(--mono); color: var(--muted); margin-top: 4px; }
details summary { cursor: pointer; font-size: 13px; color: var(--accent); }
.defects, .top { list-style: none; padding: 0; margin: 8px 0 0; display: grid; gap: 10px; }
.defects li, .top li { display: grid; grid-template-columns: 4.2rem 1fr; gap: 10px; font-size: 13.5px; }
.defects p, .top p { margin: 0; } .prevent { color: var(--muted); font-size: 12.5px; margin-top: 2px !important; }
.sev { font: 600 10px var(--mono); text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 0; text-align: center; border-radius: 3px; height: fit-content; border: 1px solid currentColor; }
.sev.high { color: var(--bad); } .sev.medium { color: var(--warn); } .sev.low { color: var(--muted); }
.empty { color: var(--muted); font-style: italic; }
.notes { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 18px 20px; display: grid; gap: 10px; }
.notes ol { margin: 0; padding-left: 1.3em; display: grid; gap: 8px; max-width: 95ch; }
.notes p { margin: 0; max-width: 95ch; }
code { font-family: var(--mono); font-size: 0.92em; }
a { color: var(--accent); }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
@media (max-width: 560px) { .shots { flex-direction: column; } .crit { grid-template-columns: 7.5rem 1fr; } }
"""


def render(runs, title, notes=""):
    conditions = list(dict.fromkeys(r["condition"] for r in runs))
    prompts = list(dict.fromkeys(prompt_key(r) for r in runs))
    models = sorted({r["model"] for r in runs})
    datasets = sorted({r.get("dataset", "taxi") for r in runs})
    judges = sorted({r["judge"].get("judge_model", "?") for r in runs if r["judge"]})
    legend = "".join(
        f"<span><i class='c{i}' style='background:var(--cc)'></i>{html.escape(c)}</span>"
        for i, c in enumerate(conditions)
    )
    nav = " · ".join(f"<a href='#{html.escape(p)}'>{html.escape(p)}</a>" for p in prompts)
    return f"""<title>{html.escape(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=Instrument+Sans:wght@400;600;700&family=JetBrains+Mono:wght@400;600;700&display=swap">
<style>{STYLE}</style>
<main>
  <header>
    <h1>{html.escape(title)}</h1>
    <p class='lede'>Each run gives one agent client one fixed prompt against a fresh copy of an eval project that holds a raw source only ({html.escape(', '.join(datasets))}). The harness records every tool call, renders each dashboard at 1280 px and 390 px, and an LLM judge scores it on ten criteria, 0–2 each.</p>
    <div class='meta'><span>{len(runs)} runs</span><span>agent model: {html.escape(', '.join(models))}</span><span>judge: {html.escape(', '.join(judges))}</span></div>
  </header>
  {notes}
  <section><h2>By condition</h2><div class='table-wrap' style='margin-top:12px'><table>
    <thead><tr><th>Condition</th><th class='num'>Runs</th><th class='num'>Mean score</th><th class='num'>Would ship</th><th class='num'>Built asked dashboard</th><th class='num'>All visuals rendered</th><th class='num'>Read data before writing</th><th class='num'>Used guidance tools</th><th class='num'>Added inputs</th><th class='num'>Tool calls</th><th class='num'>Time</th></tr></thead>
    <tbody>{condition_rows(runs, conditions)}</tbody></table></div></section>
  <section><h2>Score by criterion</h2><div class='legend' style='margin:10px 0 14px'>{legend}</div><div class='criteria'>{criteria_block(runs, conditions)}</div></section>
  <section><h2>High-severity defects</h2><ul class='top'>{top_defects(runs)}</ul></section>
  <section><h2>Runs by prompt</h2><p class='meta'>{nav}</p></section>
  {prompt_sections(runs, conditions, prompts)}
</main>
<script>document.addEventListener('click', e => {{ if (e.target.matches('.shot img')) e.target.classList.toggle('open'); }});</script>
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runs", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--title", default="Agent Eval")
    parser.add_argument("--notes", help="an HTML fragment shown above the tables")
    args = parser.parse_args()
    runs = load(args.runs)
    with open(args.out, "w") as out:
        out.write(render(runs, args.title, open(args.notes).read() if args.notes else ""))
    print(f"{len(runs)} runs -> {args.out} ({os.path.getsize(args.out) // 1024} KB)")


if __name__ == "__main__":
    sys.exit(main())
