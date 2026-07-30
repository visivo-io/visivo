import { act, renderHook } from '@testing-library/react';
import { useGuardedAsync } from './useGuardedAsync';

const deferred = () => {
  let resolve;
  const promise = new Promise(r => {
    resolve = r;
  });
  return { promise, resolve };
};

describe('useGuardedAsync', () => {
  it('rejects a second call while the first is still in flight (double-click guard)', async () => {
    const d = deferred();
    const fn = jest.fn(() => d.promise);
    const { result } = renderHook(() => useGuardedAsync(fn));

    // Fire twice synchronously, before the first resolves — the classic
    // double-click both dispatched before a re-render.
    let firstReturn, secondReturn;
    act(() => {
      firstReturn = result.current[0]();
      secondReturn = result.current[0]();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current[1]).toBe(true); // pending

    await act(async () => {
      d.resolve('ok');
      await firstReturn;
      await secondReturn;
    });

    expect(result.current[1]).toBe(false); // pending cleared
    // The guard is released once settled — a later click runs again.
    await act(async () => {
      await result.current[0]();
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('clears pending and releases the guard even when fn throws', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useGuardedAsync(fn));

    await act(async () => {
      await result.current[0]().catch(() => {});
    });

    expect(result.current[1]).toBe(false);
    // Not wedged: a subsequent call still runs.
    await act(async () => {
      await result.current[0]().catch(() => {});
    });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('always invokes the latest fn without changing run identity', async () => {
    const first = jest.fn().mockResolvedValue(undefined);
    const second = jest.fn().mockResolvedValue(undefined);
    const { result, rerender } = renderHook(({ fn }) => useGuardedAsync(fn), {
      initialProps: { fn: first },
    });
    const runBefore = result.current[0];

    rerender({ fn: second });
    const runAfter = result.current[0];
    expect(runAfter).toBe(runBefore); // stable identity across fn change

    await act(async () => {
      await result.current[0]();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('forwards arguments and returns the fn result', async () => {
    const fn = jest.fn(async (a, b) => a + b);
    const { result } = renderHook(() => useGuardedAsync(fn));
    let ret;
    await act(async () => {
      ret = await result.current[0](2, 3);
    });
    expect(fn).toHaveBeenCalledWith(2, 3);
    expect(ret).toBe(5);
  });
});
