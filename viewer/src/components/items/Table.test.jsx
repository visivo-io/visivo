import { render, screen, waitFor, act } from '@testing-library/react';
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
