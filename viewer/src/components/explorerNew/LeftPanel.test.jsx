import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import LeftPanel from './LeftPanel';
import useStore from '../../stores/store';
import {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
} from '../../api/sourceSchemaJobs';

jest.mock('../../api/sourceSchemaJobs');

const MockIcon = (props) => <span data-testid="mock-icon" {...props} />;

jest.mock('../new-views/common/objectTypeConfigs', () => ({
  getTypeIcon: () => MockIcon,
  getTypeColors: (type) => ({
    bg: `bg-${type}-100`,
    text: `text-${type}-800`,
    border: `border-${type}-200`,
    bgHover: `hover:bg-${type}-50`,
  }),
  getTypeByValue: () => ({ icon: MockIcon, colors: { text: 'text-gray-500' } }),
}));

jest.mock('./SchemaBrowser/SchemaTreeNode', () => {
  return function MockSchemaTreeNode({ label, type, onClick, onDoubleClick, children, isExpanded }) {
    return (
      <div data-testid={`tree-node-${type}-${label}`}>
        <button data-testid={`click-${type}-${label}`} onClick={onClick}>
          {label}
        </button>
        {onDoubleClick && (
          <button data-testid={`dblclick-${type}-${label}`} onDoubleClick={onDoubleClick}>
            dbl-{label}
          </button>
        )}
        {isExpanded && children}
      </div>
    );
  };
});

const mockSources = [
  { source_name: 'postgres_db', source_type: 'postgresql', has_cached_schema: true, total_tables: 5 },
  { source_name: 'snowflake_wh', source_type: 'snowflake', has_cached_schema: false, total_tables: null },
];

const mockTables = [
  { name: 'users', column_count: 8 },
  { name: 'orders', column_count: 5 },
];

const mockColumns = [
  { name: 'id', type: 'INTEGER' },
  { name: 'email', type: 'VARCHAR' },
];

const mockModels = [
  { name: 'user_model', status: 'published', config: { sql: 'SELECT * FROM users', source: 'ref(postgres_db)' } },
  { name: 'order_model', status: 'new', config: { sql: 'SELECT * FROM orders', source: 'snowflake_wh' } },
];

const mockMetrics = [
  { name: 'total_revenue', status: 'published', parentModel: 'orders_model', config: { aggregation: 'sum' } },
];

const mockDimensions = [
  { name: 'user_region', status: 'published', parentModel: 'users_model', config: { expression: 'region' } },
];

describe('LeftPanel', () => {
  const mockFetchModels = jest.fn();
  const mockFetchMetrics = jest.fn();
  const mockFetchDimensions = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    fetchSourceSchemaJobs.mockResolvedValue(mockSources);
    fetchSourceTables.mockResolvedValue(mockTables);
    fetchTableColumns.mockResolvedValue(mockColumns);
    generateSourceSchema.mockResolvedValue({ run_instance_id: 'job-123' });
    fetchSchemaGenerationStatus.mockResolvedValue({ status: 'completed', progress: 1.0 });

    useStore.setState({
      explorerLeftNavCollapsed: false,
      explorerSourceName: null,
      explorerSql: '',
      explorerIsEditorCollapsed: false,
      explorerActiveModelName: null,
      explorerModelEditMode: null,
      explorerEditStack: [],
      models: mockModels,
      modelsLoading: false,
      fetchModels: mockFetchModels,
      dimensions: mockDimensions,
      dimensionsLoading: false,
      fetchDimensions: mockFetchDimensions,
      metrics: mockMetrics,
      metricsLoading: false,
      fetchMetrics: mockFetchMetrics,
    });
  });

  it('renders search, type filter, and sections', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('source-selector')).toBeInTheDocument();
    });

    expect(screen.getByTestId('left-panel-search')).toBeInTheDocument();
    expect(screen.getByTestId('type-filter')).toBeInTheDocument();
  });

  it('loads sources on mount and auto-selects first', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('source-selector')).toHaveValue('postgres_db');
    });

    expect(useStore.getState().explorerSourceName).toBe('postgres_db');
  });

  it('fetches models, metrics, and dimensions on mount', async () => {
    render(<LeftPanel />);

    expect(mockFetchModels).toHaveBeenCalledTimes(1);
    expect(mockFetchMetrics).toHaveBeenCalledTimes(1);
    expect(mockFetchDimensions).toHaveBeenCalledTimes(1);
  });

  it('shows loading state', async () => {
    let resolvePromise;
    fetchSourceSchemaJobs.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );

    render(<LeftPanel />);

    expect(screen.getByTestId('left-panel-loading')).toBeInTheDocument();

    await act(async () => {
      resolvePromise(mockSources);
    });
  });

  it('renders sources section with source items', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('section-sources')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tree-node-source-postgres_db')).toBeInTheDocument();
    expect(screen.getByTestId('tree-node-source-snowflake_wh')).toBeInTheDocument();
  });

  it('renders models section', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('section-models')).toBeInTheDocument();
    });

    expect(screen.getByText('user_model')).toBeInTheDocument();
    expect(screen.getByText('order_model')).toBeInTheDocument();
  });

  it('renders metrics section', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('section-metrics')).toBeInTheDocument();
    });

    expect(screen.getByText('total_revenue')).toBeInTheDocument();
  });

  it('renders dimensions section', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('section-dimensions')).toBeInTheDocument();
    });

    expect(screen.getByText('user_region')).toBeInTheDocument();
  });

  it('clicking source expands tree and loads tables', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('click-source-postgres_db')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('click-source-postgres_db'));

    await waitFor(() => {
      expect(fetchSourceTables).toHaveBeenCalledWith('postgres_db');
    });
  });

  it('clicking model calls handleExplorerModelUse', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('model-use-user_model')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('model-use-user_model'));

    const state = useStore.getState();
    expect(state.explorerSql).toBe('SELECT * FROM users');
    expect(state.explorerSourceName).toBe('postgres_db');
    expect(state.explorerActiveModelName).toBe('user_model');
  });

  it('clicking model edit button calls handleExplorerModelEdit', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('model-edit-user_model')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('model-edit-user_model'));

    const state = useStore.getState();
    expect(state.explorerEditStack).toHaveLength(1);
    expect(state.explorerEditStack[0].type).toBe('model');
  });

  it('search filters all sections', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('section-sources')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('left-panel-search'), { target: { value: 'user' } });

    // user_model and user_region should be visible; postgres_db, snowflake_wh, order_model, total_revenue should be hidden
    expect(screen.getByText('user_model')).toBeInTheDocument();
    expect(screen.getByText('user_region')).toBeInTheDocument();
    expect(screen.queryByText('order_model')).not.toBeInTheDocument();
    expect(screen.queryByText('total_revenue')).not.toBeInTheDocument();
  });

  it('clear search button works', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('left-panel-search')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('left-panel-search'), { target: { value: 'user' } });
    expect(screen.getByTestId('clear-search')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('clear-search'));
    expect(screen.getByTestId('left-panel-search')).toHaveValue('');
  });

  it('type filter toggles section visibility', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('section-sources')).toBeInTheDocument();
    });

    // Click 'Models' filter to show only models
    fireEvent.click(screen.getByTestId('type-filter-model'));

    // Models should still be visible
    expect(screen.getByTestId('section-models')).toBeInTheDocument();
    // Sources should be hidden (only 'model' is in visibleTypes)
    expect(screen.queryByTestId('section-sources')).not.toBeInTheDocument();
  });

  it('collapses to icon rail', async () => {
    useStore.setState({ explorerLeftNavCollapsed: true });

    render(<LeftPanel />);

    expect(screen.getByTestId('expand-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('source-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('left-panel-search')).not.toBeInTheDocument();
  });

  it('collapse toggle calls store action', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('collapse-sidebar')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('collapse-sidebar'));

    expect(useStore.getState().explorerLeftNavCollapsed).toBe(true);
  });

  it('section headers toggle expand/collapse', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('section-models')).toBeInTheDocument();
    });

    // Models section is expanded, items visible
    expect(screen.getByText('user_model')).toBeInTheDocument();

    // Collapse models section
    fireEvent.click(screen.getByTestId('section-header-model'));
    expect(screen.queryByText('user_model')).not.toBeInTheDocument();

    // Re-expand
    fireEvent.click(screen.getByTestId('section-header-model'));
    expect(screen.getByText('user_model')).toBeInTheDocument();
  });

  it('shows empty state when no objects and no search', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([]);
    useStore.setState({ models: [], metrics: [], dimensions: [] });

    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('left-panel-empty')).toBeInTheDocument();
    });

    expect(screen.getByText('No project objects defined')).toBeInTheDocument();
  });

  it('shows search-specific empty state', async () => {
    fetchSourceSchemaJobs.mockResolvedValue([]);
    useStore.setState({ models: [], metrics: [], dimensions: [] });

    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('left-panel-empty')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId('left-panel-search'), { target: { value: 'nonexistent' } });

    expect(screen.getByText('No results for "nonexistent"')).toBeInTheDocument();
  });

  it('source selector changes source in store', async () => {
    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('source-selector')).toHaveValue('postgres_db');
    });

    fireEvent.change(screen.getByTestId('source-selector'), { target: { value: 'snowflake_wh' } });

    expect(useStore.getState().explorerSourceName).toBe('snowflake_wh');
  });

  it('highlights active model', async () => {
    useStore.setState({ explorerActiveModelName: 'user_model' });

    render(<LeftPanel />);

    await waitFor(() => {
      expect(screen.getByTestId('model-item-user_model')).toBeInTheDocument();
    });

    expect(screen.getByTestId('model-item-user_model').className).toContain('bg-primary-50');
  });
});
