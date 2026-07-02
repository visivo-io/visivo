/**
 * DimensionInspector tests (VIS-1009).
 *
 * The Field Lens body for a dimension: it shows the dimension expression, runs
 * its parent model's SQL (via useModelQueryJob), loads the rows into DuckDB and
 * profiles the dimension as a DERIVED column, then mounts the dashboard-style
 * profile (DimensionProfileDashboard — KPI tiles + distribution + box-plot).
 *
 * We mock the data layer: the model-query job hook (so we can drive it to a
 * completed state with rows), the DuckDB context + connection, and the two
 * profiling helpers. The dashboard renders for real so the profile panel mounts.
 */
import React from 'react';
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react';
import DimensionInspector from './DimensionInspector';
import useStore from '../../../../stores/store';

// --- Mock the model-query job hook (driven per-test) ---------------------
// `mock`-prefixed so the jest.mock factory may reference them (jest exempts
// `mock*` identifiers from the out-of-scope guard).
let mockJobState;
const mockExecuteQuery = jest.fn(() => Promise.resolve('job-1'));
const mockJobReset = jest.fn(() => {
  mockJobState = { status: null, progressMessage: '', result: null, error: null, isRunning: false };
});
jest.mock('../../../../hooks/useModelQueryJob', () => ({
  __esModule: true,
  useModelQueryJob: () => ({
    ...mockJobState,
    executeQuery: mockExecuteQuery,
    reset: mockJobReset,
  }),
}));

// --- Mock DuckDB (context + connection + file registration) --------------
// A STABLE db object (same reference every render) so the profiling effect
// isn't re-triggered + cancelled by a changing `db` dependency.
const mockConn = { query: jest.fn(() => Promise.resolve()) };
const mockDb = {
  registerFileText: jest.fn(() => Promise.resolve()),
  dropFile: jest.fn(() => Promise.resolve()),
};
jest.mock('../../../../contexts/DuckDBContext', () => ({
  __esModule: true,
  useDuckDB: () => mockDb,
}));
jest.mock('../../../../duckdb/duckdb', () => ({
  __esModule: true,
  getConnection: jest.fn(() => Promise.resolve(mockConn)),
}));

// --- Mock the profiling helpers (the Explorer stack we reuse) -------------
const mockProfileTableLocally = jest.fn();
const mockHistogramTableLocally = jest.fn();
jest.mock('../../../../duckdb/profiling', () => ({
  __esModule: true,
  profileTableLocally: (...a) => mockProfileTableLocally(...a),
  histogramTableLocally: (...a) => mockHistogramTableLocally(...a),
}));

const DERIVED = '__dimension__';

const seed = ({ dimensions = [], models = [] } = {}) => {
  act(() => {
    useStore.setState({
      dimensions,
      models,
      sources: [],
      defaults: { source_name: 'src' },
      fetchDimensions: jest.fn(),
      fetchModels: jest.fn(),
      fetchSources: jest.fn(),
      fetchDefaults: jest.fn(),
    });
  });
};

const renderInspector = (name = 'x_rounded') =>
  render(<DimensionInspector activeObject={{ type: 'dimension', name }} projectId="p1" />);

describe('DimensionInspector (VIS-1009)', () => {
  beforeEach(() => {
    mockJobState = {
      status: null,
      progressMessage: '',
      result: null,
      error: null,
      isRunning: false,
    };
    mockExecuteQuery.mockClear();
    mockJobReset.mockClear();
    mockConn.query.mockClear();
    mockProfileTableLocally.mockReset();
    mockHistogramTableLocally.mockReset();
  });

  test('renders the dimension expression and its parent model', () => {
    seed({
      dimensions: [
        { name: 'x_rounded', parentModel: 'local_test', config: { expression: 'ROUND(x, 2)' } },
      ],
      models: [{ name: 'local_test', config: { sql: 'SELECT * FROM t' } }],
    });
    renderInspector();

    expect(screen.getByTestId('dimension-inspector')).toBeInTheDocument();
    expect(screen.getByTestId('dimension-inspector-expression')).toHaveTextContent('ROUND(x, 2)');
    expect(screen.getByText('local_test')).toBeInTheDocument();
    // Idle until profiled.
    expect(screen.getByTestId('dimension-inspector-idle')).toBeInTheDocument();
  });

  test('clicking Profile runs the parent model SQL via the model-query job', () => {
    seed({
      dimensions: [
        { name: 'x_rounded', parentModel: 'local_test', config: { expression: 'ROUND(x, 2)' } },
      ],
      models: [{ name: 'local_test', config: { sql: 'SELECT * FROM t' } }],
    });
    renderInspector();
    fireEvent.click(screen.getByTestId('dimension-inspector-run'));
    expect(mockExecuteQuery).toHaveBeenCalledWith('src', 'SELECT * FROM t');
  });

  test('on a completed run it profiles the derived column and mounts the profile panel', async () => {
    mockProfileTableLocally.mockResolvedValue({
      row_count: 3,
      columns: [
        {
          name: DERIVED,
          type: 'DOUBLE',
          null_percentage: 0,
          null_count: 0,
          distinct: 3,
          min: 1,
          max: 3,
          avg: 2,
          median: 2,
          std_dev: 1,
        },
      ],
    });
    mockHistogramTableLocally.mockResolvedValue({
      buckets: [{ range: '[1, 2)', count: 2 }],
      total_count: 3,
      column_type: 'DOUBLE',
    });

    seed({
      dimensions: [
        { name: 'x_rounded', parentModel: 'local_test', config: { expression: 'ROUND(x, 2)' } },
      ],
      models: [{ name: 'local_test', config: { sql: 'SELECT * FROM t' } }],
    });
    const { rerender } = renderInspector();
    fireEvent.click(screen.getByTestId('dimension-inspector-run'));

    // Drive the mocked job to a completed state WITH rows.
    mockJobState = {
      status: 'completed',
      progressMessage: '',
      result: { rows: [{ x: 1 }, { x: 2 }, { x: 3 }] },
      error: null,
      isRunning: false,
    };
    rerender(
      <DimensionInspector activeObject={{ type: 'dimension', name: 'x_rounded' }} projectId="p1" />
    );

    // The dashboard-style profile panel mounts (KPI tiles + distribution).
    expect(await screen.findByTestId('dimension-profile-dashboard')).toBeInTheDocument();
    expect(await screen.findByTestId('dim-kpi-distinct')).toBeInTheDocument();
    expect(mockProfileTableLocally).toHaveBeenCalled();
    // The derived column is created with the dimension expression aliased.
    const createCalls = mockConn.query.mock.calls.map(c => c[0]).join('\n');
    expect(createCalls).toContain('(ROUND(x, 2)) AS');
  });

  test('switching dimensions resets the run instead of profiling the new expression against old rows', async () => {
    mockProfileTableLocally.mockResolvedValue({
      row_count: 3,
      columns: [{ name: DERIVED, type: 'DOUBLE', null_count: 0, distinct: 3 }],
    });
    mockHistogramTableLocally.mockResolvedValue({
      buckets: [{ range: '[1, 2)', count: 2 }],
      total_count: 3,
      column_type: 'DOUBLE',
    });

    seed({
      dimensions: [
        { name: 'x_rounded', parentModel: 'local_test', config: { expression: 'ROUND(x, 2)' } },
        { name: 'y_scaled', parentModel: 'other_model', config: { expression: 'y * 10' } },
      ],
      models: [
        { name: 'local_test', config: { sql: 'SELECT * FROM t' } },
        { name: 'other_model', config: { sql: 'SELECT * FROM u' } },
      ],
    });
    const { rerender } = renderInspector();
    fireEvent.click(screen.getByTestId('dimension-inspector-run'));

    mockJobState = {
      status: 'completed',
      progressMessage: '',
      result: { rows: [{ x: 1 }, { x: 2 }, { x: 3 }] },
      error: null,
      isRunning: false,
    };
    rerender(
      <DimensionInspector activeObject={{ type: 'dimension', name: 'x_rounded' }} projectId="p1" />
    );
    expect(await screen.findByTestId('dimension-profile-dashboard')).toBeInTheDocument();

    mockProfileTableLocally.mockClear();
    mockConn.query.mockClear();

    // Switch to the sibling dimension — the SAME instance is reused (no
    // remount) and the hook still reports the PREVIOUS run's completed result.
    rerender(
      <DimensionInspector activeObject={{ type: 'dimension', name: 'y_scaled' }} projectId="p1" />
    );

    // Back to idle for the new dimension; the old model's rows were never
    // re-profiled against the new expression.
    expect(await screen.findByTestId('dimension-inspector-idle')).toBeInTheDocument();
    expect(mockProfileTableLocally).not.toHaveBeenCalled();
    expect(mockJobReset).toHaveBeenCalled();
  });

  test('a re-profile drops the previous run derived table (no DuckDB table leak)', async () => {
    // Deterministic, strictly-increasing Date.now so the derived table names of
    // consecutive runs never collide.
    let tick = 1000;
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => ++tick);
    mockProfileTableLocally.mockResolvedValue({
      row_count: 1,
      columns: [{ name: DERIVED, type: 'DOUBLE', null_count: 0, distinct: 1 }],
    });
    mockHistogramTableLocally.mockResolvedValue({
      buckets: [],
      total_count: 1,
      column_type: 'DOUBLE',
    });

    seed({
      dimensions: [
        { name: 'x_rounded', parentModel: 'local_test', config: { expression: 'ROUND(x, 2)' } },
      ],
      models: [{ name: 'local_test', config: { sql: 'SELECT * FROM t' } }],
    });
    const { rerender } = renderInspector();
    fireEvent.click(screen.getByTestId('dimension-inspector-run'));

    mockJobState = {
      status: 'completed',
      progressMessage: '',
      result: { rows: [{ x: 1 }] },
      error: null,
      isRunning: false,
    };
    rerender(
      <DimensionInspector activeObject={{ type: 'dimension', name: 'x_rounded' }} projectId="p1" />
    );
    expect(await screen.findByTestId('dimension-profile-dashboard')).toBeInTheDocument();

    const firstDerived = mockConn.query.mock.calls
      .map(c => (c[0].match(/CREATE TABLE "(dim_derived_\d+)"/) || [])[1])
      .find(Boolean);
    expect(firstDerived).toBeTruthy();

    // Drive a SECOND completed run (a new result identity re-triggers the
    // profiling effect on the same dimension).
    mockConn.query.mockClear();
    mockJobState = { ...mockJobState, result: { rows: [{ x: 4 }] } };
    rerender(
      <DimensionInspector activeObject={{ type: 'dimension', name: 'x_rounded' }} projectId="p1" />
    );

    // The first run's derived table is dropped before the new one is created.
    await waitFor(() =>
      expect(mockConn.query.mock.calls.map(c => c[0])).toContain(
        `DROP TABLE IF EXISTS "${firstDerived}"`
      )
    );
    nowSpy.mockRestore();
  });

  test('renders a no-parent callout for a model-less dimension', () => {
    seed({
      dimensions: [{ name: 'orphan', config: { expression: 'x' } }],
      models: [],
    });
    renderInspector('orphan');
    expect(screen.getByTestId('dimension-inspector-no-parent')).toBeInTheDocument();
  });
});
