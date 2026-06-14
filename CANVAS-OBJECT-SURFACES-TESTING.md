# Canvas Object Surfaces — Testing Guide

This PR gives **every Visivo object type a useful middle-pane canvas** in the
Workspace, unified behind one extensible canvas registry, and fixes the
acceptance issues found while reviewing the Wave-1 PRs (#495/#496/#497 — whose
work is folded in here, so those can be closed as superseded).

Everything below is verified by unit tests + Playwright e2e + manual checks, but
here are the **user stories to walk through** yourself.

## How to run

- **Sandbox (recommended):** from the repo root, `bash scripts/sandbox.sh start`
  serves the integration project on `http://localhost:3001` (backend `:8001`).
  Then open `http://localhost:3001/workspace`.
- Or point at your own `visivo serve` + `yarn dev`.
- All stories use the **integration test project** object names.

> Throughout: the middle pane is the **Canvas**; the right rail has **Outline/Data**
> + **Edit** tabs; the lens picker (top-right of the canvas) toggles **Canvas ↔
> Lineage** (and, for some types, extra lenses like **Edit** / **Build**).

---

## 1. Acceptance fixes (Wave-1 review feedback)

**1.1 Source-outline caching + cold-gating**
1. Workspace → Data Layer → Sources → click **local-duckdb**.
2. Right rail → **Data** tab → the schema tree renders.
3. Click **local-postgres** (it can't connect) → you see **"No schema cached
   yet" + Generate schema** (the cold state only shows when the API truly has no
   cached schema).
4. Click back to **local-duckdb** → the tree returns **instantly** with no
   re-introspection (it's cached in the store for the session). ✅ no spinner,
   no spurious Generate button.

**1.2 Wide tables scroll instead of overflowing** — open the **wide-table-dashboard**;
the wide table scrolls **inside its slot** rather than pushing the page sideways.

**1.3 Column-profile info icon is Explorer-only** — open **table-dashboard**; the
table column headers have **no** "ℹ︎ profile" button (it was a dead button on
read-only canvases). The icon still works in **Explorer**.

**1.4 Canvas tab label** — selecting any object, the first lens always reads
**"Canvas"** (never "Preview").

---

## 2. VIS-1001 — Unified object-canvas framework

Every non-dashboard object now opens through one shared **ObjectCanvasFrame**:
a titled SubBar (tinted type icon + `name · Type`), an N-way lens picker, a
lens-aware **read-only pill** (or a **dirty indicator** on editable lenses), and
lazy-loaded bodies.

1. Select a **chart**, **table**, **insight**, **input**, **markdown**, **model** —
   each opens its Canvas with the **Read-only** pill + a **Canvas | Lineage**
   picker. Flip to **Lineage** and back.
2. Select **csv** (a csvScriptModel, shown under Models) → it renders the **Model
   canvas** (previously these fell through to Lineage / "not found"). ✅
3. Select a **source** / **dimension** / **metric** / **relation** → see §5/§7/§8 —
   these used to be muted-to-Lineage and now have real canvases.

---

## 3. Wave-1 surfaces (VIS-1002 / 1003 / 1004)

**3.1 Insight preview (VIS-1002)** — select **simple-scatter-insight** → its Canvas
renders a **real Plotly chart** (published insights used to spin forever).

**3.2 Input widgets in previews (VIS-1003)** — select **split-input-test-insight**
→ the preview renders the **input widget(s)** around the chart and still plots
(input-driven objects used to hang).

**3.3 Source schema outline (VIS-1004)** — covered in §1.1 (right-rail Data tab).

---

## 4. VIS-1010 — Markdown editor canvas (editable lens)

1. Workspace → Layout Items → Markdowns → select **welcome-note**.
2. The Canvas shows the rendered markdown (read-only). The lens picker now has a
   third lens: **Edit**.
3. Click **Edit** → a split editor (textarea + **live preview**). The pill
   becomes a **dirty indicator** (not the read-only lock).
4. Type → the live preview updates and the indicator shows **Unsaved**; it
   auto-saves (debounced) and settles back to **Saved**.
5. Flip back to **Canvas** → the read-only render reflects your edit.

---

## 5. VIS-1005 — Source ERD canvas

1. Select a source, e.g. **local-sqlite**.
2. Its **Canvas** is now a **React-Flow ERD**: one card per table (orange,
   on-brand), listing columns, with MiniMap + zoom controls. (Sources used to be
   muted to Lineage.)
3. **Right-click a table card** → "Create a model to query this table" → it
   scaffolds a `SELECT * FROM …` model bound to that source and opens it as a
   tab. ("Copy qualified name" is also there.)
4. On the **dist/cloud** build (no `visivo serve`), the source canvas shows an
   **"Available with visivo serve"** state instead of breaking.

## 6. VIS-1014 — Foreign-key relationship edges

The source ERD draws **edges between tables that share a foreign key** (the
backend now introspects FKs into the metadata feed). The integration project's
SQLite tables have no FKs, so you won't see edges there — to verify, point a
source at a DB with FK constraints (or trust the unit tests:
`useSourceErdDag.test.js` + `test_source_introspect_foreign_keys.py`).

## 7. VIS-1013 — Project governance view

1. Open **/workspace** (the **project** is selected by default → Project editor).
2. Scroll to the new **governance** section: **Relations** (every relation in the
   project, with a join summary) and **Semantic Fields** (every metric +
   dimension, with a type chip + expression).
3. Click a relation row → it opens that relation's editor; click a field row →
   opens that metric/dimension. ✅ deep-links into the per-object editor.

---

## 8. VIS-1006 — Relations ERD builder

1. Select a relation, e.g. **local_to_local** (Data Layer → Relations).
2. Its **Canvas** is a React-Flow ERD of the project's models; the existing
   relation renders as an **edge** between its two models. The right rail shows
   the relation editor (condition, join type, default).
3. Author a new relation by dragging from one model's column handle to another's
   → the **Join Operator popover** opens (operator, join type, `${ref()}`
   preview, @-mention model/column pickers, custom-SQL escape hatch) → Save
   writes the relation.
4. **Known limitation:** model **columns** are only listed once hydrated via a
   model run; in a fresh project the cards show "No columns loaded", so
   column-to-column *drag* needs hydration. The graph, existing edges, the popover's
   @-mention authoring, and the right-rail editor all work regardless.

## 9. VIS-1008 — Table Pivot Playground (Build lens)

1. Select a pivot table, e.g. **category-pivot-table** (Layout Items → Tables).
2. The lens picker now has three lenses: **Canvas | Build | Lineage**. Click
   **Build**.
3. The **Pivot Playground**: a Field list, three drop shelves (Columns / Rows /
   Values with per-value aggregation pickers — sum/avg/min/max/count/…), and a
   **live result table** that re-runs on every change. It seeds from the table's
   existing pivot config.
4. Drag a field pill onto a shelf → a chip appears and the result re-runs. The
   pill becomes a **dirty** indicator; **Save** commits the pivot back to the
   table.

## 10. VIS-1009 — Metrics & Dimensions Field Lens

1. Select a **dimension**, e.g. **x_rounded** → the **Dimension Inspector**:
   shows its expression (`ROUND(x, 2)`) bound to its parent model
   (`local_test_table`) and **profiles** the evaluated expression (click Profile;
   uses local DuckDB on the model's data).
2. Select a **metric**, e.g. **avg_value** → the **Metric Playground**: the
   metric (`AVG(value)` on `daily_metrics`), an always-defaulted **split-by** and
   **time-grain** selector.
3. Open a **model** canvas (e.g. a model that owns fields) → a **Semantic Fields**
   strip of its dimension (teal) + metric (cyan) pills.
4. **Known limitation:** the metric **live chart** runs a synthetic single-metric
   insight through the preview pipeline, which can't yet resolve a metric in a
   project whose data hasn't been run — it shows **"Preview Failed"** gracefully.
   The inspector/playground shell + controls work; the live metric chart is a
   tracked backend follow-up. (The Dimension Inspector's profile works.)

## 11. VIS-1007 — Missing-relation inline fix

When an insight/table spans **two unjoined models**, the preview run used to
dead-end on a raw red error. Now the error is **typed** end-to-end and the
preview shows an inline fix card.

**Manual repro** (the integration project has no such insight, so this needs a
2-model setup):
1. Add two models with no relation, e.g. `orders {user_id, amount}` and
   `users {id, age}`; add an insight with x = `${ref(orders).amount}`, y =
   `${ref(users).age}`. `visivo serve`.
2. Select the insight → instead of a red error, an inline **"missing relation"
   card** appears with **"Draw the join"** → opens the VIS-1006 Join Operator
   popover **seeded with both models**.
3. Pick the columns/operator → Save → the relation is written and the **preview
   re-runs green** in place.
4. If two relations connect the pair ambiguously, an **ambiguous-relation**
   path-picker card appears instead.

Covered by backend tests (typed `NoJoinPathError`/`AmbiguousJoinError` →
`error_type`/`error_models` through the run status) + viewer tests (the cards
render for typed errors; the real popover save re-triggers the run).

## (Deferred)

- **VIS-1012** csv/localMerge model **Run** path. The Model canvas already
  **resolves** csvScriptModel / localMergeModel records (no more "not found"),
  but running them live needs a backend terminal-run/generate path; verifying it
  needs a live run, so it's left as a follow-up.

### Known limitations recap (all graceful, none block the canvases)
- **Relations ERD:** model *columns* need a model run to hydrate; until then cards
  read "No columns loaded" and column-drag is unavailable (graph + edges + popover
  @-mention authoring + right-rail editor all work).
- **Metric Field Lens:** the live metric *chart* runs a synthetic insight the
  preview pipeline can't yet resolve in a non-materialized project → "Preview
  Failed" (shell + controls + the Dimension Inspector's profile all work).
- **Telemetry:** `POST /api/telemetry/workspace-event/ → 405` (the VIS-822 relay
  isn't on this branch); best-effort + swallowed.

---

## Automated coverage in this PR

- **Viewer unit tests:** full suite green (~3000+), including new suites for the
  canvas registry, `ObjectCanvasFrame`, `useCanvasRecord`, markdown editor, source
  ERD (+ FK edges), relations ERD / Join popover, pivot playground, dimension/metric
  Field Lens, missing-relation cards, and governance lists. Lint: 0 errors.
- **Backend (pytest + black):** `test_source_introspect_foreign_keys.py` (FK
  introspection), `test_relation_graph.py` (is_default tie-break + typed join
  errors), `test_run_insight_job_join_errors.py` + `test_preview_job_executor.py`
  (typed-error threading).
- **Playwright e2e stories** (`viewer/e2e/stories/`, all green in parallel):
  `canvas-source-outline`, `canvas-insight-input-preview`, `canvas-table-info-icon`,
  `canvas-object-frame`, `canvas-markdown-editor`, `canvas-source-erd`,
  `canvas-relations-erd`, `canvas-pivot-playground`, `canvas-field-lens`,
  `project-governance` (+ `canvas-missing-relation` documented/skipped pending a
  2-model fixture). Run with the sandbox up:
  `cd viewer && npx playwright test e2e/stories/canvas-*.spec.mjs e2e/stories/project-governance.spec.mjs --project=parallel`.

> **Sandbox note:** the e2e sandbox backend runs the repo's *installed* `visivo`
> (via the `venv12` symlink), so backend-only changes (FK introspection, typed
> join errors) are verified by **pytest**, not the live sandbox; the viewer features
> are verified live + by Playwright.
