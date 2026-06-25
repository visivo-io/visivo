/**
 * useRecordSave tests (VIS-1018 step 1).
 *
 * The unified optimistic + debounced save backbone. Exercises:
 *   - status transitions (idle → pending → saving → saved → idle),
 *   - the optimistic store write on scheduleSave,
 *   - clobber-safety: the persist reads the CURRENT optimistic value at FIRE
 *     time, not the config captured when the timer was scheduled,
 *   - per-type dispatch through the correct saveX action.
 */
import { renderHook, act } from '@testing-library/react';
import useRecordSave from './useRecordSave';
import useStore from '../stores/store';

const setupCollection = (collectionKey, name, config, saveActionName) => {
  const saveFn = jest.fn(() => Promise.resolve({ success: true }));
  useStore.setState({
    [collectionKey]: [{ name, config }],
    [saveActionName]: saveFn,
    saveActivityCount: 0,
    lastSaveFailed: false,
  });
  return saveFn;
};

describe('useRecordSave (VIS-1018)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('starts idle and goes pending → saving → saved → idle', async () => {
    const saveFn = setupCollection('dashboards', 'd1', { name: 'd1', rows: [] }, 'saveDashboard');
    const { result } = renderHook(() => useRecordSave('dashboard', 'd1', { delay: 500 }));

    expect(result.current.status).toBe('idle');

    act(() => result.current.scheduleSave({ name: 'd1', rows: [{ height: 'large', items: [] }] }));
    expect(result.current.status).toBe('pending');
    expect(saveFn).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saved');

    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.status).toBe('idle');
  });

  test('scheduleSave optimistically updates the store collection immediately', () => {
    setupCollection('dashboards', 'd1', { name: 'd1', rows: [] }, 'saveDashboard');
    const { result } = renderHook(() => useRecordSave('dashboard', 'd1', { delay: 500 }));

    const nextConfig = { name: 'd1', rows: [{ height: 'large', items: [] }] };
    act(() => result.current.scheduleSave(nextConfig));

    // The optimistic write lands in the store BEFORE the debounce fires.
    const dash = useStore.getState().dashboards.find(d => d.name === 'd1');
    expect(dash.config.rows[0].height).toBe('large');

    // Cancel the pending persist so it doesn't fire after the assertion.
    act(() => result.current.reset());
  });

  test('persist reads the CURRENT optimistic value at fire time, not the scheduled closure', async () => {
    const saveFn = setupCollection('charts', 'c1', { name: 'c1', v: 0 }, 'saveChart');
    const { result } = renderHook(() => useRecordSave('chart', 'c1', { delay: 500 }));

    // Schedule with v:1...
    act(() => result.current.scheduleSave({ name: 'c1', v: 1 }));

    // ...but BEFORE the timer fires, another surface writes v:2 into the store
    // optimistically (simulating a concurrent editor converging on the record).
    act(() => {
      useStore.getState().updateRecordConfigOptimistic('chart', 'c1', { name: 'c1', v: 2 });
    });

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    // The persist must use the latest store value (v:2), not the captured v:1.
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('c1', { name: 'c1', v: 2 });
  });

  test('debounces rapid edits into a single persist of the latest value', async () => {
    const saveFn = setupCollection('charts', 'c1', { name: 'c1', v: 0 }, 'saveChart');
    const { result } = renderHook(() => useRecordSave('chart', 'c1', { delay: 500 }));

    await act(async () => {
      result.current.scheduleSave({ name: 'c1', v: 1 });
      jest.advanceTimersByTime(200);
      result.current.scheduleSave({ name: 'c1', v: 2 });
      jest.advanceTimersByTime(200);
      result.current.scheduleSave({ name: 'c1', v: 3 });
      jest.advanceTimersByTime(500);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('c1', { name: 'c1', v: 3 });
  });

  test('dispatches each type through its own saveX action', async () => {
    const cases = [
      ['source', 'sources', 'saveSource', 's1'],
      ['model', 'models', 'saveModel', 'm1'],
      ['dimension', 'dimensions', 'saveDimension', 'dim1'],
      ['metric', 'metrics', 'saveMetric', 'met1'],
      ['relation', 'relations', 'saveRelation', 'r1'],
      ['insight', 'insights', 'saveInsight', 'i1'],
      ['markdown', 'markdowns', 'saveMarkdown', 'md1'],
      ['chart', 'charts', 'saveChart', 'ch1'],
      ['table', 'tables', 'saveTable', 't1'],
      ['dashboard', 'dashboards', 'saveDashboard', 'd1'],
      ['csvScriptModel', 'csvScriptModels', 'saveCsvScriptModel', 'csv1'],
      ['localMergeModel', 'localMergeModels', 'saveLocalMergeModel', 'lm1'],
      ['input', 'inputs', 'saveInput', 'in1'],
    ];

    for (const [type, collectionKey, saveActionName, name] of cases) {
      const saveFn = setupCollection(collectionKey, name, { name, x: 1 }, saveActionName);
      const { result, unmount } = renderHook(() => useRecordSave(type, name, { delay: 100 }));

      act(() => result.current.scheduleSave({ name, x: 2 }));
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        jest.advanceTimersByTime(100);
      });

      expect(saveFn).toHaveBeenCalledWith(name, { name, x: 2 });
      unmount();
    }
  });

  test('saveNow flushes immediately with an explicit config', async () => {
    const saveFn = setupCollection('tables', 't1', { name: 't1', v: 0 }, 'saveTable');
    const { result } = renderHook(() => useRecordSave('table', 't1', { delay: 500 }));

    await act(async () => {
      await result.current.saveNow({ name: 't1', v: 9 });
    });

    expect(saveFn).toHaveBeenCalledWith('t1', { name: 't1', v: 9 });
    // The optimistic store write also happened (envelope entry → inner config).
    const tbl = useStore.getState().tables.find(t => t.name === 't1');
    expect(tbl.config.v).toBe(9);
  });

  test('surfaces error status when the save action reports failure', async () => {
    useStore.setState({
      insights: [{ name: 'i1', config: { name: 'i1' } }],
      saveInsight: jest.fn(() => Promise.resolve({ success: false, error: 'boom' })),
      saveActivityCount: 0,
      lastSaveFailed: false,
    });
    const { result } = renderHook(() => useRecordSave('insight', 'i1', { delay: 100 }));

    act(() => result.current.scheduleSave({ name: 'i1', changed: true }));
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.status).toBe('error');
  });

  test('surfaces error status when the save action throws', async () => {
    useStore.setState({
      insights: [{ name: 'i1', config: { name: 'i1' } }],
      saveInsight: jest.fn(() => Promise.reject(new Error('nope'))),
      saveActivityCount: 0,
      lastSaveFailed: false,
    });
    const { result } = renderHook(() => useRecordSave('insight', 'i1', { delay: 100 }));

    act(() => result.current.scheduleSave({ name: 'i1', changed: true }));
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.status).toBe('error');
  });

  test('errors (does not crash) for an unknown type', async () => {
    useStore.setState({ saveActivityCount: 0, lastSaveFailed: false });
    const { result } = renderHook(() => useRecordSave('bogus', 'x', { delay: 100 }));

    act(() => result.current.scheduleSave({ x: 1 }));
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.status).toBe('error');
  });

  test('reset cancels a pending save and returns to idle', async () => {
    const saveFn = setupCollection('models', 'm1', { name: 'm1' }, 'saveModel');
    const { result } = renderHook(() => useRecordSave('model', 'm1', { delay: 500 }));

    act(() => result.current.scheduleSave({ name: 'm1', sql: 'select 1' }));
    expect(result.current.status).toBe('pending');

    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(saveFn).not.toHaveBeenCalled();
  });

  test('recovers an edit typed during an in-flight save from a refetch revert (VIS-1018 review)', async () => {
    // saveX actions refetch their collection after the write and blind-replace it
    // with the server value. Model that: resolving the save first stomps the store
    // back to the server-stale value, then resolves.
    let resolveSave;
    const saveFn = jest.fn(
      () =>
        new Promise(resolve => {
          resolveSave = () => {
            useStore.setState({ markdowns: [{ name: 'md1', config: { name: 'md1', content: 'R' } }] });
            resolve({ success: true });
          };
        })
    );
    useStore.setState({
      markdowns: [{ name: 'md1', config: { name: 'md1', content: 'R' } }],
      saveMarkdown: saveFn,
      saveActivityCount: 0,
      lastSaveFailed: false,
    });

    const { result } = renderHook(() => useRecordSave('markdown', 'md1', { delay: 300 }));

    // Edit R, let the debounce fire → save R goes in flight.
    act(() => result.current.scheduleSave({ name: 'md1', content: 'R' }));
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('saving');

    // While R's save is in flight, the user types C (optimistic store → C).
    act(() => result.current.scheduleSave({ name: 'md1', content: 'C' }));
    expect(useStore.getState().markdowns[0].config.content).toBe('C');

    // R's save resolves; its refetch reverts the store to server-stale 'R'.
    await act(async () => {
      resolveSave();
    });

    // The fix re-applies the latest optimistic edit 'C' rather than leaving the
    // store reverted to 'R' (which the next fire-time read would then persist).
    expect(useStore.getState().markdowns[0].config.content).toBe('C');

    // And the pending debounce for 'C' then persists 'C', not the stale 'R'.
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(saveFn).toHaveBeenLastCalledWith('md1', { name: 'md1', content: 'C' });
  });

  test('reports into the global save-activity counter while a save is in flight', async () => {
    let resolveSave;
    useStore.setState({
      sources: [{ name: 's1', config: { name: 's1' } }],
      saveSource: jest.fn(() => new Promise(resolve => (resolveSave = resolve))),
      saveActivityCount: 0,
      lastSaveFailed: false,
    });
    const { result } = renderHook(() => useRecordSave('source', 's1', { delay: 500 }));

    act(() => result.current.scheduleSave({ name: 's1', changed: true }));
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(useStore.getState().saveActivityCount).toBe(1);

    await act(async () => {
      resolveSave({ success: true });
    });
    expect(useStore.getState().saveActivityCount).toBe(0);
    expect(useStore.getState().lastSaveFailed).toBe(false);
  });
});
