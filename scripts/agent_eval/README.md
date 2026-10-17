# Agent eval

Runs fixed prompts against a live `visivo serve`, records what the agent did,
renders every dashboard it built and scores the result with an LLM judge.

## Set up

1. Build the eval project data (once):

   ```bash
   bash scripts/agent_eval/seed_taxi.sh
   ```

2. Start a sandbox on the eval project. Use ports that no other sandbox uses:

   ```bash
   VISIVO_SANDBOX_NAME=eval VISIVO_SANDBOX_BACKEND_PORT=8011 VISIVO_SANDBOX_FRONTEND_PORT=3011 \
   VISIVO_SANDBOX_PROJECT_DIR=$PWD/test-projects/agent-dogfood bash scripts/sandbox.sh start
   ```

3. Install the browser for screenshots: `pip install playwright pillow && playwright install chromium`.

The `mcp` conditions need the `claude` CLI. The `builtin` condition needs a
model the agent can resolve (`visivo authorize`, or a provider key).

## Run

```bash
python scripts/agent_eval/run.py --conditions mcp,mcp+skills --out /tmp/eval/r1
python scripts/agent_eval/judge.py --runs /tmp/eval/r1
python scripts/agent_eval/report.py --runs /tmp/eval/r1 --out /tmp/eval/r1/report.html
```

Each run discards all drafts first, so runs do not see each other's work. Do
not use the eval sandbox in a browser while a run is in progress: opening a
dashboard starts a run on the serve.

## Conditions

| Condition | Client |
| --- | --- |
| `mcp` | Claude Code headless with only the serve's MCP tools. |
| `mcp+skills` | The same, plus the skills the built-in loop gets in its system prompt. |
| `builtin` | The built-in loop through `POST /api/agent/`. |

## Output per run

| File | Content |
| --- | --- |
| `transcript.jsonl` / `transcript.json` | The client's full transcript. |
| `objects.json` | Every draft object the agent wrote. |
| `<dashboard>-desktop.png`, `-mobile.png` | Full-page captures at 1280 px and 390 px. |
| `summary.json` | Tool-call statistics, validation, input wiring and render facts. |
| `judge.json` | Rubric scores (`rubric.md`), defects, and the rule that would prevent each one. |
