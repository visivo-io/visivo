/* eslint-disable no-template-curly-in-string -- literal ${ref(...)} strings under test */
/**
 * ModelPreview tests (VIS-801 / N-6).
 *
 * The Track-N model preview shows a READ-ONLY SQL editor + a result table that
 * renders only AFTER Run. Run executes the model's SQL against its source via
 * the EXISTING useModelQueryJob hook. Monaco and the query hook are mocked.
 */
import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ModelPreview from './ModelPreview';
import useStore from '../../../stores/store';

const mockEditorSpy = jest.fn();
jest.mock('@monaco-editor/react', () => ({
  __esModule: true,
  default: props => {
    mockEditorSpy(props);
    return <div data-testid="monaco-mock" data-readonly={String(!!props.options?.readOnly)} />;
  },
}));

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
    mockEditorSpy.mockClear();
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

  test('renders a read-only SQL editor with the model SQL', () => {
    seed([{ name: 'orders', config: { sql: 'SELECT 1', source: '${ref(db)}' } }], [{ name: 'db' }]);
    render(<ModelPreview activeObject={{ type: 'model', name: 'orders' }} />);
    expect(screen.getByTestId('model-preview')).toBeInTheDocument();
    expect(screen.getByTestId('monaco-mock')).toHaveAttribute('data-readonly', 'true');
    expect(mockEditorSpy.mock.calls[0][0].value).toBe('SELECT 1');
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
});
