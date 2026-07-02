/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import Table from './Table';
import { withProviders } from '../../utils/test-utils';
import useStore from '../../stores/store';
import * as useShallowModule from 'zustand/react/shallow';

jest.mock('./PivotableTable', () => ({ table, sourceData }) => (
  <div data-testid="pivotable-table">
    {sourceData?.data?.map((row, i) => (
      <div key={i}>{Object.values(row).join(', ')}</div>
    ))}
  </div>
));

// The legacy MRT path exports whatever tableData holds (always empty on that
// path — data-backed tables render PivotableTable); the real generateCsv
// throws on an empty dataset, so stub the CSV builder and assert the download
// wiring behaviorally instead.
jest.mock('export-to-csv', () => ({
  mkConfig: jest.fn(cfg => cfg),
  generateCsv: jest.fn(() => () => 'csv-content'),
}));

let table;

beforeEach(() => {
  table = {
    name: 'name',
    data: 'ref(my-insight)',
    rows_per_page: 50,
  };
  useStore.setState({
    insightJobs: {
      'my-insight': {
        data: [
          { col_a: 'plain text', col_b: 100 },
          { col_a: 'more text', col_b: 200 },
        ],
      },
    },
    modelJobs: {},
  });
});

test('renders data-backed table via PivotableTable', async () => {
  render(<Table table={table} shouldLoad={true} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByTestId('pivotable-table')).toBeInTheDocument();
  });
  expect(screen.getByText('plain text, 100')).toBeInTheDocument();
});

test('shows loading when data not yet available', async () => {
  useStore.setState({
    insightJobs: {},
    modelJobs: {},
  });

  render(<Table table={table} shouldLoad={true} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByText('name')).toBeInTheDocument();
  });
});

test('shows loading when shouldLoad is false, even with data available', () => {
  render(<Table table={table} shouldLoad={false} />, { wrapper: withProviders });
  expect(screen.getByText('name')).toBeInTheDocument();
  expect(screen.queryByTestId('pivotable-table')).not.toBeInTheDocument();
});

test('derives the data source from ref strings in columns/rows/values', async () => {
  useStore.setState(s => ({
    insightJobs: {
      'my-insight': {
        ...s.insightJobs['my-insight'],
        // Exercise the props_mapping reverse-mapping derivation too.
        props_mapping: { 'props.columns.a': 'col_a' },
      },
    },
  }));
  const refTable = {
    name: 'ref-table',
    columns: ['${ref(my-insight).col_a}'],
    rows: ['${ref(my-insight).col_b}'],
  };
  render(<Table table={refTable} shouldLoad={true} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByTestId('pivotable-table')).toBeInTheDocument();
  });
  expect(screen.getByText('plain text, 100')).toBeInTheDocument();
});

test('reads model-backed data from modelJobs when table.data is a model object', async () => {
  useStore.setState({
    insightJobs: {},
    modelJobs: { m1: { data: [{ a: 'model-row', b: 7 }] } },
  });
  const modelTable = { name: 'model-table', data: { name: 'm1', sql: 'select 1' } };
  render(<Table table={modelTable} shouldLoad={true} />, { wrapper: withProviders });

  await waitFor(() => {
    expect(screen.getByTestId('pivotable-table')).toBeInTheDocument();
  });
  expect(screen.getByText('model-row, 7')).toBeInTheDocument();
});

describe('legacy MRT path (no data ref)', () => {
  const legacyTable = { name: 'legacy-table', rows_per_page: 5 };

  test('renders the MRT toolbar with a CSV export named after the table', () => {
    render(<Table table={legacyTable} shouldLoad={true} />, { wrapper: withProviders });

    const exportButton = screen.getByRole('button', { name: 'DownloadCsv' });
    expect(exportButton).toBeInTheDocument();
    expect(screen.queryByTestId('pivotable-table')).not.toBeInTheDocument();

    const appendSpy = jest.spyOn(document.body, 'appendChild');
    fireEvent.click(exportButton);
    const link = appendSpy.mock.calls.map(c => c[0]).find(n => n.tagName === 'A');
    expect(link).toBeDefined();
    expect(link.getAttribute('download')).toBe('legacy-table.csv');
    appendSpy.mockRestore();
  });

  describe('mobile toolbar', () => {
    const originalMatchMedia = window.matchMedia;

    beforeEach(() => {
      window.matchMedia = jest.fn().mockImplementation(query => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
      }));
    });

    afterEach(() => {
      window.matchMedia = originalMatchMedia;
    });

    test('toggling search reveals the mobile field; typing + clearing drive the global filter', () => {
      render(<Table table={legacyTable} shouldLoad={true} />, { wrapper: withProviders });

      // Closed by default.
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();

      fireEvent.click(screen.getByLabelText('Open search'));
      const input = screen.getByPlaceholderText('Search...');
      expect(input).toBeInTheDocument();

      fireEvent.change(input, { target: { value: 'zz' } });
      expect(input).toHaveValue('zz');

      // The clear adornment appears once a filter is set; clicking it resets.
      // eslint-disable-next-line testing-library/no-node-access
      const clearButton = input.closest('.MuiInputBase-root').querySelector('button');
      fireEvent.click(clearButton);
      expect(screen.getByPlaceholderText('Search...')).toHaveValue('');

      // Toggle closed again (the Close variant carries the same label).
      fireEvent.click(screen.getByLabelText('Open search'));
      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
    });
  });
});

describe('VIS-830 render-loop stabilization', () => {
  // Reproduces the original infinite-render loop: the store re-creates the insight
  // job object (and its `data` array) with a fresh reference on every input-driven
  // refresh. The old setState-inside-useEffect (deps [dataName, sourceData]) fired on
  // every new ref, scheduling a re-render that re-fired the effect → unbounded loop
  // ("Maximum update depth exceeded"). The useMemo-based derivation must NOT loop:
  // re-running with a NEW sourceData ref holding the SAME data is a no-op for rendering.
  test('new sourceData ref with identical data does not cause a setState storm', async () => {
    // Count Table's OWN renders by spying on a hook it calls once per render
    // (before any early return). The buggy setState-inside-useEffect produced an
    // extra Table commit per update (setColumns/setTableData); useMemo does not.
    // `useShallow` is invoked once at the top of Table on every render.
    const realHook = useShallowModule.useShallow;
    const spy = jest
      .spyOn(useShallowModule, 'useShallow')
      .mockImplementation((...args) => realHook(...args));

    render(<Table table={table} shouldLoad={true} />, { wrapper: withProviders });

    await waitFor(() => {
      expect(screen.getByTestId('pivotable-table')).toBeInTheDocument();
    });

    const rendersAfterMount = spy.mock.calls.length;

    // Simulate many input-driven refreshes that replace the job object + data array
    // with NEW references but identical content. With the buggy effect this would
    // throw "Maximum update depth exceeded"; with useMemo it must stay bounded.
    const sameRows = [
      { col_a: 'plain text', col_b: 100 },
      { col_a: 'more text', col_b: 200 },
    ];

    const UPDATES = 30;
    for (let i = 0; i < UPDATES; i++) {
      // Each update is its own commit (unbatched). With the buggy
      // setState-inside-useEffect, every new sourceData ref schedules an extra
      // setColumns/setTableData commit AFTER the subscription commit — roughly
      // doubling the render count. The useMemo derivation adds no extra commit.
      // The awaited microtask flushes zustand's subscription re-render inside act.
      // eslint-disable-next-line no-await-in-loop
      await act(async () => {
        useStore.setState(s => ({
          insightJobs: {
            ...s.insightJobs,
            'my-insight': {
              // brand-new object + brand-new (deep-copied) array each time
              data: sameRows.map(r => ({ ...r })),
            },
          },
        }));
        await Promise.resolve();
      });
    }

    const rendersFromUpdates = spy.mock.calls.length - rendersAfterMount;
    spy.mockRestore();

    // Fixed (useMemo): one Table render per update. The buggy effect added a second
    // commit per update via setColumns/setTableData, so it would roughly double this.
    expect(rendersFromUpdates).toBeLessThanOrEqual(UPDATES);

    // Data still renders correctly after all the churn.
    expect(screen.getByText('plain text, 100')).toBeInTheDocument();
  });

  // Guards against an over-aggressive fix (e.g. bailing on every update / dropping
  // deps): a genuinely-changed dataset MUST update the rendered table.
  test('genuinely-changed data updates the rendered table', async () => {
    render(<Table table={table} shouldLoad={true} />, { wrapper: withProviders });

    await waitFor(() => {
      expect(screen.getByText('plain text, 100')).toBeInTheDocument();
    });

    act(() => {
      useStore.setState(s => ({
        insightJobs: {
          ...s.insightJobs,
          'my-insight': {
            data: [
              { col_a: 'updated text', col_b: 999 },
              { col_a: 'fresh row', col_b: 42 },
            ],
          },
        },
      }));
    });

    await waitFor(() => {
      expect(screen.getByText('updated text, 999')).toBeInTheDocument();
    });
    expect(screen.getByText('fresh row, 42')).toBeInTheDocument();
    expect(screen.queryByText('plain text, 100')).not.toBeInTheDocument();
  });
});
