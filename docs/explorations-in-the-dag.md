# Explorations in the DAG — design spike

**Status:** open questions, no implementation. Tracked as VIS-1116. Written after Explore 2.0 (#527)
merged, from the still-open review thread on `viewer/src/api/insightExecuteDraft.js`.

## Why

Today an exploration executes outside every mechanism the rest of the project
uses. A scratch query chip's SQL goes to `POST /api/model-query-jobs/`, which
holds the result in `ModelQueryJobManager` — an in-process dict with a one-hour
TTL — and hands rows to browser DuckDB-WASM, where computed columns and metrics
are evaluated. `execute_and_get_result` is called without `output_dir`, so
**nothing is written to disk**. The only path from an exploration to a real
artifact is promote → commit → run, and by then it is no longer an exploration.

That leaves a whole second execution stack — its own job manager, its own
poller, its own in-browser evaluator — parallel to the DAG that already knows
how to resolve refs, order work, and write artifacts.

The proposal from the review thread:

> "…if we are truly running insight jobs, then we should combine this into the
> 'run project dag changes' and then get these changes into the project dag. So
> if an exploration references other items, that would get resolved if the
> `project.explorations.insight` was picked up by the dag… If we do it this way,
> then there is only two 'outside of dag' jobs. 1, is the 'test-connection' which
> is running before a source is ever saved. The other is the model's 'run' button."

The second half is already true: test-connection became create-then-poll on both
servers (visivo#546 / core#311), leaving it and the model run button as the two
deliberate exceptions.

## What this reverses

`visivo/models/exploration.py` opens:

> "Deliberately NOT part of the Project DAG / project YAML: explorations are
> scratch workbench state, not committed config. This module must never be
> imported by `visivo.models.project` or anything it pulls in…"

and `tests/models/test_exploration.py` enforces it —
`test_project_module_does_not_import_exploration` and
`test_exploration_module_not_in_project_schema_defs`. `PROJECT_CHILDREN`
(`visivo/utils.py`) has no `explorations` entry, there is no parser, and nothing
reads explorations from `project.visivo.yml`.

Reversing this is legitimate. It is not a refactor: those guards exist because
someone decided the opposite, and they have to be rewritten deliberately.

## Decision already taken: hybrid execution

The DAG run produces the durable assets. **The in-browser DuckDB-WASM path
stays** for typing-speed feedback.

Two execution paths coexist on purpose, and the numbers force it rather than
merely favouring it. VIS-1115 measured a scoped run on dev:

```
runner.timing: visivo run 22.69s
  Compile completed in 6.57s   imports: 0.03s, parse: 6.55s
  Run finished in 0.87s
runner.timing: total in-container 24.22s
```

**24.22 seconds to do 0.87 seconds of data work**, with cold start already at
zero — the warm pool removed that. Roughly 4.1s is fixed CLI boot, 6.55s is
parse, and ~10.3s is still unattributed. Until that overhead is understood and
cut, a run cannot be in the loop of someone editing SQL. The run is what makes
results *durable and shareable*, not what makes them *appear*.

This also means the "collapse to one path" option stays open but is gated on
VIS-1115: if per-run overhead came down far enough, revisiting is reasonable.
It should be a measurement, not a preference.

## Open questions

### 1. Lifecycle — config or state? (blocks everything else)

From the thread: *"explorations feel like they are never serialized to disk at
this point, maybe that changes… The question main question is what is new vs
modified in the project."*

Today an exploration is one JSON document per id under
`.visivo/explorations/<id>.json` (`ExplorationRepository`), deliberately outside
`target/` so it survives `rm -rf target`, and deliberately not YAML so the hot
reloader ignores it.

If explorations join the DAG, does that stay? A DAG node normally comes from
committed config. An exploration that is DAG-resident but not committed is a new
category, and the commit/pending-changes machinery
(`visivo/server/views/commit_views.py`, core's `pending_changes`) has no answer
for it yet.

### 2. What is the node — the exploration or its insights?

The thread suggests the latter (`project.explorations.insight`). The DAG walks
`PROJECT_CHILDREN` and filters by `.name` (`parse_filter_str`,
`visivo/models/dag.py`), so whatever becomes a node needs a stable, unique name.
An exploration's *insights* are what actually produce data; the exploration is a
container.

### 3. Naming is a correctness problem once they are nodes

VIS-1102 already flagged that scratch chips and their insights carry generic
`model` / `insight` names that pollute a project on save. While explorations sit
outside the DAG that is cosmetic. As DAG nodes with `--dag-filter +name+`
scoping, two explorations with an insight called `insight` collide.

### 4. `legacy_state`

`ExplorationDraft.legacy_state` is an opaque `dict` carrying the legacy
`explorerStore` shape verbatim — explicitly "never read or validated" by the
backend. It cannot be typed into a DAG node as it stands.

### 5. The cloud twin is mostly already built

Core has **no** exploration concept (VIS-1077, backlog; contract freeze
VIS-1032). The encouraging part: core already has the entire
"change → scoped run" pipeline this design wants.

```
resource save
  -> request_auto_run            creates a queued Run
  -> auto_run_draft (debounced)  apps/deploys/tasks.py
       unbuilt_changes(project)  services/changes.py — what needs rebuilding
       run_dag_filter(...)       -> "+name+,+name+"
       submit_run
```

Participation is mostly: an `Exploration` model, an entry in `RESOURCE_TYPES`
(`api/apps/deploys/resources.py`), and a `data_hash` so a change registers as
unbuilt. The rest — debounce, scoping, the staged-changes surface, the commit
gate — already works and would pick explorations up for free.

Note that `data_hash` is the *query-relevant* subset of a config: a presentation
edit must not trigger a run. Deciding which parts of an exploration draft are
data-relevant is question 1 wearing a different hat.

## Suggested sequencing

1. Answer question 1. Everything else follows from it.
2. Decide the node (question 2) and fix naming (question 3) — naming has to land
   first or the DAG filter is ambiguous.
3. `visivo/jobs/run_exploration_job.py` alongside `run_insight_job` /
   `run_sql_model_job`; exploration entry in the `PROJECT_CHILDREN` walk;
   rewrite the two guard tests to assert the new intent.
4. Cloud: `Exploration` + `RESOURCE_TYPES` + `data_hash` (VIS-1077).
5. Keep the DuckDB-WASM preview throughout. Only revisit it once VIS-1115 has
   cut per-run overhead enough that the run path could plausibly be the sole
   one — and re-measure in cloud, where a pool claim and poll add to it.

## What is NOT in scope

Removing the model's run button or test-connection from their outside-the-DAG
status — both are deliberate, and test-connection has just been rebuilt on the
job contract in visivo#546 / core#311.
