/* eslint-disable no-template-curly-in-string */
import useStore from './store';
import { expandDotNotationProps, replaceModelRefInProps } from './explorerNewStore';

jest.mock('../api/explorations', () => ({
  listExplorations: jest.fn(),
  createExploration: jest.fn(),
  updateExploration: jest.fn(),
  deleteExploration: jest.fn(),
}));

jest.mock('../api/models', () => ({
  saveModel: jest.fn(),
}));

jest.mock('../api/insights', () => ({
  saveInsight: jest.fn(),
}));

jest.mock('../api/charts', () => ({
  saveChart: jest.fn(),
}));

const {
  listExplorations,
  createExploration,
  updateExploration,
  deleteExploration,
} = require('../api/explorations');

const { saveModel: apiSaveModel } = require('../api/models');
const { saveInsight: apiSaveInsight } = require('../api/insights');
const { saveChart: apiSaveChart } = require('../api/charts');

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
      explorerModelName: '',
      explorerChartName: '',
      explorerLeftNavCollapsed: false,
      explorerCenterMode: 'split',
      explorerEditorChartSplit: 0.5,
      explorerTopBottomSplit: 0.5,
      explorerExplorationId: null,
      explorerAutoSaveTimer: null,
      explorerIsSaving: false,
      explorerSaveError: null,
      explorerIsDirty: false,
      explorerSavedModelName: null,
      explorerSavedInsightName: null,
      explorerExplorations: [],
      explorerActiveExplorationId: null,
      explorerSaveModalOpen: false,
      saveModel: jest.fn().mockResolvedValue({ success: true }),
      saveInsight: jest.fn().mockResolvedValue({ success: true }),
      saveChart: jest.fn().mockResolvedValue({ success: true }),
      namedChildren: {},
      projectFilePath: '/project/visivo.yml',
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

  describe('object names', () => {
    it('sets model name', () => {
      useStore.getState().setExplorerModelName('orders_model');
      expect(useStore.getState().explorerModelName).toBe('orders_model');
    });

    it('sets chart name', () => {
      useStore.getState().setExplorerChartName('orders_chart');
      expect(useStore.getState().explorerChartName).toBe('orders_chart');
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

  describe('replaceModelRefInProps', () => {
    it('replaces model refs in string values', () => {
      const result = replaceModelRefInProps(
        { type: 'scatter', x: '?{${ref(old_model).col}}' },
        'old_model',
        'new_model'
      );
      expect(result).toEqual({ type: 'scatter', x: '?{${ref(new_model).col}}' });
    });

    it('handles nested objects recursively', () => {
      const result = replaceModelRefInProps(
        { marker: { color: '?{${ref(old).col}}' } },
        'old',
        'new'
      );
      expect(result).toEqual({ marker: { color: '?{${ref(new).col}}' } });
    });

    it('handles arrays', () => {
      const result = replaceModelRefInProps(
        { customdata: ['?{${ref(old).a}}', '?{${ref(old).b}}'] },
        'old',
        'new'
      );
      expect(result).toEqual({ customdata: ['?{${ref(new).a}}', '?{${ref(new).b}}'] });
    });

    it('does not modify non-string values', () => {
      const result = replaceModelRefInProps({ size: 10, visible: true }, 'old', 'new');
      expect(result).toEqual({ size: 10, visible: true });
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

  describe('persistence - initExplorations', () => {
    it('loads existing exploration when explorations exist', async () => {
      listExplorations.mockResolvedValue([
        {
          id: 'abc-123',
          name: 'Test Exploration',
          source_name: 'pg_source',
          sql: 'SELECT * FROM users',
          insight_config: { name: 'test', props: { type: 'bar' } },
          is_editor_collapsed: true,
          is_active: true,
        },
      ]);

      await useStore.getState().initExplorations();

      const state = useStore.getState();
      expect(state.explorerExplorationId).toBe('abc-123');
      expect(state.explorerSourceName).toBe('pg_source');
      expect(state.explorerSql).toBe('SELECT * FROM users');
      expect(state.explorerInsightConfig).toEqual({ name: 'test', props: { type: 'bar' } });
      expect(state.explorerIsEditorCollapsed).toBe(true);
      expect(state.explorerIsDirty).toBe(false);
    });

    it('loads first exploration when none is active', async () => {
      listExplorations.mockResolvedValue([
        { id: 'first', name: 'First', sql: 'SELECT 1', is_active: false },
        { id: 'second', name: 'Second', sql: 'SELECT 2', is_active: false },
      ]);

      await useStore.getState().initExplorations();

      expect(useStore.getState().explorerExplorationId).toBe('first');
    });

    it('creates default exploration when none exist', async () => {
      listExplorations.mockResolvedValue([]);
      createExploration.mockResolvedValue({ id: 'new-id', name: 'Exploration 1' });

      await useStore.getState().initExplorations();

      expect(createExploration).toHaveBeenCalledWith('Exploration 1');
      expect(useStore.getState().explorerExplorationId).toBe('new-id');
      expect(useStore.getState().explorerIsDirty).toBe(false);
    });

    it('handles API error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      listExplorations.mockRejectedValue(new Error('Network error'));

      await useStore.getState().initExplorations();

      expect(consoleSpy).toHaveBeenCalled();
      expect(useStore.getState().explorerExplorationId).toBeNull();
      consoleSpy.mockRestore();
    });
  });

  describe('persistence - autoSaveExploration', () => {
    it('sets isDirty immediately', () => {
      useStore.getState().autoSaveExploration();
      expect(useStore.getState().explorerIsDirty).toBe(true);
    });

    it('saves after debounce delay', async () => {
      updateExploration.mockResolvedValue({});
      useStore.setState({
        explorerExplorationId: 'exp-1',
        explorerSourceName: 'pg',
        explorerSql: 'SELECT 1',
      });

      useStore.getState().autoSaveExploration();

      expect(updateExploration).not.toHaveBeenCalled();

      jest.advanceTimersByTime(2000);

      await Promise.resolve();

      expect(updateExploration).toHaveBeenCalledWith('exp-1', {
        source_name: 'pg',
        sql: 'SELECT 1',
        insight_config: { name: '', props: { type: 'scatter' } },
        chart_layout: {},
        is_editor_collapsed: false,
      });
    });

    it('does not save without exploration ID', () => {
      useStore.setState({ explorerExplorationId: null });
      useStore.getState().autoSaveExploration();
      jest.advanceTimersByTime(2000);
      expect(updateExploration).not.toHaveBeenCalled();
    });

    it('clears isDirty after successful save', async () => {
      updateExploration.mockResolvedValue({});
      useStore.setState({ explorerExplorationId: 'exp-1' });

      useStore.getState().autoSaveExploration();
      expect(useStore.getState().explorerIsDirty).toBe(true);

      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      expect(useStore.getState().explorerIsDirty).toBe(false);
    });

    it('sets saveError on failure', async () => {
      updateExploration.mockRejectedValue(new Error('Save failed'));
      useStore.setState({ explorerExplorationId: 'exp-1' });

      useStore.getState().autoSaveExploration();
      jest.advanceTimersByTime(2000);
      await Promise.resolve();
      await Promise.resolve();

      expect(useStore.getState().explorerSaveError).toBe('Save failed');
    });
  });

  describe('save as new', () => {
    it('saveExplorerModel creates model with SQL and source', async () => {
      const mockSaveModel = jest.fn().mockResolvedValue({ success: true });
      useStore.setState({
        explorerSql: 'SELECT * FROM users',
        explorerSourceName: 'pg',
        saveModel: mockSaveModel,
      });

      const result = await useStore.getState().saveExplorerModel('my_model');

      expect(result.success).toBe(true);
      expect(mockSaveModel).toHaveBeenCalledWith('my_model', {
        sql: 'SELECT * FROM users',
        source: '${ref(pg)}',
      });
    });

    it('saveExplorerModel fails without SQL', async () => {
      useStore.setState({ explorerSql: '', explorerSourceName: 'pg' });
      const result = await useStore.getState().saveExplorerModel('my_model');
      expect(result.success).toBe(false);
      expect(result.error).toBe('SQL and source required');
    });

    it('saveExplorerModel fails without source', async () => {
      useStore.setState({ explorerSql: 'SELECT 1', explorerSourceName: null });
      const result = await useStore.getState().saveExplorerModel('my_model');
      expect(result.success).toBe(false);
    });

    it('saveExplorerModel sets explorerSavedModelName on success', async () => {
      useStore.setState({
        explorerSql: 'SELECT 1',
        explorerSourceName: 'pg',
        saveModel: jest.fn().mockResolvedValue({ success: true }),
      });

      await useStore.getState().saveExplorerModel('new_model');
      expect(useStore.getState().explorerSavedModelName).toBe('new_model');
    });

    it('saveExplorerInsight fails without model saved', async () => {
      useStore.setState({ explorerSavedModelName: null });
      const result = await useStore.getState().saveExplorerInsight('my_insight');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Save model first');
    });

    it('saveExplorerInsight creates insight with proper props format', async () => {
      const mockSaveInsight = jest.fn().mockResolvedValue({ success: true });
      useStore.setState({
        explorerSavedModelName: 'my_model',
        explorerActiveModelName: '__active_model',
        explorerInsightConfig: {
          name: 'test',
          props: { type: 'scatter', x: '?{${ref(__active_model).col_a}}' },
        },
        saveInsight: mockSaveInsight,
      });

      const result = await useStore.getState().saveExplorerInsight('my_insight');

      expect(result.success).toBe(true);
      expect(mockSaveInsight).toHaveBeenCalledWith('my_insight', {
        name: 'my_insight',
        props: {
          type: 'scatter',
          x: '?{${ref(my_model).col_a}}',
        },
      });
    });

    it('saveExplorerInsight sets explorerSavedInsightName on success', async () => {
      useStore.setState({
        explorerSavedModelName: 'my_model',
        explorerInsightConfig: { name: 'test', props: { type: 'scatter' } },
        saveInsight: jest.fn().mockResolvedValue({ success: true }),
      });

      await useStore.getState().saveExplorerInsight('new_insight');
      expect(useStore.getState().explorerSavedInsightName).toBe('new_insight');
    });

    it('saveExplorerChart fails without insight saved', async () => {
      useStore.setState({ explorerSavedInsightName: null });
      const result = await useStore.getState().saveExplorerChart('my_chart');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Save insight first');
    });

    it('saveExplorerChart creates chart with insight ref', async () => {
      const mockSaveChart = jest.fn().mockResolvedValue({ success: true });
      useStore.setState({
        explorerSavedInsightName: 'my_insight',
        saveChart: mockSaveChart,
      });

      const result = await useStore.getState().saveExplorerChart('my_chart');

      expect(result.success).toBe(true);
      expect(mockSaveChart).toHaveBeenCalledWith('my_chart', {
        name: 'my_chart',
        insights: ['${ref(my_insight)}'],
      });
    });

    it('saveExplorerChart includes layout when set', async () => {
      const mockSaveChart = jest.fn().mockResolvedValue({ success: true });
      useStore.setState({
        explorerSavedInsightName: 'my_insight',
        explorerChartLayout: { 'title.text': 'My Chart' },
        saveChart: mockSaveChart,
      });

      await useStore.getState().saveExplorerChart('my_chart');

      expect(mockSaveChart).toHaveBeenCalledWith('my_chart', {
        name: 'my_chart',
        insights: ['${ref(my_insight)}'],
        layout: { 'title.text': 'My Chart' },
      });
    });
  });

  describe('update existing', () => {
    it('updateExplorerModel updates with current SQL', async () => {
      const mockSaveModel = jest.fn().mockResolvedValue({ success: true });
      useStore.setState({
        explorerSql: 'SELECT * FROM orders',
        explorerSourceName: 'pg',
        saveModel: mockSaveModel,
      });

      const result = await useStore.getState().updateExplorerModel('existing_model');

      expect(result.success).toBe(true);
      expect(mockSaveModel).toHaveBeenCalledWith('existing_model', {
        sql: 'SELECT * FROM orders',
        source: '${ref(pg)}',
      });
    });

    it('updateExplorerModel sets explorerSavedModelName on success', async () => {
      useStore.setState({
        explorerSql: 'SELECT 1',
        explorerSourceName: 'pg',
        saveModel: jest.fn().mockResolvedValue({ success: true }),
      });

      await useStore.getState().updateExplorerModel('updated_model');
      expect(useStore.getState().explorerSavedModelName).toBe('updated_model');
    });

    it('updateExplorerModel fails without model name', async () => {
      useStore.setState({ explorerSql: 'SELECT 1', explorerSourceName: 'pg' });
      const result = await useStore.getState().updateExplorerModel('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Model name required for update');
    });

    it('updateExplorerModel fails without SQL', async () => {
      useStore.setState({ explorerSql: '', explorerSourceName: 'pg' });
      const result = await useStore.getState().updateExplorerModel('model');
      expect(result.success).toBe(false);
      expect(result.error).toBe('SQL and source required');
    });

    it('updateExplorerInsight updates with current config', async () => {
      const mockSaveInsight = jest.fn().mockResolvedValue({ success: true });
      useStore.setState({
        explorerSavedModelName: 'my_model',
        explorerActiveModelName: '__active_model',
        explorerInsightConfig: {
          name: 'existing',
          props: { type: 'bar', x: '?{${ref(__active_model).id}}' },
        },
        saveInsight: mockSaveInsight,
      });

      const result = await useStore.getState().updateExplorerInsight('existing_insight');

      expect(result.success).toBe(true);
      expect(mockSaveInsight).toHaveBeenCalledWith('existing_insight', {
        name: 'existing_insight',
        props: {
          type: 'bar',
          x: '?{${ref(my_model).id}}',
        },
      });
    });

    it('updateExplorerInsight fails without model saved', async () => {
      useStore.setState({ explorerSavedModelName: null });
      const result = await useStore.getState().updateExplorerInsight('insight');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Save model first');
    });

    it('updateExplorerInsight fails without insight name', async () => {
      useStore.setState({ explorerSavedModelName: 'model' });
      const result = await useStore.getState().updateExplorerInsight('');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insight name required for update');
    });

    it('updateExplorerInsight sets explorerSavedInsightName on success', async () => {
      useStore.setState({
        explorerSavedModelName: 'model',
        explorerInsightConfig: { name: 'insight', props: { type: 'line' } },
        saveInsight: jest.fn().mockResolvedValue({ success: true }),
      });

      await useStore.getState().updateExplorerInsight('updated_insight');
      expect(useStore.getState().explorerSavedInsightName).toBe('updated_insight');
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
  });


  describe('save modal', () => {
    it('setExplorerSaveModalOpen toggles modal state', () => {
      useStore.getState().setExplorerSaveModalOpen(true);
      expect(useStore.getState().explorerSaveModalOpen).toBe(true);

      useStore.getState().setExplorerSaveModalOpen(false);
      expect(useStore.getState().explorerSaveModalOpen).toBe(false);
    });
  });

  describe('saveExplorerToProject', () => {
    it('saves model, insight, chart to namedChildren', async () => {
      apiSaveModel.mockResolvedValue({ success: true });
      apiSaveInsight.mockResolvedValue({ success: true });
      apiSaveChart.mockResolvedValue({ success: true });

      useStore.setState({
        explorerSql: 'SELECT * FROM users',
        explorerSourceName: 'pg',
        explorerInsightConfig: {
          name: '',
          props: {
            type: 'scatter',
            x: '?{${ref(active_model).id}}',
            y: '?{${ref(active_model).val}}',
          },
        },
        explorerChartLayout: { title: { text: 'My Chart' } },
        explorerActiveModelName: 'active_model',
        projectFilePath: '/project/visivo.yml',
      });

      const result = await useStore.getState().saveExplorerToProject({
        modelName: 'users_model',
        insightName: 'users_scatter',
        chartName: 'users_chart',
      });

      expect(result.success).toBe(true);

      // Verify API calls with user-chosen names
      expect(apiSaveModel).toHaveBeenCalledWith('users_model', expect.objectContaining({
        name: 'users_model',
        sql: 'SELECT * FROM users',
        source: '${ref(pg)}',
      }));
      expect(apiSaveInsight).toHaveBeenCalledWith('users_scatter', expect.objectContaining({
        name: 'users_scatter',
        props: {
          type: 'scatter',
          x: '?{${ref(users_model).id}}',
          y: '?{${ref(users_model).val}}',
        },
      }));
      expect(apiSaveChart).toHaveBeenCalledWith('users_chart', expect.objectContaining({
        name: 'users_chart',
        insights: ['${ref(users_scatter)}'],
        layout: { title: { text: 'My Chart' } },
      }));

      // Verify namedChildren
      const nc = useStore.getState().namedChildren;
      expect(nc['users_model']).toBeDefined();
      expect(nc['users_model'].status).toBe('New');
      expect(nc['users_model'].type).toBe('model');
      expect(nc['users_scatter']).toBeDefined();
      expect(nc['users_scatter'].status).toBe('New');
      expect(nc['users_scatter'].type).toBe('insight');
      expect(nc['users_chart']).toBeDefined();
      expect(nc['users_chart'].status).toBe('New');
      expect(nc['users_chart'].type).toBe('chart');

      expect(useStore.getState().explorerSaveModalOpen).toBe(false);
    });

    it('fails without SQL', async () => {
      useStore.setState({ explorerSql: '', explorerSourceName: 'pg' });

      const result = await useStore.getState().saveExplorerToProject({
        modelName: 'model',
        insightName: 'insight',
        chartName: 'chart',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('SQL and source are required');
    });

    it('fails without source', async () => {
      useStore.setState({ explorerSql: 'SELECT 1', explorerSourceName: null });

      const result = await useStore.getState().saveExplorerToProject({
        modelName: 'model',
        insightName: 'insight',
        chartName: 'chart',
      });

      expect(result.success).toBe(false);
    });

    it('saves computed columns as model metrics and dimensions', async () => {
      apiSaveModel.mockResolvedValue({ success: true });
      apiSaveInsight.mockResolvedValue({ success: true });
      apiSaveChart.mockResolvedValue({ success: true });

      useStore.setState({
        explorerSql: 'SELECT 1',
        explorerSourceName: 'pg',
        explorerInsightConfig: { name: '', props: { type: 'scatter' } },
        explorerChartLayout: {},
        projectFilePath: '/project/visivo.yml',
        explorerComputedColumns: [
          { name: 'sum_value', expression: 'SUM(value)', type: 'metric' },
          { name: 'month', expression: "DATE_TRUNC('month', date)", type: 'dimension' },
        ],
      });

      await useStore.getState().saveExplorerToProject({
        modelName: 'model',
        insightName: 'insight',
        chartName: 'chart',
        computedNames: { sum_value: 'total_value', month: 'month' },
      });

      const modelCall = apiSaveModel.mock.calls[0];
      expect(modelCall[1].metrics).toEqual([
        { name: 'total_value', expression: 'SUM(value)' },
      ]);
      expect(modelCall[1].dimensions).toEqual([
        { name: 'month', expression: "DATE_TRUNC('month', date)" },
      ]);
    });

    it('handles API failure gracefully', async () => {
      apiSaveModel.mockRejectedValue(new Error('Server error'));

      useStore.setState({
        explorerSql: 'SELECT 1',
        explorerSourceName: 'pg',
        explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      });

      const result = await useStore.getState().saveExplorerToProject({
        modelName: 'model',
        insightName: 'insight',
        chartName: 'chart',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Server error');
    });
  });

  describe('multi-tab exploration', () => {
    const setupTwoExplorations = () => {
      useStore.setState({
        explorerExplorations: [
          {
            id: 'exp-1',
            name: 'Exploration 1',
            sourceName: 'pg',
            sql: 'SELECT * FROM users',
            queryResult: { columns: ['id'], rows: [{ id: 1 }] },
            queryError: null,
            insightConfig: { name: '', props: { type: 'scatter' } },
            chartLayout: {},
            isEditorCollapsed: false,
            profileColumn: null,
            editStack: [],
            savedModelName: null,
            savedInsightName: null,
            isDirty: false,
            leftNavCollapsed: false,
            centerMode: 'split',
            editorChartSplit: 0.5,
            topBottomSplit: 0.5,
            modelName: '',
            chartName: '',
            activeModelName: null,
          },
          {
            id: 'exp-2',
            name: 'Exploration 2',
            sourceName: 'mysql',
            sql: 'SELECT * FROM orders',
            queryResult: null,
            queryError: null,
            insightConfig: { name: 'chart', props: { type: 'bar' } },
            chartLayout: { 'title.text': 'Orders' },
            isEditorCollapsed: true,
            profileColumn: null,
            editStack: [],
            savedModelName: null,
            savedInsightName: null,
            isDirty: false,
            leftNavCollapsed: false,
            centerMode: 'split',
            editorChartSplit: 0.5,
            topBottomSplit: 0.5,
            modelName: '',
            chartName: '',
            activeModelName: null,
          },
        ],
        explorerActiveExplorationId: 'exp-1',
        explorerExplorationId: 'exp-1',
        explorerSourceName: 'pg',
        explorerSql: 'SELECT * FROM users',
        explorerQueryResult: { columns: ['id'], rows: [{ id: 1 }] },
        explorerIsEditorCollapsed: false,
      });
    };

    it('snapshotCurrentExploration captures all flat state', () => {
      setupTwoExplorations();
      useStore.setState({ explorerSql: 'SELECT * FROM modified' });

      useStore.getState().snapshotCurrentExploration();

      const explorations = useStore.getState().explorerExplorations;
      const exp1 = explorations.find((e) => e.id === 'exp-1');
      expect(exp1.sql).toBe('SELECT * FROM modified');
    });

    it('snapshotCurrentExploration does nothing without active ID', () => {
      useStore.setState({ explorerActiveExplorationId: null });
      useStore.getState().snapshotCurrentExploration();
      // Should not throw
    });

    it('switchExploration saves current and restores target state', () => {
      setupTwoExplorations();

      useStore.getState().switchExploration('exp-2');

      const state = useStore.getState();
      expect(state.explorerActiveExplorationId).toBe('exp-2');
      expect(state.explorerSourceName).toBe('mysql');
      expect(state.explorerSql).toBe('SELECT * FROM orders');
      expect(state.explorerIsEditorCollapsed).toBe(true);
      expect(state.explorerInsightConfig).toEqual({ name: 'chart', props: { type: 'bar' } });
      expect(state.explorerChartLayout).toEqual({ 'title.text': 'Orders' });
    });

    it('switchExploration snapshots current state before switching', () => {
      setupTwoExplorations();
      useStore.setState({ explorerSql: 'SELECT * FROM modified_users' });

      useStore.getState().switchExploration('exp-2');

      const explorations = useStore.getState().explorerExplorations;
      const exp1 = explorations.find((e) => e.id === 'exp-1');
      expect(exp1.sql).toBe('SELECT * FROM modified_users');
    });

    it('switchExploration does nothing if already on target', () => {
      setupTwoExplorations();
      const sqlBefore = useStore.getState().explorerSql;

      useStore.getState().switchExploration('exp-1');

      expect(useStore.getState().explorerSql).toBe(sqlBefore);
    });

    it('switchExploration does nothing for nonexistent ID', () => {
      setupTwoExplorations();

      useStore.getState().switchExploration('nonexistent');

      expect(useStore.getState().explorerActiveExplorationId).toBe('exp-1');
    });

    it('createNewExploration adds exploration and switches to it', async () => {
      setupTwoExplorations();
      createExploration.mockResolvedValue({ id: 'exp-3', name: 'Exploration 3' });

      await useStore.getState().createNewExploration();

      const state = useStore.getState();
      expect(state.explorerExplorations).toHaveLength(3);
      expect(state.explorerActiveExplorationId).toBe('exp-3');
      expect(state.explorerSql).toBe('');
      expect(state.explorerSourceName).toBeNull();
    });

    it('createNewExploration uses auto-incremented name', async () => {
      setupTwoExplorations();
      createExploration.mockResolvedValue({ id: 'exp-3', name: 'Exploration 3' });

      await useStore.getState().createNewExploration();

      expect(createExploration).toHaveBeenCalledWith('Exploration 3');
    });

    it('createNewExploration uses provided name', async () => {
      setupTwoExplorations();
      createExploration.mockResolvedValue({ id: 'exp-custom', name: 'Custom Name' });

      await useStore.getState().createNewExploration('Custom Name');

      expect(createExploration).toHaveBeenCalledWith('Custom Name');
    });

    it('renameExploration updates name in array and calls API', async () => {
      setupTwoExplorations();
      updateExploration.mockResolvedValue({});

      await useStore.getState().renameExploration('exp-1', 'Renamed');

      const explorations = useStore.getState().explorerExplorations;
      expect(explorations.find((e) => e.id === 'exp-1').name).toBe('Renamed');
      expect(updateExploration).toHaveBeenCalledWith('exp-1', { name: 'Renamed' });
    });

    it('closeExploration removes from array and calls API', async () => {
      setupTwoExplorations();
      deleteExploration.mockResolvedValue(true);

      await useStore.getState().closeExploration('exp-2');

      const explorations = useStore.getState().explorerExplorations;
      expect(explorations).toHaveLength(1);
      expect(explorations[0].id).toBe('exp-1');
      expect(deleteExploration).toHaveBeenCalledWith('exp-2');
    });

    it('closeExploration switches to adjacent tab when closing active', async () => {
      setupTwoExplorations();
      deleteExploration.mockResolvedValue(true);

      await useStore.getState().closeExploration('exp-1');

      expect(useStore.getState().explorerActiveExplorationId).toBe('exp-2');
    });

    it('closeExploration prevents closing last tab', async () => {
      useStore.setState({
        explorerExplorations: [{ id: 'exp-1', name: 'Only One' }],
        explorerActiveExplorationId: 'exp-1',
      });

      await useStore.getState().closeExploration('exp-1');

      expect(useStore.getState().explorerExplorations).toHaveLength(1);
      expect(deleteExploration).not.toHaveBeenCalled();
    });

    it('forceAutoSave saves immediately without debounce', async () => {
      updateExploration.mockResolvedValue({});
      useStore.setState({
        explorerExplorationId: 'exp-1',
        explorerActiveExplorationId: 'exp-1',
        explorerSql: 'SELECT 1',
        explorerSourceName: 'pg',
        explorerIsDirty: true,
      });

      await useStore.getState().forceAutoSave();

      expect(updateExploration).toHaveBeenCalledWith(
        'exp-1',
        expect.objectContaining({
          sql: 'SELECT 1',
          source_name: 'pg',
        })
      );
      expect(useStore.getState().explorerIsDirty).toBe(false);
    });

    it('initExplorations loads multiple explorations into array', async () => {
      listExplorations.mockResolvedValue([
        {
          id: 'a',
          name: 'First',
          source_name: 'pg',
          sql: 'SELECT 1',
          is_active: true,
        },
        {
          id: 'b',
          name: 'Second',
          source_name: 'mysql',
          sql: 'SELECT 2',
          is_active: false,
        },
      ]);

      await useStore.getState().initExplorations();

      const state = useStore.getState();
      expect(state.explorerExplorations).toHaveLength(2);
      expect(state.explorerExplorations[0].id).toBe('a');
      expect(state.explorerExplorations[1].id).toBe('b');
      expect(state.explorerActiveExplorationId).toBe('a');
    });

    it('initExplorations creates default with explorations array', async () => {
      listExplorations.mockResolvedValue([]);
      createExploration.mockResolvedValue({ id: 'new-id', name: 'Exploration 1' });

      await useStore.getState().initExplorations();

      const state = useStore.getState();
      expect(state.explorerExplorations).toHaveLength(1);
      expect(state.explorerExplorations[0].id).toBe('new-id');
      expect(state.explorerActiveExplorationId).toBe('new-id');
    });
  });
});
