/* eslint-disable no-template-curly-in-string */
import useStore from './store';
import { expandDotNotationProps } from './explorerNewStore';

describe('explorerNewStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useStore.setState({
      explorerSourceName: null,
      explorerSql: '',
      explorerQueryResult: null,
      explorerQueryError: null,
      explorerIsEditorCollapsed: false,
      explorerProfileColumn: null,
      explorerActiveModelName: null,
      explorerModelEditMode: null,
      explorerEditStack: [],
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerChartLayout: {},
      explorerLeftNavCollapsed: false,
      explorerCenterMode: 'split',
      explorerEditorChartSplit: 0.5,
      explorerTopBottomSplit: 0.5,
      explorerSaveModalOpen: false,
      explorerComputedColumns: [],
      explorerEnrichedResult: null,
      explorerDuckDBTableName: null,
      explorerDuckDBLoading: false,
      explorerDuckDBError: null,
      explorerFailedComputedColumns: {},
      explorerSources: [],
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('setExplorerSourceName', () => {
    it('sets source name', () => {
      useStore.getState().setExplorerSourceName('postgres_db');
      expect(useStore.getState().explorerSourceName).toBe('postgres_db');
    });
  });

  describe('setExplorerSql', () => {
    it('sets SQL text', () => {
      useStore.getState().setExplorerSql('SELECT 1');
      expect(useStore.getState().explorerSql).toBe('SELECT 1');
    });
  });

  describe('setExplorerQueryResult', () => {
    it('sets query result and clears error and profile', () => {
      useStore.setState({
        explorerQueryError: 'old error',
        explorerProfileColumn: 'old_col',
      });

      const mockResult = { columns: ['id'], rows: [{ id: 1 }], row_count: 1 };
      useStore.getState().setExplorerQueryResult(mockResult);

      const state = useStore.getState();
      expect(state.explorerQueryResult).toEqual(mockResult);
      expect(state.explorerQueryError).toBeNull();
      expect(state.explorerProfileColumn).toBeNull();
    });
  });

  describe('setExplorerQueryError', () => {
    it('sets query error', () => {
      useStore.getState().setExplorerQueryError('SQL syntax error');
      expect(useStore.getState().explorerQueryError).toBe('SQL syntax error');
    });
  });

  describe('handleExplorerTableSelect', () => {
    it('sets SQL and source when SQL is empty', () => {
      useStore.getState().handleExplorerTableSelect({ sourceName: 'pg', table: 'users' });

      const state = useStore.getState();
      expect(state.explorerSql).toBe('SELECT * FROM users');
      expect(state.explorerSourceName).toBe('pg');
      expect(state.explorerIsEditorCollapsed).toBe(false);
    });

    it('appends to existing SQL', () => {
      useStore.setState({ explorerSql: 'SELECT * FROM orders' });
      useStore.getState().handleExplorerTableSelect({ sourceName: 'pg', table: 'users' });

      expect(useStore.getState().explorerSql).toBe(
        'SELECT * FROM orders\nSELECT * FROM users'
      );
    });

    it('keeps existing source if none provided', () => {
      useStore.setState({ explorerSourceName: 'existing_source' });
      useStore
        .getState()
        .handleExplorerTableSelect({ sourceName: null, table: 'users' });

      expect(useStore.getState().explorerSourceName).toBe('existing_source');
    });
  });

  describe('handleExplorerModelUse', () => {
    it('sets SQL from model config', () => {
      useStore
        .getState()
        .handleExplorerModelUse({ name: 'test', config: { sql: 'SELECT 1', source: 'pg' } });

      expect(useStore.getState().explorerSql).toBe('SELECT 1');
    });

    it('sets source name from model config (direct string)', () => {
      useStore
        .getState()
        .handleExplorerModelUse({ name: 'test', config: { sql: 'SELECT 1', source: 'pg' } });

      expect(useStore.getState().explorerSourceName).toBe('pg');
    });

    it('strips ref() wrapper from source name', () => {
      useStore.getState().handleExplorerModelUse({
        name: 'test',
        config: { sql: 'SELECT 1', source: 'ref(postgres_db)' },
      });

      expect(useStore.getState().explorerSourceName).toBe('postgres_db');
    });

    it('matches source name via suffix when exact match fails', () => {
      useStore.setState({
        explorerSources: [
          { source_name: 'local-sqlite' },
          { source_name: 'local-duckdb' },
        ],
      });

      useStore.getState().handleExplorerModelUse({
        name: 'test',
        config: { sql: 'SELECT 1', source: 'ref(duckdb)' },
      });

      expect(useStore.getState().explorerSourceName).toBe('local-duckdb');
    });

    it('matches source name via contains when suffix match fails', () => {
      useStore.setState({
        explorerSources: [
          { source_name: 'my-pg-prod' },
          { source_name: 'staging-duckdb-v2' },
        ],
      });

      useStore.getState().handleExplorerModelUse({
        name: 'test',
        config: { sql: 'SELECT 1', source: 'ref(duckdb)' },
      });

      expect(useStore.getState().explorerSourceName).toBe('staging-duckdb-v2');
    });

    it('prefers exact match over suffix match', () => {
      useStore.setState({
        explorerSources: [
          { source_name: 'duckdb' },
          { source_name: 'local-duckdb' },
        ],
      });

      useStore.getState().handleExplorerModelUse({
        name: 'test',
        config: { sql: 'SELECT 1', source: 'ref(duckdb)' },
      });

      expect(useStore.getState().explorerSourceName).toBe('duckdb');
    });

    it('keeps existing source if model has no source', () => {
      useStore.setState({ explorerSourceName: 'existing_source' });
      useStore
        .getState()
        .handleExplorerModelUse({ name: 'test', config: { sql: 'SELECT 1' } });

      expect(useStore.getState().explorerSourceName).toBe('existing_source');
    });

    it('sets explorerActiveModelName to model name', () => {
      useStore
        .getState()
        .handleExplorerModelUse({ name: 'my_model', config: { sql: 'SELECT 1' } });

      expect(useStore.getState().explorerActiveModelName).toBe('my_model');
    });

    it('sets explorerModelEditMode to "use"', () => {
      useStore
        .getState()
        .handleExplorerModelUse({ name: 'test', config: { sql: 'SELECT 1' } });

      expect(useStore.getState().explorerModelEditMode).toBe('use');
    });

    it('resets UI state (editor visible)', () => {
      useStore.setState({
        explorerIsEditorCollapsed: true,
      });

      useStore
        .getState()
        .handleExplorerModelUse({ name: 'test', config: { sql: 'SELECT 1' } });

      const state = useStore.getState();
      expect(state.explorerIsEditorCollapsed).toBe(false);
    });

    it('handles model with no config gracefully', () => {
      const before = useStore.getState().explorerSql;
      useStore.getState().handleExplorerModelUse({ name: 'test' });

      expect(useStore.getState().explorerSql).toBe(before);
    });

    it('uses query field if sql field is missing', () => {
      useStore
        .getState()
        .handleExplorerModelUse({ name: 'test', config: { query: 'SELECT 2' } });

      expect(useStore.getState().explorerSql).toBe('SELECT 2');
    });
  });

  describe('handleExplorerModelUse auto-adds computed columns', () => {
    it('auto-adds metrics belonging to the model as computed columns', () => {
      useStore.setState({
        metrics: [
          { name: 'revenue', parentModel: 'orders', config: { expression: 'SUM(amount)', model: 'ref(orders)' } },
          { name: 'other_metric', parentModel: 'users', config: { expression: 'COUNT(*)', model: 'ref(users)' } },
        ],
        dimensions: [],
      });

      useStore.getState().handleExplorerModelUse({
        name: 'orders',
        config: { sql: 'SELECT * FROM orders', source: 'ref(my_source)' },
      });

      const computed = useStore.getState().explorerComputedColumns;
      expect(computed).toHaveLength(1);
      expect(computed[0].name).toBe('revenue');
      expect(computed[0].type).toBe('metric');
    });

    it('auto-adds dimensions belonging to the model as computed columns', () => {
      useStore.setState({
        metrics: [],
        dimensions: [
          { name: 'order_month', config: { expression: "DATE_TRUNC('month', date)", model: 'ref(orders)' } },
        ],
      });

      useStore.getState().handleExplorerModelUse({
        name: 'orders',
        config: { sql: 'SELECT 1', source: 'ref(src)' },
      });

      const computed = useStore.getState().explorerComputedColumns;
      expect(computed).toHaveLength(1);
      expect(computed[0].name).toBe('order_month');
      expect(computed[0].type).toBe('dimension');
    });

    it('clears editStack when model is used', () => {
      useStore.setState({
        explorerEditStack: [{ type: 'model', object: {} }],
        metrics: [],
        dimensions: [],
      });

      useStore.getState().handleExplorerModelUse({
        name: 'test',
        config: { sql: 'SELECT 1' },
      });

      expect(useStore.getState().explorerEditStack).toEqual([]);
    });
  });

  describe('explorerSources', () => {
    it('sets explorer sources', () => {
      const sources = [{ source_name: 'pg' }, { source_name: 'mysql' }];
      useStore.getState().setExplorerSources(sources);
      expect(useStore.getState().explorerSources).toEqual(sources);
    });
  });

  describe('UI controls', () => {
    it('toggles editor collapsed', () => {
      expect(useStore.getState().explorerIsEditorCollapsed).toBe(false);
      useStore.getState().toggleExplorerEditorCollapsed();
      expect(useStore.getState().explorerIsEditorCollapsed).toBe(true);
      useStore.getState().toggleExplorerEditorCollapsed();
      expect(useStore.getState().explorerIsEditorCollapsed).toBe(false);
    });

    it('sets profile column', () => {
      useStore.getState().setExplorerProfileColumn('email');
      expect(useStore.getState().explorerProfileColumn).toBe('email');
    });

    it('toggles left nav collapsed', () => {
      expect(useStore.getState().explorerLeftNavCollapsed).toBe(false);
      useStore.getState().toggleExplorerLeftNavCollapsed();
      expect(useStore.getState().explorerLeftNavCollapsed).toBe(true);
      useStore.getState().toggleExplorerLeftNavCollapsed();
      expect(useStore.getState().explorerLeftNavCollapsed).toBe(false);
    });

    it('sets center mode', () => {
      useStore.getState().setExplorerCenterMode('chart');
      expect(useStore.getState().explorerCenterMode).toBe('chart');
    });
  });

  describe('insight config', () => {
    it('sets insight config', () => {
      const config = { name: 'test', props: { type: 'line' } };
      useStore.getState().setExplorerInsightConfig(config);

      expect(useStore.getState().explorerInsightConfig).toEqual(config);
    });

    it('insight config is always initialized (never null)', () => {
      const config = useStore.getState().explorerInsightConfig;
      expect(config).toBeDefined();
      expect(config.props.type).toBe('scatter');
    });
  });

  describe('chart layout', () => {
    it('syncs plotly edits to chart layout', () => {
      useStore.getState().syncPlotlyEditsToChartLayout({
        'title.text': 'My Chart',
      });

      expect(useStore.getState().explorerChartLayout).toEqual({
        'title.text': 'My Chart',
      });
    });

    it('merges layout updates', () => {
      useStore.setState({
        explorerChartLayout: { 'title.text': 'Old' },
      });

      useStore.getState().syncPlotlyEditsToChartLayout({
        'xaxis.title.text': 'X Axis',
      });

      expect(useStore.getState().explorerChartLayout).toEqual({
        'title.text': 'Old',
        'xaxis.title.text': 'X Axis',
      });
    });
  });

  describe('setExplorerInsightProp', () => {
    it('sets a single prop without affecting others', () => {
      useStore.setState({
        explorerInsightConfig: { name: 'test', props: { type: 'scatter', x: 'col_a' } },
      });

      useStore.getState().setExplorerInsightProp('y', 'col_b');

      const props = useStore.getState().explorerInsightConfig.props;
      expect(props.x).toBe('col_a');
      expect(props.y).toBe('col_b');
      expect(props.type).toBe('scatter');
    });

    it('overwrites an existing prop value', () => {
      useStore.setState({
        explorerInsightConfig: { name: 'test', props: { type: 'scatter', x: 'old_col' } },
      });

      useStore.getState().setExplorerInsightProp('x', 'new_col');

      expect(useStore.getState().explorerInsightConfig.props.x).toBe('new_col');
    });
  });

  describe('removeExplorerInsightProp', () => {
    it('removes a prop while keeping others', () => {
      useStore.setState({
        explorerInsightConfig: { name: 'test', props: { type: 'scatter', x: 'col_a', y: 'col_b' } },
      });

      useStore.getState().removeExplorerInsightProp('y');

      const props = useStore.getState().explorerInsightConfig.props;
      expect(props.x).toBe('col_a');
      expect(props.y).toBeUndefined();
      expect(props.type).toBe('scatter');
    });
  });

  describe('expandDotNotationProps', () => {
    it('passes through flat keys unchanged', () => {
      const result = expandDotNotationProps({ type: 'scatter', x: '?{${ref(m).col}}', y: '?{val}' });
      expect(result).toEqual({ type: 'scatter', x: '?{${ref(m).col}}', y: '?{val}' });
    });

    it('expands dot-notation keys to nested objects', () => {
      const result = expandDotNotationProps({ type: 'scatter', 'marker.color': '?{${ref(m).col}}' });
      expect(result).toEqual({ type: 'scatter', marker: { color: '?{${ref(m).col}}' } });
    });

    it('handles multiple dot levels', () => {
      const result = expandDotNotationProps({ 'marker.line.width': 2 });
      expect(result).toEqual({ marker: { line: { width: 2 } } });
    });
  });

  describe('edit stack', () => {
    it('push/pop/clear work correctly', () => {
      useStore.getState().pushExplorerEdit('insight', { name: 'test' }, { isCreate: true });
      expect(useStore.getState().explorerEditStack).toHaveLength(1);

      useStore.getState().pushExplorerEdit('model', { name: 'model1' });
      expect(useStore.getState().explorerEditStack).toHaveLength(2);

      useStore.getState().popExplorerEdit();
      expect(useStore.getState().explorerEditStack).toHaveLength(1);

      useStore.getState().clearExplorerEditStack();
      expect(useStore.getState().explorerEditStack).toHaveLength(0);
    });
  });

  describe('computed columns', () => {
    it('adds a computed column', () => {
      useStore.getState().addExplorerComputedColumn({
        name: 'total_revenue',
        expression: 'SUM(amount)',
        type: 'metric',
      });

      expect(useStore.getState().explorerComputedColumns).toHaveLength(1);
      expect(useStore.getState().explorerComputedColumns[0].name).toBe('total_revenue');
    });

    it('prevents duplicate computed columns', () => {
      useStore.getState().addExplorerComputedColumn({
        name: 'total_revenue',
        expression: 'SUM(amount)',
        type: 'metric',
      });
      useStore.getState().addExplorerComputedColumn({
        name: 'total_revenue',
        expression: 'SUM(amount)',
        type: 'metric',
      });

      expect(useStore.getState().explorerComputedColumns).toHaveLength(1);
    });

    it('removes a computed column', () => {
      useStore.getState().addExplorerComputedColumn({
        name: 'total_revenue',
        expression: 'SUM(amount)',
        type: 'metric',
      });
      useStore.getState().addExplorerComputedColumn({
        name: 'order_month',
        expression: "DATE_TRUNC('month', order_date)",
        type: 'dimension',
      });

      useStore.getState().removeExplorerComputedColumn('total_revenue');

      expect(useStore.getState().explorerComputedColumns).toHaveLength(1);
      expect(useStore.getState().explorerComputedColumns[0].name).toBe('order_month');
    });

    it('removing a computed column clears enriched result', () => {
      useStore.setState({
        explorerComputedColumns: [{ name: 'col', expression: 'SUM(x)', type: 'metric' }],
        explorerEnrichedResult: { columns: ['x', 'col'], rows: [{ x: 1, col: 10 }] },
      });

      useStore.getState().removeExplorerComputedColumn('col');

      expect(useStore.getState().explorerEnrichedResult).toBeNull();
    });

    it('clears all computed columns', () => {
      useStore.setState({
        explorerComputedColumns: [
          { name: 'a', expression: 'SUM(x)', type: 'metric' },
          { name: 'b', expression: 'y', type: 'dimension' },
        ],
        explorerEnrichedResult: { columns: ['x'], rows: [] },
      });

      useStore.getState().clearExplorerComputedColumns();

      expect(useStore.getState().explorerComputedColumns).toHaveLength(0);
      expect(useStore.getState().explorerEnrichedResult).toBeNull();
    });

    it('sets enriched result', () => {
      const enriched = { columns: ['x', 'sum_x'], rows: [{ x: 1, sum_x: 10 }] };
      useStore.getState().setExplorerEnrichedResult(enriched);

      expect(useStore.getState().explorerEnrichedResult).toEqual(enriched);
    });

    it('setExplorerQueryResult clears DuckDB state', () => {
      useStore.setState({
        explorerEnrichedResult: { columns: ['x'], rows: [] },
        explorerDuckDBTableName: 'explorer_1',
        explorerDuckDBError: 'old error',
      });

      useStore.getState().setExplorerQueryResult({
        columns: ['id'],
        rows: [{ id: 1 }],
        row_count: 1,
      });

      const state = useStore.getState();
      expect(state.explorerEnrichedResult).toBeNull();
      expect(state.explorerDuckDBTableName).toBeNull();
      expect(state.explorerDuckDBError).toBeNull();
    });

    it('sets DuckDB loading state', () => {
      useStore.getState().setExplorerDuckDBLoading(true);
      expect(useStore.getState().explorerDuckDBLoading).toBe(true);

      useStore.getState().setExplorerDuckDBLoading(false);
      expect(useStore.getState().explorerDuckDBLoading).toBe(false);
    });

    it('sets DuckDB error state', () => {
      useStore.getState().setExplorerDuckDBError('DuckDB error');
      expect(useStore.getState().explorerDuckDBError).toBe('DuckDB error');
    });

    it('sets DuckDB table name', () => {
      useStore.getState().setExplorerDuckDBTableName('explorer_5');
      expect(useStore.getState().explorerDuckDBTableName).toBe('explorer_5');
    });

    it('updates a computed column expression', () => {
      useStore.setState({
        explorerComputedColumns: [
          { name: 'total', expression: 'SUM(x)', type: 'metric' },
          { name: 'month', expression: 'DATE_TRUNC(order_date)', type: 'dimension' },
        ],
        explorerEnrichedResult: { columns: ['x'], rows: [] },
      });

      useStore.getState().updateExplorerComputedColumn('total', {
        expression: 'SUM(amount)',
        type: 'metric',
      });

      const cols = useStore.getState().explorerComputedColumns;
      expect(cols).toHaveLength(2);
      expect(cols[0].expression).toBe('SUM(amount)');
      expect(cols[1].expression).toBe('DATE_TRUNC(order_date)');
    });

    it('updating a computed column clears enriched result', () => {
      useStore.setState({
        explorerComputedColumns: [{ name: 'col', expression: 'SUM(x)', type: 'metric' }],
        explorerEnrichedResult: { columns: ['x', 'col'], rows: [{ x: 1, col: 10 }] },
      });

      useStore.getState().updateExplorerComputedColumn('col', { expression: 'AVG(x)' });

      expect(useStore.getState().explorerEnrichedResult).toBeNull();
    });

    it('sets and clears failed computed columns', () => {
      useStore.getState().setExplorerFailedComputedColumns({
        formatted_date: 'Type mismatch',
      });

      expect(useStore.getState().explorerFailedComputedColumns).toEqual({
        formatted_date: 'Type mismatch',
      });

      useStore.getState().setExplorerFailedComputedColumns({});
      expect(useStore.getState().explorerFailedComputedColumns).toEqual({});
    });

    it('removing a computed column clears failed computed columns', () => {
      useStore.setState({
        explorerComputedColumns: [{ name: 'col', expression: 'SUM(x)', type: 'metric' }],
        explorerFailedComputedColumns: { col: 'Error' },
      });

      useStore.getState().removeExplorerComputedColumn('col');

      expect(useStore.getState().explorerFailedComputedColumns).toEqual({});
    });

    it('clearing all computed columns clears failed computed columns', () => {
      useStore.setState({
        explorerComputedColumns: [{ name: 'a', expression: 'x', type: 'dimension' }],
        explorerFailedComputedColumns: { a: 'Error' },
      });

      useStore.getState().clearExplorerComputedColumns();

      expect(useStore.getState().explorerFailedComputedColumns).toEqual({});
    });
  });

  describe('save modal', () => {
    it('setExplorerSaveModalOpen toggles modal state', () => {
      useStore.getState().setExplorerSaveModalOpen(true);
      expect(useStore.getState().explorerSaveModalOpen).toBe(true);

      useStore.getState().setExplorerSaveModalOpen(false);
      expect(useStore.getState().explorerSaveModalOpen).toBe(false);
    });
  });
});
