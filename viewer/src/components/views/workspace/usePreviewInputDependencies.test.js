/* eslint-disable no-template-curly-in-string -- literal ${input.accessor} strings under test */
/**
 * usePreviewInputDependencies tests (VIS-1003 / design §5 + §8.3).
 *
 * The hook produces the UNION of input dependencies across an object's parent
 * insights — runtime (insightJobs[n].inputDependencies + pendingInputs) unioned
 * with a config fallback (extractInputDependenciesFromProps across props +
 * layout + interactions) — resolves each to its <Input> config, and calls
 * useInputsData so options load and a DEFAULT is seeded.
 *
 * VIS-831 invariant under test: the names passed to useInputsData are derived
 * ONLY from the resolved input configs (graph metadata + config), never from a
 * pending/resolved boolean.
 */
import { renderHook } from '@testing-library/react';
import { usePreviewInputDependencies } from './usePreviewInputDependencies';
import useStore from '../../../stores/store';
import { useInputsData } from '../../../hooks/useInputsData';

jest.mock('../../../stores/store');
jest.mock('../../../hooks/useInputsData', () => ({
  useInputsData: jest.fn(),
}));
// Use the REAL extractor so the config-fallback union (props+layout+interactions)
// is genuinely exercised end-to-end.
jest.mock('zustand/react/shallow', () => ({
  useShallow: fn => fn,
}));

const seedStore = ({ inputs = [], insightJobs = {} } = {}) => {
  const state = { inputs, insightJobs, fetchInputs: jest.fn() };
  useStore.mockImplementation(selector =>
    typeof selector === 'function' ? selector(state) : state
  );
  useStore.getState = jest.fn(() => state);
};

const lastInputsDataCall = () =>
  useInputsData.mock.calls[useInputsData.mock.calls.length - 1];

describe('usePreviewInputDependencies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves runtime inputDependencies from insightJobs into <Input> configs', () => {
    seedStore({
      inputs: [{ name: 'region', config: { name: 'region', type: 'single-select' } }],
      insightJobs: { sales: { inputDependencies: ['region'], pendingInputs: null } },
    });

    const { result } = renderHook(() =>
      usePreviewInputDependencies('p1', { insightNames: ['sales'] })
    );

    expect(result.current.inputConfigs).toEqual([{ name: 'region', type: 'single-select' }]);
    expect(lastInputsDataCall()).toEqual(['p1', ['region']]);
  });

  it('unions inputDependencies AND pendingInputs across multiple insights', () => {
    seedStore({
      inputs: [
        { name: 'region', config: { name: 'region' } },
        { name: 'quarter', config: { name: 'quarter' } },
        { name: 'segment', config: { name: 'segment' } },
      ],
      insightJobs: {
        a: { inputDependencies: ['region'], pendingInputs: ['quarter'] },
        b: { inputDependencies: ['segment'], pendingInputs: [] },
      },
    });

    const { result } = renderHook(() =>
      usePreviewInputDependencies('p1', { insightNames: ['a', 'b'] })
    );

    const names = result.current.inputConfigs.map(c => c.name);
    expect(names).toEqual(['quarter', 'region', 'segment']); // sorted, deduped union
  });

  it('falls back to the config (props + layout + interactions) before runtime metadata lands', () => {
    seedStore({
      inputs: [
        { name: 'show_markers', config: { name: 'show_markers' } },
        { name: 'min_value', config: { name: 'min_value' } },
        { name: 'y_max', config: { name: 'y_max' } },
      ],
      insightJobs: {}, // no runtime metadata yet
    });

    const config = {
      props: { mode: '${show_markers.value}' },
      interactions: [{ filter: 'x > ${min_value.value}' }],
      layout: { yaxis: { range: [0, '${y_max.value}'] } },
    };

    const { result } = renderHook(() =>
      usePreviewInputDependencies('p1', {
        insightNames: ['unloaded'],
        configForFallback: config,
      })
    );

    const names = result.current.inputConfigs.map(c => c.name);
    // Union across props + interactions + layout, from the fallback path.
    expect(names).toEqual(['min_value', 'show_markers', 'y_max']);
  });

  it('unions runtime metadata with the config fallback (dedupe across sources)', () => {
    seedStore({
      inputs: [
        { name: 'region', config: { name: 'region' } },
        { name: 'segment', config: { name: 'segment' } },
      ],
      insightJobs: { sales: { inputDependencies: ['region'] } },
    });

    const { result } = renderHook(() =>
      usePreviewInputDependencies('p1', {
        insightNames: ['sales'],
        // region overlaps with runtime; segment is new from the fallback.
        configForFallback: { props: { color: '${region.value}', mode: '${segment.value}' } },
      })
    );

    const names = result.current.inputConfigs.map(c => c.name);
    expect(names).toEqual(['region', 'segment']);
  });

  it('drops names that have no matching <Input> config (e.g. a model ref)', () => {
    seedStore({
      inputs: [{ name: 'region', config: { name: 'region' } }],
      insightJobs: { sales: { inputDependencies: ['region', 'some_model'] } },
    });

    const { result } = renderHook(() =>
      usePreviewInputDependencies('p1', { insightNames: ['sales'] })
    );

    // some_model is not an input → dropped; only region is loaded.
    expect(result.current.inputConfigs.map(c => c.name)).toEqual(['region']);
    expect(lastInputsDataCall()).toEqual(['p1', ['region']]);
  });

  it('returns no configs and loads no inputs for a no-dependency object', () => {
    seedStore({
      inputs: [{ name: 'region', config: { name: 'region' } }],
      insightJobs: { sales: { inputDependencies: [], pendingInputs: [] } },
    });

    const { result } = renderHook(() =>
      usePreviewInputDependencies('p1', {
        insightNames: ['sales'],
        configForFallback: { props: { type: 'scatter' } },
      })
    );

    expect(result.current.inputConfigs).toEqual([]);
    expect(lastInputsDataCall()).toEqual(['p1', []]);
  });

  it('keys useInputsData ONLY on resolved names — never on pending state (VIS-831)', () => {
    // Two insightJobs that differ ONLY in pendingInputs presence must produce
    // the same name set passed to useInputsData (because the union of
    // inputDependencies + pendingInputs is identical). We assert the call shape
    // is purely the resolved input names — there is no pending/resolved boolean
    // anywhere in the arguments.
    seedStore({
      inputs: [{ name: 'region', config: { name: 'region' } }],
      insightJobs: { sales: { inputDependencies: ['region'], pendingInputs: ['region'] } },
    });

    renderHook(() => usePreviewInputDependencies('p1', { insightNames: ['sales'] }));

    const call = lastInputsDataCall();
    expect(call[0]).toBe('p1');
    expect(call[1]).toEqual(['region']);
    // No third argument carrying pending/resolved state.
    expect(call.length).toBe(2);
  });

  it('fetches the inputs list at most once even when the empty-array reference churns', () => {
    // A project with no inputs makes `fetchInputs` write a fresh [] each call,
    // so `s.inputs` returns a NEW reference every render. Simulate that by
    // handing out a new state (new empty `inputs`) on every selector call: the
    // pre-fix effect re-fetched on every render → a continuous /api/inputs/
    // loop. The ref guard must hold it to a single fetch.
    const fetchInputs = jest.fn();
    useStore.mockImplementation(selector => {
      const state = { inputs: [], insightJobs: {}, fetchInputs };
      return typeof selector === 'function' ? selector(state) : state;
    });
    useStore.getState = jest.fn(() => ({ inputs: [], insightJobs: {}, fetchInputs }));

    const { rerender } = renderHook(() =>
      usePreviewInputDependencies('p1', { insightNames: [] })
    );
    rerender();
    rerender();
    rerender();

    expect(fetchInputs).toHaveBeenCalledTimes(1);
  });
});
