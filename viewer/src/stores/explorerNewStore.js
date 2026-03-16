/* eslint-disable no-template-curly-in-string */

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
 * ExplorerNew Store Slice
 *
 * Manages state for the ExplorerNew composition layer.
 * Separate from explorerStore.js (old Explorer page).
 * All state keys prefixed with 'explorer' to avoid namespace collisions.
 *
 * This store handles explorer-specific concerns:
 * - Source & query state (SQL, results, errors)
 * - Model context (active model, edit mode)
 * - Insight & chart config for preview
 * - DuckDB WASM computed columns
 * - UI layout state (panel sizes, collapse)
 * - Edit stack for right panel navigation
 *
 * Object persistence (save/update/delete) is handled by per-type stores
 * (modelStore, insightStore, etc.) via useObjectSave hook.
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

  // --- DuckDB WASM & Computed Columns ---
  explorerComputedColumns: [], // [{name, expression, type: 'metric'|'dimension', sourceDialect}]
  explorerEnrichedResult: null, // query result + computed columns from DuckDB
  explorerDuckDBTableName: null, // table name in DuckDB WASM (will be internalized in Phase 2)
  explorerDuckDBLoading: false,
  explorerDuckDBError: null,
  explorerFailedComputedColumns: {}, // { columnName: errorMessage }

  // --- Save Modal (temporary — will be removed when InsightEditorPanel is replaced by EditPanel) ---
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
    const resolvedSourceName = matchedSourceName || extractedSourceName;
    let sourceDialect = null;
    if (resolvedSourceName) {
      const dialectHints = [
        'duckdb',
        'postgres',
        'postgresql',
        'mysql',
        'sqlite',
        'snowflake',
        'bigquery',
        'redshift',
      ];
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
    import('../api/modelData')
      .then(({ fetchModelData }) => {
        fetchModelData(model.name)
          .then((data) => {
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
          })
          .catch(() => {});
      })
      .catch(() => {});
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
    set({
      explorerComputedColumns: [],
      explorerEnrichedResult: null,
      explorerFailedComputedColumns: {},
    });
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

  // Temporary stub — will be removed when SaveToProjectModal is replaced by EditPanel
  saveExplorerToProject: async () => {
    return { success: false, error: 'Save via EditPanel instead' };
  },

  // --- Edit Stack Management ---
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
});

export default createExplorerNewSlice;
