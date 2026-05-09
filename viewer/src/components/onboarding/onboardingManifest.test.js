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

  test('connect_source predicate is satisfied by sources or by onboarding flag', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'connect_source');
    expect(it.predicate({ project: { project_json: { sources: [] } }, persisted: {} })).toBe(false);
    expect(
      it.predicate({ project: { project_json: { sources: [{ name: 'a' }] } }, persisted: {} })
    ).toBe(true);
    expect(it.predicate({ project: { project_json: {} }, persisted: { source_connected: true } })).toBe(
      true
    );
  });

  test('build_dashboard predicate honors the sample-onboarding outcome', () => {
    const it = CHECKLIST_ITEMS.find(i => i.id === 'build_dashboard');
    expect(it.predicate({ project: { project_json: { dashboards: [] } }, persisted: {} })).toBe(false);
    expect(
      it.predicate({ project: { project_json: { dashboards: [] } }, persisted: { path: 'sample' } })
    ).toBe(true);
    expect(
      it.predicate({
        project: { project_json: { dashboards: [{ name: 'd' }] } },
        persisted: {},
      })
    ).toBe(true);
  });

  test('build_model / create_insight / deploy stay false until phase 2 lands', () => {
    ['build_model', 'create_insight', 'deploy'].forEach(id => {
      const it = CHECKLIST_ITEMS.find(i => i.id === id);
      expect(
        it.predicate({
          project: { project_json: { models: [{ name: 'a' }], insights: [{ name: 'a' }] } },
          persisted: { deployed_at: '2026-01-01' },
        })
      ).toBe(false);
    });
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
