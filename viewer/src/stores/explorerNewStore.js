/* eslint-disable no-template-curly-in-string */
import { generateUniqueName } from '../utils/uniqueName';

/**
 * Thrown by create/rename actions when the proposed name collides with any
 * existing object (cached or context) across all object types. UI submit
 * handlers should catch this and surface the message inline.
 */
export class NameCollisionError extends Error {
  constructor(name, collisionType) {
    super(
      `Name "${name}" is already in use${
        collisionType ? ` by a ${collisionType}` : ''
      }. Choose a different name.`
    );
    this.name = 'NameCollisionError';
    this.code = 'NAME_COLLISION';
    this.collisionName = name;
    this.collisionType = collisionType;
  }
}

/**
 * Collect every object name the store knows about, across cached API
 * collections and explorer context working stores. Names are project-wide
 * unique because refs like `ref(foo)` are untyped — the DAG resolver cannot
 * distinguish a model named `foo` from a metric named `foo`.
 *
 * Returns a Map<name, type> so collision errors can surface which kind of
 * object the caller is colliding with.
 */
export const getAllKnownNames = (state) => {
  const known = new Map();
  const cachedCollections = [
    ['insight', state.insights],
    ['model', state.models],
    ['source', state.sources],
    ['chart', state.charts],
    ['input', state.inputs],
    ['metric', state.metrics],
    ['dimension', state.dimensions],
    ['relation', state.relations],
    ['table', state.tables],
    ['dashboard', state.dashboards],
  ];
  for (const [type, collection] of cachedCollections) {
    for (const obj of collection || []) {
      if (obj && obj.name && !known.has(obj.name)) known.set(obj.name, type);
    }
  }
  for (const name of Object.keys(state.explorerInsightStates || {})) {
    if (!known.has(name)) known.set(name, 'insight');
  }
  for (const name of Object.keys(state.explorerModelStates || {})) {
    if (!known.has(name)) known.set(name, 'model');
  }
  for (const name of state.explorerModelTabs || []) {
    if (!known.has(name)) known.set(name, 'model');
  }
  return known;
};

/**
 * Throws NameCollisionError if `name` is in use by any object, excluding the
 * entry identified by `excludingName` (used by rename flows to allow a no-op
 * rename-to-self).
 */
export const assertNameUnique = (state, name, { excludingName } = {}) => {
  if (!name) return;
  const known = getAllKnownNames(state);
  if (excludingName && known.has(excludingName)) {
    known.delete(excludingName);
  }
  if (known.has(name)) {
    throw new NameCollisionError(name, known.get(name));
  }
};

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

  // Source priority: model's explicit source > project default > first available
  const projectDefaultSource = globalState.defaults?.source_name || null;
  const firstAvailableSource = sources[0]?.source_name || null;
  const resolvedSourceName = matchedSource || extractedSourceName || projectDefaultSource || firstAvailableSource;

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
  };
};

/**
 * Transform an API insight object to UI state format.
 * Extracts type from config (handling both top-level and props-nested),
 * separates type from props, and converts interactions from API format
 * ({filter: "..."}) to UI format ({type: 'filter', value: '...'}).
 */
const transformInsightToUiState = (insight) => {
  const rawInteractions = insight.config?.interactions || [];
  const transformedInteractions = rawInteractions.map((i) => {
    const key = Object.keys(i).find((k) => ['filter', 'split', 'sort'].includes(k));
    if (key) return { type: key, value: i[key] };
    if (i.type && 'value' in i) return { ...i };
    return { type: 'filter', value: '' };
  });

  const insightType = insight.config?.type || insight.config?.props?.type || 'scatter';
  const { type: _propsType, ...propsWithoutType } = insight.config?.props || {};

  return {
    type: insightType,
    props: propsWithoutType,
    interactions: transformedInteractions,
    typePropsCache: {},
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
  return s.explorerDiffResult?.models?.[modelName] || null;
};

export const selectInsightStatus = (insightName) => (s) => {
  return s.explorerDiffResult?.insights?.[insightName] || null;
};

export const selectHasModifications = (s) => {
  // Brand-new local objects (isNew=true) may not appear in the backend diff
  // at all — the diff only tracks changes to objects the backend already
  // knows about. Always check the context store first so the save button
  // enables on fresh page load when an auto-created insight exists, even
  // after fetchExplorerDiff has hydrated explorerDiffResult.
  for (const state of Object.values(s.explorerModelStates || {})) {
    if (state.isNew && state.sql) return true;
  }
  for (const state of Object.values(s.explorerInsightStates || {})) {
    if (state.isNew) return true;
  }

  // Then check the diff result for modifications to existing cached objects.
  const diff = s.explorerDiffResult;
  if (!diff) return false;

  for (const category of ['models', 'insights', 'metrics', 'dimensions']) {
    const statuses = diff[category];
    if (statuses) {
      for (const status of Object.values(statuses)) {
        if (status) return true;
      }
    }
  }
  if (diff.chart) return true;

  return false;
};

/**
 * Derive input names by scanning interaction values and prop values for ref(inputName)
 * patterns — scoped to insights currently attached to the chart. Detached insights
 * keep their working copy in explorerInsightStates, but their inputs should not
 * leak into the toolbar.
 */
export const selectDerivedInputNames = (s) => {
  const inputNameSet = new Set((s.inputs || []).map((i) => i.name));
  if (inputNameSet.size === 0) return [];

  const chartInsightNames = s.explorerChartInsightNames || [];
  if (chartInsightNames.length === 0) return [];

  const insightStates = s.explorerInsightStates || {};
  const found = new Set();

  for (const insightName of chartInsightNames) {
    const insight = insightStates[insightName];
    if (!insight) continue;

    for (const interaction of insight.interactions || []) {
      if (typeof interaction.value === 'string') {
        const matches = interaction.value.matchAll(/ref\(([^.)]+)\)/g);
        for (const m of matches) {
          if (inputNameSet.has(m[1])) found.add(m[1]);
        }
      }
    }
    const scanProps = (obj) => {
      for (const val of Object.values(obj || {})) {
        if (typeof val === 'string') {
          const matches = val.matchAll(/ref\(([^.)]+)\)/g);
          for (const m of matches) {
            if (inputNameSet.has(m[1])) found.add(m[1]);
          }
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
          scanProps(val);
        }
      }
    };
    scanProps(insight.props);
  }

  return [...found];
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

  // --- Diff Result (from backend /api/explorer/diff/) ---
  explorerDiffResult: null,

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
    let finalName;
    if (name) {
      // User-supplied name — enforce cross-type uniqueness strictly.
      assertNameUnique(state, name);
      finalName = name;
    } else {
      // Auto-disambiguate against current tabs + working copies only. Users
      // rename before saving; cross-type collision against cached objects is
      // caught at save time by setChartName / saveExplorerObjects.
      const existing = new Set([
        ...state.explorerModelTabs,
        ...Object.keys(state.explorerModelStates || {}),
      ]);
      finalName = generateUniqueName('model', Array.from(existing));
    }

    // Default source priority: project defaults > first available source > null
    const projectDefaultSource = state.defaults?.source_name || null;
    const firstAvailableSource = (state.explorerSources || [])[0]?.source_name || null;
    const defaultSource = projectDefaultSource || firstAvailableSource;
    const newModelState = { ...createEmptyModelState(true), sourceName: defaultSource };

    set({
      explorerModelTabs: [...state.explorerModelTabs, finalName],
      explorerActiveModelName: finalName,
      explorerModelStates: {
        ...state.explorerModelStates,
        [finalName]: newModelState,
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

    let newActive = state.explorerActiveModelName;
    if (newActive === modelName) {
      newActive = newTabs.length > 0 ? newTabs[0] : null;
    }

    // Preserve explorerModelStates — the working copy outlives the tab. Insights
    // that reference this model continue to resolve via the context store overlay.
    // Explicit cleanup is the user's responsibility (reset button for modified,
    // delete for new) — tab close is a UI-only concept.
    set({
      explorerModelTabs: newTabs,
      explorerActiveModelName: newActive,
    });
  },

  renameModelTab: (oldName, newName) => {
    const state = get();
    const modelState = state.explorerModelStates[oldName];
    if (!modelState || !modelState.isNew) return;
    if (oldName === newName) return;

    // Throws NameCollisionError on cross-type collision — UI catches and shows inline.
    assertNameUnique(state, newName, { excludingName: oldName });

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
    let finalName;
    if (name) {
      // User-supplied name — enforce cross-type uniqueness strictly.
      assertNameUnique(state, name);
      finalName = name;
    } else {
      // No name provided (Add button click) — auto-disambiguate against
      // current explorer working copies only. Users rename before saving;
      // cross-type collision against cached objects is caught at save time.
      finalName = generateUniqueName('insight', Object.keys(state.explorerInsightStates));
    }

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [finalName]: {
          type: 'scatter',
          props: {},
          interactions: [],
          typePropsCache: {},
          isNew: true,
        },
      },
      explorerChartInsightNames: [...state.explorerChartInsightNames, finalName],
      explorerActiveInsightName: finalName,
    });
  },

  addExistingInsightToChart: (insightName) => {
    const state = get();

    // Duplicate: already on chart → just focus it
    if (state.explorerChartInsightNames.includes(insightName)) {
      set({ explorerActiveInsightName: insightName });
      return;
    }

    // Look up cached API insight
    const insight = (state.insights || []).find((i) => i.name === insightName);
    if (!insight) {
      // eslint-disable-next-line no-console
      console.warn(`addExistingInsightToChart: insight '${insightName}' not found in cache`);
      return;
    }

    const insightState = transformInsightToUiState(insight);

    // Resolve model dependencies from the insight config to auto-open tabs
    // for models the insight references. Input dependencies are handled by
    // selectDerivedInputNames dynamically, so no input-name tracking needed.
    const allInputNames = new Set((state.inputs || []).map((i) => i.name));
    const searchStr = JSON.stringify(insight.config || {});
    const matches = [...searchStr.matchAll(/ref\(([^.)]+)\)/g)];
    const modelNames = new Set();
    for (const match of matches) {
      const name = match[1];
      if (!allInputNames.has(name)) {
        modelNames.add(name);
      }
    }

    // Compute new model tabs and states (auto-load missing models)
    const existingTabs = new Set(state.explorerModelTabs);
    const newlyAddedModelNames = [];
    const newModelTabs = [...state.explorerModelTabs];
    const newModelStates = { ...state.explorerModelStates };
    for (const modelName of modelNames) {
      if (existingTabs.has(modelName)) continue;
      const modelObj = (state.models || []).find((m) => m.name === modelName);
      if (!modelObj) continue;
      newModelTabs.push(modelName);
      newModelStates[modelName] = buildModelStateFromObject(modelObj, state);
      newlyAddedModelNames.push(modelName);
    }

    set({
      explorerChartInsightNames: [...state.explorerChartInsightNames, insightName],
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [insightName]: insightState,
      },
      explorerActiveInsightName: insightName,
      explorerModelTabs: newModelTabs,
      explorerModelStates: newModelStates,
    });

    // Auto-load parquet data for newly added models
    for (const modelName of newlyAddedModelNames) {
      autoLoadModelData(modelName, get, set);
    }

    // Refresh diff status
    get().fetchExplorerDiff?.();
  },

  renameInsight: (oldName, newName) => {
    const state = get();
    const insightState = state.explorerInsightStates[oldName];
    if (!insightState || !insightState.isNew) return;
    if (oldName === newName) return;

    // Throws NameCollisionError on cross-type collision — UI catches and shows inline.
    assertNameUnique(state, newName, { excludingName: oldName });

    const { [oldName]: movedState, ...restStates } = state.explorerInsightStates;
    const newChartInsightNames = state.explorerChartInsightNames.map((n) =>
      n === oldName ? newName : n
    );
    const newActiveInsight =
      state.explorerActiveInsightName === oldName ? newName : state.explorerActiveInsightName;

    set({
      explorerInsightStates: { ...restStates, [newName]: movedState },
      explorerChartInsightNames: newChartInsightNames,
      explorerActiveInsightName: newActiveInsight,
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

  deleteExplorerInsight: (insightName) => {
    const state = get();
    const { [insightName]: _, ...restInsights } = state.explorerInsightStates;
    const newChartInsights = state.explorerChartInsightNames.filter((n) => n !== insightName);
    const newActive = state.explorerActiveInsightName === insightName
      ? (newChartInsights.length > 0 ? newChartInsights[0] : null)
      : state.explorerActiveInsightName;

    set({
      explorerInsightStates: restInsights,
      explorerChartInsightNames: newChartInsights,
      explorerActiveInsightName: newActive,
    });
  },

  resetModel: (modelName) => {
    const state = get();
    const ms = state.explorerModelStates[modelName];
    if (!ms || ms.isNew) return;

    // Restore from cached API object
    const cachedModel = (state.models || []).find((m) => m.name === modelName);
    if (!cachedModel) return;

    const config = cachedModel.config;
    const extractSourceName = (rawSource) => {
      if (typeof rawSource !== 'string') return null;
      const refMatch = rawSource.match(/ref\(([^)]+)\)/);
      return refMatch ? refMatch[1].trim() : rawSource;
    };

    set({
      explorerModelStates: {
        ...state.explorerModelStates,
        [modelName]: {
          ...ms,
          sql: config?.sql || ms.sql,
          sourceName: extractSourceName(config?.source) || ms.sourceName,
          computedColumns: JSON.parse(JSON.stringify(ms.computedColumns || [])),
          queryResult: null,
          enrichedResult: null,
          queryError: null,
        },
      },
    });
  },

  resetInsight: (insightName) => {
    const state = get();
    const is = state.explorerInsightStates[insightName];
    if (!is || is.isNew) return;

    // Restore from cached API object
    const cachedInsight = (state.insights || []).find((i) => i.name === insightName);
    if (!cachedInsight) return;

    const config = cachedInsight.config;
    const insightType = config?.props?.type || config?.type || 'scatter';
    const { type: _t, ...propsWithoutType } = config?.props || {};
    const interactions = (config?.interactions || []).map((i) => {
      const key = Object.keys(i).find((k) => ['filter', 'split', 'sort'].includes(k));
      return key ? { type: key, value: i[key] } : { type: 'filter', value: '' };
    });

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [insightName]: {
          ...is,
          type: insightType,
          props: propsWithoutType,
          interactions,
          typePropsCache: {},
        },
      },
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
    const cache = insight.typePropsCache || {};

    // Save full props under the old type key (for exact restoration when switching back)
    // Flatten ALL leaf string values (including nested like marker.color) into shared cache
    const shared = { ...(cache._shared || {}) };
    const flattenToShared = (obj, prefix = '') => {
      for (const [key, val] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (typeof val === 'string') {
          shared[path] = val;
        } else if (val && typeof val === 'object' && !Array.isArray(val)) {
          flattenToShared(val, path);
        }
      }
    };
    flattenToShared(insight.props);

    const updatedCache = {
      ...cache,
      [oldType]: { ...insight.props },
      _shared: shared,
    };

    // If switching to a previously visited type, restore its exact props
    // Otherwise start empty — InsightCRUDSection will restore shared flat values
    const restoredProps = updatedCache[type] ? { ...updatedCache[type] } : {};

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

  restorePropsFromCache: (insightName, allSchemaPropertyPaths) => {
    const state = get();
    const insight = state.explorerInsightStates[insightName];
    if (!insight?.typePropsCache?._shared) return;
    // Don't restore if props already have values (exact type restoration already ran)
    if (Object.keys(insight.props).length > 0) return;

    // allSchemaPropertyPaths includes ALL valid paths for the type
    const validSet = new Set(allSchemaPropertyPaths);
    let restored = {};
    for (const [key, val] of Object.entries(insight.typePropsCache._shared)) {
      if (validSet.has(key)) {
        // Build nested object structure from dot-notation keys
        // e.g., 'marker.color' → { marker: { color: val } }
        const keys = key.split('.');
        if (keys.length === 1) {
          restored[key] = val;
        } else {
          let current = restored;
          for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]] || typeof current[keys[i]] !== 'object') {
              current[keys[i]] = {};
            }
            current = current[keys[i]];
          }
          current[keys[keys.length - 1]] = val;
        }
      }
    }

    if (Object.keys(restored).length === 0) return;

    set({
      explorerInsightStates: {
        ...state.explorerInsightStates,
        [insightName]: {
          ...insight,
          props: { ...insight.props, ...restored },
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
          typePropsCache: { ...(insight.typePropsCache || {}), [path]: value },
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
    const state = get();
    // If the chart is already loaded (from cache), renaming would be a rename —
    // assert uniqueness excluding the current name. For a fresh/unsaved chart
    // (explorerChartName === null or matches a NEW chart), also assert uniqueness.
    if (name && name !== state.explorerChartName) {
      assertNameUnique(state, name, { excludingName: state.explorerChartName });
    }
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

  closeChart: () => {
    set({
      explorerChartName: null,
      explorerChartLayout: {},
      explorerChartInsightNames: [],
      explorerActiveInsightName: null,
      explorerInsightStates: {},
      explorerDiffResult: null,
    });
  },

  resetChart: () => {
    const state = get();
    const cachedChart = (state.charts || []).find((c) => c.name === state.explorerChartName);
    if (!cachedChart) return;

    const config = cachedChart.config;
    const insightRefs = config?.insights || [];
    const insightNames = insightRefs.map((ref) => {
      const match = typeof ref === 'string' ? ref.match(/ref\(([^)]+)\)/) : null;
      return match ? match[1].trim() : ref;
    });

    set({
      explorerChartLayout: config?.layout ? JSON.parse(JSON.stringify(config.layout)) : {},
      explorerChartInsightNames: insightNames,
      explorerActiveInsightName: insightNames.length > 0 ? insightNames[0] : null,
    });
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

    // Remove auto-created empty model tabs (isNew with no SQL) — they're clutter when loading a chart
    let newTabs = state.explorerModelTabs.filter((tabName) => {
      const ms = state.explorerModelStates[tabName];
      return !(ms && ms.isNew && !ms.sql);
    });
    let newModelStates = { ...state.explorerModelStates };
    for (const tabName of state.explorerModelTabs) {
      const ms = state.explorerModelStates[tabName];
      if (ms && ms.isNew && !ms.sql) {
        const { [tabName]: _, ...rest } = newModelStates;
        newModelStates = rest;
      }
    }
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
      insightStates[insight.name] = transformInsightToUiState(insight);
    }

    // Set active model to the first chart model (not the first tab overall)
    const firstChartModel = modelObjects.length > 0 ? modelObjects[0].name : null;
    const activeModel = firstChartModel && newTabs.includes(firstChartModel)
      ? firstChartModel
      : (newTabs.length > 0 ? newTabs[0] : null);

    set({
      explorerModelTabs: newTabs,
      explorerModelStates: newModelStates,
      explorerActiveModelName: activeModel,
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
      const uniqueName = generateUniqueName(
        'model',
        Array.from(
          new Set([
            ...state.explorerModelTabs,
            ...Object.keys(state.explorerModelStates || {}),
          ])
        )
      );
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
  // Backend Diff — Modification Tracking
  // ====================================================================

  fetchExplorerDiff: async () => {
    const state = get();
    const payload = {};

    // Build models payload — only send sql (source is project-level, not user-edited)
    const modelConfigs = {};
    for (const [name, ms] of Object.entries(state.explorerModelStates)) {
      if (!ms.sql) continue;
      modelConfigs[name] = { sql: ms.sql };
    }
    if (Object.keys(modelConfigs).length > 0) payload.models = modelConfigs;

    // Build insights payload
    const insightConfigs = {};
    for (const [name, is] of Object.entries(state.explorerInsightStates)) {
      const expandedProps = expandDotNotationProps(is.props);
      const backendInteractions = (is.interactions || [])
        .filter((i) => i.value)
        .map((i) => ({ [i.type]: i.value }));
      insightConfigs[name] = {
        props: { type: is.type, ...expandedProps },
        ...(backendInteractions.length > 0 ? { interactions: backendInteractions } : {}),
      };
    }
    if (Object.keys(insightConfigs).length > 0) payload.insights = insightConfigs;

    // Build chart payload
    if (state.explorerChartName) {
      payload.chart = {
        name: state.explorerChartName,
        insights: state.explorerChartInsightNames.map((n) => `ref(${n})`),
        layout: state.explorerChartLayout || {},
      };
    }

    // Build metrics/dimensions from computed columns, carrying the parent
    // model scope so the backend can nest them under the right model at
    // publish time.
    const metricConfigs = {};
    const dimensionConfigs = {};
    for (const [modelName, ms] of Object.entries(state.explorerModelStates)) {
      for (const cc of ms.computedColumns || []) {
        const entry = { expression: cc.expression, parentModel: modelName };
        if (cc.type === 'metric') metricConfigs[cc.name] = entry;
        else dimensionConfigs[cc.name] = entry;
      }
    }
    if (Object.keys(metricConfigs).length > 0) payload.metrics = metricConfigs;
    if (Object.keys(dimensionConfigs).length > 0) payload.dimensions = dimensionConfigs;

    try {
      const { fetchDiff } = await import('../api/explorer');
      const result = await fetchDiff(payload);
      set({ explorerDiffResult: result });
      return result;
    } catch (err) {
      set({ explorerDiffResult: null });
      return null;
    }
  },

  // ====================================================================
  // Standalone Utilities (not shims)
  // ====================================================================

  saveExplorerObjects: async () => {
    const state = get();
    const errors = [];

    // Save models and their model-scoped computed columns.
    //
    // The backend diff endpoint returns null for unchanged models, which
    // lets us skip an unchanged `saveModel` POST. BUT the user may have
    // added a brand-new computed column to an otherwise-unchanged model —
    // that column still needs to be saved (with parentModel set) so the
    // publish step nests it under the existing model in YAML. We therefore
    // check the diff for each computed column individually rather than
    // short-circuiting the whole model's iteration.
    const diff = state.explorerDiffResult || {};
    for (const [name, ms] of Object.entries(state.explorerModelStates)) {
      const modelChanged = !(diff.models && diff.models[name] === null);
      if (modelChanged && ms.sql) {
        try {
          const { saveModel } = await import('../api/models');
          await saveModel(name, {
            sql: ms.sql,
            source: ms.sourceName ? `ref(${ms.sourceName})` : undefined,
          });
        } catch (err) {
          errors.push({ name, type: 'model', error: err.message });
        }
      }

      // Save computed columns as metrics/dimensions, scoped to this model.
      // parentModel is consumed by the backend save endpoints to set the
      // Pydantic PrivateAttr `_parent_name` so ProjectWriter nests them
      // under the model on publish instead of writing to top-level lists.
      // Skip individual columns whose diff status is null (unchanged) to
      // avoid re-saving pre-existing metrics/dimensions on every save.
      for (const cc of ms.computedColumns) {
        const diffBucket = cc.type === 'metric' ? diff.metrics : diff.dimensions;
        if (diffBucket && diffBucket[cc.name] === null) continue;
        try {
          if (cc.type === 'metric') {
            const { saveMetric } = await import('../api/metrics');
            await saveMetric(cc.name, {
              expression: cc.expression,
              parentModel: name,
            });
          } else {
            const { saveDimension } = await import('../api/dimensions');
            await saveDimension(cc.name, {
              expression: cc.expression,
              parentModel: name,
            });
          }
        } catch (err) {
          errors.push({ name: cc.name, type: cc.type, error: err.message });
        }
      }
    }

    // Save insights
    for (const [name, is] of Object.entries(state.explorerInsightStates)) {
      // Skip unchanged insights (diff result is null)
      if (diff.insights && diff.insights[name] === null) continue;
      try {
        const { saveInsight } = await import('../api/insights');
        const expandedProps = expandDotNotationProps(is.props);
        const backendInteractions = (is.interactions || [])
          .filter((i) => i.value)
          .map((i) => ({ [i.type]: i.value }));
        await saveInsight(name, {
          props: { type: is.type, ...expandedProps },
          ...(backendInteractions.length > 0 ? { interactions: backendInteractions } : {}),
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

    // Post-save: refresh cached API stores so diff resolves to "unchanged"
    if (errors.length === 0) {
      // Mark all context objects as not new
      const updatedModelStates = {};
      for (const [name, ms] of Object.entries(state.explorerModelStates)) {
        updatedModelStates[name] = { ...ms, isNew: false };
      }
      const updatedInsightStates = {};
      for (const [name, is] of Object.entries(state.explorerInsightStates)) {
        updatedInsightStates[name] = { ...is, isNew: false };
      }
      set({
        explorerModelStates: updatedModelStates,
        explorerInsightStates: updatedInsightStates,
      });

      // Refresh cached API stores — this makes the diff return null (unchanged)
      // for all objects that were just saved
      try {
        await Promise.all([
          get().fetchInsights?.(),
          get().fetchModels?.(),
          get().fetchCharts?.(),
          get().fetchMetrics?.(),
          get().fetchDimensions?.(),
        ]);
        // Re-run diff to update status dots
        await get().fetchExplorerDiff();
        // Sync the TopNav Publish-button state: save just added draft
        // changes to the backend, so hasUnpublishedChanges should flip true
        // without forcing the user to refresh the page.
        await get().checkPublishStatus?.();
      } catch {
        // Cache refresh is best-effort — save already succeeded
      }
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
