/**
 * DimensionInspector tests (VIS-1009).
 *
 * The Field Lens body for a dimension: it shows the dimension expression, runs
 * its parent model's SQL (via useModelQueryJob), loads the rows into DuckDB and
 * profiles the dimension as a DERIVED column using the EXACT Explorer profiling
 * stack (mockProfileTableLocally / mockHistogramTableLocally → ProfileStats + Histogram).
 *
 * We mock the data layer: the model-query job hook (so we can drive it to a
 * completed state with rows), the DuckDB context + connection, and the two
 * profiling helpers. ProfileStats / Histogram render for real so a real profile
 * panel mounts.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import DimensionInspector from './DimensionInspector';
import useStore from '../../../../stores/store';

// --- Mock the model-query job hook (driven per-test) ---------------------
// `mock`-prefixed so the jest.mock factory may reference them (jest exempts
// `mock*` identifiers from the out-of-scope guard).
let mockJobState;
const mockExecuteQuery = jest.fn(() => Promise.resolve('job-1'));
jest.mock('../../../../hooks/useModelQueryJob', () => ({
  __esModule: true,
  useModelQueryJob: () => ({ ...mockJobState, executeQuery: mockExecuteQuery }),
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

    // The real ProfileStats panel renders (Distinct stat from the mocked profile).
    expect(await screen.findByText('Distinct')).toBeInTheDocument();
    expect(mockProfileTableLocally).toHaveBeenCalled();
    // The derived column is created with the dimension expression aliased.
    const createCalls = mockConn.query.mock.calls.map(c => c[0]).join('\n');
    expect(createCalls).toContain('(ROUND(x, 2)) AS');
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
