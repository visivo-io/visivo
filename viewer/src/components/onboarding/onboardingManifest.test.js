import {
  CHECKLIST_ITEMS,
  ROLE_OVERRIDES,
  buildChecklistForRole,
} from './onboardingManifest';

describe('onboardingManifest', () => {
  test('default checklist exposes seven rows in weight order', () => {
    const ids = CHECKLIST_ITEMS.map(i => i.id);
    expect(ids).toEqual([
      'connect_source',
      'build_model',
      'create_insight',
      'build_dashboard',
      'view_project',
      'connect_cloud',
      'deploy',
    ]);
    const weights = CHECKLIST_ITEMS.map(i => i.weight);
    expect([...weights].sort((a, b) => a - b)).toEqual(weights);
  });

  test('connect_cloud predicate keys off persisted.cloud_connected', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'connect_cloud');
    expect(it.predicate({ persisted: {} })).toBe(false);
    expect(it.predicate({ persisted: { cloud_connected: true } })).toBe(true);
  });

  test('every item declares the predicate hook surface', () => {
    CHECKLIST_ITEMS.forEach(it => {
      expect(typeof it.predicate).toBe('function');
      expect(typeof it.label).toBe('string');
      expect(typeof it.route).toBe('string');
      expect(typeof it.weight).toBe('number');
    });
  });

  test('connect_source predicate is satisfied by sources slice OR project.json OR onboarding flag', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'connect_source');
    expect(
      it.predicate({ project: { project_json: { sources: [] } }, sources: [], persisted: {} })
    ).toBe(false);
    expect(
      it.predicate({
        project: { project_json: { sources: [] } },
        sources: [{ name: 'a' }],
        persisted: {},
      })
    ).toBe(true);
    expect(
      it.predicate({
        project: { project_json: { sources: [{ name: 'a' }] } },
        sources: [],
        persisted: {},
      })
    ).toBe(true);
    expect(
      it.predicate({ project: { project_json: {} }, sources: [], persisted: { source_connected: true } })
    ).toBe(true);
  });

  test('build_model predicate fires only when persisted.actions.model_saved is set', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'build_model');
    // Presence of pre-existing models (from a sample) is not enough.
    expect(
      it.predicate({
        project: { project_json: { models: [{ name: 'm' }] } },
        models: [{ name: 'm' }],
        persisted: {},
      })
    ).toBe(false);
    expect(
      it.predicate({ persisted: { actions: { model_saved: '2026-05-09' } } })
    ).toBe(true);
  });

  test('create_insight predicate fires only when persisted.actions.insight_saved is set', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'create_insight');
    expect(
      it.predicate({
        project: { project_json: { insights: [{ name: 'i' }] } },
        insights: [{ name: 'i' }],
        persisted: {},
      })
    ).toBe(false);
    expect(
      it.predicate({ persisted: { actions: { insight_saved: '2026-05-09' } } })
    ).toBe(true);
  });

  test('build_dashboard predicate fires only when persisted.actions.dashboard_saved is set', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'build_dashboard');
    // Sample-pickers don't get build_dashboard for free anymore.
    expect(
      it.predicate({
        project: { project_json: { dashboards: [{ name: 'd' }] } },
        dashboards: [{ name: 'd' }],
        persisted: { path: 'sample' },
      })
    ).toBe(false);
    expect(
      it.predicate({ persisted: { actions: { dashboard_saved: '2026-05-09' } } })
    ).toBe(true);
  });

  test('view_project predicate keys off persisted.visited_project_route', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'view_project');
    expect(it.predicate({ persisted: {} })).toBe(false);
    expect(it.predicate({ persisted: { visited_project_route: '2026-01-01' } })).toBe(true);
  });

  test('deploy predicate keys off persisted.deployed_at', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'deploy');
    expect(it.predicate({ persisted: {} })).toBe(false);
    expect(it.predicate({ persisted: { deployed_at: '2026-01-01' } })).toBe(true);
  });

  test('buildChecklistForRole(null) returns the defaults unchanged', () => {
    expect(buildChecklistForRole(null).map(i => i.id)).toEqual(CHECKLIST_ITEMS.map(i => i.id));
  });

  test('buildChecklistForRole(unknown role) falls through to defaults', () => {
    expect(buildChecklistForRole('not_a_real_role').map(i => i.id)).toEqual(
      CHECKLIST_ITEMS.map(i => i.id)
    );
  });

  test('analytics_engineer adds define_metric in weight order between build_model and create_insight', () => {
    const items = buildChecklistForRole('analytics_engineer');
    expect(items.map(i => i.id)).toEqual([
      'connect_source',
      'build_model',
      'define_metric',
      'create_insight',
      'build_dashboard',
      'view_project',
      'connect_cloud',
      'deploy',
    ]);
    expect(items.find(i => i.id === 'connect_source').label).toBe('Connect your warehouse');
    expect(items.find(i => i.id === 'build_model').label).toBe(
      'Re-use a dbt model or save a SQL file'
    );
  });

  test('software_engineer keeps the default count but relabels two rows', () => {
    const items = buildChecklistForRole('software_engineer');
    expect(items.map(i => i.id)).toEqual(CHECKLIST_ITEMS.map(i => i.id));
    expect(items.find(i => i.id === 'connect_source').label).toBe(
      'Connect a database (Postgres / DuckDB)'
    );
    expect(items.find(i => i.id === 'build_model').label).toBe('Save a `.sql` file as a Model');
  });

  test('executive drops the build steps and shows just consume + cloud', () => {
    const items = buildChecklistForRole('executive');
    expect(items.map(i => i.id)).toEqual([
      'connect_source',
      'build_dashboard',
      'view_project',
      'connect_cloud',
    ]);
    expect(items.find(i => i.id === 'connect_source').label).toBe('Pick a sample to explore');
    expect(items.find(i => i.id === 'build_dashboard').label).toBe('Open your dashboard');
  });

  test('founder keeps all defaults and relabels the deploy row', () => {
    const items = buildChecklistForRole('founder');
    expect(items.map(i => i.id)).toEqual(CHECKLIST_ITEMS.map(i => i.id));
    expect(items.find(i => i.id === 'deploy').label).toBe(
      'Connect Visivo Cloud + share with your team'
    );
  });

  test('other (just exploring) lands on the lowest-friction four-item set', () => {
    const items = buildChecklistForRole('other');
    expect(items.map(i => i.id)).toEqual([
      'connect_source',
      'build_dashboard',
      'view_project',
      'connect_cloud',
    ]);
  });

  test('replace overrides preserve the predicate / weight / route from the default item', () => {
    const items = buildChecklistForRole('analytics_engineer');
    const cs = items.find(i => i.id === 'connect_source');
    expect(typeof cs.predicate).toBe('function');
    expect(cs.weight).toBe(10);
    expect(cs.route).toBe('/editor');
    expect(cs.label).toBe('Connect your warehouse');
  });

  test('ROLE_OVERRIDES covers every role from concepts.js', () => {
    // If a new role lands in the onboarding flow we want this test to
    // remind us to decide the override (default is fine; silent default
    // hurts when a role wants a different list).
    const expected = [
      'analytics_engineer',
      'data_engineer',
      'bi_analyst',
      'product_analyst',
      'software_engineer',
      'data_scientist',
      'founder',
      'executive',
      'consultant',
      'other',
    ];
    expected.forEach(roleId => {
      expect(ROLE_OVERRIDES[roleId]).toBeDefined();
    });
  });
});
