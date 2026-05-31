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
