/* Time-to-value step marks (Guided First Run W1).
 *
 * The 2.1 exit gate is "8 of 8 new users build a dashboard in under 20 minutes
 * with zero hand-written YAML". Nothing in the product could measure that.
 * This module emits the viewer's half of the one canonical ladder that can:
 *
 *   1. first_run_launched       — CLI (visivo/telemetry/first_run.py)
 *   2. source_connected         — here
 *   3. first_query_run          — here
 *   4. first_model_created      — here
 *   5. first_insight_created    — here
 *   6. first_dashboard_rendered — here (terminal — the metric's end)
 *
 * The contract — required properties, the FROZEN step_index, and the
 * `from_sample` filter the gate metric must be read with — is specified in
 * specs/marketing-relaunch/event-taxonomy.md §4, which is the source of record.
 *
 * Three things this module exists to guarantee:
 *
 *   ONCE PER JOURNEY, NOT ONCE PER SESSION. The journey spans reloads, tabs and
 *   a CLI process; a mark that re-fired on reload would inflate the funnel and
 *   destroy the median. Emitted marks are persisted in localStorage under
 *   `visivo.ttv.v1`, seeded from the steps the CLI already marked — AND written
 *   back to the server's ledger, because `localStorage` is scoped to one origin
 *   (`http://localhost:8000` and `:8001` are different origins) while the
 *   journey is not. Without the write-back a second browser, an incognito
 *   window, a cleared site-data, or `visivo serve -p 8001` re-fires every mark
 *   under the same journey_id — exactly the inflation this is meant to prevent.
 *
 *   ONE JOURNEY IDENTITY. `window.__VISIVO_FIRST_RUN` (injected by the local
 *   Flask server, see server/views/data_views.py) carries the journey_id,
 *   its start, the anonymous machine_id, and the CLI-side marks. Carrying the
 *   machine_id is what lets these join to `new_installation` / `cli_command`,
 *   which ship under it as their distinct_id.
 *
 *   THE OPT-OUT, WITHOUT A SECOND IMPLEMENTATION. When telemetry is disabled
 *   the server injects `__VISIVO_TELEMETRY_DISABLED` and NO journey at all, so
 *   there is nothing to mark. We also check the flag directly and return before
 *   touching the event buffer, localStorage, or PostHog — a disabled run emits
 *   nothing and leaves nothing behind.
 *
 * PRIVACY: counts and booleans only. No source / model / insight / dashboard /
 * column / file / project name and no path ever enters a payload here.
 * `journey_id` and `machine_id` are random UUIDs identifying a first run, not a
 * person. Callers pass metadata, never user-authored strings.
 */

import { fireEvent } from './telemetry';
import { isTelemetryDisabled } from './posthogClient';
import { postFirstRunStep } from '../../api/firstRunSteps';

const LEDGER_KEY = 'visivo.ttv.v1';

/* FROZEN step identities. Assigned once, never reassigned — a step added later
 * (W3's `table_profiled` / `scaffold_shown` / `scaffold_applied`) takes the
 * NEXT UNUSED integer even though it falls mid-journey chronologically,
 * because renumbering silently redefines every historical funnel. Funnels
 * order by timestamp; step_index is identity, not sort order. Mirrors
 * STEP_INDEXES in visivo/telemetry/first_run.py. */
export const TTV_STEP_INDEXES = Object.freeze({
  first_run_launched: 1,
  source_connected: 2,
  first_query_run: 3,
  first_model_created: 4,
  first_insight_created: 5,
  first_dashboard_rendered: 6,
});

/* The steps this module owns. `first_run_launched` is the CLI's. */
export const TTV_STEPS = Object.freeze({
  SOURCE_CONNECTED: 'source_connected',
  FIRST_QUERY_RUN: 'first_query_run',
  FIRST_MODEL_CREATED: 'first_model_created',
  FIRST_INSIGHT_CREATED: 'first_insight_created',
  FIRST_DASHBOARD_RENDERED: 'first_dashboard_rendered',
});

function injectedJourney() {
  if (typeof window === 'undefined') return null;
  const injected = window.__VISIVO_FIRST_RUN;
  if (!injected || typeof injected !== 'object') return null;
  if (typeof injected.journey_id !== 'string' || !injected.journey_id) return null;
  return injected;
}

function readLedger() {
  try {
    const raw = window.localStorage.getItem(LEDGER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.journey_id !== 'string' || !parsed.journey_id) return null;
    if (!parsed.steps || typeof parsed.steps !== 'object') parsed.steps = {};
    return parsed;
  } catch {
    // Unreadable / quota / disabled storage: treat as no journey recorded yet.
    // Losing idempotence is better than throwing into a store action.
    return null;
  }
}

function writeLedger(ledger) {
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    /* storage unavailable — the mark still fires, it just isn't deduped */
  }
}

function newJourneyId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* fall through to the Math.random id below */
  }
  // Not cryptographically strong, and it does not need to be: this is a
  // throwaway grouping key for one first run, never an identifier of a person.
  return `ttv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* Resolve the journey this page belongs to, creating a viewer-local one when
 * the CLI did not supply one (the cloud/dist viewer has no Flask server, so
 * there is no injection there — but its first run is just as worth measuring).
 * A viewer-local journey has a null machine_id; there is no CLI to join to.
 *
 * It also has a NULL `started_at_ms`, and that is load-bearing. There is no
 * first run to measure from here, so the taxonomy specifies
 * `ms_since_first_run: null` — "the journey start is unknown (cloud viewer, or
 * a machine whose ledger predates this contract)". Minting `Date.now()` instead
 * would report a ~0ms time-to-value for every cloud dashboard view, straight
 * into the single number the 2.1 exit gate is read off, and the cloud
 * population is far larger than the CLI one.
 *
 * When the injected journey_id differs from the stored one the ledger is
 * replaced rather than merged: that is a genuinely new first run (the user
 * cleared ~/.visivo, or this browser profile is looking at a different
 * machine's server) and merging would silently suppress its marks. */
function resolveJourney() {
  const injected = injectedJourney();
  const stored = readLedger();

  if (injected) {
    if (stored && stored.journey_id === injected.journey_id) {
      return {
        ...stored,
        // Refresh the CLI-side facts from the page — the server is authoritative
        // for them and may have marked a step since this ledger was written.
        started_at_ms: injected.started_at_ms ?? stored.started_at_ms ?? null,
        install_age_ms: injected.install_age_ms ?? stored.install_age_ms ?? null,
        machine_id: injected.machine_id ?? stored.machine_id ?? null,
        steps: { ...(injected.steps || {}), ...stored.steps },
      };
    }
    return {
      journey_id: injected.journey_id,
      started_at_ms: injected.started_at_ms ?? null,
      install_age_ms: injected.install_age_ms ?? null,
      machine_id: injected.machine_id ?? null,
      steps: { ...(injected.steps || {}) },
    };
  }

  if (stored) return stored;

  const created = {
    journey_id: newJourneyId(),
    started_at_ms: null,
    install_age_ms: null,
    machine_id: null,
    steps: {},
  };
  writeLedger(created);
  return created;
}

/** The bundled sample dashboards the server named, or null when it named none
 *  (the cloud/dist viewer, which has no Flask server to ask). Lets the terminal
 *  mark decide `from_sample` from the dashboard being rendered. */
export function getSampleDashboardNames() {
  const injected = injectedJourney();
  const names = injected && injected.sample_dashboards;
  return Array.isArray(names) ? names : null;
}

/* Largest timestamp among the marks already recorded for this journey — the
 * "previous step" `ms_since_previous_step` is measured from. Uses max rather
 * than the highest step_index so a clock that jumps cannot produce a negative
 * gap; a genuinely out-of-order mark is reported via `out_of_order` instead. */
function previousStepMs(steps) {
  const values = Object.values(steps || {}).filter(v => typeof v === 'number' && isFinite(v));
  if (values.length === 0) return null;
  return Math.max(...values);
}

/**
 * Mark one step of the time-to-value journey. At most once per journey.
 *
 * @param {string} stepId  — a key of TTV_STEP_INDEXES.
 * @param {object} [props] — extra event properties. Metadata only: counts and
 *                           booleans, NEVER a user-authored string or path.
 * @returns {boolean} true only when a mark was actually emitted, so callers
 *                    and tests can tell "fired" from "already fired" and from
 *                    "telemetry off".
 */
export function markTimeToValueStep(stepId, props = {}) {
  if (typeof window === 'undefined') return false;
  // Opt-out first: before the event buffer, before localStorage, before
  // PostHog. A disabled run emits nothing and writes nothing.
  if (isTelemetryDisabled()) return false;
  const stepIndex = TTV_STEP_INDEXES[stepId];
  if (!stepIndex) return false;

  const journey = resolveJourney();
  if (journey.steps && journey.steps[stepId] != null) return false;

  const now = Date.now();
  const previousMs = previousStepMs(journey.steps);
  const startedAtMs = typeof journey.started_at_ms === 'number' ? journey.started_at_ms : null;

  // Claim the step before firing, so a throwing sink cannot turn into a mark
  // that re-fires on every subsequent call.
  const nextLedger = {
    journey_id: journey.journey_id,
    started_at_ms: startedAtMs,
    install_age_ms: typeof journey.install_age_ms === 'number' ? journey.install_age_ms : null,
    machine_id: journey.machine_id ?? null,
    steps: { ...journey.steps, [stepId]: now },
  };
  writeLedger(nextLedger);

  fireEvent(stepId, {
    journey_id: journey.journey_id,
    step_id: stepId,
    step_index: stepIndex,
    ms_since_first_run: startedAtMs === null ? null : Math.max(0, now - startedAtMs),
    ms_since_previous_step: previousMs === null ? null : Math.max(0, now - previousMs),
    install_age_ms: nextLedger.install_age_ms,
    machine_id: journey.machine_id ?? null,
    out_of_order: previousMs !== null && now < previousMs,
    ...props,
  });

  // Tell the server the mark fired, so "once per journey" survives this origin.
  // Only when the CLI handed us the journey: there is nowhere to write back to
  // in the cloud/dist viewer, and a POST there would 404 on every mark.
  if (injectedJourney()) {
    postFirstRunStep({ journeyId: journey.journey_id, stepId, atMs: now });
  }
  return true;
}

/**
 * Read-only view of the journey, for tests and for surfaces that want to show
 * elapsed time. Returns null when telemetry is disabled.
 */
export function getTimeToValueJourney() {
  if (typeof window === 'undefined') return null;
  if (isTelemetryDisabled()) return null;
  return resolveJourney();
}

/** Drop the persisted ledger. Test helper; not called by product code. */
export function clearTimeToValueLedger() {
  try {
    window.localStorage.removeItem(LEDGER_KEY);
  } catch {
    /* ignore */
  }
}
