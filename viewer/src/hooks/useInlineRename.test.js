import { act, renderHook } from '@testing-library/react';
import useInlineRename from './useInlineRename';

class NameCollisionError extends Error {
  constructor(message) {
    super(message);
    this.code = 'NAME_COLLISION';
  }
}

describe('useInlineRename', () => {
  test('starts not editing, with no error', () => {
    const { result } = renderHook(() => useInlineRename({ onCommit: jest.fn() }));
    expect(result.current.editing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test('start() enters edit mode', () => {
    const { result } = renderHook(() => useInlineRename({ onCommit: jest.fn() }));
    act(() => result.current.start());
    expect(result.current.editing).toBe(true);
  });

  test('cancel() leaves edit mode and clears any error', () => {
    const onCommit = jest.fn(() => {
      throw new NameCollisionError('taken');
    });
    const { result } = renderHook(() => useInlineRename({ onCommit }));
    act(() => result.current.start());
    act(() => result.current.commit('dup'));
    expect(result.current.error).toBe('taken');
    act(() => result.current.cancel());
    expect(result.current.editing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test('commit() calls onCommit and exits edit mode on success', () => {
    const onCommit = jest.fn();
    const { result } = renderHook(() => useInlineRename({ onCommit }));
    act(() => result.current.start());
    act(() => result.current.commit('Renamed'));
    expect(onCommit).toHaveBeenCalledWith('Renamed');
    expect(result.current.editing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  test('commit() catches a NAME_COLLISION error, sets it, and stays in edit mode', () => {
    const onCommit = jest.fn(() => {
      throw new NameCollisionError('Name "dup" is already in use.');
    });
    const { result } = renderHook(() => useInlineRename({ onCommit }));
    act(() => result.current.start());
    act(() => result.current.commit('dup'));
    expect(result.current.editing).toBe(true);
    expect(result.current.error).toBe('Name "dup" is already in use.');
  });

  test('commit() rethrows a non-collision error', () => {
    const boom = new Error('boom');
    const onCommit = jest.fn(() => {
      throw boom;
    });
    const { result } = renderHook(() => useInlineRename({ onCommit }));
    act(() => result.current.start());
    expect(() => act(() => result.current.commit('x'))).toThrow('boom');
  });

  test('start() clears a stale error from a previous failed attempt', () => {
    let shouldThrow = true;
    const onCommit = jest.fn(name => {
      if (shouldThrow) throw new NameCollisionError('taken');
    });
    const { result } = renderHook(() => useInlineRename({ onCommit }));
    act(() => result.current.start());
    act(() => result.current.commit('dup'));
    expect(result.current.error).toBe('taken');
    shouldThrow = false;
    act(() => result.current.start());
    expect(result.current.error).toBeNull();
  });
});
