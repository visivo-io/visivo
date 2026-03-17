/* eslint-disable no-template-curly-in-string */
import { generateUniqueName } from '../utils/uniqueName';

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
 * Escape regex metacharacters in a string for use in new RegExp().
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replace all occurrences of ref(oldName) with ref(newName) in a string value.
 */
const replaceRefInString = (str, oldName, newName) => {
  if (typeof str !== 'string') return str;
  return str.replace(new RegExp(`ref\\(${escapeRegex(oldName)}\\)`, 'g'), `ref(${newName})`);
};

/**
 * Walk all string values in an object/array and replace ref(oldName) with ref(newName).
 */
const replaceRefsInObject = (obj, oldName, newName) => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item) => {
      if (typeof item === 'string') return replaceRefInString(item, oldName, newName);
      if (typeof item === 'object' && item !== null) return replaceRefsInObject(item, oldName, newName);
      return item;
    });
  }
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = replaceRefInString(value, oldName, newName);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = replaceRefsInObject(value, oldName, newName);
    } else {
      result[key] = value;
    }
  }
  return result;
};

/**
 * Create an empty model state entry.
 */
const createEmptyModelState = (isNew = true) => ({
  sql: '',
  sourceName: null,
  queryResult: null,
  queryError: null,
  computedColumns: [],
  enrichedResult: null,
  isNew,
});

/**
 * Build a model state from an existing model object + global state context.
 * Used by both loadModel and loadChart to avoid code duplication.
 */
const buildModelStateFromObject = (modelObject, globalState) => {
  const sql = modelObject.config?.sql || modelObject.config?.query || '';
  const extractedSourceName = extractSourceName(modelObject.config?.source);
  const sources = globalState.explorerSources || [];
  const matchedSource = matchSourceName(extractedSourceName, sources);
  const resolvedSourceName = matchedSource || extractedSourceName;

  const allMetrics = globalState.metrics || [];
  const allDimensions = globalState.dimensions || [];

  const stripRef = (value) => {
    if (typeof value !== 'string') return value;
    const match = value.match(/^ref\((.+)\)$/);
    return match ? match[1] : value;
  };

  const belongsToModel = (item) => {
    const rawModel = item.parentModel || item.config?.model;
    return rawModel && stripRef(rawModel) === modelObject.name;
  };

  const sourceDialect = detectDialect(resolvedSourceName);

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

  return {
    sql,
    sourceName: resolvedSourceName,
    queryResult: null,
    queryError: null,
    computedColumns: computedCols,
    enrichedResult: null,
    isNew: false,
  };
};

/**
 * Extract source name from a ref() string or return as-is.
 */
const extractSourceName = (rawSource) => {
  if (typeof rawSource !== 'string') return null;
  const refMatch = rawSource.match(/ref\(([^)]+)\)/);
  return refMatch ? refMatch[1].trim() : rawSource;
};

/**
 * Match extracted source name against available sources (exact -> suffix -> contains).
 */
const matchSourceName = (extractedName, sources) => {
  if (!extractedName || !sources?.length) return null;

  const exact = sources.find((s) => s.source_name === extractedName);
  if (exact) return exact.source_name;

  const suffix = sources.find((s) => s.source_name.endsWith('-' + extractedName));
  if (suffix) return suffix.source_name;

  const contains = sources.find((s) => s.source_name.includes(extractedName));
  if (contains) return contains.source_name;

  return null;
};

/**
 * Determine source dialect from source name for expression translation.
 */
const detectDialect = (sourceName) => {
  if (!sourceName) return null;
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
  const lowerSrc = sourceName.toLowerCase();
  let dialect = dialectHints.find((d) => lowerSrc.includes(d)) || null;
  if (dialect === 'postgresql') dialect = 'postgres';
  return dialect;
};

/**
 * ExplorerNew Store Slice
 *
 * Multi-model, multi-insight architecture for the ExplorerNew composition layer.
 * All state keys prefixed with 'explorer' to avoid namespace collisions.
 *
 * Key concepts:
 * - explorerModelTabs / explorerModelStates: Multiple model tabs, each with SQL, source, data
 * - explorerInsightStates: Multiple insights, each with type, props, interactions, typePropsCache
 * - explorerChartInsightNames: Ordered list of insights on the active chart
 * - Active tracking via explorerActiveModelName / explorerActiveInsightName
 */
const createExplorerNewSlice = (set, get) => ({
  // --- Model Tab Management ---
  explorerModelTabs: [],
  explorerActiveModelName: null,

  // --- Per-Model State ---
  explorerModelStates: {},

  // --- Chart State ---
  explorerChartName: null,
  explorerChartLayout: {},
  explorerChartInsightNames: [],
  explorerActiveInsightName: null,

  // --- Per-Insight State ---
  explorerInsightStates: {},

  // --- DuckDB (shared, operates on active model) ---
  explorerDuckDBLoading: false,
  explorerDuckDBError: null,
  explorerFailedComputedColumns: {},

  // --- Sources ---
  explorerSources: [],

  // --- UI State ---
  explorerLeftNavCollapsed: false,
  explorerCenterMode: 'split',
  explorerEditorChartSplit: 0.5,
  explorerTopBottomSplit: 0.5,
  explorerProfileColumn: null,
  explorerIsEditorCollapsed: false,

  // ====================================================================
  // Model Tab Actions
  // ====================================================================

  createModelTab: (name) => {
    const state = get();
    const baseName = name || 'model';
    const uniqueName = generateUniqueName(baseName, state.explorerModelTabs);

    set({
      explorerModelTabs: [...state.explorerModelTabs, uniqueName],
      explorerActiveModelName: uniqueName,
      explorerModelStates: {
        ...state.explorerModelStates,
        [uniqueName]: createEmptyModelState(true),
      },
    });
  },

  switchModelTab: (modelName) => {
    set({ explorerActiveModelName: modelName });
  },

  closeModelTab: (modelName) => {
    const state = get();
    const newTabs = state.explorerModelTabs.filter((t) => t !== modelName);
    const { [modelName]: _, ...restStates } = state.explorerModelStates;

    let newActive = state.explorerActiveModelName;
    if (newActive === modelName) {
      newActive = newTabs.length > 0 ? newTabs[0] : null;
    }

    set({
      explorerModelTabs: newTabs,
      explorerModelStates: restStates,
      explorerActiveModelName: newActive,
    });
  },

  renameModelTab: (oldName, newName) => {
    const state = get();
    const modelState = state.explorerModelStates[oldName];
    if (!modelState || !modelState.isNew) return;
    if (state.explorerModelTabs.includes(newName)) return; // prevent collision

    const newTabs = state.explorerModelTabs.map((t) => (t === oldName ? newName : t));
    const { [oldName]: oldState, ...restStates } = state.explorerModelStates;

    // Update active model name if it was the renamed tab
    const newActive = state.explorerActiveModelName === oldName ? newName : state.explorerActiveModelName;

    // Propagate rename through all insight states
    const newInsightStates = {};
    for (const [insightName, insightState] of Object.entries(state.explorerInsightStates)) {
      newInsightStates[insightName] = {
        ...insightState,
        props: replaceRefsInObject(insightState.props, oldName, newName),
        interactions: insightState.interactions.map((interaction) => ({
          ...interaction,
          value:
            typeof interaction.value === 'string'
              ? replaceRefInString(interaction.value, oldName, newName)
              : interaction.value,
        })),
        typePropsCache: Object.fromEntries(
          Object.entries(insightState.typePropsCache || {}).map(([typeName, cachedProps]) => [
            typeName,
            replaceRefsInObject(cachedProps, oldName, newName),
          ])
        ),
      };
    }

    set({
      explorerModelTabs: newTabs,
      explorerModelStates: { ...restStates, [newName]: oldState },
      explorerActiveModelName: newActive,
      explorerInsightStates: newInsightStates,
    });
  },

  // ====================================================================
  // Active Model Convenience Actions
  // ====================================================================

  setActiveModelSql: (sql) => {
    const state = get();
    const name = state.explorerActiveModelName;
    if (!name || !state.explorerModelStates[name]) return;

    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [name]: { ...state.explorerModelStates[name], sql },
      },
    });
  },

  setActiveModelSource: (sourceName) => {
    const state = get();
    const name = state.explorerActiveModelName;
    if (!name || !state.explorerModelStates[name]) return;

    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [name]: { ...state.explorerModelStates[name], sourceName },
      },
    });
  },

  setActiveModelQueryResult: (result) => {
    const state = get();
    const name = state.explorerActiveModelName;
    if (!name || !state.explorerModelStates[name]) return;

    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [name]: {
          ...state.explorerModelStates[name],
          queryResult: result,
          queryError: null,
          enrichedResult: null,
        },
      },
      explorerDuckDBError: null,
      explorerProfileColumn: null,
    });
  },

  setActiveModelQueryError: (error) => {
    const state = get();
    const name = state.explorerActiveModelName;
    if (!name || !state.explorerModelStates[name]) return;

    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [name]: { ...state.explorerModelStates[name], queryError: error },
      },
    });
  },

  addActiveModelComputedColumn: (col) => {
    const state = get();
    const name = state.explorerActiveModelName;
    if (!name || !state.explorerModelStates[name]) return;

    const modelState = state.explorerModelStates[name];
    const exists = modelState.computedColumns.some((c) => c.name === col.name);
    if (exists) return;

    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [name]: {
          ...modelState,
          computedColumns: [...modelState.computedColumns, col],
        },
      },
    });
  },

  updateActiveModelComputedColumn: (colName, updates) => {
    const state = get();
    const name = state.explorerActiveModelName;
    if (!name || !state.explorerModelStates[name]) return;

    const modelState = state.explorerModelStates[name];
    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [name]: {
          ...modelState,
          computedColumns: modelState.computedColumns.map((c) =>
            c.name === colName ? { ...c, ...updates } : c
          ),
          enrichedResult: null,
        },
      },
    });
  },

  removeActiveModelComputedColumn: (colName) => {
    const state = get();
    const name = state.explorerActiveModelName;
    if (!name || !state.explorerModelStates[name]) return;

    const modelState = state.explorerModelStates[name];
    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [name]: {
          ...modelState,
          computedColumns: modelState.computedColumns.filter((c) => c.name !== colName),
          enrichedResult: null,
        },
      },
      explorerFailedComputedColumns: {},
    });
  },

  setActiveModelEnrichedResult: (result) => {
    const state = get();
    const name = state.explorerActiveModelName;
    if (!name || !state.explorerModelStates[name]) return;

    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [name]: { ...state.explorerModelStates[name], enrichedResult: result },
      },
    });
  },

  // ====================================================================
  // Insight Actions
  // ====================================================================

  createInsight: (name) => {
    const state = get();
    const baseName = name || 'insight';
    const uniqueName = generateUniqueName(baseName, Object.keys(state.explorerInsightStates));

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [uniqueName]: {
          type: 'scatter',
          props: {},
          interactions: [],
          typePropsCache: {},
          isNew: true,
        },
      },
      explorerChartInsightNames: [...state.explorerChartInsightNames, uniqueName],
      explorerActiveInsightName: uniqueName,
    });
  },

  removeInsightFromChart: (insightName) => {
    const state = get();
    const newChartInsights = state.explorerChartInsightNames.filter((n) => n !== insightName);

    let newActive = state.explorerActiveInsightName;
    if (newActive === insightName) {
      newActive = newChartInsights.length > 0 ? newChartInsights[0] : null;
    }

    set({
      explorerChartInsightNames: newChartInsights,
      explorerActiveInsightName: newActive,
    });
  },

  setActiveInsight: (insightName) => {
    set({ explorerActiveInsightName: insightName });
  },

  setInsightType: (insightName, type) => {
    const state = get();
    const insight = state.explorerInsightStates[insightName];
    if (!insight) return;

    const oldType = insight.type;
    const oldProps = { ...insight.props };

    // Cache current props under the old type
    const updatedCache = {
      ...(insight.typePropsCache || {}),
      [oldType]: oldProps,
    };

    // Restore cached props for the new type, or start fresh
    const restoredProps = updatedCache[type] || {};

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [insightName]: {
          ...insight,
          type,
          props: restoredProps,
          typePropsCache: updatedCache,
        },
      },
    });
  },

  setInsightProp: (insightName, path, value) => {
    const state = get();
    const insight = state.explorerInsightStates[insightName];
    if (!insight) return;

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [insightName]: {
          ...insight,
          props: { ...insight.props, [path]: value },
        },
      },
    });
  },

  removeInsightProp: (insightName, path) => {
    const state = get();
    const insight = state.explorerInsightStates[insightName];
    if (!insight) return;

    const { [path]: _, ...restProps } = insight.props;

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [insightName]: {
          ...insight,
          props: restProps,
        },
      },
    });
  },

  addInsightInteraction: (insightName, interaction) => {
    const state = get();
    const insight = state.explorerInsightStates[insightName];
    if (!insight) return;

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [insightName]: {
          ...insight,
          interactions: [...insight.interactions, interaction],
        },
      },
    });
  },

  removeInsightInteraction: (insightName, index) => {
    const state = get();
    const insight = state.explorerInsightStates[insightName];
    if (!insight) return;

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [insightName]: {
          ...insight,
          interactions: insight.interactions.filter((_, i) => i !== index),
        },
      },
    });
  },

  // ====================================================================
  // Chart Actions
  // ====================================================================

  setChartName: (name) => {
    set({ explorerChartName: name });
  },

  setChartLayout: (updates) => {
    set((state) => ({
      explorerChartLayout: { ...state.explorerChartLayout, ...updates },
    }));
  },

  reorderChartInsights: (orderedNames) => {
    set({ explorerChartInsightNames: orderedNames });
  },

  // ====================================================================
  // Loading Actions
  // ====================================================================

  loadModel: (modelObject) => {
    if (!modelObject?.config) return;

    const state = get();
    const modelName = modelObject.name;

    // If model already loaded, just switch to it
    if (state.explorerModelTabs.includes(modelName)) {
      set({ explorerActiveModelName: modelName });
      return;
    }

    const modelState = buildModelStateFromObject(modelObject, state);

    set({
      explorerModelTabs: [...state.explorerModelTabs, modelName],
      explorerActiveModelName: modelName,
      explorerModelStates: {
        ...state.explorerModelStates,
        [modelName]: modelState,
      },
    });

    // Auto-load pre-existing parquet data if available
    import('../api/modelData')
      .then(({ fetchModelData }) => {
        fetchModelData(modelName)
          .then((data) => {
            if (data.available && data.rows?.length > 0) {
              const currentState = get();
              if (currentState.explorerModelStates[modelName]) {
                set({
                  explorerModelStates: {
                    ...currentState.explorerModelStates,
                    [modelName]: {
                      ...currentState.explorerModelStates[modelName],
                      queryResult: {
                        columns: data.columns,
                        rows: data.rows,
                        row_count: data.row_count,
                        truncated: data.truncated || false,
                      },
                      queryError: null,
                    },
                  },
                });
              }
            }
          })
          .catch(() => {});
      })
      .catch(() => {});
  },

  loadChart: (chartObject, insightObjects, modelObjects) => {
    const state = get();

    // Build model tabs and states using local variables (never mutate state directly)
    let newTabs = [...state.explorerModelTabs];
    let newModelStates = { ...state.explorerModelStates };
    const loadedModels = new Set();

    for (const model of modelObjects) {
      if (!loadedModels.has(model.name) && model.config) {
        const modelName = model.name;
        if (!newTabs.includes(modelName)) {
          const modelState = buildModelStateFromObject(model, state);
          newTabs = [...newTabs, modelName];
          newModelStates = { ...newModelStates, [modelName]: modelState };
        }
        loadedModels.add(model.name);
      }
    }

    // Build insight states (replace, not merge, to avoid orphans from previous charts)
    const insightStates = {};
    const insightNames = [];
    for (const insight of insightObjects) {
      insightNames.push(insight.name);
      insightStates[insight.name] = {
        type: insight.config?.type || 'scatter',
        props: insight.config?.props ? { ...insight.config.props } : {},
        interactions: insight.config?.interactions
          ? insight.config.interactions.map((i) => ({ ...i }))
          : [],
        typePropsCache: {},
        isNew: false,
      };
    }

    set({
      explorerModelTabs: newTabs,
      explorerModelStates: newModelStates,
      explorerActiveModelName: newTabs.length > 0 ? newTabs[0] : null,
      explorerChartName: chartObject.name,
      explorerChartLayout: chartObject.config?.layout ? { ...chartObject.config.layout } : {},
      explorerChartInsightNames: insightNames,
      explorerInsightStates: insightStates,
      explorerActiveInsightName: insightNames.length > 0 ? insightNames[0] : null,
    });

    // Auto-load parquet data for each model
    for (const modelName of loadedModels) {
      import('../api/modelData')
        .then(({ fetchModelData }) => {
          fetchModelData(modelName)
            .then((data) => {
              if (data.available && data.rows?.length > 0) {
                const currentState = get();
                if (currentState.explorerModelStates[modelName]) {
                  set({
                    explorerModelStates: {
                      ...currentState.explorerModelStates,
                      [modelName]: {
                        ...currentState.explorerModelStates[modelName],
                        queryResult: {
                          columns: data.columns,
                          rows: data.rows,
                          row_count: data.row_count,
                          truncated: data.truncated || false,
                        },
                        queryError: null,
                      },
                    },
                  });
                }
              }
            })
            .catch(() => {});
        })
        .catch(() => {});
    }
  },

  handleTableSelect: ({ sourceName, table }) => {
    const state = get();
    const sql = `SELECT * FROM "${table}"`;

    // Create a model tab if none exists
    if (!state.explorerActiveModelName) {
      const uniqueName = generateUniqueName('model', state.explorerModelTabs);
      set({
        explorerModelTabs: [...state.explorerModelTabs, uniqueName],
        explorerActiveModelName: uniqueName,
        explorerModelStates: {
          ...state.explorerModelStates,
          [uniqueName]: {
            ...createEmptyModelState(true),
            sql,
            sourceName: sourceName || null,
          },
        },
        explorerIsEditorCollapsed: false,
      });
      return;
    }

    const name = state.explorerActiveModelName;
    const modelState = state.explorerModelStates[name];
    if (!modelState) return;

    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [name]: {
          ...modelState,
          sql,
          sourceName: sourceName || modelState.sourceName,
        },
      },
      explorerIsEditorCollapsed: false,
    });
  },

  // ====================================================================
  // Save-Related Helpers
  // ====================================================================

  getModifiedObjects: () => {
    const state = get();

    const newModels = [];
    const modifiedModels = [];
    for (const [name, modelState] of Object.entries(state.explorerModelStates)) {
      if (modelState.isNew) {
        newModels.push(name);
      } else {
        modifiedModels.push(name);
      }
    }

    const newInsights = [];
    const modifiedInsights = [];
    for (const [name, insightState] of Object.entries(state.explorerInsightStates)) {
      if (insightState.isNew) {
        newInsights.push(name);
      } else {
        modifiedInsights.push(name);
      }
    }

    return {
      newModels,
      modifiedModels,
      newInsights,
      modifiedInsights,
      chartName: state.explorerChartName,
    };
  },

  // ====================================================================
  // DuckDB Actions
  // ====================================================================

  setExplorerDuckDBLoading: (loading) => {
    set({ explorerDuckDBLoading: loading });
  },

  setExplorerDuckDBError: (error) => {
    set({ explorerDuckDBError: error });
  },

  setExplorerFailedComputedColumns: (failedMap) => {
    set({ explorerFailedComputedColumns: failedMap });
  },

  // ====================================================================
  // UI Actions
  // ====================================================================

  setExplorerSources: (sources) => {
    set({ explorerSources: sources });
  },

  toggleExplorerLeftNavCollapsed: () => {
    set((state) => ({ explorerLeftNavCollapsed: !state.explorerLeftNavCollapsed }));
  },

  setExplorerCenterMode: (mode) => {
    set({ explorerCenterMode: mode });
  },

  setExplorerProfileColumn: (column) => {
    set({ explorerProfileColumn: column });
  },

  toggleExplorerEditorCollapsed: () => {
    set((state) => ({ explorerIsEditorCollapsed: !state.explorerIsEditorCollapsed }));
  },

  // ====================================================================
  // Backward-Compatible Shims (old single-model API)
  //
  // These delegate to the new multi-model API so existing components
  // continue to work during the migration. They operate on the active
  // model and provide the old flat-key interface.
  // ====================================================================

  // --- Old state keys (computed getters aren't possible in Zustand slices,
  //     so we keep these as real state that gets synced) ---
  explorerSourceName: null,
  explorerSql: '',
  explorerQueryResult: null,
  explorerQueryError: null,
  explorerInsightConfig: { name: '', props: { type: 'scatter' } },
  explorerComputedColumns: [],
  explorerEnrichedResult: null,
  explorerModelEditMode: null,
  explorerEditStack: [],

  // --- Old actions that delegate to the new API (merged into single set() calls) ---
  setExplorerSourceName: (sourceName) => {
    const state = get();
    const name = state.explorerActiveModelName;
    const updates = { explorerSourceName: sourceName };
    if (name && state.explorerModelStates[name]) {
      updates.explorerModelStates = {
        ...state.explorerModelStates,
        [name]: { ...state.explorerModelStates[name], sourceName },
      };
    }
    set(updates);
  },

  setExplorerSql: (sql) => {
    const state = get();
    const name = state.explorerActiveModelName;
    const updates = { explorerSql: sql };
    if (name && state.explorerModelStates[name]) {
      updates.explorerModelStates = {
        ...state.explorerModelStates,
        [name]: { ...state.explorerModelStates[name], sql },
      };
    }
    set(updates);
  },

  setExplorerQueryResult: (result) => {
    const state = get();
    const name = state.explorerActiveModelName;
    const updates = {
      explorerQueryResult: result,
      explorerQueryError: null,
      explorerProfileColumn: null,
      explorerEnrichedResult: null,
      explorerDuckDBError: null,
    };
    if (name && state.explorerModelStates[name]) {
      updates.explorerModelStates = {
        ...state.explorerModelStates,
        [name]: {
          ...state.explorerModelStates[name],
          queryResult: result,
          queryError: null,
          enrichedResult: null,
        },
      };
    }
    set(updates);
  },

  setExplorerQueryError: (error) => {
    const state = get();
    const name = state.explorerActiveModelName;
    const updates = { explorerQueryError: error };
    if (name && state.explorerModelStates[name]) {
      updates.explorerModelStates = {
        ...state.explorerModelStates,
        [name]: { ...state.explorerModelStates[name], queryError: error },
      };
    }
    set(updates);
  },

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

  handleExplorerTableSelect: ({ sourceName, table }) => {
    const tableRef = `SELECT * FROM "${table}"`;
    const currentSql = get().explorerSql;
    const newSql = currentSql.trim() ? `${currentSql}\n${tableRef}` : tableRef;

    set({
      explorerSql: newSql,
      explorerSourceName: sourceName || get().explorerSourceName,
      explorerIsEditorCollapsed: false,
    });
  },

  handleExplorerModelUse: (model) => {
    if (!model?.config) return;

    const sql = model.config.sql || model.config.query || '';

    let extractedSourceName = null;
    const rawSource = model.config.source;
    if (typeof rawSource === 'string') {
      const refMatch = rawSource.match(/ref\(([^)]+)\)/);
      extractedSourceName = refMatch ? refMatch[1].trim() : rawSource;
    }

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

    const resolvedSourceName = matchedSourceName || extractedSourceName;
    let sourceDialect = null;
    if (resolvedSourceName) {
      const dialectHints = [
        'duckdb', 'postgres', 'postgresql', 'mysql',
        'sqlite', 'snowflake', 'bigquery', 'redshift',
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

  syncPlotlyEditsToChartLayout: (layoutUpdates) => {
    set((state) => ({
      explorerChartLayout: { ...state.explorerChartLayout, ...layoutUpdates },
    }));
  },

  setExplorerEnrichedResult: (result) => {
    const state = get();
    const name = state.explorerActiveModelName;
    const updates = { explorerEnrichedResult: result };
    if (name && state.explorerModelStates[name]) {
      updates.explorerModelStates = {
        ...state.explorerModelStates,
        [name]: { ...state.explorerModelStates[name], enrichedResult: result },
      };
    }
    set(updates);
  },

  addExplorerComputedColumn: (col) => {
    const state = get();
    const name = state.explorerActiveModelName;
    const exists = state.explorerComputedColumns.some((c) => c.name === col.name);
    if (exists) return;
    const updates = { explorerComputedColumns: [...state.explorerComputedColumns, col] };
    if (name && state.explorerModelStates[name]) {
      const modelState = state.explorerModelStates[name];
      const modelExists = modelState.computedColumns.some((c) => c.name === col.name);
      if (!modelExists) {
        updates.explorerModelStates = {
          ...state.explorerModelStates,
          [name]: { ...modelState, computedColumns: [...modelState.computedColumns, col] },
        };
      }
    }
    set(updates);
  },

  updateExplorerComputedColumn: (name, updates) => {
    const state = get();
    const modelName = state.explorerActiveModelName;
    const stateUpdates = {
      explorerComputedColumns: state.explorerComputedColumns.map((c) =>
        c.name === name ? { ...c, ...updates } : c
      ),
      explorerEnrichedResult: null,
    };
    if (modelName && state.explorerModelStates[modelName]) {
      const modelState = state.explorerModelStates[modelName];
      stateUpdates.explorerModelStates = {
        ...state.explorerModelStates,
        [modelName]: {
          ...modelState,
          computedColumns: modelState.computedColumns.map((c) =>
            c.name === name ? { ...c, ...updates } : c
          ),
          enrichedResult: null,
        },
      };
    }
    set(stateUpdates);
  },

  removeExplorerComputedColumn: (name) => {
    const state = get();
    const modelName = state.explorerActiveModelName;
    const stateUpdates = {
      explorerComputedColumns: state.explorerComputedColumns.filter((c) => c.name !== name),
      explorerEnrichedResult: null,
      explorerFailedComputedColumns: {},
    };
    if (modelName && state.explorerModelStates[modelName]) {
      const modelState = state.explorerModelStates[modelName];
      stateUpdates.explorerModelStates = {
        ...state.explorerModelStates,
        [modelName]: {
          ...modelState,
          computedColumns: modelState.computedColumns.filter((c) => c.name !== name),
          enrichedResult: null,
        },
      };
    }
    set(stateUpdates);
  },

  clearExplorerComputedColumns: () => {
    set({
      explorerComputedColumns: [],
      explorerEnrichedResult: null,
      explorerFailedComputedColumns: {},
    });
  },

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
});

export default createExplorerNewSlice;
