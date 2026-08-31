import { fetchModelColumnNames } from '../api/modelSchema';
import { generateUniqueName } from '../utils/uniqueName';
import { createRow } from '../components/views/workspace/itemMutations';

/**
 * Inline-create Store Slice
 *
 * One shared "create a new <type>" flow for the Workspace (Library "+ New X"
 * buttons, the Library header "+ New" menu, and the Project Editor's "+ New
 * Dashboard" CTA). No modals: each type drafts a MINIMAL VALID config into
 * the backend draft cache through that type's existing save action, then the
 * caller opens the object as a workspace tab so the right-rail Edit form is
 * the editing surface.
 *
 * The templates were validated against the live save endpoints — each is the
 * smallest config the backend's Pydantic model accepts.
 *
 * `config` receives the store state, because one type cannot be templated from
 * a constant: a `relation`'s condition must reference TWO REAL models (the
 * backend's `validate_condition_has_models`), so its draft is built from the
 * project's own models. Every other template ignores the argument.
 *
 * Dimension/metric names use underscores — the backend rejects dashes for
 * semantic-layer names (they must be valid SQL identifiers).
 */

/**
 * Two model names to seed a relation's condition with, oldest-first so the
 * choice is stable rather than dependent on fetch order. Returns null when the
 * project has fewer than two models — there is no valid relation to draft, and
 * the caller says so instead of failing at the backend.
 */
const firstTwoModelNames = state => {
  const names = (state.models || []).map(m => m?.name).filter(Boolean);
  return names.length >= 2 ? [names[0], names[1]] : null;
};

/**
 * The model a project-level metric/dimension is drafted against, or null when
 * the project has none.
 *
 * A project-level field reaches a source only by naming a model in its
 * expression — nesting it inside a model is the other way, and that is a
 * different object. So a scaffold like `count(*)` is not "a draft to fill in",
 * it is a field that can never resolve: the project stops parsing on commit and
 * every metric and dimension disappears from the editor.
 */
const firstModelName = state =>
  (state.models || []).map(m => m?.name).find(Boolean) || null;

/** Why a project-level metric/dimension can't be drafted with no models yet. */
const needsAModel = kind =>
  `A ${kind} references a model, and this project has none yet. Create a model first.`;

/**
 * A real column on `modelName`, inferred server-side (SQLGlot against the
 * source's cached schema — no query, no run required).
 *
 * The scaffolds used to hardcode `id`. Most models don't have one, so "+ New
 * Metric" produced `count(${ref(orders).id})` against a column that isn't
 * there: valid to the parser, broken the moment it runs, and the user had no
 * reason to suspect the column rather than their own edit. Guess the model —
 * that is a starting point with a name attached — but never the column.
 *
 * @returns {Promise<string|null>} null when the columns can't be determined,
 *   which the caller turns into a refusal rather than a fabricated reference.
 */
const firstColumnOf = async (state, modelName) => {
  if (!modelName) return null;
  try {
    const columns = await fetchModelColumnNames(modelName, { projectId: state.project?.id });
    return columns?.[0] || null;
  } catch {
    return null;
  }
};

/** Why a draft can't be built when a model's columns are unknown. */
const unknownColumns = modelName =>
  `Could not read any columns from model '${modelName}', so there is nothing to reference yet. ` +
  `Check the model's SQL and its source connection.`;

export const CREATE_TEMPLATES = {
  dashboard: {
    namePrefix: 'new-dashboard',
    collectionKey: 'dashboards',
    saveKey: 'saveDashboard',
    // VIS-1231: starts with ONE row, not zero. An empty dashboard can't accept
    // a drag (there is no row to drop into), so a brand-new one landed the user
    // on a canvas whose only useful action was "add a row" — the row is a
    // prerequisite, not a choice. Born valid: one row holding one empty slot,
    // which is also a live drop target (VIS-989).
    config: () => ({ rows: [createRow()] }),
  },
  chart: {
    namePrefix: 'new-chart',
    collectionKey: 'charts',
    saveKey: 'saveChart',
    config: () => ({ insights: [] }),
  },
  table: {
    namePrefix: 'new-table',
    collectionKey: 'tables',
    saveKey: 'saveTable',
    config: () => ({ columns: [] }),
  },
  markdown: {
    namePrefix: 'new-markdown',
    collectionKey: 'markdowns',
    saveKey: 'saveMarkdown',
    config: () => ({ content: '# New markdown\n' }),
  },
  input: {
    namePrefix: 'new-input',
    collectionKey: 'inputs',
    saveKey: 'saveInput',
    config: () => ({ type: 'single-select', options: ['Option 1', 'Option 2'] }),
  },
  insight: {
    namePrefix: 'new-insight',
    collectionKey: 'insights',
    saveKey: 'saveInsight',
    config: () => ({ props: { type: 'scatter' } }),
  },
  model: {
    namePrefix: 'new-model',
    collectionKey: 'models',
    saveKey: 'saveModel',
    config: () => ({ sql: 'SELECT 1' }),
  },
  source: {
    namePrefix: 'new-source',
    collectionKey: 'sources',
    saveKey: 'saveSource',
    config: () => ({ type: 'sqlite', database: 'new-source.db' }),
  },
  dimension: {
    namePrefix: 'new_dimension',
    collectionKey: 'dimensions',
    saveKey: 'saveDimension',
    // Declared, not inferred: the backend rejects a dash in a dimension name,
    // and a user-named dimension (`region`) carries no separator to infer from.
    nameSeparator: '_',
    requires: state => (firstModelName(state) ? null : needsAModel('dimension')),
    config: async state => {
      const model = firstModelName(state);
      const column = await firstColumnOf(state, model);
      if (!column) throw new Error(unknownColumns(model));
      // eslint-disable-next-line no-template-curly-in-string
      return { expression: `\${ref(${model}).${column}}` };
    },
  },
  metric: {
    namePrefix: 'new_metric',
    collectionKey: 'metrics',
    saveKey: 'saveMetric',
    nameSeparator: '_',
    requires: state => (firstModelName(state) ? null : needsAModel('metric')),
    config: async state => {
      const model = firstModelName(state);
      const column = await firstColumnOf(state, model);
      if (!column) throw new Error(unknownColumns(model));
      // eslint-disable-next-line no-template-curly-in-string
      return { expression: `count(\${ref(${model}).${column}})` };
    },
  },
  relation: {
    namePrefix: 'new_relation',
    collectionKey: 'relations',
    saveKey: 'saveRelation',
    // Seeded with the project's first two models joined on a REAL column from
    // each — a starting point the user re-points in the edit panel, exactly
    // like every other "+ New" draft. Which columns to join on is a guess; that
    // the columns and models EXIST is not.
    requires: state =>
      firstTwoModelNames(state)
        ? null
        : 'A relation joins two models, and this project has fewer than two. Create another model first.',
    config: async state => {
      const [left, right] = firstTwoModelNames(state);
      const [leftColumn, rightColumn] = await Promise.all([
        firstColumnOf(state, left),
        firstColumnOf(state, right),
      ]);
      if (!leftColumn) throw new Error(unknownColumns(left));
      if (!rightColumn) throw new Error(unknownColumns(right));
      return {
        join_type: 'inner',
        // eslint-disable-next-line no-template-curly-in-string
        condition: `\${ref(${left}).${leftColumn}} = \${ref(${right}).${rightColumn}}`,
      };
    },
  },
};

/**
 * Why `type` cannot be drafted right now, or null when it can.
 *
 * The same predicate `createWorkspaceObject` enforces, exposed so the UI can
 * ask BEFORE the click. A "+ New" item that looks live and then fails is a
 * worse answer than one that shows, disabled, with the reason on hover — the
 * user learns what the project is missing instead of what the backend rejected.
 *
 * Pure and synchronous, so a component can call it during render.
 *
 * @param {object} state the store state (`useStore.getState()`, or the value
 *   a `useStore(s => …)` selector is given)
 * @param {string} type one of CREATE_TEMPLATES' keys
 * @returns {string|null}
 */
export const createBlockedReason = (state, type) => {
  const template = CREATE_TEMPLATES[type];
  if (!template || !template.requires) return null;
  return template.requires(state) || null;
};

const createInlineCreateSlice = (set, get) => ({
  /**
   * Draft a new object of `type` with a unique name and a minimal valid
   * config. Returns `{ success, name, type }` on success so the caller can
   * open the new object as a workspace tab; `{ success: false, error }`
   * otherwise. The per-type save action refreshes its collection and the
   * pending-changes state, so the Library and TopBar update live.
   */
  createWorkspaceObject: async type => {
    const template = CREATE_TEMPLATES[type];
    if (!template) {
      return { success: false, error: `No inline-create template for type "${type}"` };
    }
    const save = get()[template.saveKey];
    if (typeof save !== 'function') {
      return { success: false, error: `${template.saveKey} unavailable` };
    }
    // A type whose draft depends on other objects existing (relation → two
    // models) reports WHY it can't be drafted, rather than posting a config
    // the backend will reject with a validator message.
    const blocked = createBlockedReason(get(), type);
    if (blocked) {
      return { success: false, error: blocked };
    }
    const existing = (get()[template.collectionKey] || []).map(o => o.name);
    const name = generateUniqueName(template.namePrefix, existing, {
      separator: template.nameSeparator,
    });
    // A template that cannot build a valid draft THROWS with the reason (a
    // model whose columns can't be read). Report it the same way an unmet
    // precondition is reported, rather than letting it escape as an unhandled
    // rejection and look like the button did nothing.
    let config;
    try {
      config = await template.config(get());
    } catch (error) {
      return { success: false, error: error?.message || `Could not draft a new ${type}` };
    }
    const result = await save(name, config);
    return result?.success ? { ...result, name, type } : result;
  },
});

export default createInlineCreateSlice;
