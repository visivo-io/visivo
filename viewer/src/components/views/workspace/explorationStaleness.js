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
 * DRIFT DETECTION (Phase 6c-T1, ux-audit.md existing-objects #8, ⚠
 * conflicts-with-e2e — "no staleness indication after the underlying insight
 * is edited elsewhere"): the dangling-ref check above only catches a ref
 * that stopped resolving ENTIRELY (deleted). The audit's actual complaint —
 * "I edited aggregated-bar-insight's description in the project editor,
 * reopened the exploration that copied it, and got no signal at all" — is a
 * DIFFERENT case: the seeded-from object still resolves, its CONTENT just
 * changed. This was a genuine, documented scope gap (see the removed
 * "Scope" note this replaces): a bare dangling-ref check can never catch it,
 * only a persisted fingerprint of the seeded object's content at seed time
 * can. `workspaceExplorationsStore.js`'s `createExploration` now captures
 * exactly that (`computeSeedContentSignature`, below) into
 * `exploration.seededFrom.contentSignature` at seed time; this function
 * recomputes the CURRENT signature for the same object and flags `stale`
 * when they diverge — orthogonal to (and additive with) the dangling-ref
 * check, never a replacement for it.
 */

// Object types this exploration's seed provenance can point at whose
// content is meaningfully hashable via the shared collections a mounted
// Workspace already has loaded (`state.insights`/`state.models`/
// `state.charts`). 'source'/'table'/'metric'/'dimension' seeds don't carry a
// single canonical "content" the same way (a table is the source's schema,
// not a project object; metrics/dimensions are scoped inside a model's own
// config) — omitted rather than guessed at.
const SIGNATURE_TYPES = { insight: 'insights', chart: 'charts', model: 'models' };

/** Deterministic JSON stringify — recursively sorts object keys — so two
 * reads of logically-identical config taken at different times (seed-time
 * vs. a later recheck) never disagree merely because of incidental key
 * insertion-order differences from the API layer. */
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The live content a `{type, name}` seed ref currently points at, hashed
 * into a stable signature string — `null` when the type isn't one of
 * `SIGNATURE_TYPES`, the object can't be found in `state`, or it has no
 * `config` to hash (all "can't determine drift" cases, never treated as
 * drift themselves — that would double up with the dangling-ref check,
 * which already owns "this doesn't resolve anymore").
 *
 * @param {{type: string, name: string}} seed
 * @param {object} state - `useStore.getState()` (or an equivalent plain
 *   object exposing `insights`/`models`/`charts`).
 * @returns {string|null}
 */
export function computeSeedContentSignature(seed, state) {
  if (!seed?.type || !seed?.name) return null;
  const collectionKey = SIGNATURE_TYPES[seed.type];
  if (!collectionKey) return null;
  const obj = (state?.[collectionKey] || []).find(o => o.name === seed.name);
  if (!obj || obj.config == null) return null;
  return stableStringify(obj.config);
}

/**
 * @param {object} exploration - a mapped workspaceExplorations record (or
 *   `null`/`undefined`, tolerated for a not-yet-loaded card).
 * @param {object} state - `useStore.getState()` (or an equivalent plain
 *   object exposing the same collection arrays `checkRefTargets` reads).
 * @returns {{stale: boolean, danglingRefs: string[], driftedFrom: {type: string, name: string}|null}}
 */
export function computeExplorationStaleness(exploration, state) {
  const seed = exploration?.seededFrom;
  let driftedFrom = null;
  if (seed?.contentSignature) {
    const currentSignature = computeSeedContentSignature(seed, state);
    // `currentSignature` is `null` when the object is gone entirely — that
    // case is the dangling-ref check's job (below), not drift's; only an
    // object that STILL resolves but hashes differently counts as drifted.
    if (currentSignature && currentSignature !== seed.contentSignature) {
      driftedFrom = { type: seed.type, name: seed.name };
    }
  }

  const draft = exploration?.draft;
  if (!draft) return { stale: !!driftedFrom, danglingRefs: [], driftedFrom };

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
  if (result.skipped || result.valid) {
    return { stale: !!driftedFrom, danglingRefs: [], driftedFrom };
  }

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
  return { stale: danglingRefs.length > 0 || !!driftedFrom, danglingRefs, driftedFrom };
}
