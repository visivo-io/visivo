import { renderHook } from '@testing-library/react';
import useHardReload from './useHardReload';
import { subscribe } from './eventSource';

jest.mock('./eventSource', () => ({ subscribe: jest.fn() }));

describe('useHardReload', () => {
  let fire;
  let unsubscribe;

  beforeEach(() => {
    unsubscribe = jest.fn();
    subscribe.mockImplementation((topic, handler) => {
      fire = () => handler();
      return unsubscribe;
    });
    delete window.__VISIVO_SOFT_RELOAD__;
  });

  test('subscribes to the reload event over the bundled socket client', () => {
    renderHook(() => useHardReload(jest.fn()));

    expect(subscribe).toHaveBeenCalledWith({ event: 'reload' }, expect.any(Function));
  });

  test('reloads the page when the project changes', () => {
    const reload = jest.fn();
    renderHook(() => useHardReload(reload));

    fire();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('stands down while the Workspace is handling the change itself', () => {
    window.__VISIVO_SOFT_RELOAD__ = true;
    const reload = jest.fn();
    renderHook(() => useHardReload(reload));

    fire();

    expect(reload).not.toHaveBeenCalled();
  });

  test('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useHardReload(jest.fn()));

    unmount();

    expect(unsubscribe).toHaveBeenCalled();
  });
});
