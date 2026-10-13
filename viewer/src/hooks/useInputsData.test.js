/**
 * useInputsData tests (VIS-1460 I1 / I2 / I3).
 *
 * The hook is the point where `display.default` from YAML meets the loaded
 * options, so this is where the documented default semantics must hold:
 *   - `values: all`  -> every option selected            (I1)
 *   - `values: none` -> nothing selected                 (I1)
 *   - `values: ?{..}` -> whatever the default query returned, read from the
 *     `defaults` parquet the run wrote                   (I2)
 *   - range `start`/`end` defaults match options numerically when numeric (I3)
 *
 * DuckDB and the API are stubbed at their module boundaries; the store is a
 * plain object with jest.fn setters so the seeded defaults can be asserted.
 */
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useInputsData, expandDefaultLiteral } from './useInputsData';
import { useFetchInputJobs } from '../contexts/QueryContext';
import { useDuckDB } from '../contexts/DuckDBContext';
import { loadInsightParquetFiles, runDuckDBQuery } from '../duckdb/queries';
import useStore from '../stores/store';

// setupTests stubs useQuery globally; this hook's behaviour IS the query, so
// run the real react-query here.
jest.mock('@tanstack/react-query', () => jest.requireActual('@tanstack/react-query'));
jest.mock('../contexts/QueryContext');
jest.mock('../contexts/DuckDBContext');
jest.mock('../duckdb/queries');
jest.mock('../stores/store');

const asArrow = rows => ({ toArray: () => rows.map(r => ({ toJSON: () => r })) });

let fetchInputJobs;
let state;

const seedStore = (inputJobOptions = {}) => {
  state = {
    inputJobOptions,
    setInputJobOptions: jest.fn(),
    setDefaultInputJobValues: jest.fn(),
    setInputJobData: jest.fn(),
  };
  useStore.mockImplementation(selector => selector(state));
};

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

const renderInputs = (names, opts) =>
  renderHook(() => useInputsData('proj', names, opts), { wrapper: wrapper() });

const seededDefaults = () => {
  expect(state.setDefaultInputJobValues).toHaveBeenCalled();
  return state.setDefaultInputJobValues.mock.calls[0][0];
};

const defaultFor = name => seededDefaults().find(d => d.name === name);

beforeEach(() => {
  jest.clearAllMocks();
  fetchInputJobs = jest.fn();
  useFetchInputJobs.mockReturnValue(fetchInputJobs);
  useDuckDB.mockReturnValue({ mock: 'db' });
  loadInsightParquetFiles.mockResolvedValue({ loaded: [], failed: [] });
  runDuckDBQuery.mockResolvedValue(asArrow([]));
  seedStore();
});

describe('expandDefaultLiteral', () => {
  it("maps 'all' to a copy of every option and 'none' to []", () => {
    const options = ['a', 'b'];
    const all = expandDefaultLiteral('all', options);
    expect(all).toEqual(['a', 'b']);
    expect(all).not.toBe(options);
    expect(expandDefaultLiteral('none', options)).toEqual([]);
    expect(expandDefaultLiteral('all', undefined)).toEqual([]);
  });

  it('passes anything else through unchanged', () => {
    expect(expandDefaultLiteral(['a'], ['a', 'b'])).toEqual(['a']);
    expect(expandDefaultLiteral('a', ['a', 'b'])).toBe('a');
  });
});

describe('multi-select literal defaults (I1)', () => {
  it('seeds every static option for `values: all` (never the literal string)', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 'groups',
        type: 'multi-select',
        structure: 'options',
        files: [],
        static_props: { options: ['Group 1', 'Group 2', 'Group 3'] },
        display: { type: 'checkboxes', default: { values: 'all' } },
      },
    ]);

    renderInputs(['groups']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('groups')).toEqual({
      name: 'groups',
      value: ['Group 1', 'Group 2', 'Group 3'],
      type: 'multi-select',
    });
    expect(state.setInputJobOptions).toHaveBeenCalledWith('groups', [
      'Group 1',
      'Group 2',
      'Group 3',
    ]);
  });

  it('seeds every query-loaded option for `values: all`', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 'xs',
        type: 'multi-select',
        structure: 'options',
        files: [{ key: 'options', name_hash: 'h_options', signed_data_file_url: '/f' }],
        static_props: null,
        display: { type: 'checkboxes', default: { values: 'all' } },
      },
    ]);
    runDuckDBQuery.mockResolvedValue(asArrow([{ option: 1 }, { option: 2 }, { option: 3 }]));

    renderInputs(['xs']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('xs').value).toEqual(['1', '2', '3']);
  });

  it('seeds an empty selection for `values: none`', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 'tags',
        type: 'multi-select',
        structure: 'options',
        files: [],
        static_props: { options: ['High', 'Low'] },
        display: { type: 'chips', default: { values: 'none' } },
      },
    ]);

    renderInputs(['tags']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('tags').value).toEqual([]);
  });

  it('passes an explicit list through unchanged', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 'cats',
        type: 'multi-select',
        structure: 'options',
        files: [],
        static_props: { options: ['A', 'B', 'C'] },
        display: { type: 'dropdown', default: { values: ['A', 'B'] } },
      },
    ]);

    renderInputs(['cats']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('cats').value).toEqual(['A', 'B']);
  });

  it('expands the literal on the legacy results.display shape too', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 'legacy',
        type: 'multi-select',
        structure: 'options',
        results: {
          options: ['p', 'q'],
          display: { type: 'checkboxes', default: { values: 'all' } },
        },
      },
    ]);

    renderInputs(['legacy']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('legacy').value).toEqual(['p', 'q']);
  });
});

describe('query-based multi-select defaults (I2)', () => {
  const queryInput = {
    name: 'qx',
    type: 'multi-select',
    structure: 'options',
    files: [
      { key: 'options', name_hash: 'qx_options', signed_data_file_url: '/o' },
      { key: 'defaults', name_hash: 'qx_defaults', signed_data_file_url: '/d' },
    ],
    static_props: null,
    display: { type: 'checkboxes', default: { values: null } },
  };

  beforeEach(() => {
    runDuckDBQuery.mockImplementation(async (db, sql) => {
      if (sql.includes('"value"')) return asArrow([{ value: 1 }, { value: 2 }]);
      return asArrow([{ option: 1 }, { option: 2 }, { option: 3 }, { option: 4 }]);
    });
  });

  it('batch-loads the `defaults` parquet alongside `options`', async () => {
    fetchInputJobs.mockResolvedValue([queryInput]);

    renderInputs(['qx']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    const batchFiles = loadInsightParquetFiles.mock.calls[0][1];
    expect(batchFiles.map(f => f.key).sort()).toEqual(['defaults', 'options']);
  });

  it('seeds the values the default query returned, not null', async () => {
    fetchInputJobs.mockResolvedValue([queryInput]);

    renderInputs(['qx']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(runDuckDBQuery).toHaveBeenCalledWith(
      expect.anything(),
      'SELECT "value" FROM "qx_defaults"',
      3,
      1000
    );
    expect(defaultFor('qx')).toEqual({ name: 'qx', value: ['1', '2'], type: 'multi-select' });
    expect(state.setInputJobOptions).toHaveBeenCalledWith('qx', ['1', '2', '3', '4']);
  });

  it('a query default wins over a stale literal in display.default', async () => {
    fetchInputJobs.mockResolvedValue([
      { ...queryInput, display: { type: 'checkboxes', default: { values: 'all' } } },
    ]);

    renderInputs(['qx']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('qx').value).toEqual(['1', '2']);
  });
});

describe('range defaults (I3)', () => {
  const rangeInput = (range, def, display = 'range-slider') => ({
    name: 'r',
    type: 'multi-select',
    structure: 'range',
    files: [],
    static_props: { range },
    display: { type: display, default: def },
  });

  it('matches numeric start/end against numeric options as numbers', async () => {
    fetchInputJobs.mockResolvedValue([
      rangeInput({ start: 0, end: 1000, step: 50 }, { start: 100, end: 500 }),
    ]);

    renderInputs(['r']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('r').value).toEqual([
      '100',
      '150',
      '200',
      '250',
      '300',
      '350',
      '400',
      '450',
      '500',
    ]);
  });

  it('treats string bounds as numbers on the legacy results.range shape', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 'r',
        type: 'multi-select',
        structure: 'range',
        results: {
          range: { start: 0, end: 30, step: 5 },
          display: { type: 'range-slider', default: { start: '10', end: '20' } },
        },
        display: { default: { start: '10', end: '20' } },
      },
    ]);

    renderInputs(['r']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('r').value).toEqual(['10', '15', '20']);
  });

  it('does not treat "100" < "20" as a string comparison would', async () => {
    fetchInputJobs.mockResolvedValue([
      rangeInput({ start: 0, end: 200, step: 20 }, { start: 20, end: 100 }),
    ]);

    renderInputs(['r']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('r').value).toEqual(['20', '40', '60', '80', '100']);
  });

  it('keeps lexicographic matching for ISO date ranges', async () => {
    fetchInputJobs.mockResolvedValue([
      rangeInput(
        { start: '2024-01-01', end: '2024-01-10', step: '1 day' },
        { start: '2024-01-03', end: '2024-01-05' },
        'date-range'
      ),
    ]);

    renderInputs(['r']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('r').value).toEqual(['2024-01-03', '2024-01-04', '2024-01-05']);
  });

  it('falls back to the full option list when no option falls in the default range', async () => {
    fetchInputJobs.mockResolvedValue([
      rangeInput({ start: 0, end: 10, step: 5 }, { start: 100, end: 200 }),
    ]);

    renderInputs(['r']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('r').value).toEqual(['0', '5', '10']);
  });

  it('includes the end value when it is not on a step boundary', async () => {
    fetchInputJobs.mockResolvedValue([
      rangeInput({ start: 0, end: 7, step: 3 }, { start: 0, end: 7 }),
    ]);

    renderInputs(['r']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('r').value).toEqual(['0', '3', '6', '7']);
  });
});

describe('single-select and fallbacks', () => {
  it('seeds display.default.value for a single-select', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 's',
        type: 'single-select',
        structure: 'options',
        files: [],
        static_props: { options: ['a', 'b'] },
        display: { type: 'dropdown', default: { value: 'b' } },
      },
    ]);

    renderInputs(['s']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('s')).toEqual({ name: 's', value: 'b', type: 'single-select' });
  });

  it('reads the legacy results.display.default.value', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 's',
        type: 'single-select',
        structure: 'options',
        results: { options: ['a', 'b'], display: { default: { value: 'a' } } },
      },
    ]);

    renderInputs(['s']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('s').value).toBe('a');
  });

  it('falls back to the first static option, then the first loaded option', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 'static',
        structure: 'options',
        files: [],
        static_props: { options: ['x', 'y'] },
        display: { type: 'dropdown' },
      },
      {
        name: 'loaded',
        structure: 'options',
        files: [{ key: 'options', name_hash: 'l_options', signed_data_file_url: '/l' }],
        static_props: null,
        display: { type: 'dropdown', default: {} },
      },
    ]);
    runDuckDBQuery.mockResolvedValue(asArrow([{ option: 'first' }, { option: 'second' }]));

    renderInputs(['static', 'loaded']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(defaultFor('static')).toEqual({ name: 'static', value: 'x', type: 'single-select' });
    expect(defaultFor('loaded').value).toBe('first');
  });

  it('drops inputs whose processing rejected and still seeds the rest', async () => {
    fetchInputJobs.mockResolvedValue([
      {
        name: 'bad',
        structure: 'options',
        files: [{ key: 'options', name_hash: 'bad_options', signed_data_file_url: '/b' }],
      },
      { name: 'good', structure: 'options', files: [], static_props: { options: ['ok'] } },
    ]);
    runDuckDBQuery.mockRejectedValue(new Error('boom'));

    renderInputs(['bad', 'good']);

    await waitFor(() => expect(state.setDefaultInputJobValues).toHaveBeenCalled());
    expect(seededDefaults().map(d => d.name)).toEqual(['good']);
  });
});

describe('loading gates', () => {
  it('does nothing without a DuckDB instance', async () => {
    useDuckDB.mockReturnValue(null);
    fetchInputJobs.mockResolvedValue([]);

    const { result } = renderInputs(['a']);

    await waitFor(() => expect(result.current.isInputsLoading).toBe(false));
    expect(fetchInputJobs).not.toHaveBeenCalled();
  });

  it('skips inputs whose options are already in the store', async () => {
    seedStore({ a: ['1'] });
    fetchInputJobs.mockResolvedValue([]);

    renderInputs(['a']);

    await new Promise(r => setTimeout(r, 20));
    expect(fetchInputJobs).not.toHaveBeenCalled();
  });

  it('re-processes already-loaded inputs when a run refresh cacheKey is passed', async () => {
    seedStore({ a: ['1'] });
    fetchInputJobs.mockResolvedValue([
      { name: 'a', structure: 'options', files: [], static_props: { options: ['1', '2'] } },
    ]);

    renderInputs(['a'], { cacheKey: 'run-2' });

    await waitFor(() => expect(state.setInputJobOptions).toHaveBeenCalledWith('a', ['1', '2']));
  });

  it('dedupes and returns quietly when the API returns nothing', async () => {
    fetchInputJobs.mockResolvedValue([]);

    renderInputs(['a', 'a']);

    await waitFor(() => expect(fetchInputJobs).toHaveBeenCalledWith('proj', ['a']));
    expect(state.setDefaultInputJobValues).not.toHaveBeenCalled();
  });

  it('returns no defaults when inputNames is empty', () => {
    const { result } = renderInputs([]);
    expect(result.current.isInputsLoading).toBe(false);
  });
});
