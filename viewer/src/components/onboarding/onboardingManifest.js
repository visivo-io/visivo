/* Onboarding checklist manifest.
 *
 * Single source of truth for what shows up in the post-flow checklist
 * widget. Each item is a pure data record. The `predicate` is a
 * function that returns true when the item should be marked done.
 *
 * Predicate signature:
 *
 *   predicate({ project, sources, models, insights, dashboards, persisted }) -> boolean
 *
 *   project     — the parsed project payload from /api/project/.
 *   sources     — sourceStore.sources (server-side managed list, includes
 *                 entries from `includes:` not just top-level YAML).
 *   models      — modelStore.models (same caveat).
 *   insights    — insightStore.insights.
 *   dashboards  — dashboardStore items if present, else fall back to
 *                 project.project_json.dashboards.
 *   persisted   — the parsed onboarding state from localStorage
 *                 (role / path / source_connected / cloud_connected /
 *                 deployed_at / visited_project_route / ...).
 *
 * Why not just project.project_json.{models,insights}? Because top-level
 * `models:` is empty when the user organizes their YAML through includes,
 * which is the recommended pattern. The dedicated stores fetch the
 * fully-resolved lists from the server.
 *
 * Sticky completion: once a predicate returns true on any render, the
 * hook (useChecklistProgress) records it in persisted.checklist_checked
 * so the row stays done across reloads even if the underlying state
 * later goes away (for example: user creates and then deletes a model).
 *
 * Phase 3 layers in role overrides via ROLE_OVERRIDES below.
 */

export const CHECKLIST_ITEMS = [
  {
    id: 'connect_source',
    label: 'Connect a data source',
    why: 'A Source is the connection to where your data already lives.',
    route: '/editor',                       // the Editor FAB is the canonical
                                            // add-source surface; SourceBrowser
                                            // in /explorer lists existing
                                            // sources but doesn't create them.
    target: 'source-create-button',
    weight: 10,
    predicate: ({ project, sources, persisted }) =>
      (sources?.length ?? 0) > 0 ||
      (project?.project_json?.sources?.length ?? 0) > 0 ||
      !!persisted.source_connected,
  },
  {
    id: 'build_model',
    label: 'Create and run a model',
    why: "A Model is a re-usable SQL definition you'll chart from.",
    route: '/explorer',
    target: 'model-tab-bar',
    weight: 20,
    // Multi-step flow: the Coach walks the user through creating a tab,
    // typing SQL, and running the query before the row checks off.
    // Each step's `done` reads a per-action flag tapped by the host
    // surface — the tab + button (createModelTab), Monaco's onChange
    // (setActiveModelSql), and SQLEditor's handleRun.
    steps: [
      {
        id: 'create_tab',
        target: 'model-tab-bar',
        label: 'Open a new model tab',
        tip: 'Click + on the tab bar to start a Model. Rename it so your team knows what it does.',
        done: ({ persisted }) => !!persisted?.actions?.model_tab_created,
      },
      {
        id: 'write_sql',
        target: 'sql-editor',
        label: 'Write your SQL',
        tip: 'Type a SELECT here. The model is whatever this query returns.',
        done: ({ persisted }) => !!persisted?.actions?.sql_written,
      },
      {
        id: 'run_query',
        target: 'sql-run-button',
        label: 'Run the query',
        tip: 'Click Run (or press Cmd+Enter) to fetch results from your source.',
        done: ({ persisted }) => !!persisted?.actions?.query_run,
      },
    ],
  },
  {
    id: 'create_insight',
    label: 'Create an Insight in Explorer',
    why: 'An Insight is a chart on top of a Model.',
    route: '/explorer',
    target: 'chart-crud-section',
    weight: 30,
    predicate: ({ persisted }) => !!persisted?.actions?.insight_saved,
  },
  {
    id: 'build_dashboard',
    label: 'Build a Dashboard',
    why: 'Arrange Insights and Inputs into a single page.',
    route: '/editor',
    target: 'dashboard-save',
    weight: 40,
    predicate: ({ persisted }) => !!persisted?.actions?.dashboard_saved,
  },
  {
    id: 'view_project',
    label: 'View your Project',
    why: 'See the dashboard your code produces.',
    route: '/project',
    target: 'top-nav-project',
    weight: 50,
    // Real signal now: user has to actually navigate to /project after
    // completing onboarding. The visit is recorded by ProjectVisitTracker
    // mounted under the /project route.
    predicate: ({ persisted }) => !!persisted.visited_project_route,
  },
  {
    id: 'connect_cloud',
    label: 'Connect Visivo Cloud',
    why: 'Sign in to push your dashboard out so a teammate can open it.',
    route: '/editor',
    target: 'top-nav-deploy',
    weight: 55,
    // Set by the onboarding flow's Cloud screen on a successful
    // signup, OR by any future /editor cloud-connect button. Users
    // who connected during onboarding will see this auto-pass.
    predicate: ({ persisted }) => !!persisted.cloud_connected,
  },
  {
    id: 'deploy',
    label: 'Deploy to share',
    why: 'Run visivo deploy to push to cloud.',
    route: '/editor',
    target: 'top-nav-deploy',
    weight: 60,
    // StageSelection.jsx writes persisted.deployed_at on a successful
    // /api/cloud/deploy/ poll response.
    predicate: ({ persisted }) => !!persisted.deployed_at,
  },
];

/* Role overrides — keyed on the role id captured by the onboarding flow.
 *
 * Each entry can specify any combination of:
 *   - replace: { itemId: { ...partial fields to merge into that item } }
 *   - remove:  ['itemId', ...]
 *   - add:     [ { ...full item record }, ... ]
 *
 * Roles without an entry inherit the default CHECKLIST_ITEMS unchanged.
 * Items targeted by `replace` keep their predicate / weight / route /
 * target unless the override explicitly redeclares them — only the
 * label / why / etc tend to vary by role.
 *
 * Two of the items (`define_metric` for analytics engineers, and the
 * "configure_env" item we sketched for consultants) need supporting
 * UI before their predicates can fire — those are flagged in the plan
 * as Phase 5 follow-ups. We still ship the manifest entries today so
 * the roles see the right copy + so the Coach (Phase 4) has a target
 * id to point at as soon as the host UI lands.
 */
export const ROLE_OVERRIDES = {
  analytics_engineer: {
    replace: {
      connect_source: { label: 'Connect your warehouse' },
      // build_model uses the default "Create and run a model" — the
      // multi-step flow walks dbt-fluent users through the same path.
    },
    add: [
      {
        id: 'define_metric',
        label: 'Define a Metric on a Model',
        why: 'A re-usable measure every Insight + chart agrees on.',
        route: '/explorer',
        target: 'metric-add-button',
        weight: 25,
        // Action-based: AddComputedColumnPopover taps
        // recordOnboardingAction('metric_defined') on save. A computed
        // column on a Model is exactly the "re-usable measure" the
        // why-text describes; this satisfies the row when the user
        // actually saves one, not when one happens to pre-exist.
        predicate: ({ persisted }) => !!persisted?.actions?.metric_defined,
      },
    ],
  },

  data_engineer: {
    replace: {
      connect_source: { label: 'Connect your warehouse' },
      create_insight: { label: 'Add a pipeline-health Insight' },
    },
  },

  bi_analyst: {
    replace: {
      connect_source: { label: 'Connect your data warehouse' },
      build_model: { label: 'Save a query as a Model' },
      create_insight: { label: 'Build your first chart' },
    },
  },

  product_analyst: {
    replace: {
      connect_source: { label: 'Connect your event store' },
      create_insight: { label: 'Build a funnel Insight' },
    },
  },

  software_engineer: {
    replace: {
      connect_source: { label: 'Connect a database (Postgres / DuckDB)' },
      build_model: { label: 'Save a `.sql` file as a Model' },
    },
  },

  data_scientist: {
    replace: {
      connect_source: { label: 'Connect your feature store' },
      create_insight: { label: 'Add a model-drift Insight' },
    },
  },

  founder: {
    replace: {
      connect_source: { label: 'Connect Stripe, Postgres, or upload a CSV' },
      deploy: { label: 'Connect Visivo Cloud + share with your team' },
    },
  },

  executive: {
    // An exec lands to consume, not build. Strip the build steps; the
    // remaining items auto-pass for sample-pickers, so the checklist
    // mostly nudges them to connect cloud + deploy if they want a link
    // to share back to the analyst.
    remove: ['build_model', 'create_insight', 'deploy'],
    replace: {
      connect_source: { label: 'Pick a sample to explore' },
      build_dashboard: { label: 'Open your dashboard' },
    },
  },

  consultant: {
    replace: {
      connect_source: { label: "Connect your client's warehouse" },
      deploy: { label: "Deploy this client's dashboard" },
    },
  },

  other: {
    // Lowest-friction set: 4 items (Connect / Dashboard / View /
    // Connect cloud). Tire-kickers feel a win quickly.
    remove: ['build_model', 'create_insight', 'deploy'],
    replace: {
      connect_source: { label: 'Pick a sample to explore' },
    },
  },
};

/**
 * Resolve the final ordered checklist for a given role.
 *
 * Roles without an entry in ROLE_OVERRIDES fall through to the default
 * CHECKLIST_ITEMS. Phase 3 will read `add` / `remove` / `replace` keys
 * from the override and apply them; this function exists now so the
 * call sites lock in the right shape.
 */
export function buildChecklistForRole(roleId) {
  const overrides = ROLE_OVERRIDES[roleId];
  let items = [...CHECKLIST_ITEMS];

  if (overrides) {
    if (overrides.remove?.length) {
      const dropped = new Set(overrides.remove);
      items = items.filter(it => !dropped.has(it.id));
    }
    if (overrides.replace) {
      items = items.map(it =>
        overrides.replace[it.id] ? { ...it, ...overrides.replace[it.id] } : it
      );
    }
    if (overrides.add?.length) {
      items = [...items, ...overrides.add];
    }
  }

  return items.sort((a, b) => a.weight - b.weight);
}
