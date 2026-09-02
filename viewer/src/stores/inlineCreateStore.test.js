/**
 * Inline-create slice — the shared "new <type>" flow behind the Library's
 * "+ New X" buttons / header menu and the Project Editor's New Dashboard CTA.
 * Each template must draft through the type's own save action with a unique
 * name and that type's minimal valid config.
 */
import useStore from './store';
import { CREATE_TEMPLATES } from './inlineCreateStore';
import { fetchModelSchema } from '../api/modelSchema';

// The metric/dimension/relation scaffolds ask the server which columns a model
// actually has, rather than hardcoding `id` (which most models don't have).
jest.mock('../api/modelSchema', () => ({
  fetchModelSchema: jest.fn(async () => ({
    available: true,
    columns: [{ name: 'order_id' }, { name: 'amount' }],
  })),
}));

beforeEach(() => {
  fetchModelSchema.mockClear();
  fetchModelSchema.mockResolvedValue({
    available: true,
    columns: [{ name: 'order_id' }, { name: 'amount' }],
  });
});

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
    const expectedConfig = await template.config(useStore.getState());

    const result = await useStore.getState().createWorkspaceObject(type);

    expect(save).toHaveBeenCalledWith(template.namePrefix, expectedConfig);
    expect(result).toMatchObject({ success: true, name: template.namePrefix, type });
  });

  // VIS-1231: a zero-row dashboard can't accept a drag (nothing to drop into),
  // so "+ New" hands back one that is already usable.
  test('a new dashboard starts with one row holding an empty slot', async () => {
    const save = jest.fn(async () => ({ success: true }));
    useStore.setState({ dashboards: [], saveDashboard: save });

    await useStore.getState().createWorkspaceObject('dashboard');

    const [, config] = save.mock.calls[0];
    expect(config.rows).toHaveLength(1);
    // Born valid, and a live drop target (VIS-989) rather than `items: []`.
    expect(config.rows[0]).toEqual({ height: 'medium', items: [{ width: 1 }] });
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

  // The collision suffix is part of the name the backend validates, so it has
  // to respect the same rule the base name does.
  describe('collision suffixes', () => {
    const collisionNameFor = async type => {
      const template = CREATE_TEMPLATES[type];
      const save = jest.fn(async () => ({ success: true }));
      useStore.setState({
        models: [{ name: 'orders' }, { name: 'users' }],
        [template.collectionKey]: [{ name: template.namePrefix }], // already taken
        [template.saveKey]: save,
      });
      const result = await useStore.getState().createWorkspaceObject(type);
      return result.name;
    };

    // dimension/metric must stay valid SQL identifiers — `new_dimension-2` is
    // rejected by the backend.
    test.each(['dimension', 'metric'])('%s disambiguates with an underscore', async type => {
      const name = await collisionNameFor(type);
      expect(name).toBe(`${CREATE_TEMPLATES[type].namePrefix}_2`);
      expect(name).not.toMatch(/-/);
    });

    // Everything else follows the hyphen house style.
    test.each(['dashboard', 'chart', 'table', 'markdown', 'input', 'insight', 'model', 'source'])(
      '%s disambiguates with a hyphen',
      async type => {
        expect(await collisionNameFor(type)).toBe(`${CREATE_TEMPLATES[type].namePrefix}-2`);
      }
    );

    // A relation name is underscore-styled (`new_relation`), and the backend
    // accepts either — matching the base reads better than `new_relation-2`.
    test('relation keeps its base style', async () => {
      expect(await collisionNameFor('relation')).toBe('new_relation_2');
    });
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
      // Real model refs — what the backend's validator requires — joined on
      // REAL columns. Which columns is a starting point the user re-points in
      // the edit panel; that they exist is not negotiable.
      // eslint-disable-next-line no-template-curly-in-string
      expect(config.condition).toBe('${ref(orders).order_id} = ${ref(users).order_id}');
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

  // Same shape of bug as the relation one above, found the hard way: the
  // scaffolds were `count(*)` and `1`, which reference no model. A PROJECT-level
  // metric or dimension reaches a source only through a `${ref()}`, so the
  // draft saved, then the commit wrote YAML the next parse refused — and every
  // metric and dimension vanished from the editor with only
  // "does not tie back to any source" in the server log.
  describe('metric and dimension drafts reference a real model', () => {
    const draftConfig = async type => {
      const save = jest.fn(async () => ({ success: true }));
      useStore.setState({
        models: [{ name: 'orders' }, { name: 'users' }],
        [CREATE_TEMPLATES[type].collectionKey]: [],
        [CREATE_TEMPLATES[type].saveKey]: save,
      });
      await useStore.getState().createWorkspaceObject(type);
      return save.mock.calls[0][1];
    };

    test('a metric counts a REAL column of the first model', async () => {
      // eslint-disable-next-line no-template-curly-in-string
      expect((await draftConfig('metric')).expression).toBe('count(${ref(orders).order_id})');
      expect(fetchModelSchema).toHaveBeenCalledWith('orders', expect.anything());
    });

    test('a dimension selects a REAL column of the first model', async () => {
      // eslint-disable-next-line no-template-curly-in-string
      expect((await draftConfig('dimension')).expression).toBe('${ref(orders).order_id}');
    });

    // The scaffolds used to hardcode `id`. Most models don't have one, so the
    // draft saved and then broke at run time against a column that was never
    // there — with nothing pointing at the column as the cause.
    test.each(['metric', 'dimension'])('a %s never invents a column name', async type => {
      const config = await draftConfig(type);
      expect(config.expression).not.toContain('.id}');
    });

    // Inference is BEST-EFFORT. In cloud it resolves against the source's
    // cached schema, so a source nobody has introspected answers 200 with no
    // columns — which is not "this model is broken" and must not block the
    // create. It used to, blaming the user's SQL and source connection.
    test.each([
      ['metric', 'count(${ref(orders)})'],
      ['dimension', '${ref(orders)}'],
    ])('a %s still drafts when no columns come back', async (type, expected) => {
      fetchModelSchema.mockResolvedValue({ available: true, columns: [] });
      const save = jest.fn(async () => ({ success: true }));
      useStore.setState({
        models: [{ name: 'orders' }],
        [CREATE_TEMPLATES[type].collectionKey]: [],
        [CREATE_TEMPLATES[type].saveKey]: save,
      });

      const result = await useStore.getState().createWorkspaceObject(type);

      expect(result.success).toBe(true);
      // A real model ref, so it still satisfies the project-level minRefs rule
      // — just without a column nobody could confirm exists.
      expect(save.mock.calls[0][1].expression).toBe(expected);
    });

    test('a create survives the schema endpoint throwing outright', async () => {
      fetchModelSchema.mockRejectedValue(new Error('network'));
      const save = jest.fn(async () => ({ success: true }));
      useStore.setState({
        models: [{ name: 'orders' }],
        metrics: [],
        saveMetric: save,
      });

      const result = await useStore.getState().createWorkspaceObject('metric');

      expect(result.success).toBe(true);
    });

    test.each(['metric', 'dimension'])(
      'a %s says WHY it cannot draft one with no models, rather than posting a doomed config',
      async type => {
        const save = jest.fn(async () => ({ success: true }));
        useStore.setState({
          models: [],
          [CREATE_TEMPLATES[type].collectionKey]: [],
          [CREATE_TEMPLATES[type].saveKey]: save,
        });

        const result = await useStore.getState().createWorkspaceObject(type);

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/model/i);
        expect(save).not.toHaveBeenCalled();
      }
    );
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
