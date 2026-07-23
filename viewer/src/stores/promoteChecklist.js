/**
 * promoteChecklist — Explore 2.0 Phase 4 (02-architecture.md §3, 01-ux-spec.md
 * §3's "Save to Project" checklist mockup).
 *
 * `buildPromoteChecklist(getState)` computes the per-object promote checklist
 * from the legacy `explorerStore.js` working state (the active exploration's
 * live editing surface — see `ExplorationPane.jsx`'s docstring): every
 * changed model (+ its model-scoped computed-column metrics/dimensions),
 * insight, and the chart, each gated through the SAME three-layer validation
 * `useRecordSave` uses for every other object type — `validateRecordConfig`
 * ($defs schema) -> `checkRefTargets` (dangling refs) -> `checkExpressions`
 * (SQL parse) — via the exported functions, never the hook.
 *
 * SYNTHETIC-SIBLING REF RESOLUTION: a chart referencing a brand-new sibling
 * insight (or an insight referencing a brand-new sibling model/metric/
 * dimension) that's ALSO in this same checklist must not be flagged dangling
 * just because nothing has been promoted yet — `checkRefTargets` is run
 * against a synthetic state where every OTHER candidate row in the checklist
 * is stubbed into its collection by name (mirrors `InsightBuildSection.jsx`'s
 * existing "real collections UNION this exploration's own scratch names"
 * pattern, generalized from query names to every promotable type). This is
 * exactly what makes 01 §3's mockup possible: a new insight AND the chart
 * that references it both show "valid" in the same checklist.
 *
 * Called twice per promote: once to render the checklist (the modal), and
 * again — freshly, from scratch — inside `promoteExploration` right before
 * persisting (02 §3: "Fresh get() per object"), so the checklist a user
 * clicked "Promote" against is never trusted as stale state.
 *
 * KNOWN LIMITATION (accepted, documented): validity is computed as "if EVERY
 * row currently in the checklist is promoted" — not reactively per the
 * user's individual checkbox selections. The default ("all valid objects
 * pre-checked", 01 §3) always promotes correctly; manually UNCHECKING a
 * dependency another selected row relies on can still produce a backend
 * validation failure on that dependent row at promote time (it fails
 * cleanly, blocking only itself — never a silent corruption).
 */

import { validateRecordConfig } from '../components/views/workspace/validateAgainstSchema';
import { checkRefTargets } from '../components/views/workspace/refPreflight';
import { checkExpressions } from '../components/views/workspace/expressionPreflight';
import { expandDotNotationProps } from './explorerStore';

/** Metric/Dimension configs carry a frontend-only `parentModel` scoping field
 * (consumed by the backend save endpoint to set the Pydantic `_parent_name`
 * private attr) that isn't part of either object's persisted schema —
 * `Metric`/`Dimension` are `extra="forbid"`. Strip it before handing the
 * config to the validation gate, mirroring `explorer_views.py::_diff_object`'s
 * identical stripping for the same reason. */
const stripParentModel = config => {
  const { parentModel, ...rest } = config || {};
  return rest;
};

const validateRow = async (type, config, syntheticState) => {
  const strippedConfig = stripParentModel(config);
  try {
    const structural = await validateRecordConfig(type, strippedConfig);
    if (!structural.valid) {
      return { valid: false, error: structural.errors?.[0]?.message || 'Invalid configuration' };
    }
    const refCheck = checkRefTargets(strippedConfig, syntheticState);
    if (!refCheck.valid) {
      return { valid: false, error: refCheck.errors?.[0]?.message || 'Broken reference' };
    }
    const exprCheck = await checkExpressions(type, strippedConfig);
    if (!exprCheck.valid) {
      return { valid: false, error: exprCheck.errors?.[0]?.message || 'Expression failed to parse' };
    }
  } catch (err) {
    // FAIL-OPEN on a gate CRASH, mirroring useRecordSave's exact contract —
    // only a real invalid VERDICT blocks; an internal gate error must never
    // swallow a promote candidate.
    console.error('promoteChecklist: validation gate crashed — failing open', err);
    return { valid: true, error: null };
  }
  return { valid: true, error: null };
};

/**
 * @param {() => object} getState - `useStore.getState` (component callers)
 *   or a slice's own `get` (store-internal callers) — kept parameterized so
 *   this module never imports `useStore` itself (a store-slice file can't:
 *   `workspaceExplorationsStore.js` is one of the slices composed INTO it).
 * @returns {Promise<Array<{
 *   tier: 'model'|'field'|'insight'|'chart', type: string, name: string,
 *   parentModel: string|null, status: 'new'|'modified', valid: boolean,
 *   error: string|null, config: object,
 * }>>}
 */
export const buildPromoteChecklist = async getState => {
  const state = getState();
  const candidates = [];

  for (const [name, ms] of Object.entries(state.explorerModelStates || {})) {
    if (!ms.sql) continue;
    candidates.push({
      tier: 'model',
      type: 'model',
      name,
      parentModel: null,
      isNew: !!ms.isNew,
      config: {
        sql: ms.sql,
        ...(ms.sourceName ? { source: `ref(${ms.sourceName})` } : {}),
      },
    });
    for (const cc of ms.computedColumns || []) {
      const fieldType = cc.type === 'metric' ? 'metric' : 'dimension';
      candidates.push({
        tier: 'field',
        type: fieldType,
        name: cc.name,
        parentModel: name,
        isNew: undefined, // determined via diff below
        config: { expression: cc.expression, parentModel: name },
      });
    }
  }

  for (const [name, is] of Object.entries(state.explorerInsightStates || {})) {
    const expandedProps = expandDotNotationProps(is.props || {});
    const backendInteractions = (is.interactions || [])
      .filter(i => i.value)
      .map(i => ({ [i.type]: i.value }));
    candidates.push({
      tier: 'insight',
      type: 'insight',
      name,
      parentModel: null,
      isNew: is.isNew !== false,
      config: {
        // Unlike Model/Metric/Dimension/Chart, Insight's $defs schema
        // REQUIRES `name` (`Insight.required === ['name']`) — established
        // callers (useRecordSave's `readCurrentConfig`) always validate a
        // BARE collection entry that already carries `name` alongside its
        // other fields (`unwrapConfig` only strips an ENVELOPE `.config`
        // wrapper, never `name` itself). Root-caused via live reproduction
        // against the sandbox (integration-gate fix cycle): omitting it here
        // made `validateRecordConfig` reject every insight row with "must
        // have required property 'name'", so nothing was ever pre-checked
        // in the promote checklist.
        name,
        props: { type: is.type, ...expandedProps },
        ...(backendInteractions.length > 0 ? { interactions: backendInteractions } : {}),
      },
    });
  }

  if (state.explorerChartName) {
    candidates.push({
      tier: 'chart',
      type: 'chart',
      name: state.explorerChartName,
      parentModel: null,
      isNew: undefined,
      config: {
        insights: (state.explorerChartInsightNames || []).map(n => `ref(${n})`),
        layout: state.explorerChartLayout || {},
      },
    });
  }

  // Backend diff (`/api/explorer/diff/`) resolves new/modified/unchanged per
  // name — the same status source `saveExplorerObjects`/`ExplorerSaveModal`
  // used. Fetched once, best-effort: an unreachable diff endpoint fails open
  // to "new" for everything (never blocks the checklist from rendering).
  let diff = {};
  try {
    diff = (await state.fetchExplorerDiff?.()) || {};
  } catch {
    diff = {};
  }

  const statusFor = (bucket, name, fallbackIsNew) => {
    const raw = diff?.[bucket]?.[name];
    if (raw === null) return 'unchanged';
    if (raw === 'new' || raw === 'modified') return raw;
    return fallbackIsNew === false ? 'modified' : 'new';
  };

  const rows = candidates
    .map(candidate => {
      const bucket =
        candidate.type === 'model'
          ? 'models'
          : candidate.type === 'metric'
            ? 'metrics'
            : candidate.type === 'dimension'
              ? 'dimensions'
              : candidate.type === 'insight'
                ? 'insights'
                : null;
      const status =
        candidate.type === 'chart'
          ? diff.chart === null
            ? 'unchanged'
            : diff.chart || (candidate.isNew === false ? 'modified' : 'new')
          : statusFor(bucket, candidate.name, candidate.isNew);
      return { ...candidate, status };
    })
    // Nothing to promote for an already-published, byte-identical object.
    .filter(row => row.status !== 'unchanged');

  // Synthetic-sibling state: every candidate row's name stubbed into its
  // collection so a chart/insight referencing a sibling ALSO in this
  // checklist doesn't falsely read as a dangling ref.
  const stubsByKey = { models: [], metrics: [], dimensions: [], insights: [], charts: [] };
  for (const row of rows) {
    const key =
      row.type === 'model'
        ? 'models'
        : row.type === 'metric'
          ? 'metrics'
          : row.type === 'dimension'
            ? 'dimensions'
            : row.type === 'insight'
              ? 'insights'
              : 'charts';
    stubsByKey[key].push({ name: row.name });
  }
  const syntheticState = {
    ...state,
    models: [...(state.models || []), ...stubsByKey.models],
    metrics: [...(state.metrics || []), ...stubsByKey.metrics],
    dimensions: [...(state.dimensions || []), ...stubsByKey.dimensions],
    insights: [...(state.insights || []), ...stubsByKey.insights],
    charts: [...(state.charts || []), ...stubsByKey.charts],
  };

  const validated = await Promise.all(
    rows.map(async row => {
      const verdict = await validateRow(row.type, row.config, syntheticState);
      return { ...row, ...verdict };
    })
  );

  const tierOrder = { model: 0, field: 1, insight: 2, chart: 3 };
  return validated.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier]);
};

export default buildPromoteChecklist;
