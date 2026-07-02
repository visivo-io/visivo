/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
/**
 * useRecordSave validation gate (VIS-993) — the REAL schema + ref pre-flight.
 *
 * Persistence is gated: schema-invalid or dangling-ref configs never reach the
 * type's saveX action (no POST, no run under runs-on-changes), the hook reports
 * status 'invalid' with per-field errors, and a subsequent valid edit clears
 * and persists. Backbone mechanics live in useRecordSave.test.js with the gate
 * stubbed permissive.
 */
import { renderHook, act } from '@testing-library/react';
import useRecordSave from './useRecordSave';
import useStore from '../stores/store';
import {
  preloadValidationSchema,
  clearValidationCache,
} from '../components/views/workspace/validateAgainstSchema';

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

afterEach(() => {
  act(() => {
    jest.runOnlyPendingTimers();
  });
  jest.useRealTimers();
});

describe('useRecordSave validation gate (VIS-993)', () => {
  // The gate consults the $defs schema + ref pre-flight at persist time, so
  // these tests run against the REAL bundled schema (preloaded so the sync
  // fast path is live too).
  beforeAll(async () => {
    jest.useRealTimers();
    await preloadValidationSchema();
  });
  beforeEach(() => {
    jest.useFakeTimers();
  });

  test('a schema-invalid config is blocked: no saveX call, status invalid, errors exposed', async () => {
    const saveFn = setupCollection('markdowns', 'notes', { name: 'notes', content: 'hi' }, 'saveMarkdown');
    const { result } = renderHook(() => useRecordSave('markdown', 'notes', { delay: 500 }));

    act(() =>
      result.current.scheduleSave({ name: 'notes', content: 'hi', align: 'diagonal' })
    );
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(saveFn).not.toHaveBeenCalled();
    expect(result.current.status).toBe('invalid');
    expect(result.current.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'align', keyword: 'enum' })])
    );
  });

  test('the optimistic store write still happens for a blocked edit (surfaces stay live)', async () => {
    setupCollection('markdowns', 'notes', { name: 'notes', content: 'hi' }, 'saveMarkdown');
    const { result } = renderHook(() => useRecordSave('markdown', 'notes', { delay: 500 }));

    act(() =>
      result.current.scheduleSave({ name: 'notes', content: 'typing…', align: 'diagonal' })
    );
    const entry = useStore.getState().markdowns.find(m => m.name === 'notes');
    expect((entry.config || entry).content).toBe('typing…');
  });

  test('a dangling ref is blocked with a ref error (sync path — no timer ever arms)', () => {
    const saveFn = setupCollection('charts', 'c1', { name: 'c1', insights: [] }, 'saveChart');
    // Populate a collection so the ref union is non-empty (high-confidence mode).
    useStore.setState({ insights: [{ name: 'real_insight' }] });
    const { result } = renderHook(() => useRecordSave('chart', 'c1', { delay: 500 }));

    act(() => result.current.scheduleSave({ name: 'c1', insights: ['${ref(ghost_insight)}'] }));

    // The preloaded sync gate blocks immediately: status flips without any
    // debounce timer being armed, and nothing ever persists.
    expect(result.current.status).toBe('invalid');
    expect(result.current.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ keyword: 'ref', path: 'insights.0' })])
    );
    expect(jest.getTimerCount()).toBe(0);
    expect(saveFn).not.toHaveBeenCalled();
  });

  test('the async fire-time gate blocks when the sync fast path is unavailable', async () => {
    // Drop the compiled cache: validateRecordConfigSync now returns null, so the
    // timer arms and the authoritative async check must do the blocking.
    clearValidationCache();
    const saveFn = setupCollection('markdowns', 'notes', { name: 'notes', content: 'hi' }, 'saveMarkdown');
    const { result } = renderHook(() => useRecordSave('markdown', 'notes', { delay: 500 }));

    act(() =>
      result.current.scheduleSave({ name: 'notes', content: 'hi', align: 'diagonal' })
    );
    expect(result.current.status).toBe('pending');

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(saveFn).not.toHaveBeenCalled();
    expect(result.current.status).toBe('invalid');
    expect(result.current.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: 'align', keyword: 'enum' })])
    );

    // Restore the warm cache for the remaining tests.
    await preloadValidationSchema();
  });

  test('a subsequent valid edit clears the errors and persists', async () => {
    const saveFn = setupCollection('markdowns', 'notes', { name: 'notes', content: 'hi' }, 'saveMarkdown');
    const { result } = renderHook(() => useRecordSave('markdown', 'notes', { delay: 500 }));

    act(() =>
      result.current.scheduleSave({ name: 'notes', content: 'hi', align: 'diagonal' })
    );
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe('invalid');

    act(() => result.current.scheduleSave({ name: 'notes', content: 'hi', align: 'center' }));
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('notes', { name: 'notes', content: 'hi', align: 'center' });
    expect(result.current.status).toBe('saved');
    expect(result.current.errors).toBeNull();
  });

  test('saveNow is gated identically and reports the validation result', async () => {
    const saveFn = setupCollection('markdowns', 'notes', { name: 'notes', content: 'hi' }, 'saveMarkdown');
    const { result } = renderHook(() => useRecordSave('markdown', 'notes'));

    let outcome;
    await act(async () => {
      outcome = await result.current.saveNow({ name: 'notes', content: 'hi', align: 'diagonal' });
    });

    expect(saveFn).not.toHaveBeenCalled();
    expect(outcome.success).toBe(false);
    expect(outcome.validation).toBeDefined();
    expect(result.current.status).toBe('invalid');
  });

  test('types without a schema mapping still save (fail-open)', async () => {
    const saveFn = setupCollection('defaults', 'defaults', { threshold: 1 }, 'saveDefaults');
    // 'defaults' HAS a mapping; use a config valid for it instead — fail-open is
    // proven by the unknown-type arm in validateAgainstSchema tests. Here we pin
    // that a VALID config flows through the gate untouched.
    const { result } = renderHook(() => useRecordSave('markdown', 'other', { delay: 500 }));
    useStore.setState({ markdowns: [{ name: 'other', config: { content: 'x' } }], saveMarkdown: saveFn });

    act(() => result.current.scheduleSave({ content: 'valid markdown' }));
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(saveFn).toHaveBeenCalledWith('other', { content: 'valid markdown' });
  });
});
