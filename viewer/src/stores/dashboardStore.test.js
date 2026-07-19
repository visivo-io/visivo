/**
 * Dashboard store slice — level reassignment (VIS-805 / Track M M-1).
 *
 * Pins the `reassignDashboardLevel` draft-edit action used by the Project
 * Editor's drag-between-levels gesture. `saveDashboard` is stubbed so the test
 * stays unit-level (no API), focusing on the level-resolution / no-op logic.
 */
import { act } from '@testing-library/react';
import useStore from './store';
import { slotToInsertTarget } from './dashboardStore';

const seed = (dashboards, saveDashboard) => {
  act(() => {
    useStore.setState({
      dashboards,
      saveDashboard: saveDashboard || jest.fn(async () => ({ success: true })),
    });
  });
};

describe('dashboardStore createDashboard (Project Editor "+ New Dashboard")', () => {
  test('creates an empty draft with a unique name and returns it', async () => {
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seed([{ name: 'exec', config: {} }], saveDashboard);

    const result = await useStore.getState().createDashboard();

    expect(saveDashboard).toHaveBeenCalledWith('new-dashboard', { rows: [] });
    expect(result).toMatchObject({ success: true, name: 'new-dashboard' });
  });

  test('deduplicates the name when new-dashboard already exists', async () => {
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seed([{ name: 'new-dashboard', config: {} }], saveDashboard);

    const result = await useStore.getState().createDashboard();

    expect(saveDashboard).toHaveBeenCalledWith(expect.not.stringMatching(/^new-dashboard$/), {
      rows: [],
    });
    expect(result.success).toBe(true);
    expect(result.name).not.toBe('new-dashboard');
  });

  test('propagates a failed save without a name', async () => {
    const saveDashboard = jest.fn(async () => ({ success: false, error: 'boom' }));
    seed([], saveDashboard);

    const result = await useStore.getState().createDashboard();

    expect(result.success).toBe(false);
    expect(result.name).toBeUndefined();
  });
});

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

  test('updateLevel persists title + description together (VIS-807 M-2b)', async () => {
    const saveDefaults = jest.fn(async () => ({ success: true }));
    seedLevels({
      levels: [{ title: 'Org', description: 'old' }, { title: 'Team' }],
      saveDefaults,
    });
    await act(async () => {
      await useStore.getState().updateLevel(0, { title: 'Org', description: 'new desc' });
    });
    expect(saveDefaults).toHaveBeenCalledWith({
      levels: [{ title: 'Org', description: 'new desc' }, { title: 'Team' }],
    });
  });

  test('updateLevel re-points matching dashboards when the title changes', async () => {
    const saveDefaults = jest.fn(async () => ({ success: true }));
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seedLevels({
      levels: [{ title: 'Org', description: 'd' }, { title: 'Team' }],
      dashboards: [{ name: 'exec', config: { level: 'Org' } }],
      saveDefaults,
      saveDashboard,
    });
    await act(async () => {
      await useStore.getState().updateLevel(0, { title: 'Company', description: 'd' });
    });
    expect(saveDefaults).toHaveBeenCalledWith({
      levels: [{ title: 'Company', description: 'd' }, { title: 'Team' }],
    });
    expect(saveDashboard).toHaveBeenCalledWith('exec', { level: 'Company' });
  });

  test('updateLevel is a no-op when neither title nor description changes', async () => {
    const saveDefaults = jest.fn();
    seedLevels({ levels: [{ title: 'Org', description: 'd' }], saveDefaults });
    let result;
    await act(async () => {
      result = await useStore.getState().updateLevel(0, { title: 'Org', description: 'd' });
    });
    expect(saveDefaults).not.toHaveBeenCalled();
    expect(result.error).toBe('unchanged');
  });

  test('updateLevel rejects a blank title', async () => {
    const saveDefaults = jest.fn();
    seedLevels({ levels: [{ title: 'Org' }], saveDefaults });
    let result;
    await act(async () => {
      result = await useStore.getState().updateLevel(0, { title: '   ' });
    });
    expect(saveDefaults).not.toHaveBeenCalled();
    expect(result.error).toBe('title required');
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

// ----------------------------------------------------------------------------
// J-1 / J-2 (VIS-774 / VIS-778) — placeChartInDashboardSlot + slotToInsertTarget
// ----------------------------------------------------------------------------
describe('slotToInsertTarget', () => {
  const config = { rows: [{ items: [{ chart: 'ref(a)' }] }, { items: [] }] };

  test('"new" → a new top-level row at the end', () => {
    expect(slotToInsertTarget(config, 'new')).toEqual({ kind: 'between-rows', index: 2 });
  });

  test('undefined slot defaults to a new row', () => {
    expect(slotToInsertTarget(config, undefined)).toEqual({ kind: 'between-rows', index: 2 });
  });

  test('"<row>:end" → end-of-row target', () => {
    expect(slotToInsertTarget(config, '1:end')).toEqual({ kind: 'end-of-row', rowPath: 'row.1' });
  });

  test('"<row>:<item>" → between-items target', () => {
    expect(slotToInsertTarget(config, '0:0')).toEqual({
      kind: 'between-items',
      rowPath: 'row.0',
      index: 0,
    });
  });

  test('an out-of-range row index falls back to a new row', () => {
    expect(slotToInsertTarget(config, '9:end')).toEqual({ kind: 'between-rows', index: 2 });
  });
});

describe('dashboardStore placeChartInDashboardSlot', () => {
  const seedPlace = (dashboards, saveDashboard) => {
    act(() => {
      useStore.setState({
        dashboards,
        saveDashboard: saveDashboard || jest.fn(async () => ({ success: true })),
      });
    });
  };

  test('wraps the chart in an item and appends a new row, then saves', async () => {
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seedPlace([{ name: 'sales', config: { rows: [{ items: [{ chart: 'ref(x)' }] }] } }], saveDashboard);
    await act(async () => {
      await useStore.getState().placeChartInDashboardSlot('sales', 'revenue_chart', 'new');
    });
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const [name, nextConfig] = saveDashboard.mock.calls[0];
    expect(name).toBe('sales');
    expect(nextConfig.rows).toHaveLength(2);
    const placedItem = nextConfig.rows[1].items[0];
    expect(placedItem.chart).toBe('ref(revenue_chart)');
  });

  test('appends to an existing row for "<row>:end"', async () => {
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seedPlace([{ name: 'sales', config: { rows: [{ items: [{ chart: 'ref(x)' }] }] } }], saveDashboard);
    await act(async () => {
      await useStore.getState().placeChartInDashboardSlot('sales', 'revenue_chart', '0:end');
    });
    const [, nextConfig] = saveDashboard.mock.calls[0];
    expect(nextConfig.rows).toHaveLength(1);
    expect(nextConfig.rows[0].items.map(i => i.chart)).toEqual(['ref(x)', 'ref(revenue_chart)']);
  });

  test('handles a dashboard with no rows', async () => {
    const saveDashboard = jest.fn(async () => ({ success: true }));
    seedPlace([{ name: 'sales', config: {} }], saveDashboard);
    await act(async () => {
      await useStore.getState().placeChartInDashboardSlot('sales', 'revenue_chart', 'new');
    });
    const [, nextConfig] = saveDashboard.mock.calls[0];
    expect(nextConfig.rows[0].items[0].chart).toBe('ref(revenue_chart)');
  });

  test('returns an error when the dashboard is not found', async () => {
    seedPlace([], jest.fn());
    let result;
    await act(async () => {
      result = await useStore.getState().placeChartInDashboardSlot('ghost', 'c', 'new');
    });
    expect(result.success).toBe(false);
  });

  test('returns an error when chart name is missing', async () => {
    seedPlace([{ name: 'sales', config: { rows: [] } }], jest.fn());
    let result;
    await act(async () => {
      result = await useStore.getState().placeChartInDashboardSlot('sales', '', 'new');
    });
    expect(result.success).toBe(false);
  });

  // e2e-gap-review.md P5-D3 [MEDIUM·CONFIRMED_GAP]: `dashboardExists`
  // (ExplorationPromoteModal.jsx) and `placeChartInDashboardSlot` here both
  // resolve their target by a BARE NAME match — neither has any notion of
  // dashboard IDENTITY. Delete dashboard 'A' and create a brand-new,
  // unrelated dashboard also named 'A' (or rename a different dashboard TO
  // 'A') between minting a `return_to` intent and promoting, and both checks
  // silently treat the NEW 'A' as the ORIGINAL target. A `slot` captured
  // against the ORIGINAL A's row layout is now almost certainly stale
  // against the NEW A's (probably very different) rows — `slotToInsertTarget`
  // gracefully falls back to a "between rows" append rather than erroring,
  // so the chart silently lands in the wrong (if same-named) dashboard
  // object with zero signal that identity ever changed underneath the offer.
  //
  // This test LOCKS IN AND DOCUMENTS that defect — it does not fix it. A real
  // fix (comparing dashboard identity, not just name) is a larger change,
  // explicitly out of scope for this pass per the review's own recommendation.
  test('P5-D3: a slot captured against the ORIGINAL "A" still applies via the between-rows fallback after "A" is deleted and a different dashboard is created with the SAME name — no identity check exists', async () => {
    const saveDashboard = jest.fn(async () => ({ success: true }));
    // Original "A": 2 rows — a slot captured against it (row index 1) would
    // have been a normal, in-range "append to row 1" placement.
    seedPlace(
      [
        {
          name: 'A',
          config: {
            rows: [{ items: [{ chart: 'ref(old1)' }] }, { items: [{ chart: 'ref(old2)' }] }],
          },
        },
      ],
      saveDashboard
    );
    const capturedSlot = '1:end'; // captured against the ORIGINAL A (2 rows)

    // Simulate "delete A, then create a brand-new, unrelated dashboard also
    // named A" — a totally different (empty) config under the SAME name, as
    // if the exploration's `return_to.dashboard` name now resolves to a
    // different underlying object. Nothing about `dashboards` here carries
    // any id/version the store could have compared against the original.
    seedPlace([{ name: 'A', config: { rows: [] } }], saveDashboard);

    await act(async () => {
      await useStore.getState().placeChartInDashboardSlot('A', 'orphaned_chart', capturedSlot);
    });

    // Silently "succeeds" — no error, no signal that the target dashboard's
    // identity changed. slotToInsertTarget's out-of-range fallback (row index
    // 1 doesn't exist in the NEW A's empty rows) lands the chart via a plain
    // "between rows" append into whatever is now named "A".
    expect(saveDashboard).toHaveBeenCalledTimes(1);
    const [name, nextConfig] = saveDashboard.mock.calls[0];
    expect(name).toBe('A');
    expect(nextConfig.rows).toHaveLength(1);
    expect(nextConfig.rows[0].items[0].chart).toBe('ref(orphaned_chart)');
  });
});
