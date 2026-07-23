import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  // 2 retries absorb transient flakes from concurrent sandbox job-polling races
  // (insight-jobs, model-query-jobs) and mouse-coordinate flakes (US-REF-11)
  // without hiding real regressions.
  retries: 2,
  workers: '75%',
  use: {
    // Defaults to the standard sandbox (:3001). An isolated hardening sandbox
    // (e.g. :3022) can be targeted via PLAYWRIGHT_BASE_URL without editing this
    // file, so parallel agents don't collide on ports.
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3001',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  // Three projects:
  //   parallel        — read-only specs, sandbox on :3001 (integration project)
  //   state-mutating  — in-memory save specs, sandbox on :3001, runs after parallel
  //   (the isolated file-mutating 'publish' project is currently EMPTY — the
  //   Phase 3b cutover deleted its one file, explorer-publish-to-files.spec.mjs,
  //   whose mount (the standalone /explorer route) no longer exists; Phase 4's
  //   exploration-promote.spec.mjs is the named successor for its YAML
  //   round-trip coverage and should recreate an equivalent isolated-sandbox
  //   project — test-projects/explorer-publish-e2e — when it lands)
  projects: [
    {
      name: 'parallel',
      testIgnore: [
        '**/build-mode-publish.spec.mjs',
        '**/external-edit-banner.spec.mjs',
        // Phase 6 D7 (VIS-1087's remaining half): fires a real POST
        // /api/commit/ against shared sandbox state — same isolation need
        // as the two files above (registered in the 'workspace-publish'
        // project's testMatch).
        '**/cross-tab-soft-reload-project-runs.spec.mjs',
        '**/library-inline-create.spec.mjs',
        '**/validation-as-save.spec.mjs',
        // VIS-993 regression: canvas edits must persist to the DRAFT CACHE
        // (backend), so this story writes state and runs serially.
        '**/canvas-editing.spec.mjs',
        // Phase 2 e2e gate (VIS-1050): explorations live in ONE file-backed
        // repository shared by every worker (`.visivo/explorations/`, no
        // per-worker isolation like localStorage-scoped Phase 0 state) — see
        // the 'exploration-mutations' project below.
        '**/explorer-home.spec.mjs',
        '**/exploration-lifecycle.spec.mjs',
        // Phase 3a (VIS-1053/1054): both create/delete real backend
        // exploration records via the same shared `.visivo/explorations/`
        // repository (query-chip CRUD mutates the draft directly; the DnD
        // pull-in specs each mint + clean up an exploration) — same
        // isolation need as the two specs above, same project.
        '**/exploration-dnd-pull-in.spec.mjs',
        '**/exploration-query-chips.spec.mjs',
        // Phase 3b (VIS-1057/1058/1059/1060): same shared-repository
        // isolation need — the Build rail / pill grammar specs each mint
        // (and the cutover-redirect spec's dashboard-scoped-route test
        // mints) a real exploration record.
        '**/exploration-build-rail.spec.mjs',
        '**/pill-aggregation.spec.mjs',
        '**/post-cutover-redirects.spec.mjs',
        // Phase 4 (VIS-1062-1066/VIS-1081): same shared-repository isolation
        // need — each promotes real backend objects (models/insights/charts/
        // metrics) via the same shared per-project collections a concurrent
        // 'parallel' worker's own spec run could observe/collide with (gate-1
        // finding: run under 'parallel' with retries masked genuine
        // interference into flaky-looking failures across three unrelated
        // specs, plus 3 singles in already-serial specs).
        '**/exploration-promote.spec.mjs',
        '**/exploration-preview.spec.mjs',
        '**/save-as-metric.spec.mjs',
        // Gate Hardening (VIS-1082-1086 + P4-D1/P4-D4): race-inducing,
        // route-intercepting, backend-state-mutating specs — serial only.
        '**/exploration-promote-tab-race.spec.mjs',
        '**/exploration-cross-session-delete.spec.mjs',
        '**/exploration-concurrent-rename-and-draft-sync.spec.mjs',
        '**/explorer-create-race.spec.mjs',
        '**/exploration-duplicate-race.spec.mjs',
        '**/explorer-cold-session-default-source.spec.mjs',
        // B14 part 2: its exploration-workbench anchor check now mints a
        // real exploration too (the old standalone /explorer route let it
        // assume anchors render eagerly with no open document; the new
        // Explorer Home doesn't).
        '**/onboarding-coach-anchors.spec.mjs',
        // Phase 5 (VIS-1067–1072/VIS-1091-1095): same shared-repository
        // isolation need — each mints real backend exploration records
        // (and, for the flywheel/dashboard specs, real models/metrics/
        // insights/charts and a real dashboard's config).
        '**/explore-this-flywheel.spec.mjs',
        '**/dashboard-newchart-roundtrip.spec.mjs',
        '**/exploration-staleness.spec.mjs',
        // Phase 6 (VIS-1073-1076/VIS-1088-1090 armor + P5-D6/P5-D-final-
        // delta gap closures): same shared `.visivo/explorations/`
        // repository isolation need — each mints (and most delete) real
        // backend exploration records.
        '**/exploration-computed-columns.spec.mjs',
        '**/workspace-tab-close-dialog-navigation.spec.mjs',
        '**/workspace-back-forward-exploration.spec.mjs',
        '**/workspace-dnd-mid-drag-destination-switch.spec.mjs',
        '**/workspace-tab-phantom-exploration.spec.mjs',
        '**/exploration-duplicate.spec.mjs',
        '**/workspace-cross-tab-tabset.spec.mjs',
        '**/exploration-cross-tab-concurrency.spec.mjs',
        '**/exploration-cross-tab-dnd-isolation.spec.mjs',
        // Phase 6c-T1 (ux-audit.md "post-promote offers never appear" /
        // "no staleness indication" findings): each mints real backend
        // exploration + model/insight/chart records via the same shared
        // `.visivo/explorations/` repository — same isolation need as every
        // other exploration-mutating spec above.
        '**/exploration-promote-fallback-dashboard-offer.spec.mjs',
        '**/exploration-staleness-drift.spec.mjs',
        // Phase 6c-T5 (ux-audit.md Lifecycle/entry-point/persistence
        // findings): each mints real backend exploration records via the
        // same shared `.visivo/explorations/` repository — same isolation
        // need as every other exploration-mutating spec above.
        '**/explore-this-semantic-layer-erd.spec.mjs',
        '**/explore-this-dashboard-chart.spec.mjs',
        '**/exploration-reload-persistence.spec.mjs',
        // Chart-building loop (computed column -> prop well, layout prop
        // edit, type switch): mints a real exploration + computed columns
        // against the shared `.visivo/explorations/` repository.
        '**/exploration-chart-build-updates.spec.mjs',
        // Docs specs run against the docs sandbox (:8003) via
        // playwright.docs.config.mjs — never against the viewer sandbox.
        '**/e2e/docs/**',
      ],
    },
    {
      name: 'state-mutating',
      testMatch: [
        // Drafts objects into the backend cache via the Library create flow.
        '**/library-inline-create.spec.mjs',
        // VIS-993: the valid-save step drafts a dimension into the cache.
        '**/validation-as-save.spec.mjs',
        // VIS-993 regression: canvas resize/DnD edits draft dashboard changes
        // into the cache and assert them via /api/dashboards/ + reload.
        '**/canvas-editing.spec.mjs',
      ],
      dependencies: ['parallel'],
    },
    {
      // Track H stories (VIS-806/808) — both mutate the integration project's
      // YAML on disk (publish writes / external-edit simulation), so they get
      // the same isolation as 'publish': serial, no retries (a retry would
      // race the file-watcher recompile triggered by the previous attempt's
      // YAML restore and see phantom pending changes). Targets its own
      // sandbox via VIS_PUBLISH_BASE.
      //
      // Phase 6 P6-D9 (e2e-gap-review.md "Phase 6 delta pass") —
      // `cross-tab-soft-reload-project-runs.spec.mjs` was added here
      // alongside the two original Track H files, but (unlike them) its
      // default BASE falls back to the SHARED :3001/:8001 sandbox rather
      // than the isolated :3051/:8051 one whenever VIS_PUBLISH_BASE isn't
      // set — exactly how this repo's own documented full-suite invocation
      // runs (the ':8001/:3001' sandbox). `workers: 1`/serial-WITHIN-this-
      // project alone doesn't help there: with no `dependencies`, Playwright
      // schedules 'workspace-publish' to run CONCURRENTLY (same wall-clock
      // window) as 'parallel' and 'exploration-mutations' — so this spec's
      // real `POST /api/commit/` (rewriting project.visivo.yml + an
      // unscoped `reload` socket broadcast to every connected page) could
      // fire mid-run against the same shared sandbox ~150 'parallel' specs
      // and the 31-spec 'exploration-mutations' suite are using, risking
      // nondeterministic interference with either.
      //
      // Serialization is BY INVOCATION, deliberately NOT by `dependencies`:
      // a project dependency only runs its dependents after the dependency
      // project fully PASSES, and 'parallel' contains specs that can only
      // pass under their own dedicated-sandbox harness (per-spec ports —
      // see e.g. project-canvas/canvas-* BASE fallbacks), so in the
      // standard :8001/:3001 topology a dependency edge here means this
      // project NEVER runs at all (verified: 3/3 full-directory runs, 73
      // dependency failures, 0 workspace-publish tests executed). It also
      // balloons any CLI file filter that touches this project into running
      // the entire ~150-file 'parallel' project first.
      //
      // The canonical gate therefore runs TWO STAGES against the shared
      // sandbox: stage A = the curated acceptance list (parallel +
      // exploration-mutations, concurrently, no publish specs), then
      // stage B = `npx playwright test --project=workspace-publish` alone
      // once stage A has fully drained. Full-directory `npx playwright
      // test e2e/stories/` is NOT a supported invocation on the shared
      // sandbox (the dedicated-sandbox specs above fail environmentally).
      // 'exploration-mutations' declines a dependency edge for the same
      // reason (see its own comment below); it only ever mutates the
      // isolated `.visivo/explorations/` JSON repository, never
      // `project.visivo.yml` or an unscoped socket broadcast, so it does
      // not carry this project's specific risk.
      name: 'workspace-publish',
      testMatch: [
        '**/build-mode-publish.spec.mjs',
        '**/external-edit-banner.spec.mjs',
        // Phase 6 D7 (VIS-1087's remaining half): fires a real POST
        // /api/commit/ against shared sandbox state — same isolation need
        // as the two files above.
        '**/cross-tab-soft-reload-project-runs.spec.mjs',
      ],
      fullyParallel: false,
      workers: 1,
      retries: 0,
    },
    {
      // Explore 2.0 Phase 2 e2e gate: explorations are S3'd to ONE JSON
      // repository under `.visivo/explorations/` (ExplorationRepository),
      // shared by every worker against the same :3001 sandbox — unlike Phase
      // 0's tab/view-switcher stories, which only ever touch per-worker
      // in-memory Zustand state. Running these concurrently means one
      // worker's create/rename/delete races another's list fetch (e.g. a
      // fresh page's "lazily seed Scratch" firing against a directory another
      // worker just emptied), so — same precedent as 'publish' /
      // 'workspace-publish' — they get their own serial, no-retry project.
      //
      // Deliberately NO `dependencies: ['parallel']` here (unlike
      // 'state-mutating'): a Playwright project dependency always runs the
      // ENTIRE dependency project, ignoring any file-name filter on the CLI
      // invocation — `npx playwright test explorer-home.spec.mjs` would
      // silently balloon into running all ~150 'parallel' spec files first.
      // 'exploration-mutations' runs CONCURRENTLY with 'parallel' (same as
      // 'publish'/'workspace-publish'); a single observed flake under
      // combined 5-worker load (a slow round-trip missing a 15s timeout) was
      // not reproducible across 7+ repeated runs and wasn't worth the
      // dependency's cost.
      name: 'exploration-mutations',
      testMatch: [
        '**/explorer-home.spec.mjs',
        '**/exploration-lifecycle.spec.mjs',
        // Phase 3a additions (VIS-1053/1054) — see the 'parallel' project's
        // testIgnore entry for the same two files for why.
        '**/exploration-dnd-pull-in.spec.mjs',
        '**/exploration-query-chips.spec.mjs',
        // Phase 3b additions (VIS-1057/1058/1059/1060) — same shared-
        // repository isolation need, from the START per this phase's gate.
        '**/exploration-build-rail.spec.mjs',
        '**/pill-aggregation.spec.mjs',
        '**/post-cutover-redirects.spec.mjs',
        '**/onboarding-coach-anchors.spec.mjs',
        // Phase 4 additions (VIS-1062-1066/VIS-1081) — see the 'parallel'
        // project's testIgnore entry for the same three files for why.
        '**/exploration-promote.spec.mjs',
        '**/exploration-preview.spec.mjs',
        '**/save-as-metric.spec.mjs',
        // Gate Hardening (VIS-1082-1086 + Phase 4 delta P4-D1/P4-D4): same
        // shared-repository isolation need — mints real backend exploration
        // + promoted-object records, and P4-D1's story deliberately holds a
        // real network request open via page.route(), which must never race
        // another worker's own promote flow against the same sandbox.
        '**/exploration-promote-tab-race.spec.mjs',
        '**/exploration-cross-session-delete.spec.mjs',
        '**/exploration-concurrent-rename-and-draft-sync.spec.mjs',
        '**/explorer-create-race.spec.mjs',
        '**/exploration-duplicate-race.spec.mjs',
        '**/explorer-cold-session-default-source.spec.mjs',
        // Phase 5 additions (VIS-1067-1072/VIS-1091-1095) — see the
        // 'parallel' project's testIgnore entry for the same three files
        // for why.
        '**/explore-this-flywheel.spec.mjs',
        '**/dashboard-newchart-roundtrip.spec.mjs',
        '**/exploration-staleness.spec.mjs',
        // Phase 6 additions (VIS-1073-1076/VIS-1088-1090 armor + P5-D6/
        // P5-D-final-delta gap closures) — see the 'parallel' project's
        // testIgnore entry for the same files for why.
        '**/exploration-computed-columns.spec.mjs',
        '**/workspace-tab-close-dialog-navigation.spec.mjs',
        '**/workspace-back-forward-exploration.spec.mjs',
        '**/workspace-dnd-mid-drag-destination-switch.spec.mjs',
        '**/workspace-tab-phantom-exploration.spec.mjs',
        '**/exploration-duplicate.spec.mjs',
        '**/workspace-cross-tab-tabset.spec.mjs',
        '**/exploration-cross-tab-concurrency.spec.mjs',
        '**/exploration-cross-tab-dnd-isolation.spec.mjs',
        // Phase 6c-T1 additions — see the 'parallel' project's testIgnore
        // entry for the same two files for why.
        '**/exploration-promote-fallback-dashboard-offer.spec.mjs',
        '**/exploration-staleness-drift.spec.mjs',
        // Phase 6c-T5 additions — see the 'parallel' project's testIgnore
        // entry for the same three files for why.
        '**/explore-this-semantic-layer-erd.spec.mjs',
        '**/explore-this-dashboard-chart.spec.mjs',
        '**/exploration-reload-persistence.spec.mjs',
        // Chart-building loop (computed column -> prop well, layout prop
        // edit, type switch): mints a real exploration + computed columns
        // against the shared `.visivo/explorations/` repository.
        '**/exploration-chart-build-updates.spec.mjs',
      ],
      fullyParallel: false,
      workers: 1,
      retries: 0,
    },
  ],
  // No webServer config — sandbox must be started separately
  // via `visivo serve --port 8001` + `yarn start:sandbox`
  // This keeps Claude's tests fully isolated from user's :3000/:8000
});
