/**
 * explorationLifecycle — Explore 2.0 Phase 6c-T5 (ux-audit.md's Lifecycle
 * findings): the pure rules that decide whether a SEEDED exploration (one
 * minted from a source tile / "Explore this" — `seededFrom` set) counts as
 * genuinely "real" yet, or is still just a browse gesture that hasn't
 * produced any user-authored content.
 *
 * THE PROBLEM (ux-audit.md): "Clicking a source tile on Explorer home
 * silently creates a new persistent exploration every time" / "'Explore
 * this' always spawns a new exploration ... silent proliferation" / "Phantom
 * 'Scratch' exploration". Every one of these traces back to the SAME root
 * cause — `createExploration` always persists a backend record AND always
 * surfaces it in the Home gallery, even when the user did nothing but click
 * a browse affordance.
 *
 * THE FIX: a seeded exploration's backend record is still created eagerly
 * (this keeps the id STABLE from the very first render — no later id-swap
 * needed anywhere: tabs, the right rail, promote, discard, and every other
 * piece of this surface key off a record's `id` for its entire life), but it
 * is only "real" — visible in the Home gallery, survives its tab closing —
 * once one of these becomes true:
 *
 *   1. It has MEANINGFUL CONTENT: real SQL typed, more than the one seeded
 *      model/insight, a binding on an insight, an interaction, a computed
 *      column, or chart layout config. `hasMeaningfulExplorationContent`
 *      computes this from the SAME `draft`/`legacyState` shape the record is
 *      already persisted as — no new field, no new backend contract.
 *
 *      NOTE this is why "Explore this" on an EXISTING insight/chart/model
 *      is never hidden: `buildExplorationSeedState` (explorerStore.js) seeds
 *      those cases with the object's REAL sql/props from the very first
 *      frame — there is nothing "browse-only" about opening an insight that
 *      already renders a chart. Only the source-tile / bare-model /
 *      bare-table seeds (empty SQL, no insight props) start with nothing.
 *
 *   2. It's been RENAMED away from the deterministic name a seed gets by
 *      default (`seedDefaultName`) — an explicit rename is itself a
 *      deliberate "keep this" action, even before any SQL is typed.
 *
 *   3. Something in it has been PROMOTED to the project — obviously real by
 *      definition regardless of what the rest of the draft looks like.
 *
 * A record with NO `seededFrom` at all (the "+ New exploration" button) is
 * always real — that's an explicit, deliberate create, never a browse
 * gesture, and the audit never flagged it as a proliferation problem.
 */

const trimmedNonEmpty = value => typeof value === 'string' && value.trim().length > 0;

/** The name a seed gets by default — human-readable and derived from what
 * was actually explored (ux-audit.md: "Names are the primary scent for
 * returning users; derive them from the explored object"), replacing the
 * incoherent 'Scratch' / 'Exploration N' / 'model' scheme. */
export const seedDefaultName = seed => {
  if (!seed || !trimmedNonEmpty(seed.name)) return null;
  return `${seed.name} exploration`;
};

/** Does this exploration's draft contain anything the user (or a seed that
 * copied real content) actually authored? Prefers the lossless
 * `draft.legacyState` (present for every viewer-created record); falls back
 * to the thin typed projection for a record that only ever went through
 * that (e.g. a future non-viewer client). */
export const hasMeaningfulExplorationContent = record => {
  if (!record) return false;
  if ((record.promoted || []).length > 0) return true;

  const legacy = record.draft?.legacyState;
  if (!legacy) {
    const draft = record.draft || {};
    const queries = draft.queries || [];
    const insights = draft.insights || [];
    if (queries.length > 1 || insights.length > 1) return true;
    if (queries.some(q => trimmedNonEmpty(q?.sql))) return true;
    if (insights.some(i => Object.keys(i?.props || {}).length > 0)) return true;
    if ((draft.computedColumns || []).length > 0) return true;
    return false;
  }

  const modelStates = legacy.modelStates || {};
  const modelNames = Object.keys(modelStates);
  if (modelNames.length > 1) return true;
  if (modelNames.some(name => trimmedNonEmpty(modelStates[name]?.sql))) return true;
  if (modelNames.some(name => (modelStates[name]?.computedColumns || []).length > 0)) return true;

  const insightStates = legacy.insightStates || {};
  const insightNames = Object.keys(insightStates);
  if (insightNames.length > 1) return true;
  if (
    insightNames.some(name => {
      const is = insightStates[name] || {};
      return Object.keys(is.props || {}).length > 0 || (is.interactions || []).length > 0;
    })
  ) {
    return true;
  }

  if (Object.keys(legacy.chartLayout || {}).length > 0) return true;

  return false;
};

/** Has the user renamed this exploration away from its deterministic
 * seed-derived default? A no-op (false) for a record with no seed — those
 * have no "default" to diverge from in the sense this check cares about. */
export const isExplorationRenamedFromSeedDefault = record => {
  if (!record?.seededFrom) return false;
  const expected = seedDefaultName(record.seededFrom);
  return !!expected && record.name !== expected;
};

/**
 * The single predicate every surface should use to decide whether a seeded
 * exploration is "real" — shown in the Home gallery, survives its tab
 * closing without being garbage-collected. A blank ("+ New exploration")
 * record is always real.
 */
export const isExplorationVisibleInGallery = record => {
  if (!record) return false;
  if (!record.seededFrom) return true;
  return (
    hasMeaningfulExplorationContent(record) ||
    isExplorationRenamedFromSeedDefault(record) ||
    (record.promoted || []).length > 0
  );
};
