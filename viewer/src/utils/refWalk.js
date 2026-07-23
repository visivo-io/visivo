/**
 * refWalk — the shared `ref(name)` walker (Explore 2.0 Phase 3a / B16,
 * specs/plan/explorer-workspace-unification/04-bug-inventory.md).
 *
 * Before this util, at least four call sites independently re-implemented the
 * same "scan this value for `ref(name)` occurrences" regex walk:
 * `stores/explorerStore.js` (`selectDerivedInputNames`, and again inline for
 * chart-lineage resolution), `components/explorer/ModelTabBar.jsx`
 * (`getReferencedModelNames`), `components/explorer/ExplorerLeftPanel.jsx`
 * (chart lineage resolution), and `models/Insight.js` (a stricter
 * `${ref(name).field}`-only variant). Each walked props/interactions by hand
 * with a slightly different regex and a slightly different traversal.
 *
 * This module is the ONE walker. Adopted by the new query chips
 * (`ExplorationQueryChips.jsx`)'s referenced-by badge; the other call sites
 * are a noted follow-up (03-delivery-plan.md's Phase 3a scope: "adopt in the
 * new chips... full sweep of legacy call sites can note follow-ups").
 */

// Matches `ref(name)` — deliberately loose (no `${}` wrapper requirement, no
// `.field` requirement) so it catches every existing call site's target
// shape: bare `ref(name)`, `ref(name).field`, and refs embedded inside a
// larger expression like `sum(ref(model).amount)`.
const REF_CALL_PATTERN = /ref\(([^.)]+)\)/g;

/**
 * Recursively collect every `ref(name)` occurrence's `name` inside `value`
 * (a string, or an object/array nested to any depth), adding to `into` (a
 * Set, so repeated calls across multiple values can accumulate into one
 * result). Returns `into` for chaining.
 */
export function collectRefNames(value, into = new Set()) {
  if (value == null) return into;
  if (typeof value === 'string') {
    // A fresh RegExp per call — `REF_CALL_PATTERN` carries a `lastIndex` that
    // must not leak state across invocations (a stale `lastIndex` from a
    // previous, shorter string silently skips matches in the next one).
    const re = new RegExp(REF_CALL_PATTERN.source, 'g');
    let match;
    while ((match = re.exec(value)) !== null) {
      into.add(match[1]);
    }
    return into;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectRefNames(item, into));
    return into;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach(item => collectRefNames(item, into));
    return into;
  }
  return into;
}

/**
 * Every ref name a single insight's working state (props + interactions)
 * references. `insightState` is an `explorerInsightStates[name]` entry
 * (`{ props, interactions }`) — tolerates `null`/`undefined`.
 */
export function collectInsightRefNames(insightState) {
  const names = new Set();
  if (!insightState) return names;
  collectRefNames(insightState.props, names);
  (insightState.interactions || []).forEach(interaction => {
    collectRefNames(interaction && interaction.value, names);
  });
  return names;
}

/**
 * For each name in `names`, how many of `insightNames` (looked up in
 * `insightStates`) reference it (across props or interactions)? Returns a
 * `Map<name, count>` — the data behind the query chip's referenced-by badge
 * (⛓n — "2 draft insights reference this query", 01-ux-spec.md §3;
 * successor to `ModelTabBar`'s boolean referenced ring).
 */
export function countReferencingInsights(names, insightNames, insightStates) {
  const counts = new Map((names || []).map(name => [name, 0]));
  for (const insightName of insightNames || []) {
    const refs = collectInsightRefNames((insightStates || {})[insightName]);
    for (const name of counts.keys()) {
      if (refs.has(name)) counts.set(name, counts.get(name) + 1);
    }
  }
  return counts;
}
