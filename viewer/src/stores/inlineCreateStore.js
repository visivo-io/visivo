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
 * smallest config the backend's Pydantic model accepts. `relation` is absent
 * by design: its condition must reference two real models, so there is no
 * meaningful empty draft.
 *
 * Dimension/metric names use underscores — the backend rejects dashes for
 * semantic-layer names (they must be valid SQL identifiers).
 */
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
    config: () => ({ expression: '1' }),
  },
  metric: {
    namePrefix: 'new_metric',
    collectionKey: 'metrics',
    saveKey: 'saveMetric',
    config: () => ({ expression: 'count(*)' }),
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
    const existing = (get()[template.collectionKey] || []).map(o => o.name);
    const name = generateUniqueName(template.namePrefix, existing);
    const result = await save(name, template.config());
    return result?.success ? { ...result, name, type } : result;
  },
});

export default createInlineCreateSlice;
