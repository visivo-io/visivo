/* eslint-disable no-template-curly-in-string */
import {
  listExplorations as apiListExplorations,
  createExploration as apiCreateExploration,
  updateExploration as apiUpdateExploration,
  deleteExploration as apiDeleteExploration,
} from '../api/explorations';
import { saveModel as apiSaveModel } from '../api/models';
import { saveInsight as apiSaveInsight } from '../api/insights';
import { saveChart as apiSaveChart } from '../api/charts';

/**
 * Expand dot-notation keys in insight props to nested objects.
 *
 * Explorer stores flat keys with dots (e.g., 'marker.color') for convenience.
 * Backend expects nested objects (e.g., { marker: { color: ... } }).
 * All values are passed through unchanged — they should already be
 * in ?{...} query-string format.
 */
export const expandDotNotationProps = (props) => {
  const result = {};
  for (const [key, value] of Object.entries(props)) {
    if (key.includes('.')) {
      const parts = key.split('.');
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!current[parts[i]] || typeof current[parts[i]] !== 'object') {
          current[parts[i]] = {};
        }
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
};

/**
 * Replace model references in all string values of insight props.
 * Used at save time when the user chooses a different model name
 * than the active model name used during exploration.
 */
export const replaceModelRefInProps = (props, oldName, newName) => {
  const result = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'string') {
      result[key] = value.replaceAll('ref(' + oldName + ')', 'ref(' + newName + ')');
    } else if (Array.isArray(value)) {
      result[key] = value.map((v) =>
        typeof v === 'string'
          ? v.replaceAll('ref(' + oldName + ')', 'ref(' + newName + ')')
          : v
      );
    } else if (typeof value === 'object' && value !== null) {
      result[key] = replaceModelRefInProps(value, oldName, newName);
    } else {
      result[key] = value;
    }
  }
  return result;
};

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
  explorerFailedComputedColumns: {}, // { columnName: errorMessage }

  // --- Save Modal ---
  explorerSaveModalOpen: false,

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

    let extractedSourceName = null;
    const rawSource = model.config.source;
    if (typeof rawSource === 'string') {
      // Handle various ref formats: ref(name), ${ref(name)}, ${ ref(name) }
      const refMatch = rawSource.match(/ref\(([^)]+)\)/);
      extractedSourceName = refMatch ? refMatch[1].trim() : rawSource;
    }

    // Match extracted source name against available sources (exact → suffix → contains)
    const sources = get().explorerSources || [];
    let matchedSourceName = null;
    if (extractedSourceName) {
      const exact = sources.find((s) => s.source_name === extractedSourceName);
      if (exact) {
        matchedSourceName = exact.source_name;
      } else {
        const suffix = sources.find((s) =>
          s.source_name.endsWith('-' + extractedSourceName)
        );
        if (suffix) {
          matchedSourceName = suffix.source_name;
        } else {
          const contains = sources.find((s) =>
            s.source_name.includes(extractedSourceName)
          );
          if (contains) {
            matchedSourceName = contains.source_name;
          }
        }
      }
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

    // Determine source dialect for expression translation
    // Extract dialect hint from source name (e.g., "local-duckdb" → "duckdb", "local-postgres" → "postgres")
    const resolvedSourceName = matchedSourceName || extractedSourceName;
    let sourceDialect = null;
    if (resolvedSourceName) {
      const dialectHints = ['duckdb', 'postgres', 'postgresql', 'mysql', 'sqlite', 'snowflake', 'bigquery', 'redshift'];
      const lowerSrc = resolvedSourceName.toLowerCase();
      sourceDialect = dialectHints.find((d) => lowerSrc.includes(d)) || null;
      if (sourceDialect === 'postgresql') sourceDialect = 'postgres';
    }

    const computedCols = [];
    allMetrics.filter(belongsToModel).forEach((m) => {
      if (m.config?.expression) {
        computedCols.push({
          name: m.name,
          expression: m.config.expression,
          type: 'metric',
          sourceDialect: sourceDialect && sourceDialect !== 'duckdb' ? sourceDialect : undefined,
        });
      }
    });
    allDimensions.filter(belongsToModel).forEach((d) => {
      if (d.config?.expression) {
        computedCols.push({
          name: d.name,
          expression: d.config.expression,
          type: 'dimension',
          sourceDialect: sourceDialect && sourceDialect !== 'duckdb' ? sourceDialect : undefined,
        });
      }
    });

    set({
      explorerSql: sql,
      explorerSourceName: matchedSourceName || extractedSourceName || get().explorerSourceName,
      explorerIsEditorCollapsed: false,
      explorerActiveModelName: model.name,
      explorerModelEditMode: 'use',
      explorerComputedColumns: computedCols,
      explorerEnrichedResult: null,
      explorerEditStack: [],
    });

    // Auto-load pre-existing parquet data if available
    import('../api/modelData').then(({ fetchModelData }) => {
      fetchModelData(model.name).then((data) => {
        if (data.available && data.rows?.length > 0) {
          set({
            explorerQueryResult: {
              columns: data.columns,
              rows: data.rows,
              row_count: data.row_count,
              truncated: data.truncated || false,
            },
            explorerQueryError: null,
          });
        }
      }).catch(() => {});
    }).catch(() => {});
  },

  // --- Actions: Insight Config ---
  setExplorerInsightConfig: (config) => {
    set({ explorerInsightConfig: config });
  },

  setExplorerInsightProp: (fieldName, value) => {
    set((state) => ({
      explorerInsightConfig: {
        ...state.explorerInsightConfig,
        props: {
          ...state.explorerInsightConfig?.props,
          [fieldName]: value,
        },
      },
    }));
  },

  removeExplorerInsightProp: (fieldName) => {
    set((state) => {
      const { [fieldName]: _, ...restProps } = state.explorerInsightConfig?.props || {};
      return {
        explorerInsightConfig: {
          ...state.explorerInsightConfig,
          props: restProps,
        },
      };
    });
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

  setExplorerFailedComputedColumns: (failedMap) => {
    set({ explorerFailedComputedColumns: failedMap });
  },

  addExplorerComputedColumn: (col) => {
    set((state) => {
      const exists = state.explorerComputedColumns.some((c) => c.name === col.name);
      if (exists) return state;
      return { explorerComputedColumns: [...state.explorerComputedColumns, col] };
    });
  },

  updateExplorerComputedColumn: (name, updates) => {
    set((state) => ({
      explorerComputedColumns: state.explorerComputedColumns.map((c) =>
        c.name === name ? { ...c, ...updates } : c
      ),
      explorerEnrichedResult: null,
    }));
  },

  removeExplorerComputedColumn: (name) => {
    set((state) => ({
      explorerComputedColumns: state.explorerComputedColumns.filter((c) => c.name !== name),
      explorerEnrichedResult: null,
      explorerFailedComputedColumns: {},
    }));
  },

  clearExplorerComputedColumns: () => {
    set({ explorerComputedColumns: [], explorerEnrichedResult: null, explorerFailedComputedColumns: {} });
  },

  // --- Actions: Validate Expressions ---
  validateExplorerExpression: async (expression, sourceDialect) => {
    try {
      const { translateExpressions } = await import('../api/expressions');
      const result = await translateExpressions(
        [{ name: '__validate__', expression, type: '' }],
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
        detectedType: translation?.detected_type || 'dimension',
      };
    } catch (err) {
      return { valid: false, error: err.message || 'Validation failed' };
    }
  },

  setExplorerSaveModalOpen: (open) => {
    set({ explorerSaveModalOpen: open });
  },

  saveExplorerToProject: async ({ modelName, insightName, chartName, computedNames }) => {
    const {
      explorerSql,
      explorerSourceName,
      explorerInsightConfig,
      explorerChartLayout,
      explorerComputedColumns,
    } = get();

    if (!explorerSql || !explorerSourceName) {
      return { success: false, error: 'SQL and source are required' };
    }

    const projectFilePath = get().projectFilePath;
    const targetPath = projectFilePath;

    try {
      // Build model config with metrics/dimensions from computed columns
      const modelConfig = {
        name: modelName,
        sql: explorerSql,
        source: `\${ref(${explorerSourceName})}`,
      };

      // Add computed columns as model-scoped metrics and dimensions
      const computedMetrics = (explorerComputedColumns || []).filter((c) => c.type === 'metric');
      const computedDimensions = (explorerComputedColumns || []).filter((c) => c.type === 'dimension');

      if (computedMetrics.length > 0) {
        modelConfig.metrics = computedMetrics.map((c) => ({
          name: computedNames?.[c.name] || c.name,
          expression: c.expression,
        }));
      }
      if (computedDimensions.length > 0) {
        modelConfig.dimensions = computedDimensions.map((c) => ({
          name: computedNames?.[c.name] || c.name,
          expression: c.expression,
        }));
      }

      await apiSaveModel(modelName, modelConfig);

      // Save insight to server cache with user-chosen name
      const activeModelName = get().explorerActiveModelName;
      let insightProps = expandDotNotationProps(explorerInsightConfig.props);
      // Replace refs if model name changed
      if (activeModelName && modelName !== activeModelName) {
        insightProps = replaceModelRefInProps(insightProps, activeModelName, modelName);
      }
      // Also replace computed column names if they were renamed
      if (computedNames) {
        for (const [oldName, newName] of Object.entries(computedNames)) {
          if (oldName !== newName) {
            insightProps = replaceModelRefInProps(insightProps, oldName, newName);
          }
        }
      }
      const insightConfig = {
        name: insightName,
        props: insightProps,
      };
      await apiSaveInsight(insightName, insightConfig);

      // Save chart to server cache with user-chosen name
      const chartConfig = {
        name: chartName,
        insights: [`\${ref(${insightName})}`],
      };
      if (explorerChartLayout && Object.keys(explorerChartLayout).length > 0) {
        chartConfig.layout = explorerChartLayout;
      }
      await apiSaveChart(chartName, chartConfig);

      // Push to editorStore.namedChildren
      const namedChildren = get().namedChildren || {};
      const updatedNamedChildren = { ...namedChildren };

      updatedNamedChildren[modelName] = {
        type: 'model',
        type_key: 'models',
        config: modelConfig,
        status: 'New',
        file_path: targetPath,
        new_file_path: targetPath,
        path: null,
      };

      updatedNamedChildren[insightName] = {
        type: 'insight',
        type_key: 'insights',
        config: insightConfig,
        status: 'New',
        file_path: targetPath,
        new_file_path: targetPath,
        path: null,
      };

      updatedNamedChildren[chartName] = {
        type: 'chart',
        type_key: 'charts',
        config: chartConfig,
        status: 'New',
        file_path: targetPath,
        new_file_path: targetPath,
        path: null,
      };

      set({ namedChildren: updatedNamedChildren });

      set({
        explorerSaveModalOpen: false,
        explorerSavedModelName: modelName,
        explorerSavedInsightName: insightName,
      });

      return { success: true };
    } catch (err) {
      return { success: false, error: err.message || 'Failed to save to project' };
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
          activeModelName: null,
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
          activeModelName: null,
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
      activeModelName: get().explorerActiveModelName,
      failedComputedColumns: get().explorerFailedComputedColumns,
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
      activeModelName: null,
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
      explorerActiveModelName: null,
      explorerFailedComputedColumns: {},
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
      explorerActiveModelName: target.activeModelName || null,
      explorerFailedComputedColumns: target.failedComputedColumns || {},
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

    const config = { sql, source: `\${ref(${sourceName})}` };
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

    const activeModel = get().explorerActiveModelName;
    let finalProps = expandDotNotationProps(insightConfig.props);
    if (activeModel && modelName !== activeModel) {
      finalProps = replaceModelRefInProps(finalProps, activeModel, modelName);
    }
    const config = {
      name,
      props: finalProps,
    };
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
    const config = { name, insights: [`\${ref(${insightName})}`] };
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

    const config = { sql, source: `\${ref(${sourceName})}` };
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

    const activeModel = get().explorerActiveModelName;
    let finalProps = expandDotNotationProps(insightConfig.props);
    if (activeModel && modelName !== activeModel) {
      finalProps = replaceModelRefInProps(finalProps, activeModel, modelName);
    }
    const config = {
      name,
      props: finalProps,
    };
    const result = await get().saveInsight(name, config);
    if (result.success) {
      set({ explorerSavedInsightName: name });
    }
    return result;
  },
});

export default createExplorerNewSlice;
