/**
 * Dashboard store slice — level reassignment (VIS-805 / Track M M-1).
 *
 * Pins the `reassignDashboardLevel` draft-edit action used by the Project
 * Editor's drag-between-levels gesture. `saveDashboard` is stubbed so the test
 * stays unit-level (no API), focusing on the level-resolution / no-op logic.
 */
import { act } from '@testing-library/react';
import useStore from './store';

const seed = (dashboards, saveDashboard) => {
  act(() => {
    useStore.setState({
      dashboards,
      saveDashboard: saveDashboard || jest.fn(async () => ({ success: true })),
    });
  });
};

describe('dashboardStore reassignDashboardLevel', () => {
  test('saves the dashboard config with the new level', async () => {
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seed(
      [{ name: 'exec', config: { level: 'Organization', tags: ['x'] } }],
      saveDashboard
    );
    await act(async () => {
      await useStore.getState().reassignDashboardLevel('exec', 'Department');
    });
    expect(saveDashboard).toHaveBeenCalledWith('exec', { level: 'Department', tags: ['x'] });
  });

  test('removes the level key when moved to Unassigned (null level)', async () => {
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seed([{ name: 'exec', config: { level: 'Organization' } }], saveDashboard);
    await act(async () => {
      await useStore.getState().reassignDashboardLevel('exec', null);
    });
    expect(saveDashboard).toHaveBeenCalledWith('exec', {});
  });

  test('is a no-op when the level is unchanged', async () => {
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seed([{ name: 'exec', config: { level: 'Organization' } }], saveDashboard);
    let result;
    await act(async () => {
      result = await useStore.getState().reassignDashboardLevel('exec', 'Organization');
    });
    expect(saveDashboard).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  test('returns an error when the dashboard is unknown', async () => {
    const saveDashboard = jest.fn();
    seed([], saveDashboard);
    let result;
    await act(async () => {
      result = await useStore.getState().reassignDashboardLevel('missing', 'Team');
    });
    expect(saveDashboard).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});

describe('dashboardStore level CRUD (VIS-807 M-2a)', () => {
  const seedLevels = ({ levels, dashboards = [], saveDefaults, saveDashboard } = {}) => {
    act(() => {
      useStore.setState({
        defaults: levels === undefined ? null : { levels },
        dashboards,
        saveDefaults: saveDefaults || jest.fn(async () => ({ success: true })),
        saveDashboard: saveDashboard || jest.fn(async () => ({ success: true })),
        reassignDashboardLevel:
          useStore.getState().reassignDashboardLevel,
      });
    });
  };

  test('createLevel appends a new level to defaults.levels', async () => {
    const saveDefaults = jest.fn(async () => ({ success: true }));
    seedLevels({ levels: [{ title: 'Org' }, { title: 'Team' }], saveDefaults });
    await act(async () => {
      await useStore.getState().createLevel('Squad');
    });
    expect(saveDefaults).toHaveBeenCalledWith({
      levels: [{ title: 'Org' }, { title: 'Team' }, { title: 'Squad', description: '' }],
    });
  });

  test('createLevel seeds from defaultLevels when none are configured', async () => {
    const saveDefaults = jest.fn(async () => ({ success: true }));
    seedLevels({ levels: [], saveDefaults });
    await act(async () => {
      await useStore.getState().createLevel('Custom');
    });
    const arg = saveDefaults.mock.calls[0][0];
    expect(arg.levels.length).toBeGreaterThan(1);
    expect(arg.levels[arg.levels.length - 1]).toEqual({ title: 'Custom', description: '' });
    expect(arg.levels[0].title).toBe('Organization');
  });

  test('renameLevel updates the title and re-points matching dashboards', async () => {
    const saveDefaults = jest.fn(async () => ({ success: true }));
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seedLevels({
      levels: [{ title: 'Org' }, { title: 'Team' }],
      dashboards: [{ name: 'exec', config: { level: 'Org' } }],
      saveDefaults,
      saveDashboard,
    });
    await act(async () => {
      await useStore.getState().renameLevel(0, 'Company');
    });
    expect(saveDefaults).toHaveBeenCalledWith({
      levels: [{ title: 'Company' }, { title: 'Team' }],
    });
    expect(saveDashboard).toHaveBeenCalledWith('exec', { level: 'Company' });
  });

  test('renameLevel is a no-op when the title is unchanged', async () => {
    const saveDefaults = jest.fn();
    seedLevels({ levels: [{ title: 'Org' }], saveDefaults });
    let result;
    await act(async () => {
      result = await useStore.getState().renameLevel(0, 'Org');
    });
    expect(saveDefaults).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  test('reorderLevel swaps adjacent levels', async () => {
    const saveDefaults = jest.fn(async () => ({ success: true }));
    seedLevels({ levels: [{ title: 'A' }, { title: 'B' }, { title: 'C' }], saveDefaults });
    await act(async () => {
      await useStore.getState().reorderLevel(2, -1);
    });
    expect(saveDefaults).toHaveBeenCalledWith({
      levels: [{ title: 'A' }, { title: 'C' }, { title: 'B' }],
    });
  });

  test('reorderLevel is a no-op at the boundary', async () => {
    const saveDefaults = jest.fn();
    seedLevels({ levels: [{ title: 'A' }, { title: 'B' }], saveDefaults });
    let result;
    await act(async () => {
      result = await useStore.getState().reorderLevel(0, -1);
    });
    expect(saveDefaults).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  test('deleteLevel removes the level and drops its dashboards to Unassigned', async () => {
    const saveDefaults = jest.fn(async () => ({ success: true }));
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seedLevels({
      levels: [{ title: 'Org' }, { title: 'Team' }],
      dashboards: [{ name: 'exec', config: { level: 'Org' } }],
      saveDefaults,
      saveDashboard,
    });
    await act(async () => {
      await useStore.getState().deleteLevel(0);
    });
    expect(saveDefaults).toHaveBeenCalledWith({ levels: [{ title: 'Team' }] });
    // reassignDashboardLevel(name, null) strips the level key via saveDashboard.
    expect(saveDashboard).toHaveBeenCalledWith('exec', {});
  });
});
