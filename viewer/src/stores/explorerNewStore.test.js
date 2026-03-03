import useStore from './store';

jest.mock('../api/explorations', () => ({
  listExplorations: jest.fn(),
  createExploration: jest.fn(),
  updateExploration: jest.fn(),
  deleteExploration: jest.fn(),
}));

const {
  listExplorations,
  createExploration,
  updateExploration,
  deleteExploration,
} = require('../api/explorations');

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
      saveModel: jest.fn().mockResolvedValue({ success: true }),
      saveInsight: jest.fn().mockResolvedValue({ success: true }),
      saveChart: jest.fn().mockResolvedValue({ success: true }),
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

  describe('handleExplorerModelEdit', () => {
    it('sets explorerActiveModelName to model name', () => {
      useStore.getState().handleExplorerModelEdit({ name: 'my_model' });

      expect(useStore.getState().explorerActiveModelName).toBe('my_model');
    });

    it('sets explorerModelEditMode to "edit"', () => {
      useStore.getState().handleExplorerModelEdit({ name: 'my_model' });

      expect(useStore.getState().explorerModelEditMode).toBe('edit');
    });

    it('pushes model to editStack with isCreate: false', () => {
      const model = { name: 'my_model', config: { sql: 'SELECT 1' } };
      useStore.getState().handleExplorerModelEdit(model);

      const stack = useStore.getState().explorerEditStack;
      expect(stack).toHaveLength(1);
      expect(stack[0].type).toBe('model');
      expect(stack[0].object).toBe(model);
      expect(stack[0].isCreate).toBe(false);
    });

    it('handles null model gracefully', () => {
      const before = useStore.getState().explorerEditStack.length;
      useStore.getState().handleExplorerModelEdit(null);

      expect(useStore.getState().explorerEditStack.length).toBe(before);
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

  describe('autoPopulateInsight', () => {
    it('does nothing without query results', () => {
      useStore.getState().autoPopulateInsight();

      expect(useStore.getState().explorerInsightConfig.props.type).toBe('scatter');
      expect(useStore.getState().explorerInsightConfig.props.x).toBeUndefined();
    });

    it('does nothing if insight already has axis mapping', () => {
      useStore.setState({
        explorerInsightConfig: { name: '', props: { type: 'bar', x: '${col}', y: '${val}' } },
        explorerQueryResult: {
          columns: ['date', 'amount'],
          rows: [{ date: '2024-01-01', amount: 100 }],
        },
      });

      useStore.getState().autoPopulateInsight();

      expect(useStore.getState().explorerInsightConfig.props.type).toBe('bar');
    });

    it('auto-populates datetime + numeric as scatter with lines', () => {
      useStore.setState({
        explorerQueryResult: {
          columns: ['created_at', 'amount'],
          rows: [{ created_at: '2024-01-01T00:00:00Z', amount: 100 }],
        },
      });

      useStore.getState().autoPopulateInsight();

      const props = useStore.getState().explorerInsightConfig.props;
      expect(props.type).toBe('scatter');
      expect(props.mode).toBe('lines+markers');
      expect(props.x).toBe('${created_at}');
      expect(props.y).toBe('${amount}');
    });

    it('auto-populates categorical + numeric as bar chart', () => {
      useStore.setState({
        explorerQueryResult: {
          columns: ['region', 'sales'],
          rows: [{ region: 'East', sales: 500 }],
        },
      });

      useStore.getState().autoPopulateInsight();

      const props = useStore.getState().explorerInsightConfig.props;
      expect(props.type).toBe('bar');
      expect(props.x).toBe('${region}');
      expect(props.y).toBe('${sales}');
    });

    it('auto-populates two numeric columns as scatter', () => {
      useStore.setState({
        explorerQueryResult: {
          columns: ['x_val', 'y_val'],
          rows: [{ x_val: 1, y_val: 2 }],
        },
      });

      useStore.getState().autoPopulateInsight();

      const props = useStore.getState().explorerInsightConfig.props;
      expect(props.type).toBe('scatter');
      expect(props.x).toBe('${x_val}');
      expect(props.y).toBe('${y_val}');
    });

    it('falls back to first two columns as scatter', () => {
      useStore.setState({
        explorerQueryResult: {
          columns: ['a', 'b'],
          rows: [{ a: null, b: null }],
        },
      });

      useStore.getState().autoPopulateInsight();

      const props = useStore.getState().explorerInsightConfig.props;
      expect(props.type).toBe('scatter');
      expect(props.x).toBe('${a}');
      expect(props.y).toBe('${b}');
    });

    it('is called by setExplorerQueryResult', () => {
      useStore.getState().setExplorerQueryResult({
        columns: ['price', 'quantity'],
        rows: [{ price: 10, quantity: 5 }],
      });

      const props = useStore.getState().explorerInsightConfig.props;
      expect(props.x).toBe('${price}');
      expect(props.y).toBe('${quantity}');
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
        source: 'ref(pg)',
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

    it('saveExplorerInsight creates insight with model ref', async () => {
      const mockSaveInsight = jest.fn().mockResolvedValue({ success: true });
      useStore.setState({
        explorerSavedModelName: 'my_model',
        explorerInsightConfig: { name: 'test', props: { type: 'scatter' } },
        saveInsight: mockSaveInsight,
      });

      const result = await useStore.getState().saveExplorerInsight('my_insight');

      expect(result.success).toBe(true);
      expect(mockSaveInsight).toHaveBeenCalledWith('my_insight', {
        name: 'my_insight',
        model: 'ref(my_model)',
        type: 'scatter',
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
        insights: ['ref(my_insight)'],
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
        insights: ['ref(my_insight)'],
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
        source: 'ref(pg)',
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
        explorerInsightConfig: { name: 'existing', props: { type: 'bar' } },
        saveInsight: mockSaveInsight,
      });

      const result = await useStore.getState().updateExplorerInsight('existing_insight');

      expect(result.success).toBe(true);
      expect(mockSaveInsight).toHaveBeenCalledWith('existing_insight', {
        name: 'existing_insight',
        model: 'ref(my_model)',
        type: 'bar',
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
