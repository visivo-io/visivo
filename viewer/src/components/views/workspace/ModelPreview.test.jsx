/* eslint-disable no-template-curly-in-string -- literal ${ref(...)} strings under test */
/**
 * ModelPreview tests (VIS-801 / N-6; de-duplicated at 6c-T2 / shell-ia #9).
 *
 * The Track-N model preview shows a result table that renders only AFTER
 * Run. Run executes the model's SQL against its source via the EXISTING
 * useModelQueryJob hook. It used to ALSO render a second, read-only Monaco
 * copy of the SQL the right rail's ModelEditForm already edits — 6c-T2
 * removed that duplicate editor in favor of a hint pointing at the one real
 * editing surface (the rail). The query hook is mocked; Monaco is no longer
 * imported by this component at all.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ModelPreview from './ModelPreview';
import useStore from '../../../stores/store';

const mockExecuteQuery = jest.fn(() => Promise.resolve('job-1'));
let mockJobState;
jest.mock('../../../hooks/useModelQueryJob', () => ({
  useModelQueryJob: () => mockJobState,
}));

const seed = (models = [], sources = [], defaults = null, fields = {}) => {
  act(() => {
    useStore.setState({
      models,
      sources,
      defaults,
      dimensions: fields.dimensions || [],
      metrics: fields.metrics || [],
      fetchModels: jest.fn(),
      fetchSources: jest.fn(),
      fetchDefaults: jest.fn(),
      fetchDimensions: jest.fn(),
      fetchMetrics: jest.fn(),
    });
  });
};

describe('ModelPreview (VIS-801)', () => {
  beforeEach(() => {
    mockExecuteQuery.mockClear();
    mockJobState = {
      status: null,
      progress: 0,
      progressMessage: '',
      result: null,
      error: null,
      isRunning: false,
      executeQuery: mockExecuteQuery,
    };
  });

  // 6c-T2 / shell-ia #9: the pane used to render a SECOND, read-only copy of
  // the model's SQL (Monaco) — the exact text the right rail's
  // `ModelEditForm` already edits. That editor is gone; a hint now points at
  // the rail instead of re-showing the text a second time.
  test('does NOT render a duplicate SQL editor — points at the right rail instead', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('monaco-mock')).not.toBeInTheDocument();
    expect(screen.queryByText('SELECT 1')).not.toBeInTheDocument();
    expect(screen.getByTestId('model-preview-edit-hint')).toHaveTextContent(
      /edit this model's sql in the right rail/i
    );
  });

  test('the preview pane can shrink (min-w-0) so it does not overflow on rail resize', () => {
    // Root cause of the "black panes" (the OLD Monaco duplicate): the flex
    // item kept its content width and the dark editor overflowed the
    // narrowing pane. min-w-0 lets the pane itself shrink regardless of what
    // it renders — still asserted so a future wide child regresses the same
    // way.
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-preview').className).toContain('min-w-0');
  });

  test('does not render results until Run is clicked', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-preview-results')).toHaveTextContent(/Run the query/i);
  });

  test('Run executes the model SQL against its resolved source', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(mockExecuteQuery).toHaveBeenCalledWith('db', 'SELECT 1');
  });

  test('renders a result table after a completed Run', () => {
    mockJobState.status = 'completed';
    mockJobState.result = { columns: ['x', 'y'], rows: [{ x: 1, y: 2 }] };
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    const results = screen.getByTestId('model-preview-results');
    expect(results).toHaveTextContent('x');
    expect(results).toHaveTextContent('y');
    expect(results).toHaveTextContent('1');
    expect(results).toHaveTextContent('2');
  });

  test('falls back to the first available source when the model has none and no project default', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1' } }], [{ name: 'fallback_db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(mockExecuteQuery).toHaveBeenCalledWith('fallback_db', 'SELECT 1');
  });

  test('a source-less model uses the PROJECT DEFAULT source, not just the first source', () => {
    // Regression for the clickhouse-fallback bug: with multiple sources and a
    // project default, the default must win over sources[0]. sources[0] here is
    // an unusable dialect, exactly mirroring the integration project.
    seed(
      [{ name: 'orders', config: { sql: 'SELECT 1' } }],
      [{ name: 'local-clickhouse' }, { name: 'local-duckdb' }],
      { source_name: 'local-duckdb' }
    );
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-preview')).toHaveTextContent('local-duckdb');
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(mockExecuteQuery).toHaveBeenCalledWith('local-duckdb', 'SELECT 1');
  });

  test('an explicit model source still overrides the project default', () => {
    seed(
      [{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(explicit_db)}' } }],
      [{ name: 'local-clickhouse' }, { name: 'explicit_db' }],
      { source_name: 'local-duckdb' }
    );
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(mockExecuteQuery).toHaveBeenCalledWith('explicit_db', 'SELECT 1');
  });

  test('renders an empty state when the model is not found', () => {
    seed([], []);
    render(<ModelPreview activeObject={{ type: 'model', name: 'missing' }} />);
    expect(screen.getByTestId('model-preview-empty')).toHaveTextContent(/not found/i);
  });

  test('renders the Semantic Fields strip with the model dimension + metric pills (VIS-1009)', () => {
    seed(
      [{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }],
      [{ name: 'db' }],
      null,
      {
        dimensions: [{ name: 'region', parentModel: 'orders', config: { expression: 'region' } }],
        metrics: [{ name: 'revenue', parentModel: 'orders', config: { expression: 'SUM(r)' } }],
      }
    );
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-semantic-fields')).toBeInTheDocument();
    expect(screen.getByTestId('model-field-pill-dimension-region')).toBeInTheDocument();
    expect(screen.getByTestId('model-field-pill-metric-revenue')).toBeInTheDocument();
  });

  test('omits the Semantic Fields strip for a model that owns no fields', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.queryByTestId('model-semantic-fields')).not.toBeInTheDocument();
  });

  // Every real fetch action writes a FRESH array even when the backend
  // returns nothing, so a fetch guard keyed on `length === 0` with the effect
  // keyed on array identity refires forever (fetch → new [] → effect → fetch
  // …). These mocks mimic that store behaviour, capped so a regression fails
  // on a call-count assertion instead of hanging the runner.
  const emptyRefetcher = key => {
    const fn = jest.fn(() => {
      if (fn.mock.calls.length <= 20) useStore.setState({ [key]: [] });
    });
    return fn;
  };

  test('fetches each collection at most once when it legitimately resolves EMPTY (unbounded-loop regression)', () => {
    const fetchModels = emptyRefetcher('models');
    const fetchCsvScriptModels = emptyRefetcher('csvScriptModels');
    const fetchLocalMergeModels = emptyRefetcher('localMergeModels');
    const fetchSources = emptyRefetcher('sources');
    act(() => {
      useStore.setState({
        models: [],
        csvScriptModels: [],
        localMergeModels: [],
        sources: [],
        defaults: { source_name: 'db' },
        dimensions: [],
        metrics: [],
        fetchModels,
        fetchCsvScriptModels,
        fetchLocalMergeModels,
        fetchSources,
        fetchDefaults: jest.fn(),
        fetchDimensions: jest.fn(),
        fetchMetrics: jest.fn(),
      });
    });
    render(<ModelPreview activeObject={{ type: 'model', name: 'missing' }} />);
    expect(fetchModels).toHaveBeenCalledTimes(1);
    expect(fetchCsvScriptModels).toHaveBeenCalledTimes(1);
    expect(fetchLocalMergeModels).toHaveBeenCalledTimes(1);
    expect(fetchSources).toHaveBeenCalledTimes(1);
  });

  test('SemanticFieldsStrip fetches dimensions/metrics at most once when they resolve EMPTY (unbounded-loop regression)', () => {
    const fetchDimensions = emptyRefetcher('dimensions');
    const fetchMetrics = emptyRefetcher('metrics');
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    act(() => {
      useStore.setState({
        csvScriptModels: [],
        localMergeModels: [],
        fetchCsvScriptModels: jest.fn(),
        fetchLocalMergeModels: jest.fn(),
        fetchDimensions,
        fetchMetrics,
      });
    });
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(fetchDimensions).toHaveBeenCalledTimes(1);
    expect(fetchMetrics).toHaveBeenCalledTimes(1);
  });
});
