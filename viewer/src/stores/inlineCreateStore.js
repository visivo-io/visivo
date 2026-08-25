import { generateUniqueName } from '../utils/uniqueName';

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
export const CREATE_TEMPLATES = {
  dashboard: {
    namePrefix: 'new-dashboard',
    collectionKey: 'dashboards',
    saveKey: 'saveDashboard',
    config: () => ({ rows: [] }),
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
    config: () => ({ expression: '1' }),
  },
  metric: {
    namePrefix: 'new_metric',
    collectionKey: 'metrics',
    saveKey: 'saveMetric',
    nameSeparator: '_',
    config: () => ({ expression: 'count(*)' }),
  },
  relation: {
    namePrefix: 'new_relation',
    collectionKey: 'relations',
    saveKey: 'saveRelation',
    // Seeded with the project's first two models joined on `id` — a starting
    // point the user re-points in the edit panel, exactly like every other
    // "+ New" draft. The join keys are a guess; the MODEL references are real,
    // which is what the backend validator requires.
    requires: state =>
      firstTwoModelNames(state)
        ? null
        : 'A relation joins two models. Create at least two models first.',
    config: state => {
      const [left, right] = firstTwoModelNames(state);
      return {
        join_type: 'inner',
        // eslint-disable-next-line no-template-curly-in-string
        condition: `\${ref(${left}).id} = \${ref(${right}).id}`,
      };
    },
  },
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
    const blocked = template.requires ? template.requires(get()) : null;
    if (blocked) {
      return { success: false, error: blocked };
    }
    const existing = (get()[template.collectionKey] || []).map(o => o.name);
    const name = generateUniqueName(template.namePrefix, existing, {
      separator: template.nameSeparator,
    });
    const result = await save(name, template.config(get()));
    return result?.success ? { ...result, name, type } : result;
  },
});

export default createInlineCreateSlice;
