import { renderHook } from '@testing-library/react';
import useRunPolling from './useRunPolling';
import useStore from '../stores/store';

jest.mock('../stores/store');

describe('useRunPolling', () => {
  let state;
  const pollRuns = jest.fn(async () => {});

  beforeEach(() => {
    jest.useFakeTimers();
    pollRuns.mockClear();
    state = { project: { id: 'p1', status: 'draft' }, pollRuns, latestRun: null };
    useStore.mockImplementation(selector => selector(state));
    useStore.getState = jest.fn(() => state);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('does not poll when there is no project', () => {
    state.project = null;
    renderHook(() => useRunPolling());
    expect(pollRuns).not.toHaveBeenCalled();
  });

  it('does not poll when the project is not a draft', () => {
    state.project.status = 'deployed';
    renderHook(() => useRunPolling());
    expect(pollRuns).not.toHaveBeenCalled();
  });

  it('polls immediately while the project is a draft (no save needed to arm it)', () => {
    renderHook(() => useRunPolling());
    // The effect fires a tick on mount; pollRuns is invoked synchronously
    // before its first await, so it has already been called once here.
    expect(pollRuns).toHaveBeenCalledTimes(1);
  });

  it('keeps polling continuously while a draft (idle 4s cadence)', async () => {
    renderHook(() => useRunPolling());
    expect(pollRuns).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(4000);
    expect(pollRuns).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(4000);
    expect(pollRuns).toHaveBeenCalledTimes(3);
  });
});
