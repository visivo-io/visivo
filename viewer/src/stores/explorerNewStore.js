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
 * Auto-load pre-existing parquet data for a model if available.
 */
const autoLoadModelData = (modelName, get, set) => {
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

  const sourceDialect = (() => {
    const source = (globalState.explorerSources || []).find(
      (src) => src.source_name === resolvedSourceName || src.name === resolvedSourceName
    );
    if (!source?.type) return null;
    const d = source.type.toLowerCase();
    return d === 'postgresql' ? 'postgres' : d;
  })();

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
    _originalSql: sql,
    _originalSourceName: resolvedSourceName,
    _originalComputedColumns: JSON.parse(JSON.stringify(computedCols)),
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

  return null;
};


// ====================================================================
// Selectors — derive values from the multi-model / multi-insight state
// ====================================================================

// Stable fallback references to avoid infinite re-render loops.
// Zustand's useSyncExternalStore requires getSnapshot to return the
// same reference when the underlying data hasn't changed.
const EMPTY_ARRAY = [];
const DEFAULT_INSIGHT_CONFIG = Object.freeze({ name: '', props: { type: 'scatter' } });

export const selectActiveModelState = (s) => {
  const name = s.explorerActiveModelName;
  return name ? s.explorerModelStates[name] : null;
};
export const selectActiveModelSql = (s) => selectActiveModelState(s)?.sql || '';
export const selectActiveModelSourceName = (s) => selectActiveModelState(s)?.sourceName || null;
export const selectActiveModelQueryResult = (s) => selectActiveModelState(s)?.queryResult || null;
export const selectActiveModelQueryError = (s) => selectActiveModelState(s)?.queryError || null;
export const selectActiveModelComputedColumns = (s) =>
  selectActiveModelState(s)?.computedColumns || EMPTY_ARRAY;
export const selectActiveModelEnrichedResult = (s) =>
  selectActiveModelState(s)?.enrichedResult || null;

export const selectActiveInsightConfig = (s) => {
  const name = s.explorerActiveInsightName;
  const insight = name ? s.explorerInsightStates[name] : null;
  if (!insight) return DEFAULT_INSIGHT_CONFIG;
  return { name, props: { type: insight.type, ...insight.props } };
};

export const selectModelStatus = (modelName) => (s) => {
  const state = s.explorerModelStates[modelName];
  if (!state) return null;
  if (state.isNew) return 'new';
  if (state.sql !== state._originalSql) return 'modified';
  if (state.sourceName !== state._originalSourceName) return 'modified';
  if (JSON.stringify(state.computedColumns) !== JSON.stringify(state._originalComputedColumns))
    return 'modified';
  return null;
};

export const selectInsightStatus = (insightName) => (s) => {
  const state = s.explorerInsightStates[insightName];
  if (!state) return null;
  if (state.isNew) return 'new';
  if (state.type !== state._originalType) return 'modified';
  if (JSON.stringify(state.props) !== JSON.stringify(state._originalProps)) return 'modified';
  return null;
};

export const selectHasModifications = (s) => {
  for (const state of Object.values(s.explorerModelStates || {})) {
    if (state.isNew) return true;
    if (state.sql !== state._originalSql) return true;
    if (state.sourceName !== state._originalSourceName) return true;
    if (JSON.stringify(state.computedColumns) !== JSON.stringify(state._originalComputedColumns))
      return true;
  }
  for (const state of Object.values(s.explorerInsightStates || {})) {
    if (state.isNew) return true;
    if (state.type !== state._originalType) return true;
    if (JSON.stringify(state.props) !== JSON.stringify(state._originalProps)) return true;
  }
  return false;
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
  explorerProfileColumn: null,
  explorerIsEditorCollapsed: false,

  // ====================================================================
  // Model Tab Actions
  // ====================================================================

  createModelTab: (name) => {
    const state = get();
    const baseName = name || 'model';
    const uniqueName = generateUniqueName(baseName, state.explorerModelTabs);
    const newModelState = createEmptyModelState(true);

    set({
      explorerModelTabs: [...state.explorerModelTabs, uniqueName],
      explorerActiveModelName: uniqueName,
      explorerModelStates: {
        ...state.explorerModelStates,
        [uniqueName]: newModelState,
      },
    });
  },

  switchModelTab: (modelName) => {
    set({
      explorerActiveModelName: modelName,
    });
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

  updateInsightInteraction: (insightName, index, updatedInteraction) => {
    const state = get();
    const insight = state.explorerInsightStates[insightName];
    if (!insight) return;

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [insightName]: {
          ...insight,
          interactions: insight.interactions.map((item, i) =>
            i === index ? { ...item, ...updatedInteraction } : item
          ),
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

  replaceChartLayout: (layout) => {
    set({ explorerChartLayout: layout });
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

    autoLoadModelData(modelName, get, set);
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
        _originalType: insight.config?.type || 'scatter',
        _originalProps: insight.config?.props ? { ...insight.config.props } : {},
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
      autoLoadModelData(modelName, get, set);
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
  // Standalone Utilities (not shims)
  // ====================================================================

  saveExplorerObjects: async () => {
    const state = get();
    const errors = [];

    // Save models
    for (const [name, ms] of Object.entries(state.explorerModelStates)) {
      if (
        !ms.isNew &&
        ms.sql === ms._originalSql &&
        ms.sourceName === ms._originalSourceName &&
        JSON.stringify(ms.computedColumns) === JSON.stringify(ms._originalComputedColumns)
      ) {
        continue;
      }
      try {
        const { saveModel } = await import('../api/models');
        await saveModel(name, {
          sql: ms.sql,
          source: ms.sourceName ? `ref(${ms.sourceName})` : undefined,
        });
      } catch (err) {
        errors.push({ name, type: 'model', error: err.message });
      }

      // Save computed columns as metrics/dimensions
      for (const cc of ms.computedColumns) {
        try {
          if (cc.type === 'metric') {
            const { saveMetric } = await import('../api/metrics');
            await saveMetric(cc.name, { expression: cc.expression, model: `ref(${name})` });
          } else {
            const { saveDimension } = await import('../api/dimensions');
            await saveDimension(cc.name, { expression: cc.expression, model: `ref(${name})` });
          }
        } catch (err) {
          errors.push({ name: cc.name, type: cc.type, error: err.message });
        }
      }
    }

    // Save insights
    for (const [name, is] of Object.entries(state.explorerInsightStates)) {
      if (
        !is.isNew &&
        is.type === is._originalType &&
        JSON.stringify(is.props) === JSON.stringify(is._originalProps)
      ) {
        continue;
      }
      try {
        const { saveInsight } = await import('../api/insights');
        const expandedProps = expandDotNotationProps(is.props);
        await saveInsight(name, {
          type: is.type,
          props: expandedProps,
          interactions: is.interactions,
        });
      } catch (err) {
        errors.push({ name, type: 'insight', error: err.message });
      }
    }

    // Save chart
    if (state.explorerChartName) {
      try {
        const { saveChart } = await import('../api/charts');
        await saveChart(state.explorerChartName, {
          insights: state.explorerChartInsightNames.map((n) => `ref(${n})`),
          layout: state.explorerChartLayout,
        });
      } catch (err) {
        errors.push({ name: state.explorerChartName, type: 'chart', error: err.message });
      }
    }

    // Post-save: mark all as published
    if (errors.length === 0) {
      const updatedModelStates = {};
      for (const [name, ms] of Object.entries(state.explorerModelStates)) {
        updatedModelStates[name] = {
          ...ms,
          isNew: false,
          _originalSql: ms.sql,
          _originalSourceName: ms.sourceName,
          _originalComputedColumns: JSON.parse(JSON.stringify(ms.computedColumns)),
        };
      }
      const updatedInsightStates = {};
      for (const [name, is] of Object.entries(state.explorerInsightStates)) {
        updatedInsightStates[name] = {
          ...is,
          isNew: false,
          _originalType: is.type,
          _originalProps: { ...is.props },
        };
      }
      set({
        explorerModelStates: updatedModelStates,
        explorerInsightStates: updatedInsightStates,
      });
    }

    return { success: errors.length === 0, errors };
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

});

export default createExplorerNewSlice;
