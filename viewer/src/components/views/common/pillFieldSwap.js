import * as pillGrammar from './pillGrammar';

/**
 * pillFieldSwap — Explore 2.0 Phase 4 (06-pill-aggregation-grammar.md §4/§8 +
 * the post-3b delta-review's "promote-time pill reclassification" finding).
 *
 * Two situations both end with a draft prop/interaction slot needing an
 * EXPLICIT, user-visible one-click "swap to the promoted field ref" offer —
 * never a silent rendering change:
 *
 *   1. MATCH-AND-REPLACE DEDUP (06 §8, Lightdash-adopted): after "Save as
 *      metric" promotes a slot's own aggregate expression to a named Metric,
 *      other slots with the SAME expression (same ref/column/agg) are
 *      candidates to swap onto the new metric ref too.
 *   2. NAME-COLLISION RECLASSIFICATION (delta-review, HIGH): the backend
 *      resolves `${ref(model).field}` "global-name-first" — `field` is
 *      checked against every project-wide Metric/Dimension name BEFORE the
 *      stated model is consulted at all (verified empirically, see
 *      research/s5-droppable-retrofit-design.md's RESULT section; encoded in
 *      `pillGrammar.parse`'s `findGlobalField`). So the moment ANY promote
 *      creates a Metric/Dimension whose name collides with an existing bare
 *      column name used elsewhere in the draft (regardless of which model
 *      that column belongs to, or whether the expressions even match), every
 *      one of those OTHER slots will silently start resolving to the new
 *      object on next render/compile — a `dimension` pill flipping to
 *      `dimensionRef`/`metricRef` with no user action at all. This function
 *      finds those slots the INSTANT the collision is introduced so the
 *      caller can offer the swap explicitly instead of letting it happen
 *      passively.
 *
 * Both detectors work directly off `explorerInsightStates` (the draft's live
 * working state) and return the SAME shape so one banner/offer UI serves
 * both triggers.
 */

const QUERY_STRING_RE = /^\?\{([\s\S]*)\}$/;

const parseQueryBody = value => {
  if (typeof value !== 'string') return null;
  const match = value.match(QUERY_STRING_RE);
  if (!match) return null;
  // Parse WITHOUT the global metric/dimension lookup tables — this is the
  // slot's syntactic shape (bare column ref vs aggregate-wrapped), which is
  // what both detectors below need, independent of whatever the store's
  // CURRENT metrics/dimensions lists happen to contain right now.
  return pillGrammar.parse(match[1], {});
};

/** Every column-ref-shaped (dimension/aggregate) prop + interaction slot
 * across every draft insight, as `{insightName, location: 'prop'|'interaction',
 * key, state}` — `key` is the prop's flat dot-path key or the interaction's
 * array index. Shared walk both detectors below filter down from. */
const allColumnRefSlots = insightStates => {
  const slots = [];
  for (const [insightName, insightState] of Object.entries(insightStates || {})) {
    for (const [key, value] of Object.entries(insightState?.props || {})) {
      const state = parseQueryBody(value);
      if (state && (state.kind === 'dimension' || state.kind === 'aggregate')) {
        slots.push({ insightName, location: 'prop', key, state });
      }
    }
    (insightState?.interactions || []).forEach((interaction, index) => {
      const state = parseQueryBody(interaction?.value);
      if (state && (state.kind === 'dimension' || state.kind === 'aggregate')) {
        slots.push({ insightName, location: 'interaction', key: index, state });
      }
    });
  }
  return slots;
};

/**
 * Name-collision reclassification (delta-review, HIGH). `promotedName`/
 * `promotedType` describe the Metric/Dimension that was JUST promoted.
 * Returns every OTHER slot whose bare column name equals `promotedName` —
 * every one of them is about to (or already does) resolve to the new object
 * instead of its stated model's raw column, per global-name-first.
 */
export function findReclassifiedSlots(promotedName, promotedType, insightStates) {
  return allColumnRefSlots(insightStates)
    .filter(slot => slot.state.column === promotedName)
    .map(slot => ({
      insightName: slot.insightName,
      location: slot.location,
      key: slot.key,
      previousRef: slot.state.ref,
      previousColumn: slot.state.column,
      previousAgg: slot.state.agg || null,
      swapTo: { kind: promotedType === 'metric' ? 'metricRef' : 'dimensionRef', ref: promotedName },
    }));
}

/**
 * Match-and-replace dedup (06 §8). `promotedRef`/`promotedColumn`/
 * `promotedAgg` describe the EXACT expression that was just promoted to a
 * named metric (`promotedAgg` null for a plain dimension promote — not
 * currently reachable from Save-as-metric, which only promotes aggregates,
 * but kept general). Returns every OTHER slot with the identical
 * ref+column+agg shape (excluding the slot that was itself just promoted,
 * identified by `excludeInsightName`/`excludeKey`).
 */
export function findMatchingExpressionSlots(
  { promotedRef, promotedColumn, promotedAgg, promotedName, promotedType },
  insightStates,
  { excludeInsightName, excludeLocation, excludeKey } = {}
) {
  return allColumnRefSlots(insightStates)
    .filter(slot => {
      if (
        slot.insightName === excludeInsightName &&
        slot.location === excludeLocation &&
        slot.key === excludeKey
      ) {
        return false;
      }
      return (
        slot.state.ref === promotedRef &&
        slot.state.column === promotedColumn &&
        (slot.state.agg || null) === (promotedAgg || null)
      );
    })
    .map(slot => ({
      insightName: slot.insightName,
      location: slot.location,
      key: slot.key,
      previousRef: slot.state.ref,
      previousColumn: slot.state.column,
      previousAgg: slot.state.agg || null,
      swapTo: { kind: promotedType === 'metric' ? 'metricRef' : 'dimensionRef', ref: promotedName },
    }));
}

/** Serialize a swap target (`{kind: 'metricRef'|'dimensionRef', ref}`) into
 * the `?{...}` query-string form a prop/interaction value expects. */
export function serializeSwapTarget(swapTo) {
  return `?{${pillGrammar.serialize({ kind: swapTo.kind, ref: swapTo.ref })}}`;
}

/**
 * Re-read a slot's CURRENT live value (VIS-1095, Phase 5 preview-lane/offer-
 * staleness fix). An offer's `slots` are a SNAPSHOT captured the instant the
 * offer was created (right after a promote / "Save as metric"); by the time
 * the user actually clicks "Update N references", the target insight may
 * have been renamed/removed, or the SAME slot may have been hand-edited to
 * something else entirely underneath the banner (it's a non-blocking inline
 * element, not a modal — nothing stops continued editing while it's open).
 *
 * Returns `null` when the insight is gone or the slot's current value no
 * longer parses as a column-ref-shaped (dimension/aggregate) value at all —
 * `FieldSwapOfferBanner.applyOffer` treats a `null` (or any ref/column/agg
 * mismatch against the offer's captured `previousRef`/`previousColumn`/
 * `previousAgg`) as "changed since the offer was made" and skips that slot
 * rather than blindly overwriting whatever is there now.
 */
export function readCurrentSlotState(insightStates, slot) {
  const insightState = insightStates?.[slot.insightName];
  if (!insightState) return null;
  const rawValue =
    slot.location === 'prop'
      ? insightState.props?.[slot.key]
      : insightState.interactions?.[slot.key]?.value;
  return parseQueryBody(rawValue);
}
