/**
 * Inline-create slice — the shared "new <type>" flow behind the Library's
 * "+ New X" buttons / header menu and the Project Editor's New Dashboard CTA.
 * Each template must draft through the type's own save action with a unique
 * name and that type's minimal valid config.
 */
import useStore from './store';
import { CREATE_TEMPLATES } from './inlineCreateStore';

describe('createWorkspaceObject', () => {
  test.each(Object.keys(CREATE_TEMPLATES))('drafts a %s through its save action', async type => {
    const template = CREATE_TEMPLATES[type];
    const save = jest.fn(async () => ({ success: true }));
    useStore.setState({
      // Two models exist so every template's precondition is satisfiable —
      // a relation's draft is built FROM the project's models.
      models: [{ name: 'orders' }, { name: 'users' }],
      [template.collectionKey]: [],
      [template.saveKey]: save,
    });
    const expectedConfig = template.config(useStore.getState());

    const result = await useStore.getState().createWorkspaceObject(type);

    expect(save).toHaveBeenCalledWith(template.namePrefix, expectedConfig);
    expect(result).toMatchObject({ success: true, name: template.namePrefix, type });
  });

  test('deduplicates against the existing collection', async () => {
    const save = jest.fn(async () => ({ success: true }));
    useStore.setState({
      models: [{ name: 'new-model' }],
      saveModel: save,
    });

    const result = await useStore.getState().createWorkspaceObject('model');

    expect(result.success).toBe(true);
    expect(result.name).not.toBe('new-model');
    expect(save).toHaveBeenCalledWith(result.name, { sql: 'SELECT 1' });
  });

  test('dimension/metric names stay SQL-identifier safe (underscores, no dashes)', () => {
    expect(CREATE_TEMPLATES.dimension.namePrefix).not.toMatch(/-/);
    expect(CREATE_TEMPLATES.metric.namePrefix).not.toMatch(/-/);
  });

  // VIS-1237: "+ New" → Relation was a dead affordance. A relation IS
  // templatable — its condition just has to be built from real models, because
  // the backend requires two distinct model references.
  describe('relation', () => {
    test('drafts a condition joining the project\'s first two models', async () => {
      const save = jest.fn(async () => ({ success: true }));
      useStore.setState({
        models: [{ name: 'orders' }, { name: 'users' }, { name: 'events' }],
        relations: [],
        saveRelation: save,
      });

      const result = await useStore.getState().createWorkspaceObject('relation');

      expect(result).toMatchObject({ success: true, type: 'relation' });
      const [, config] = save.mock.calls[0];
      expect(config.join_type).toBe('inner');
      // Real model refs — what the backend's validator requires. The join keys
      // are a starting point the user re-points in the edit panel.
      // eslint-disable-next-line no-template-curly-in-string
      expect(config.condition).toBe('${ref(orders).id} = ${ref(users).id}');
    });

    test('says WHY it cannot draft one when the project has fewer than two models', async () => {
      const save = jest.fn(async () => ({ success: true }));
      useStore.setState({ models: [{ name: 'orders' }], relations: [], saveRelation: save });

      const result = await useStore.getState().createWorkspaceObject('relation');

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/two models/i);
      // Nothing is posted that the backend would only reject.
      expect(save).not.toHaveBeenCalled();
    });

    test('names stay SQL-identifier safe', () => {
      expect(CREATE_TEMPLATES.relation.namePrefix).not.toMatch(/-/);
    });
  });

  test('propagates a failed save', async () => {
    useStore.setState({
      charts: [],
      saveChart: jest.fn(async () => ({ success: false, error: 'boom' })),
    });
    const result = await useStore.getState().createWorkspaceObject('chart');
    expect(result).toEqual({ success: false, error: 'boom' });
  });
});
