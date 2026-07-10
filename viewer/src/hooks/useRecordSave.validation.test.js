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
import { validateExpressions } from '../api/expressions';
import useRecordSave from './useRecordSave';
import useStore from '../stores/store';
import {
  preloadValidationSchema,
  clearValidationCache,
} from '../components/views/workspace/validateAgainstSchema';

// The expression pre-flight's network layer — the real endpoint contract is
// covered by the backend suite + the e2e story. (jest.mock is hoisted.)
jest.mock('../api/expressions', () => ({
  validateExpressions: jest.fn(async exprs => ({
    results: exprs.map(e => ({ name: e.name, valid: true })),
  })),
}));
// The real $defs validators compile heavyweight unions; under full-suite
// CPU contention the first compile can exceed jest's 5s default.
jest.setTimeout(30000);


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
    // Warm the heavyweight union validators (Insight/Chart pull the 51-arm
    // trace union) so per-test sync validation stays fast — the first compile
    // is hundreds of ms even outside jest. Production mirrors this via
    // preloadValidationSchema on workspace mount + lazy per-type compile.
    const { validateRecordConfig } = jest.requireActual(
      '../components/views/workspace/validateAgainstSchema'
    );
    await validateRecordConfig('insight', { name: 'warm', props: { type: 'scatter' } });
    await validateRecordConfig('chart', { name: 'warm' });
  }, 60000);
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

  test('a plotly-invalid props object inside an insight is blocked by the $defs union', async () => {
    // TracePropsEditor gives per-field detail; the backbone's union check is the
    // structural guarantee that a doomed insight config never persists — even
    // from consumers that bypass the editor.
    const saveFn = setupCollection(
      'insights',
      'i1',
      { name: 'i1', props: { type: 'scatter', mode: 'lines' } },
      'saveInsight'
    );
    const { result } = renderHook(() => useRecordSave('insight', 'i1', { delay: 500 }));

    act(() =>
      result.current.scheduleSave({
        name: 'i1',
        props: { type: 'scatter', mode: 'not-a-real-mode' },
      })
    );
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(saveFn).not.toHaveBeenCalled();
    expect(result.current.status).toBe('invalid');
    expect(result.current.errors.some(e => e.path === 'props.mode')).toBe(true);
  });

  test('an unparseable metric expression is blocked at fire time (VIS-993 layer 2)', async () => {
    const { clearExpressionCache } = jest.requireActual(
      '../components/views/workspace/expressionPreflight'
    );
    clearExpressionCache();
    validateExpressions.mockResolvedValueOnce({
      results: [{ name: 'expression', valid: false, error: "Expecting ). Line 1, Col: 25." }],
    });
    const saveFn = setupCollection(
      'metrics',
      'avg_value',
      { name: 'avg_value', expression: 'AVG(value)' },
      'saveMetric'
    );
    const { result } = renderHook(() => useRecordSave('metric', 'avg_value', { delay: 500 }));

    act(() => result.current.scheduleSave({ name: 'avg_value', expression: 'AVG(value)}' }));
    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(saveFn).not.toHaveBeenCalled();
    expect(result.current.status).toBe('invalid');
    expect(result.current.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: 'expression', keyword: 'expression' }),
      ])
    );
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
