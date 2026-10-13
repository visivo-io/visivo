// Coverage for the input-jobs slice: the accessor computations (single/multi
// select, SQL escaping, numeric vs ISO-date min/max) exercised via the value
// setters, plus the initialized-gated query refresh (stubbed at the duckdb
// boundary; the db-null guard short-circuits without querying).
import createInputJobsSlice, { toMultiSelectArray } from './inputJobsStore';
import { prepPostQuery, runDuckDBQuery } from '../duckdb/queries';

jest.mock('../duckdb/queries', () => ({
  prepPostQuery: jest.fn(),
  runDuckDBQuery: jest.fn(),
}));

const makeStore = (slice, initial = {}) => {
  let state = { ...initial };
  const set = patch => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  const get = () => state;
  state = { ...state, ...slice(set, get) };
  return { get };
};

const build = (initial = {}) => makeStore(createInputJobsSlice, initial);

beforeEach(() => {
  jest.clearAllMocks();
  // Invoke rAF callbacks synchronously so the refresh path is observable.
  global.requestAnimationFrame = jest.fn(cb => {
    cb();
    return 1;
  });
});

describe('simple setters', () => {
  it('setInputJobOptions and setInputJobData store per-input entries', () => {
    const store = build();
    store.get().setInputJobOptions('region', ['us', 'eu']);
    store.get().setInputJobData('region', { type: 'single-select' });
    expect(store.get().inputJobOptions.region).toEqual(['us', 'eu']);
    expect(store.get().inputJobData.region).toEqual({ type: 'single-select' });
  });
});

describe('single-select accessors', () => {
  it('wraps a plain value and nulls out empty selections', () => {
    const store = build();
    store.get().setDefaultInputJobValue('a', 'hello');
    expect(store.get().inputJobs.a).toEqual({ value: 'hello' });
    expect(store.get().inputSelectedValues.a).toBe('hello');
    expect(store.get().inputJobsInitialized.a).toBe(true);

    store.get().setDefaultInputJobValue('b', null);
    expect(store.get().inputJobs.b).toEqual({ value: null });
  });
});

describe('multi-select accessors', () => {
  it('produces a quoted SQL list and numeric min/max', () => {
    const store = build();
    store.get().setDefaultInputJobValue('nums', ['1', '2', 3], 'multi-select');
    expect(store.get().inputJobs.nums).toEqual({
      values: "'1','2','3'",
      min: 1,
      max: 3,
      first: '1',
      last: 3,
    });
  });

  it('computes lexicographic min/max for ISO date strings', () => {
    const store = build();
    store.get().setDefaultInputJobValue('dates', ['2024-03-01', '2024-01-15'], 'multi-select');
    expect(store.get().inputJobs.dates).toMatchObject({
      min: '2024-01-15',
      max: '2024-03-01',
    });
  });

  it('escapes embedded quotes and leaves min/max null for non-numeric/non-date', () => {
    const store = build();
    store.get().setDefaultInputJobValue('strs', ["O'Reilly", 'Acme'], 'multi-select');
    expect(store.get().inputJobs.strs).toEqual({
      values: "'O''Reilly','Acme'",
      min: null,
      max: null,
      first: "O'Reilly",
      last: 'Acme',
    });
  });

  it('returns the all-null accessor shape for an empty selection', () => {
    const store = build();
    store.get().setDefaultInputJobValue('empty', [], 'multi-select');
    expect(store.get().inputJobs.empty).toEqual({
      values: null,
      min: null,
      max: null,
      first: null,
      last: null,
    });
  });
});

describe('setDefaultInputJobValues (batch)', () => {
  it('is a no-op for an empty batch', () => {
    const store = build();
    store.get().setDefaultInputJobValues([]);
    expect(store.get().inputJobs).toEqual({});
  });

  it('applies every default in one update', () => {
    const store = build();
    store.get().setDefaultInputJobValues([
      { name: 'a', value: 'x' },
      { name: 'b', value: [1, 2], type: 'multi-select' },
    ]);
    expect(store.get().inputJobs.a).toEqual({ value: 'x' });
    expect(store.get().inputJobs.b).toMatchObject({ min: 1, max: 2 });
    expect(store.get().inputJobsInitialized).toEqual({ a: true, b: true });
  });
});

describe('setInputJobValue refresh gating', () => {
  it('does not schedule a refresh on the first (initializing) call', () => {
    const store = build({ insightJobs: {}, db: null });
    store.get().setInputJobValue('a', 'x');
    expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    expect(store.get().inputJobsInitialized.a).toBe(true);
  });

  it('subsequent value changes only write the store — refetch is owned by useInsightsData (VIS-831)', () => {
    // The imperative rAF/DuckDB refresh path was removed: writing the new
    // accessor object re-keys useInsightsData's react-query query, which
    // re-runs the insight exactly once. A second imperative re-query here is
    // the VIS-831 feedback-loop class.
    const store = build({ insightJobs: {}, db: null });
    store.get().setInputJobValue('a', 'x'); // initialize
    store.get().setInputJobValue('a', 'y');
    expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    expect(prepPostQuery).not.toHaveBeenCalled();
    expect(runDuckDBQuery).not.toHaveBeenCalled();
    expect(store.get().inputSelectedValues.a).toBe('y');
  });
});

describe('multi-select default literals (VIS-1460 I1)', () => {
  // The documented semantics (MultiSelectDefault): `all` = every option
  // selected, `none` = nothing selected. The store resolves the literal against
  // the options already loaded for that input so `.values` is never `'all'`.
  it("expands 'all' to every loaded option in setDefaultInputJobValue", () => {
    const store = build();
    store.get().setInputJobOptions('groups', ['Group 1', 'Group 2', 'Group 3']);
    store.get().setDefaultInputJobValue('groups', 'all', 'multi-select');
    expect(store.get().inputSelectedValues.groups).toEqual(['Group 1', 'Group 2', 'Group 3']);
    expect(store.get().inputJobs.groups).toMatchObject({
      values: "'Group 1','Group 2','Group 3'",
      first: 'Group 1',
      last: 'Group 3',
    });
  });

  it("expands 'none' to an empty selection (all-null accessors)", () => {
    const store = build();
    store.get().setInputJobOptions('groups', ['Group 1', 'Group 2']);
    store.get().setDefaultInputJobValue('groups', 'none', 'multi-select');
    expect(store.get().inputSelectedValues.groups).toEqual([]);
    expect(store.get().inputJobs.groups).toEqual({
      values: null,
      min: null,
      max: null,
      first: null,
      last: null,
    });
  });

  it('expands literals per input in the batch setter', () => {
    const store = build();
    store.get().setInputJobOptions('a', ['1', '2']);
    store.get().setInputJobOptions('b', ['x']);
    store.get().setDefaultInputJobValues([
      { name: 'a', value: 'all', type: 'multi-select' },
      { name: 'b', value: 'none', type: 'multi-select' },
      { name: 'c', value: 'all' }, // single-select: literal is just a value
    ]);
    expect(store.get().inputSelectedValues).toEqual({ a: ['1', '2'], b: [], c: 'all' });
    expect(store.get().inputJobs.a).toMatchObject({ values: "'1','2'", min: 1, max: 2 });
    expect(store.get().inputJobs.b.values).toBeNull();
    expect(store.get().inputJobs.c).toEqual({ value: 'all' });
  });

  it("falls back to an empty selection for 'all' when no options are loaded yet", () => {
    const store = build();
    store.get().setDefaultInputJobValue('late', 'all', 'multi-select');
    expect(store.get().inputSelectedValues.late).toEqual([]);
    expect(store.get().inputJobs.late.values).toBeNull();
  });

  it('toMultiSelectArray wraps scalars and passes arrays through', () => {
    expect(toMultiSelectArray('x', ['x', 'y'])).toEqual(['x']);
    expect(toMultiSelectArray(['y'], ['x', 'y'])).toEqual(['y']);
    expect(toMultiSelectArray('all', undefined)).toEqual([]);
  });
});
