import {
  listExplorations as apiListExplorations,
  createExploration as apiCreateExploration,
  updateExploration as apiUpdateExploration,
  deleteExploration as apiDeleteExploration,
} from '../api/explorations';

/**
 * ExplorerNew Store Slice
 *
 * Manages state for the ExplorerNew composition layer.
 * Separate from explorerStore.js (old Explorer page).
 * All state keys prefixed with 'explorer' to avoid namespace collisions.
 *
 * Multi-tab: explorerExplorations[] holds per-tab state snapshots.
 * Flat state (explorerSql, etc.) represents the ACTIVE exploration.
 * Switching tabs snapshots current flat state and restores target.
 */
const createExplorerNewSlice = (set, get) => ({
  // --- Source & Query State ---
  explorerSourceName: null,
  explorerSql: '',
  explorerQueryResult: null,
  explorerQueryError: null,

  // --- Model Context State ---
  explorerActiveModelName: null,
  explorerModelEditMode: null, // null | 'use' | 'edit'

  // --- Insight & Chart State ---
  explorerInsightConfig: { name: '', props: { type: 'scatter' } },
  explorerChartLayout: {},
  explorerModelName: '',
  explorerChartName: '',

  // --- DuckDB WASM & Computed Columns ---
  explorerComputedColumns: [], // [{name, expression, type: 'metric'|'dimension', sourceDialect}]
  explorerEnrichedResult: null, // query result + computed columns from DuckDB
  explorerDuckDBTableName: null, // table name in DuckDB WASM
  explorerDuckDBLoading: false,
  explorerDuckDBError: null,

  // --- Sources (shared between LeftPanel and CenterPanel) ---
  explorerSources: [],

  // --- UI State ---
  explorerIsEditorCollapsed: false,
  explorerProfileColumn: null,
  explorerEditStack: [],
  explorerLeftNavCollapsed: false,
  explorerCenterMode: 'split', // 'split' | 'editor' | 'chart'
  explorerEditorChartSplit: 0.5,
  explorerTopBottomSplit: 0.5,

  // --- Actions: Source & Query ---
  setExplorerSources: (sources) => {
    set({ explorerSources: sources });
  },

  setExplorerSourceName: (sourceName) => {
    set({ explorerSourceName: sourceName });
  },

  setExplorerSql: (sql) => {
    set({ explorerSql: sql });
  },

  setExplorerQueryResult: (result) => {
    set({
      explorerQueryResult: result,
      explorerQueryError: null,
      explorerProfileColumn: null,
      explorerEnrichedResult: null,
      explorerDuckDBTableName: null,
      explorerDuckDBError: null,
    });
    get().autoPopulateInsight();
  },

  setExplorerQueryError: (error) => {
    set({ explorerQueryError: error });
  },

  // --- Actions: Table Selection (Source-First Journey) ---
  handleExplorerTableSelect: ({ sourceName, table }) => {
    const tableRef = `SELECT * FROM ${table}`;
    const currentSql = get().explorerSql;
    const newSql = currentSql.trim() ? `${currentSql}\n${tableRef}` : tableRef;

    set({
      explorerSql: newSql,
      explorerSourceName: sourceName || get().explorerSourceName,
      explorerIsEditorCollapsed: false,
    });
  },

  // --- Actions: Model "Use" (Load SQL + Auto-Add Metrics/Dimensions) ---
  handleExplorerModelUse: (model) => {
    if (!model?.config) return;

    const sql = model.config.sql || model.config.query || '';

    let sourceName = null;
    const rawSource = model.config.source;
    if (typeof rawSource === 'string') {
      const refMatch = rawSource.match(/^ref\((.+)\)$/);
      sourceName = refMatch ? refMatch[1] : rawSource;
    }

    // Find metrics/dimensions belonging to this model
    const allMetrics = get().metrics || [];
    const allDimensions = get().dimensions || [];

    const stripRef = (value) => {
      if (typeof value !== 'string') return value;
      const match = value.match(/^ref\((.+)\)$/);
      return match ? match[1] : value;
    };

    const belongsToModel = (item) => {
      const rawModel = item.parentModel || item.config?.model;
      return rawModel && stripRef(rawModel) === model.name;
    };

    const computedCols = [];
    allMetrics.filter(belongsToModel).forEach((m) => {
      if (m.config?.expression) {
        computedCols.push({
          name: m.name,
          expression: m.config.expression,
          type: 'metric',
        });
      }
    });
    allDimensions.filter(belongsToModel).forEach((d) => {
      if (d.config?.expression) {
        computedCols.push({
          name: d.name,
          expression: d.config.expression,
          type: 'dimension',
        });
      }
    });

    set({
      explorerSql: sql,
      explorerSourceName: sourceName || get().explorerSourceName,
      explorerIsEditorCollapsed: false,
      explorerActiveModelName: model.name,
      explorerModelEditMode: 'use',
      explorerComputedColumns: computedCols,
      explorerEnrichedResult: null,
      explorerEditStack: [],
    });
  },

  // --- Actions: Insight Config ---
  setExplorerInsightConfig: (config) => {
    set({ explorerInsightConfig: config });
  },

  // --- Actions: Chart Layout ---
  syncPlotlyEditsToChartLayout: (layoutUpdates) => {
    set((state) => ({
      explorerChartLayout: { ...state.explorerChartLayout, ...layoutUpdates },
    }));
  },

  // --- Actions: Object Names ---
  setExplorerModelName: (name) => {
    set({ explorerModelName: name });
  },

  setExplorerChartName: (name) => {
    set({ explorerChartName: name });
  },

  // --- Actions: Left Nav ---
  toggleExplorerLeftNavCollapsed: () => {
    set((state) => ({ explorerLeftNavCollapsed: !state.explorerLeftNavCollapsed }));
  },

  // --- Actions: Center Mode ---
  setExplorerCenterMode: (mode) => {
    set({ explorerCenterMode: mode });
  },

  // --- Actions: Auto-populate insight from query results ---
  autoPopulateInsight: () => {
    const result = get().explorerQueryResult;
    const currentConfig = get().explorerInsightConfig;
    if (!result?.columns?.length) return;
    if (currentConfig?.props?.x || currentConfig?.props?.y) return;

    const columns = result.columns;
    const rows = result.rows || [];
    const sampleRow = rows[0] || {};

    const inferType = (col) => {
      const val = sampleRow[col];
      if (val == null) return 'unknown';
      if (typeof val === 'number') return 'numeric';
      if (!isNaN(Date.parse(val)) && typeof val === 'string' && val.length >= 8) return 'datetime';
      return 'categorical';
    };

    const colTypes = columns.map((col) => ({ name: col, type: inferType(col) }));
    const datetimeCols = colTypes.filter((c) => c.type === 'datetime');
    const numericCols = colTypes.filter((c) => c.type === 'numeric');
    const categoricalCols = colTypes.filter((c) => c.type === 'categorical');

    let newProps = { type: 'scatter' };

    if (datetimeCols.length > 0 && numericCols.length > 0) {
      newProps = {
        type: 'scatter',
        mode: 'lines+markers',
        x: `\${${datetimeCols[0].name}}`,
        y: `\${${numericCols[0].name}}`,
      };
    } else if (categoricalCols.length > 0 && numericCols.length > 0) {
      newProps = {
        type: 'bar',
        x: `\${${categoricalCols[0].name}}`,
        y: `\${${numericCols[0].name}}`,
      };
    } else if (numericCols.length >= 2) {
      newProps = {
        type: 'scatter',
        x: `\${${numericCols[0].name}}`,
        y: `\${${numericCols[1].name}}`,
      };
    } else if (columns.length >= 2) {
      newProps = {
        type: 'scatter',
        x: `\${${columns[0]}}`,
        y: `\${${columns[1]}}`,
      };
    }

    set({
      explorerInsightConfig: {
        ...currentConfig,
        props: { ...currentConfig.props, ...newProps },
      },
    });
  },

  // --- Actions: DuckDB & Computed Columns ---
  setExplorerDuckDBTableName: (name) => {
    set({ explorerDuckDBTableName: name });
  },

  setExplorerDuckDBLoading: (loading) => {
    set({ explorerDuckDBLoading: loading });
  },

  setExplorerDuckDBError: (error) => {
    set({ explorerDuckDBError: error });
  },

  setExplorerEnrichedResult: (result) => {
    set({ explorerEnrichedResult: result });
  },

  addExplorerComputedColumn: (col) => {
    set((state) => {
      const exists = state.explorerComputedColumns.some((c) => c.name === col.name);
      if (exists) return state;
      return { explorerComputedColumns: [...state.explorerComputedColumns, col] };
    });
  },

  removeExplorerComputedColumn: (name) => {
    set((state) => ({
      explorerComputedColumns: state.explorerComputedColumns.filter((c) => c.name !== name),
      explorerEnrichedResult: null,
    }));
  },

  clearExplorerComputedColumns: () => {
    set({ explorerComputedColumns: [], explorerEnrichedResult: null });
  },

  // --- Actions: Validate Expressions ---
  validateExplorerExpression: async (expression, sourceDialect) => {
    try {
      const { translateExpressions } = await import('../api/expressions');
      const result = await translateExpressions(
        [{ name: '__validate__', expression, type: 'dimension' }],
        sourceDialect
      );
      const errors = (result.errors || []).filter((e) => e.name === '__validate__');
      if (errors.length > 0) {
        return { valid: false, error: errors[0].error };
      }
      const translation = (result.translations || []).find((t) => t.name === '__validate__');
      return {
        valid: true,
        duckdbExpression: translation?.duckdb_expression || expression,
      };
    } catch (err) {
      return { valid: false, error: err.message || 'Validation failed' };
    }
  },

  // Edit stack management
  pushExplorerEdit: (type, object, options = {}) => {
    set((state) => ({
      explorerEditStack: [...state.explorerEditStack, { type, object, ...options }],
    }));
  },

  popExplorerEdit: () => {
    set((state) => ({
      explorerEditStack: state.explorerEditStack.slice(0, -1),
    }));
  },

  clearExplorerEditStack: () => {
    set({ explorerEditStack: [] });
  },

  // --- Actions: UI Controls ---
  toggleExplorerEditorCollapsed: () => {
    set((state) => ({ explorerIsEditorCollapsed: !state.explorerIsEditorCollapsed }));
  },

  setExplorerProfileColumn: (column) => {
    set({ explorerProfileColumn: column });
  },

  // --- Persistence State ---
  explorerExplorationId: null,
  explorerAutoSaveTimer: null,
  explorerIsSaving: false,
  explorerSaveError: null,
  explorerIsDirty: false,

  // --- Save Status (for cascading save) ---
  explorerSavedModelName: null,
  explorerSavedInsightName: null,

  // --- Multi-Tab State ---
  explorerExplorations: [],
  explorerActiveExplorationId: null,

  // --- Actions: Persistence ---
  initExplorations: async () => {
    try {
      const explorations = await apiListExplorations();
      if (explorations.length > 0) {
        const explorationStates = explorations.map(e => ({
          id: e.id,
          name: e.name,
          sourceName: e.source_name,
          sql: e.sql || '',
          queryResult: null,
          queryError: null,
          insightConfig: e.insight_config || { name: '', props: { type: 'scatter' } },
          chartLayout: e.chart_layout || {},
          isEditorCollapsed: e.is_editor_collapsed || false,
          profileColumn: null,
          editStack: [],
          savedModelName: null,
          savedInsightName: null,
          isDirty: false,
          leftNavCollapsed: false,
          centerMode: 'split',
          editorChartSplit: 0.5,
          topBottomSplit: 0.5,
          modelName: e.model_name || '',
          chartName: e.chart_name || '',
          computedColumns: [],
          enrichedResult: null,
          duckDBTableName: null,
        }));

        const activeApi = explorations.find(e => e.is_active);
        const active =
          explorationStates.find(e => e.id === activeApi?.id) || explorationStates[0];

        set({
          explorerExplorations: explorationStates,
          explorerActiveExplorationId: active.id,
          explorerExplorationId: active.id,
          explorerSourceName: active.sourceName || get().explorerSourceName,
          explorerSql: active.sql || '',
          explorerInsightConfig: active.insightConfig,
          explorerChartLayout: active.chartLayout,
          explorerIsEditorCollapsed: active.isEditorCollapsed,
          explorerIsDirty: false,
        });
      } else {
        const newExploration = await apiCreateExploration('Exploration 1');
        const state = {
          id: newExploration.id,
          name: newExploration.name || 'Exploration 1',
          sourceName: null,
          sql: '',
          queryResult: null,
          queryError: null,
          insightConfig: { name: '', props: { type: 'scatter' } },
          chartLayout: {},
          isEditorCollapsed: false,
          profileColumn: null,
          editStack: [],
          isDirty: false,
          leftNavCollapsed: false,
          centerMode: 'split',
          editorChartSplit: 0.5,
          topBottomSplit: 0.5,
          modelName: '',
          chartName: '',
          computedColumns: [],
          enrichedResult: null,
          duckDBTableName: null,
        };
        set({
          explorerExplorations: [state],
          explorerActiveExplorationId: newExploration.id,
          explorerExplorationId: newExploration.id,
          explorerIsDirty: false,
        });
      }
    } catch (err) {
      console.error('Failed to initialize explorations:', err);
    }
  },

  autoSaveExploration: () => {
    const timer = get().explorerAutoSaveTimer;
    if (timer) clearTimeout(timer);

    set({ explorerIsDirty: true });

    const newTimer = setTimeout(async () => {
      const id = get().explorerExplorationId || get().explorerActiveExplorationId;
      if (!id) return;

      set({ explorerIsSaving: true, explorerSaveError: null });
      try {
        await apiUpdateExploration(id, {
          source_name: get().explorerSourceName,
          sql: get().explorerSql,
          insight_config: get().explorerInsightConfig,
          chart_layout: get().explorerChartLayout,
          is_editor_collapsed: get().explorerIsEditorCollapsed,
        });
        set({ explorerIsDirty: false });
      } catch (err) {
        set({ explorerSaveError: err.message });
      } finally {
        set({ explorerIsSaving: false });
      }
    }, 2000);

    set({ explorerAutoSaveTimer: newTimer });
  },

  // --- Actions: Multi-Tab Management ---
  snapshotCurrentExploration: () => {
    const activeId = get().explorerActiveExplorationId;
    if (!activeId) return;

    const snapshot = {
      sourceName: get().explorerSourceName,
      sql: get().explorerSql,
      queryResult: get().explorerQueryResult,
      queryError: get().explorerQueryError,
      insightConfig: get().explorerInsightConfig,
      chartLayout: get().explorerChartLayout,
      isEditorCollapsed: get().explorerIsEditorCollapsed,
      profileColumn: get().explorerProfileColumn,
      editStack: get().explorerEditStack,
      savedModelName: get().explorerSavedModelName,
      savedInsightName: get().explorerSavedInsightName,
      isDirty: get().explorerIsDirty,
      leftNavCollapsed: get().explorerLeftNavCollapsed,
      centerMode: get().explorerCenterMode,
      editorChartSplit: get().explorerEditorChartSplit,
      topBottomSplit: get().explorerTopBottomSplit,
      modelName: get().explorerModelName,
      chartName: get().explorerChartName,
      computedColumns: get().explorerComputedColumns,
      enrichedResult: get().explorerEnrichedResult,
      duckDBTableName: get().explorerDuckDBTableName,
    };

    set((state) => ({
      explorerExplorations: state.explorerExplorations.map(e =>
        e.id === activeId ? { ...e, ...snapshot } : e
      ),
    }));
  },

  createNewExploration: async (name) => {
    const explorations = get().explorerExplorations;
    const newName = name || `Exploration ${explorations.length + 1}`;
    const newExploration = await apiCreateExploration(newName);

    const explorationState = {
      id: newExploration.id,
      name: newExploration.name || newName,
      sourceName: null,
      sql: '',
      queryResult: null,
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
      computedColumns: [],
      enrichedResult: null,
      duckDBTableName: null,
    };

    get().snapshotCurrentExploration();

    set((state) => ({
      explorerExplorations: [...state.explorerExplorations, explorationState],
      explorerActiveExplorationId: newExploration.id,
      explorerExplorationId: newExploration.id,
      explorerSourceName: null,
      explorerSql: '',
      explorerQueryResult: null,
      explorerQueryError: null,
      explorerInsightConfig: { name: '', props: { type: 'scatter' } },
      explorerChartLayout: {},
      explorerIsEditorCollapsed: false,
      explorerProfileColumn: null,
      explorerEditStack: [],
      explorerSavedModelName: null,
      explorerSavedInsightName: null,
      explorerIsDirty: false,
      explorerLeftNavCollapsed: false,
      explorerCenterMode: 'split',
      explorerModelName: '',
      explorerChartName: '',
      explorerComputedColumns: [],
      explorerEnrichedResult: null,
      explorerDuckDBTableName: null,
      explorerDuckDBError: null,
    }));
  },

  switchExploration: (explorationId) => {
    const current = get().explorerActiveExplorationId;
    if (current === explorationId) return;

    get().snapshotCurrentExploration();

    const target = get().explorerExplorations.find(e => e.id === explorationId);
    if (!target) return;

    set({
      explorerActiveExplorationId: explorationId,
      explorerExplorationId: explorationId,
      explorerSourceName: target.sourceName || null,
      explorerSql: target.sql || '',
      explorerQueryResult: target.queryResult || null,
      explorerQueryError: target.queryError || null,
      explorerInsightConfig: target.insightConfig || { name: '', props: { type: 'scatter' } },
      explorerChartLayout: target.chartLayout || {},
      explorerIsEditorCollapsed: target.isEditorCollapsed || false,
      explorerProfileColumn: target.profileColumn || null,
      explorerEditStack: target.editStack || [],
      explorerSavedModelName: target.savedModelName || null,
      explorerSavedInsightName: target.savedInsightName || null,
      explorerIsDirty: target.isDirty || false,
      explorerLeftNavCollapsed: target.leftNavCollapsed || false,
      explorerCenterMode: target.centerMode || 'split',
      explorerModelName: target.modelName || '',
      explorerChartName: target.chartName || '',
      explorerComputedColumns: target.computedColumns || [],
      explorerEnrichedResult: target.enrichedResult || null,
      explorerDuckDBTableName: target.duckDBTableName || null,
    });
  },

  renameExploration: async (explorationId, newName) => {
    await apiUpdateExploration(explorationId, { name: newName });
    set((state) => ({
      explorerExplorations: state.explorerExplorations.map(e =>
        e.id === explorationId ? { ...e, name: newName } : e
      ),
    }));
  },

  closeExploration: async (explorationId) => {
    const explorations = get().explorerExplorations;
    if (explorations.length <= 1) return;

    const activeId = get().explorerActiveExplorationId;
    if (activeId === explorationId) {
      const idx = explorations.findIndex(e => e.id === explorationId);
      const nextId = explorations[idx + 1]?.id || explorations[idx - 1]?.id;
      if (nextId) {
        get().switchExploration(nextId);
      }
    }

    await apiDeleteExploration(explorationId);
    set((state) => ({
      explorerExplorations: state.explorerExplorations.filter(e => e.id !== explorationId),
    }));
  },

  forceAutoSave: async () => {
    const timer = get().explorerAutoSaveTimer;
    if (timer) clearTimeout(timer);

    const id = get().explorerExplorationId || get().explorerActiveExplorationId;
    if (!id) return;

    try {
      await apiUpdateExploration(id, {
        source_name: get().explorerSourceName,
        sql: get().explorerSql,
        insight_config: get().explorerInsightConfig,
        chart_layout: get().explorerChartLayout,
        is_editor_collapsed: get().explorerIsEditorCollapsed,
      });
      set({ explorerIsDirty: false });
    } catch (err) {
      console.error('Force auto-save failed:', err);
    }
  },

  // --- Actions: Save New Project Objects ---
  saveExplorerModel: async (name) => {
    const sql = get().explorerSql;
    const sourceName = get().explorerSourceName;
    if (!sql || !sourceName) return { success: false, error: 'SQL and source required' };

    const config = { sql, source: `ref(${sourceName})` };
    const result = await get().saveModel(name, config);
    if (result.success) {
      set({ explorerSavedModelName: name });
    }
    return result;
  },

  saveExplorerInsight: async (name) => {
    const modelName = get().explorerSavedModelName;
    if (!modelName) return { success: false, error: 'Save model first' };

    const insightConfig = get().explorerInsightConfig;
    if (!insightConfig) return { success: false, error: 'No chart configuration' };

    const config = { name, model: `ref(${modelName})`, ...insightConfig.props };
    const result = await get().saveInsight(name, config);
    if (result.success) {
      set({ explorerSavedInsightName: name });
    }
    return result;
  },

  saveExplorerChart: async (name) => {
    const insightName = get().explorerSavedInsightName;
    if (!insightName) return { success: false, error: 'Save insight first' };

    const layout = get().explorerChartLayout;
    const config = { name, insights: [`ref(${insightName})`] };
    if (layout && Object.keys(layout).length > 0) {
      config.layout = layout;
    }
    return await get().saveChart(name, config);
  },

  // --- Actions: Update Existing Project Objects ---
  updateExplorerModel: async (name) => {
    const sql = get().explorerSql;
    const sourceName = get().explorerSourceName;
    if (!sql || !sourceName) return { success: false, error: 'SQL and source required' };
    if (!name) return { success: false, error: 'Model name required for update' };

    const config = { sql, source: `ref(${sourceName})` };
    const result = await get().saveModel(name, config);
    if (result.success) {
      set({ explorerSavedModelName: name });
    }
    return result;
  },

  updateExplorerInsight: async (name) => {
    const modelName = get().explorerSavedModelName;
    if (!modelName) return { success: false, error: 'Save model first' };
    if (!name) return { success: false, error: 'Insight name required for update' };

    const insightConfig = get().explorerInsightConfig;
    if (!insightConfig) return { success: false, error: 'No chart configuration' };

    const config = { name, model: `ref(${modelName})`, ...insightConfig.props };
    const result = await get().saveInsight(name, config);
    if (result.success) {
      set({ explorerSavedInsightName: name });
    }
    return result;
  },
});

export default createExplorerNewSlice;
