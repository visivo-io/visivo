import { act, renderHook } from '@testing-library/react';
import useSourceModalStore, { useSourceCreationModal } from './sourceModalStore';

describe('sourceModalStore', () => {
  beforeEach(() => {
    // Reset store between tests
    useSourceModalStore.setState({
      isOpen: false,
      onSaveOverride: null,
      onSaveSuccess: null,
    });
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

  test('openSourceModal stores onSave override when provided', () => {
    const customSave = jest.fn();
    const onSuccess = jest.fn();
    useSourceModalStore.getState().openSourceModal({
      onSave: customSave,
      onSaveSuccess: onSuccess,
    });
    expect(useSourceModalStore.getState().onSaveOverride).toBe(customSave);
    expect(useSourceModalStore.getState().onSaveSuccess).toBe(onSuccess);
  });

  test('closeSourceModal clears overrides', () => {
    const customSave = jest.fn();
    useSourceModalStore.getState().openSourceModal({ onSave: customSave });
    useSourceModalStore.getState().closeSourceModal();
    expect(useSourceModalStore.getState().onSaveOverride).toBe(null);
    expect(useSourceModalStore.getState().onSaveSuccess).toBe(null);
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

  test('multiple subscribers see updates', () => {
    const { result: a } = renderHook(() => useSourceCreationModal());
    const { result: b } = renderHook(() => useSourceCreationModal());

    expect(a.current.isOpen).toBe(false);
    expect(b.current.isOpen).toBe(false);

    act(() => {
      a.current.open();
    });

    expect(a.current.isOpen).toBe(true);
    expect(b.current.isOpen).toBe(true);

    act(() => {
      b.current.close();
    });

    expect(a.current.isOpen).toBe(false);
    expect(b.current.isOpen).toBe(false);
  });
});
