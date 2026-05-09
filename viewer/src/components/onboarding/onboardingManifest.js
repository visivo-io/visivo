/* Onboarding checklist manifest.
 *
 * Single source of truth for what shows up in the post-flow checklist
 * widget. Each item is a pure data record. The `predicate` is a
 * function that returns true when the item should be marked done.
 *
 * Predicate signature:
 *
 *   predicate({ project, persisted }) -> boolean
 *
 *   project    — the parsed project payload from useStore (full Project
 *                JSON including sources / models / insights / dashboards).
 *   persisted  — the parsed onboarding state from localStorage
 *                (role / path / source_connected / cloud_connected /
 *                deployed_at / visited_project_route / ...).
 *
 * Sticky completion: once a predicate returns true on any render, the
 * hook (useChecklistProgress) records it in persisted.checklist_checked
 * so the row stays done across reloads even if the underlying state
 * later goes away (for example: user creates and then deletes a model).
 *
 * Phase 1 keeps the same predicates the current OnboardingChecklist
 * had inline. Phase 2 swaps the `() => false` placeholders for real
 * store-backed signals (project.models.length, deploy event tap, etc).
 * Phase 3 layers in role overrides via ROLE_OVERRIDES below.
 */

export const CHECKLIST_ITEMS = [
  {
    id: 'connect_source',
    label: 'Connect a data source',
    why: 'A Source is the connection to where your data already lives.',
    route: '/explorer',
    target: 'source-create-button',
    weight: 10,
    predicate: ({ project, persisted }) =>
      (project?.project_json?.sources?.length ?? 0) > 0 || !!persisted.source_connected,
  },
  {
    id: 'build_model',
    label: 'Build a Model in Explorer',
    why: "A Model is a re-usable SQL definition you'll chart from.",
    route: '/explorer',
    target: 'model-tab-bar',
    weight: 20,
    // Phase 2: () => (project?.project_json?.models?.length ?? 0) > 0
    predicate: () => false,
  },
  {
    id: 'create_insight',
    label: 'Create an Insight in Explorer',
    why: 'An Insight is a chart on top of a Model.',
    route: '/explorer',
    target: 'chart-crud-section',
    weight: 30,
    // Phase 2: () => (project?.project_json?.insights?.length ?? 0) > 0
    predicate: () => false,
  },
  {
    id: 'build_dashboard',
    label: 'Build a Dashboard',
    why: 'Arrange Insights and Inputs into a single page.',
    route: '/editor',
    target: 'dashboard-save',
    weight: 40,
    predicate: ({ project, persisted }) =>
      (project?.project_json?.dashboards?.length ?? 0) > 0 || persisted.path === 'sample',
  },
  {
    id: 'view_project',
    label: 'View your Project',
    why: 'See the dashboard your code produces.',
    route: '/project',
    target: 'top-nav-project',
    weight: 50,
    // Phase 1 keeps the existing proxy: a populated project counts as
    // "viewed". Phase 2 will switch to persisted.visited_project_route
    // so a user has to actually navigate there to satisfy this row.
    predicate: ({ project, persisted }) =>
      (project?.project_json?.dashboards?.length ?? 0) > 0 || persisted.path === 'sample',
  },
  {
    id: 'deploy',
    label: 'Deploy to share',
    why: 'Run visivo deploy to push to cloud.',
    route: '/editor',
    target: 'top-nav-deploy',
    weight: 60,
    // Phase 2: read persisted.deployed_at (StageSelection.jsx writes it
    // on a successful /api/cloud/deploy/ response).
    predicate: () => false,
  },
];

/* Role overrides — keyed on the role id captured by the onboarding flow.
 * Phase 3 turns this on; Phase 1 leaves it empty so every role gets the
 * default ordered list. */
export const ROLE_OVERRIDES = {};

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
