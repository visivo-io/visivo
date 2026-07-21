import { generateUniqueName } from '../../../utils/uniqueName';

/**
 * promoteNaming — Explore 2.0 Phase 6c-T3 (D11 / ux-audit.md "Promote has no
 * naming step — project polluted with 'query_1' and 'insight'").
 *
 * The Save-to-Project checklist (`ExplorationPromoteModal`) used to write
 * brand-new objects under whatever placeholder name the scratch draft
 * happened to carry — `query_1`, `model`, `insight`, `insight_2`, `chart` —
 * with no rename step, so a project would permanently gain a model literally
 * named `query_1`. This module is the pure-function half of the fix: it
 * recognizes those placeholder names and proposes a real one, anchored on
 * whatever the object is actually about (its bound source, or the sibling
 * object right before it in dependency order) so a plain query -> chart
 * build gets a coherent chain (`orders_query` -> `orders_query_insight` ->
 * `orders_query_insight_chart`) instead of three unrelated placeholders.
 *
 * The modal always renders these as EDITABLE fields — this is a starting
 * point the user can override, never a silent rename. Only NEW objects are
 * ever touched (an object already published under a real name is excluded
 * upstream, by `buildPromoteChecklist`'s own `status !== 'unchanged'` filter
 * plus the modal only offering suggestions for `status === 'new'` rows) —
 * mirrors the `renameModelTab`/`renameInsight` store actions' own
 * `if (!x.isNew) return` guard, so a "modified" (update-by-name) row's real,
 * already-chosen name is never second-guessed here.
 */

// Placeholder names minted by the auto-create paths this audit finding
// named directly (`explorerStore.js`'s `createModelTab`/`createInsight`,
// `explorationLegacyBridge.js`'s seed path) — anything else is treated as
// already-meaningful (a user typed it, or renamed a chip) and left alone.
const GENERIC_NAME_PATTERNS = {
  model: /^(query_\d+|model)$/i,
  insight: /^insight(_\d+)?$/i,
  chart: /^chart(_\d+)?$/i,
};

/**
 * @param {'model'|'insight'|'chart'|string} type
 * @param {string} name
 * @returns {boolean} true when `name` is a recognized auto-generated
 *   placeholder for this type (never true for 'metric'/'dimension' — those
 *   are always user-named up front by the Save-as-metric flow).
 */
export function isGenericPromoteName(type, name) {
  const pattern = GENERIC_NAME_PATTERNS[type];
  return !!pattern && pattern.test(String(name || ''));
}

/**
 * Compute suggested replacement names for NEW checklist rows still carrying
 * a generic placeholder name.
 *
 * @param {Array<{tier:string,type:string,name:string,status:string}>} rows -
 *   `buildPromoteChecklist()` output, already tier-sorted (model -> field ->
 *   insight -> chart).
 * @param {(modelName:string) => (string|null)} getModelSourceName - resolves
 *   a model row's bound source name, if any (the `<source>_query` anchor).
 * @param {Iterable<string>} knownNames - every name already in use anywhere
 *   in the project (published objects + every other draft object), so a
 *   suggestion never collides — passed through to `generateUniqueName`.
 * @returns {Map<string,string>} `"type:oldName"` -> suggested new name, only
 *   for rows that actually got a suggestion (rows with no good anchor, or
 *   whose name is already meaningful, are simply absent from the map).
 */
export function suggestPromoteNames(rows, getModelSourceName, knownNames) {
  const suggestions = new Map();
  const used = new Set(knownNames);

  // Anchors carry forward in dependency order: a renamed model becomes the
  // insight's anchor, a (renamed-or-original) insight becomes the chart's —
  // so a fresh build cascades into one coherent family of names instead of
  // three unrelated ones.
  let modelAnchor = null;
  let insightAnchor = null;

  for (const row of rows || []) {
    if (row.tier === 'field') continue; // always already user-named
    if (row.status !== 'new') continue; // never second-guess a real object's name

    if (!isGenericPromoteName(row.type, row.name)) {
      if (row.tier === 'model') modelAnchor = row.name;
      if (row.tier === 'insight') insightAnchor = row.name;
      continue;
    }

    let base = null;
    if (row.tier === 'model') {
      const sourceName = getModelSourceName ? getModelSourceName(row.name) : null;
      base = sourceName ? `${sourceName}_query` : null;
    } else if (row.tier === 'insight') {
      base = modelAnchor ? `${modelAnchor}_insight` : null;
    } else if (row.tier === 'chart') {
      base = insightAnchor ? `${insightAnchor}_chart` : modelAnchor ? `${modelAnchor}_chart` : null;
    }

    // No usable anchor (e.g. a model with no source bound yet) — leave the
    // placeholder as-is; the modal still renders it as an editable field, so
    // the user names it themselves rather than the tool guessing badly.
    if (!base) {
      if (row.tier === 'model') modelAnchor = row.name;
      if (row.tier === 'insight') insightAnchor = row.name;
      continue;
    }

    const unique = generateUniqueName(base, used);
    used.add(unique);
    suggestions.set(`${row.type}:${row.name}`, unique);
    if (row.tier === 'model') modelAnchor = unique;
    if (row.tier === 'insight') insightAnchor = unique;
  }

  return suggestions;
}

export default suggestPromoteNames;
