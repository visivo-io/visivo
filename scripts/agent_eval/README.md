# Agent eval

Runs fixed prompts against a live `visivo serve`, records what the agent did,
renders every dashboard it built and scores the result with an LLM judge.

## Datasets

Each dataset is a project under `test-projects/agent-eval/` with one DuckDB
source and nothing else, plus a prompt set in `datasets/<name>/prompts.yml`.
The databases are not committed. Build them once:

| Dataset | Shape | Build |
| --- | --- | --- |
| `taxi` | 150k NYC yellow-cab trips, Q1 2024 (public domain): transactions, time, money, geography | `bash scripts/agent_eval/datasets/taxi/seed.sh` |
| `saas` | Seeded synthetic B2B SaaS: accounts, users, an event log and monthly MRR | `python scripts/agent_eval/datasets/saas/seed.py` |
| `climate` | Our World in Data CO2 (CC BY 4.0): a country-by-year panel with ~75 measures and aggregate rows | `bash scripts/agent_eval/datasets/climate/seed.sh` |
| `first-dashboard` | The first-dashboard path: 10 messy imported files and 3 databases. Each prompt adds its one source in `setup` | `python scripts/agent_eval/datasets/first-dashboard/seed.py` |
| `first-dashboard-example` | The EV Sales example and the three starter prompts the agent tab offers on it | Nothing: the project is `visivo/templates/samples/ev-sales` |

A prompt can name a `route` (`example`, `file` or `database`). On the `file`
route, `summary.json` records `file_reference`: whether the imported source is
unchanged and no second source reads its file.

## Set up

1. Start a sandbox on a copy of the dataset's project. Use ports that no other sandbox uses:

   ```bash
   cp -R test-projects/agent-eval/taxi /tmp/eval-taxi
   VISIVO_SANDBOX_NAME=eval VISIVO_SANDBOX_BACKEND_PORT=8011 VISIVO_SANDBOX_FRONTEND_PORT=3011 \
   VISIVO_SANDBOX_PROJECT_DIR=/tmp/eval-taxi bash scripts/sandbox.sh start
   ```

2. Install the browser for screenshots: `pip install playwright pillow && playwright install chromium`.

3. Build the viewer the serve hands out: `cd viewer && yarn deploy:local`. The
   agent's `screenshot_dashboard` loads the page from the serve, which serves
   `visivo/viewers/local`, and only a release rebuilds that. The eval renders
   from the dev server. `run.py` refuses to start while the bundle is older than
   the last `viewer/src` commit. Do not commit the rebuilt bundle.

The `mcp` conditions need the `claude` CLI. The `builtin` condition needs a
model the agent can resolve (`visivo authorize`, or a provider key).

## Run

```bash
python scripts/agent_eval/run.py --dataset taxi --conditions mcp --repeats 2 --out /tmp/eval/r1
python scripts/agent_eval/judge.py --runs /tmp/eval/r1
python scripts/agent_eval/report.py --runs /tmp/eval/r1 --out /tmp/eval/r1/report.html
```

Score a dataset that has a `pass_bar` (prompts that must pass per route) and
get the credit p50 and p90 per route as a markdown table:

```bash
python scripts/agent_eval/scorecard.py --runs /tmp/eval/r1
```

A run passes when it built the dashboard the prompt named, every visual
rendered, the last build did not fail and, on the `file` route, the file
reference is kept. The command exits 1 when a route misses its bar.

The viewer's starter prompts (`viewer/src/components/agentStarterPrompts.json`)
must equal the `chip: true` prompts of `first-dashboard-example`; a test fails
otherwise. Add a chip there, score it, then add it to the viewer.

Each run discards all drafts first, so runs do not see each other's work. Do
not open the eval sandbox in a browser while a run is in progress: opening a
dashboard starts a run on the serve.

## Conditions

| Condition | Client |
| --- | --- |
| `mcp` | Claude Code headless with only the serve's MCP tools. |
| `mcp+skills` | The same, plus the always-on skills appended to its system prompt. |
| `builtin` | The built-in loop through `POST /api/agent/`. |

## Output per run

| File | Content |
| --- | --- |
| `transcript.jsonl` / `transcript.json` | The client's full transcript. |
| `objects.json` | Every draft object the agent wrote. |
| `<dashboard>-desktop.png`, `-mobile.png` | Captures at 1280 px and 390 px. |
| `summary.json` | Tool-call statistics, validation, input wiring and render facts. |
| `judge.json` | Rubric scores (`rubric.md`), defects, and the rule that would prevent each one. |

`replay.py <run dir>` loads a run's objects back into a serve to debug it;
`replay.py <runs dir> --recapture` re-renders every run.
