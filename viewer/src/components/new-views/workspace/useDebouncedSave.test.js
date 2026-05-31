/**
 * useDebouncedSave tests (VIS-802 / Track G G-1).
 *
 * The auto-save engine that backs the right-rail Edit forms — no Save button,
 * a ~500ms debounce, and a status that drives the inline indicator.
 */
import { renderHook, act } from '@testing-library/react';
import useDebouncedSave from './useDebouncedSave';

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
});
