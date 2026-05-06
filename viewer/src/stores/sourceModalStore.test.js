import { act, renderHook } from '@testing-library/react';
import useSourceModalStore, { useSourceCreationModal } from './sourceModalStore';

describe('sourceModalStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useSourceModalStore.setState({ isOpen: false });
  });

  test('isOpen defaults to false', () => {
    expect(useSourceModalStore.getState().isOpen).toBe(false);
  });

  test('openSourceModal flips isOpen to true', () => {
    useSourceModalStore.getState().openSourceModal();
    expect(useSourceModalStore.getState().isOpen).toBe(true);
  });

  test('closeSourceModal flips isOpen to false', () => {
    useSourceModalStore.setState({ isOpen: true });
    useSourceModalStore.getState().closeSourceModal();
    expect(useSourceModalStore.getState().isOpen).toBe(false);
  });

  test('useSourceCreationModal hook exposes isOpen + open + close', () => {
    const { result } = renderHook(() => useSourceCreationModal());

    expect(result.current.isOpen).toBe(false);
    expect(typeof result.current.open).toBe('function');
    expect(typeof result.current.close).toBe('function');

    act(() => {
      result.current.open();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      result.current.close();
    });
    expect(result.current.isOpen).toBe(false);
  });
});
