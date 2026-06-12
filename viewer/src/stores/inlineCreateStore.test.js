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
      [template.collectionKey]: [],
      [template.saveKey]: save,
    });

    const result = await useStore.getState().createWorkspaceObject(type);

    expect(save).toHaveBeenCalledWith(template.namePrefix, template.config());
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

  test('relation has no template (cannot draft a valid empty relation)', async () => {
    expect(CREATE_TEMPLATES.relation).toBeUndefined();
    const result = await useStore.getState().createWorkspaceObject('relation');
    expect(result.success).toBe(false);
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
