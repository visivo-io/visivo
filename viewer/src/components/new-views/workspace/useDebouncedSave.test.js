/**
 * useDebouncedSave tests (VIS-802 / Track G G-1).
 *
 * The auto-save engine that backs the right-rail Edit forms — no Save button,
 * a ~500ms debounce, and a status that drives the inline indicator.
 */
import { renderHook, act } from '@testing-library/react';
import useDebouncedSave from './useDebouncedSave';
import useStore from '../../../stores/store';

describe('useDebouncedSave (VIS-802)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  test('starts idle and goes pending → saving → saved', async () => {
    const saveFn = jest.fn(() => Promise.resolve({ success: true }));
    const { result } = renderHook(() => useDebouncedSave(saveFn, { delay: 500 }));

    expect(result.current.status).toBe('idle');

    act(() => result.current.scheduleSave({ a: 1 }));
    expect(result.current.status).toBe('pending');
    expect(saveFn).not.toHaveBeenCalled();

    // Advance past the debounce; the save fires.
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(saveFn).toHaveBeenCalledWith({ a: 1 });
    expect(result.current.status).toBe('saved');

    // The "saved" badge auto-clears back to idle.
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.status).toBe('idle');
  });

  test('debounces rapid changes into a single save with the latest payload', async () => {
    const saveFn = jest.fn(() => Promise.resolve({ success: true }));
    const { result } = renderHook(() => useDebouncedSave(saveFn, { delay: 500 }));

    await act(async () => {
      result.current.scheduleSave({ v: 1 });
      jest.advanceTimersByTime(200);
      result.current.scheduleSave({ v: 2 });
      jest.advanceTimersByTime(200);
      result.current.scheduleSave({ v: 3 });
      // Only the final payload's timer survives; flush it (plus the resolved
      // save microtask) inside the async act so no state update leaks out.
      jest.advanceTimersByTime(500);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith({ v: 3 });
  });

  test('surfaces error status when the save action reports failure', async () => {
    const saveFn = jest.fn(() => Promise.resolve({ success: false, error: 'boom' }));
    const { result } = renderHook(() => useDebouncedSave(saveFn, { delay: 100 }));

    act(() => result.current.scheduleSave({}));
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.status).toBe('error');
  });

  test('surfaces error status when the save action throws', async () => {
    const saveFn = jest.fn(() => Promise.reject(new Error('nope')));
    const { result } = renderHook(() => useDebouncedSave(saveFn, { delay: 100 }));

    act(() => result.current.scheduleSave({}));
    await act(async () => {
      jest.advanceTimersByTime(100);
    });
    expect(result.current.status).toBe('error');
  });

  test('reset cancels a pending save and returns to idle', async () => {
    const saveFn = jest.fn(() => Promise.resolve({ success: true }));
    const { result } = renderHook(() => useDebouncedSave(saveFn, { delay: 500 }));

    act(() => result.current.scheduleSave({ a: 1 }));
    expect(result.current.status).toBe('pending');

    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
    expect(saveFn).not.toHaveBeenCalled();
  });

  test('reports into the global save-activity counter while a save is in flight (H-1)', async () => {
    useStore.setState({ saveActivityCount: 0, lastSaveFailed: false });
    let resolveSave;
    const saveFn = jest.fn(
      () =>
        new Promise(resolve => {
          resolveSave = resolve;
        })
    );
    const { result } = renderHook(() => useDebouncedSave(saveFn, { delay: 500 }));

    act(() => result.current.scheduleSave({ a: 1 }));
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

  test('a failed save latches lastSaveFailed on the global counter (H-1)', async () => {
    useStore.setState({ saveActivityCount: 0, lastSaveFailed: false });
    const saveFn = jest.fn(() => Promise.resolve({ success: false, error: 'nope' }));
    const { result } = renderHook(() => useDebouncedSave(saveFn, { delay: 500 }));

    await act(async () => {
      await result.current.saveNow({ a: 1 });
    });

    expect(useStore.getState().saveActivityCount).toBe(0);
    expect(useStore.getState().lastSaveFailed).toBe(true);
  });

  test('a throwing save still balances the global counter (H-1)', async () => {
    useStore.setState({ saveActivityCount: 0, lastSaveFailed: false });
    const saveFn = jest.fn(() => Promise.reject(new Error('network')));
    const { result } = renderHook(() => useDebouncedSave(saveFn, { delay: 500 }));

    await act(async () => {
      await result.current.saveNow({ a: 1 });
    });

    expect(useStore.getState().saveActivityCount).toBe(0);
    expect(useStore.getState().lastSaveFailed).toBe(true);
  });
});
