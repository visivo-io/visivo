import { checkRefTargets } from './refPreflight';

/**
 * explorationStaleness — Explore 2.0 Phase 5 (VIS-1070, 02-architecture.md
 * §8 / 01-ux-spec.md §2's "⚠ stale (orders changed)" end-state).
 *
 * "Re-run ref checks against current collections" reuses the SAME advisory
 * tool (`checkRefTargets`) the Build rail already runs continuously while an
 * exploration is open (InsightBuildSection.jsx's live per-keystroke
 * validation) — this module is the ONE-SHOT version of that same check, run
 * against a whole exploration's `draft` at two additional moments the live
 * check never covers on its own:
 *
 *   1. On RESUME (`ExplorationPane.jsx`'s activate effect) — the exploration
 *      may have sat parked while its refs' targets were deleted elsewhere;
 *      the live advisory check only starts running once the Build rail
 *      mounts and a field is expanded, so a snapshot taken right at resume
 *      is what drives the non-blocking "re-check references" banner.
 *   2. On the Explorer Home gallery (`ExplorationCard.jsx`'s staleness
 *      badge) — a card is never "opened" at all, so nothing else ever runs
 *      this check for it.
 *
 * Scope (a deliberate, documented reduction from the UX spec's literal
 * "orders changed" copy): without a persisted fingerprint of what a draft's
 * referenced objects looked like at last-sync time, distinguishing "the
 * referenced model's OWN definition changed" from "the ref no longer
 * resolves at all" isn't computable client-side today. This treats BOTH as
 * one unified "stale" signal — a dangling ref, exactly what `checkRefTargets`
 * already detects — which is the same simplification 02 §8's own prose names
 * as the mechanism ("re-run ref checks... (checkRefTargets)"). A true
 * changed-vs-deleted distinction would need a `ref_fingerprint` persisted on
 * the Exploration record — noted as follow-up work, not implemented here.
 */

/**
 * @param {object} exploration - a mapped workspaceExplorations record (or
 *   `null`/`undefined`, tolerated for a not-yet-loaded card).
 * @param {object} state - `useStore.getState()` (or an equivalent plain
 *   object exposing the same collection arrays `checkRefTargets` reads).
 * @returns {{stale: boolean, danglingRefs: string[]}}
 */
export function computeExplorationStaleness(exploration, state) {
  const draft = exploration?.draft;
  if (!draft) return { stale: false, danglingRefs: [] };

  // Splice the draft's OWN scratch query names into `models` (mirrors
  // InsightBuildSection.jsx's synthetic-state pattern) so a ref to one of
  // THIS exploration's not-yet-promoted queries is never flagged as
  // dangling — only refs to something genuinely gone from the project.
  const draftQueryStubs = (draft.queries || [])
    .filter(q => q?.name)
    .map(q => ({ name: q.name }));
  const syntheticState = {
    ...state,
    models: [...(state?.models || []), ...draftQueryStubs],
  };

  // Walk the WHOLE draft (queries' SQL, insights, chart, computed columns) —
  // `checkRefTargets` is shape-agnostic, it just scans every string for
  // `${ref(...)}` / bare `ref(...)` occurrences.
  const result = checkRefTargets(draft, syntheticState);
  if (result.skipped || result.valid) return { stale: false, danglingRefs: [] };

  const danglingRefs = [
    ...new Set(
      result.errors
        .map(e => {
          const match = e.message.match(/ref '([^']+)' does not match/);
          return match ? match[1] : null;
        })
        .filter(Boolean)
    ),
  ];
  return { stale: danglingRefs.length > 0, danglingRefs };
}
