import {
  CHECKLIST_ITEMS,
  ROLE_OVERRIDES,
  buildChecklistForRole,
} from './onboardingManifest';

describe('onboardingManifest', () => {
  test('default checklist exposes the six rows in weight order', () => {
    const ids = CHECKLIST_ITEMS.map(i => i.id);
    expect(ids).toEqual([
      'connect_source',
      'build_model',
      'create_insight',
      'build_dashboard',
      'view_project',
      'deploy',
    ]);
    const weights = CHECKLIST_ITEMS.map(i => i.weight);
    expect([...weights].sort((a, b) => a - b)).toEqual(weights);
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

  test('build_model predicate fires from modelStore.models OR project.models', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'build_model');
    expect(
      it.predicate({ project: { project_json: { models: [] } }, models: [], persisted: {} })
    ).toBe(false);
    expect(
      it.predicate({ project: { project_json: { models: [] } }, models: [{ name: 'm' }], persisted: {} })
    ).toBe(true);
    expect(
      it.predicate({
        project: { project_json: { models: [{ name: 'm' }] } },
        models: [],
        persisted: {},
      })
    ).toBe(true);
  });

  test('create_insight predicate fires from insightStore.insights OR project.insights', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'create_insight');
    expect(
      it.predicate({
        project: { project_json: { insights: [] } },
        insights: [],
        persisted: {},
      })
    ).toBe(false);
    expect(
      it.predicate({
        project: { project_json: { insights: [] } },
        insights: [{ name: 'i' }],
        persisted: {},
      })
    ).toBe(true);
  });

  test('build_dashboard predicate honors the sample-onboarding outcome', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'build_dashboard');
    expect(
      it.predicate({
        project: { project_json: { dashboards: [] } },
        dashboards: [],
        persisted: {},
      })
    ).toBe(false);
    expect(
      it.predicate({
        project: { project_json: { dashboards: [] } },
        dashboards: [],
        persisted: { path: 'sample' },
      })
    ).toBe(true);
    expect(
      it.predicate({
        project: { project_json: { dashboards: [{ name: 'd' }] } },
        dashboards: [],
        persisted: {},
      })
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

  test('buildChecklistForRole returns the defaults for unknown roles', () => {
    expect(buildChecklistForRole('analytics_engineer').map(i => i.id)).toEqual(
      CHECKLIST_ITEMS.map(i => i.id)
    );
    expect(buildChecklistForRole(null).map(i => i.id)).toEqual(CHECKLIST_ITEMS.map(i => i.id));
  });

  test('ROLE_OVERRIDES is empty in phase 1 (overrides land in phase 3)', () => {
    expect(Object.keys(ROLE_OVERRIDES)).toEqual([]);
  });
});
