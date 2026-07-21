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

  test('SemanticFieldsStrip tolerates dimensions/metrics being non-arrays (not just an empty array)', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    act(() => {
      useStore.setState({ dimensions: undefined, metrics: undefined });
    });
    expect(() =>
      render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />)
    ).not.toThrow();
    expect(screen.queryByTestId('model-semantic-fields')).not.toBeInTheDocument();
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

  test('renders the running state with progress while the query executes', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    const { rerender } = render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    // First click while idle — sets the internal `hasRun` flag (the button
    // isn't disabled yet, so the click actually lands).
    fireEvent.click(screen.getByTestId('model-preview-run'));

    // The query is now in flight — flip the job hook's state and re-render,
    // exactly as the real hook would after `executeQuery` starts polling.
    mockJobState.isRunning = true;
    mockJobState.progress = 0.42;
    mockJobState.progressMessage = 'Crunching rows…';
    rerender(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);

    const results = screen.getByTestId('model-preview-results');
    expect(results).toHaveTextContent('Crunching rows…');
    // The Run button itself swaps to a spinner and disables while running.
    expect(screen.getByTestId('model-preview-run')).toBeDisabled();
  });

  test('renders the error state from a failed query run, never the results table', () => {
    mockJobState.status = 'error';
    mockJobState.error = 'syntax error at or near "SELCT"';
    seed([{ name: 'orders', config: { sql: 'SELCT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(screen.getByTestId('model-preview-error')).toHaveTextContent(
      'syntax error at or near "SELCT"'
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('renders a non-string, non-Error error (no .message) via String() fallback', () => {
    mockJobState.status = 'error';
    mockJobState.error = { code: 'WEIRD_FAILURE' }; // plain object, no .message
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(screen.getByTestId('model-preview-error')).toHaveTextContent('[object Object]');
  });

  test('renders an Error-shaped (non-string) error via its .message', () => {
    mockJobState.status = 'error';
    mockJobState.error = new Error('boom from an Error object');
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(screen.getByTestId('model-preview-error')).toHaveTextContent(
      'boom from an Error object'
    );
  });

  test('a completed run with zero columns shows "no rows", not an empty table', () => {
    mockJobState.status = 'completed';
    mockJobState.result = { columns: [], rows: [] };
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(screen.getByTestId('model-preview-results')).toHaveTextContent(/query returned no rows/i);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  test('falls back to result.data when result.columns/rows are absent (rows source fallback)', () => {
    mockJobState.status = 'completed';
    mockJobState.result = { data: [{ a: 1, b: 2 }] };
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    const results = screen.getByTestId('model-preview-results');
    // columns are derived from Object.keys(rows[0]) since result.columns is absent.
    expect(results).toHaveTextContent('a');
    expect(results).toHaveTextContent('b');
    expect(results).toHaveTextContent('1');
    expect(results).toHaveTextContent('2');
  });

  test('a `providedRecord` prop is used directly, bypassing the models/csvScriptModels/localMergeModels lookup', () => {
    // No model named 'orders' exists in any collection — only providedRecord
    // supplies the config, proving the frame's own resolved record wins.
    seed([], [{ name: 'db' }]);
    render(
      <ModelPreview
        activeObject={{ type: 'model', name: 'orders' }}
        record={{ sql: 'SELECT 42', source: '${ref(db)}' }}
      />
    );
    expect(screen.getByTestId('model-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(mockExecuteQuery).toHaveBeenCalledWith('db', 'SELECT 42');
  });

  test('resolves a csvScriptModel record (not present in `models`) by name', () => {
    act(() => {
      useStore.setState({
        models: [],
        csvScriptModels: [{ name: 'csv_orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }],
        localMergeModels: [],
        sources: [{ name: 'db' }],
        defaults: null,
        dimensions: [],
        metrics: [],
        fetchModels: jest.fn(),
        fetchCsvScriptModels: jest.fn(),
        fetchLocalMergeModels: jest.fn(),
        fetchSources: jest.fn(),
        fetchDefaults: jest.fn(),
        fetchDimensions: jest.fn(),
        fetchMetrics: jest.fn(),
      });
    });
    render(<ModelPreview activeObject={{ type: 'model', name: 'csv_orders' }} />);
    expect(screen.getByTestId('model-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(mockExecuteQuery).toHaveBeenCalledWith('db', 'SELECT 1');
  });

  test('resolves a localMergeModel record (not present in `models` or `csvScriptModels`) by name', () => {
    act(() => {
      useStore.setState({
        models: [],
        csvScriptModels: [],
        localMergeModels: [{ name: 'merged', config: { sql: 'SELECT 2', source: '${ref(db)}' } }],
        sources: [{ name: 'db' }],
        defaults: null,
        dimensions: [],
        metrics: [],
        fetchModels: jest.fn(),
        fetchCsvScriptModels: jest.fn(),
        fetchLocalMergeModels: jest.fn(),
        fetchSources: jest.fn(),
        fetchDefaults: jest.fn(),
        fetchDimensions: jest.fn(),
        fetchMetrics: jest.fn(),
      });
    });
    render(<ModelPreview activeObject={{ type: 'model', name: 'merged' }} />);
    expect(screen.getByTestId('model-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(mockExecuteQuery).toHaveBeenCalledWith('db', 'SELECT 2');
  });

  test('SemanticFieldsStrip resolves ownership via config.model when parentModel is absent', () => {
    seed(
      [{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }],
      [{ name: 'db' }],
      null,
      {
        dimensions: [{ name: 'region', config: { model: 'orders', expression: 'region' } }], // no parentModel
        metrics: [{ name: 'revenue', config: { model: 'orders', expression: 'SUM(r)' } }], // no parentModel
      }
    );
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-field-pill-dimension-region')).toBeInTheDocument();
    expect(screen.getByTestId('model-field-pill-metric-revenue')).toBeInTheDocument();
  });

  test('with no activeObject at all, shows "No model selected." rather than a not-found message', () => {
    seed([], []);
    render(<ModelPreview activeObject={undefined} />);
    expect(screen.getByTestId('model-preview-empty')).toHaveTextContent('No model selected.');
  });

  test('a resolved record whose own `.config` is falsy falls back to the record object itself', () => {
    // No nested `.config` key at all — mirrors a bare, flat record shape.
    seed([{ name: 'orders', sql: 'SELECT 1', source: '${ref(db)}' }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('model-preview-run'));
    expect(mockExecuteQuery).toHaveBeenCalledWith('db', 'SELECT 1');
  });

  test('tolerates `sources` being a non-array (falls back to an empty list rather than throwing)', () => {
    act(() => {
      useStore.setState({
        models: [{ name: 'orders', config: { sql: 'SELECT 1' } }],
        sources: undefined,
        defaults: null,
        dimensions: [],
        metrics: [],
        fetchModels: jest.fn(),
        fetchSources: jest.fn(),
        fetchDefaults: jest.fn(),
        fetchDimensions: jest.fn(),
        fetchMetrics: jest.fn(),
      });
    });
    expect(() =>
      render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />)
    ).not.toThrow();
    expect(screen.getByTestId('model-preview')).toHaveTextContent('No source resolved');
  });

  test('tolerates `csvScriptModels`/`localMergeModels` being non-arrays when resolving a record', () => {
    act(() => {
      useStore.setState({
        // 'orders' is NOT in `models` — the lookup must fall through to
        // csvScriptModels/localMergeModels (both non-arrays here) rather
        // than short-circuiting on a `models` match.
        models: [{ name: 'something_else', config: { sql: 'SELECT 1', source: '${ref(db)}' } }],
        csvScriptModels: undefined,
        localMergeModels: undefined,
        sources: [{ name: 'db' }],
        defaults: null,
        dimensions: [],
        metrics: [],
        fetchModels: jest.fn(),
        fetchCsvScriptModels: jest.fn(),
        fetchLocalMergeModels: jest.fn(),
        fetchSources: jest.fn(),
        fetchDefaults: jest.fn(),
        fetchDimensions: jest.fn(),
        fetchMetrics: jest.fn(),
      });
    });
    expect(() =>
      render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />)
    ).not.toThrow();
    expect(screen.getByTestId('model-preview-empty')).toHaveTextContent('not found');
  });

  test('shows "No source resolved" when genuinely no source can be determined', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1' } }], []); // no explicit source, no sources at all, no default
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-preview')).toHaveTextContent('No source resolved');
  });

  test('the running state falls back to a default message/progress when progressMessage/progress are absent', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    const { rerender } = render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    mockJobState.isRunning = true;
    mockJobState.progressMessage = undefined;
    mockJobState.progress = undefined;
    rerender(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-preview-results')).toHaveTextContent('Running query…');
  });

  test('renders a null/undefined cell value as an empty string, not the literal word "null"', () => {
    mockJobState.status = 'completed';
    mockJobState.result = { columns: ['a', 'b'], rows: [{ a: null, b: undefined }] };
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    fireEvent.click(screen.getByTestId('model-preview-run'));
    const cells = screen.getAllByRole('cell');
    expect(cells.map(c => c.textContent)).toEqual(['', '']);
  });

  test('the Run button is disabled (and executeQuery never called) when the record has no SQL', () => {
    seed([{ name: 'orders', config: { source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    const runButton = screen.getByTestId('model-preview-run');
    expect(runButton).toBeDisabled();
    fireEvent.click(runButton);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });
});
