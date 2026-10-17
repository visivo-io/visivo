# Skills

Task-shaped instructions for the operations agents get wrong unaided.

Tools say what an agent *can* do. `validate_<type>` catches invalid. Skills are
for the third category: **valid but wrong** — configuration Visivo accepts and
then behaves unexpectedly about, which is where hard-won product knowledge
lives.

One copy, two readers. `visivo/agent/skills.py` loads these for the built-in
loop's prompt, and `/api/mcp/` serves the same text to an external client. If
the built-in agent ends up better instructed than an external one, the split
has failed.

Each file is one task. Keep them short.

## Front matter and tiers

Every file opens with front matter: `name`, a one-line `summary`, and
optionally `always`, `family` and `tools`.

- `always: true` puts the body in every prompt (the built-in loop's system
  prompt, and the MCP `initialize` instructions). Together these bodies and the
  index of the rest stay under `MAX_ALWAYS_BYTES` in `skills.py`; a test fails
  past it.
- Every other skill is on demand: the index names it and the agent reads it
  with `read_skill(name)`. A subdirectory is a namespace (`charts/heatmap`).
- `tools: [...]` attaches the skill to the first result of those tools in a
  built-in session.

## Generated skills

`python -m visivo.agent.charting.render` writes them from the YAML rules in
`visivo/agent/charting/rules/`, and tests fail when a committed file differs
from its render. Edit the rule, not the markdown.

- Blocks between `<!-- rules:start -->` and `<!-- rules:end -->` in
  `choose-a-chart`, `design-a-dashboard`, `make-it-interactive`,
  `design-insights` and `charts/table`.
- Whole files: `charts/<family>.md` (one per chart family) and
  `interactions/<pattern>.md`.

A skill names only tools that exist; a test checks every tool name it mentions.
