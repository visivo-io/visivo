/* Time-to-value step marks (Guided First Run W1) — the viewer's half of the
 * ladder whose step 1, `first_run_launched`, is emitted by
 * visivo/telemetry/first_run.py. Steps 2-6 (source_connected, first_query_run,
 * first_model_created, first_insight_created, and the terminal
 * first_dashboard_rendered) are emitted here.
 *
 * specs/marketing-relaunch/event-taxonomy.md §4 is the source of record for
 * each mark's required properties, its frozen step_index, and the `from_sample`
 * filter the gate metric must be read with.
 *
 * `window.__VISIVO_FIRST_RUN`, injected by the local Flask server, carries the
 * journey id, its start, the anonymous machine_id that joins these marks to
 * `new_installation` / `cli_command`, and every mark already claimed. Emitted
 * marks are persisted under `visivo.ttv.v1` AND written back to the server's
 * ledger: localStorage is scoped to one origin (`:8000` and `:8001` are
 * different origins) while the journey is not.
 *
 * Payloads are counts, booleans, and random ids — never a user-authored string
 * or a path.
 */

import { fireEvent } from './telemetry';
import { isTelemetryDisabled } from './posthogClient';
import { postFirstRunStep } from '../../api/firstRunSteps';

const LEDGER_KEY = 'visivo.ttv.v1';

/* Frozen identities, mirroring STEP_INDEXES in visivo/telemetry/first_run.py.
 * A step added later takes the next unused integer even when it falls
 * mid-journey, because renumbering redefines every historical funnel. */
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
    // Losing idempotence beats throwing into the store action that called us.
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
  // Not cryptographically strong and does not need to be: a grouping key for
  // one first run, never an identifier of a person.
  return `ttv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* Resolve the journey this page belongs to, minting a viewer-local one when the
 * CLI supplied none (the cloud/dist viewer has no Flask server to inject one).
 *
 * A viewer-local journey keeps `started_at_ms` null so `ms_since_first_run` is
 * null, per the taxonomy: minting Date.now() here would report a ~0ms
 * time-to-value for every cloud dashboard view, into the gate metric itself. */
function resolveJourney() {
  const injected = injectedJourney();
  const stored = readLedger();

  if (injected) {
    if (stored && stored.journey_id === injected.journey_id) {
      return {
        ...stored,
        // The server is authoritative for the CLI-side facts and may have marked
        // a step since this ledger was written.
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
 *  (the cloud/dist viewer). Lets the terminal mark decide `from_sample` from
 *  the dashboard being rendered. */
export function getSampleDashboardNames() {
  const injected = injectedJourney();
  const names = injected && injected.sample_dashboards;
  return Array.isArray(names) ? names : null;
}

/* The mark `ms_since_previous_step` is measured from. Newest timestamp rather
 * than highest step_index, so a clock jump cannot produce a negative gap — an
 * out-of-order mark is reported through `out_of_order` instead. */
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
 *                           booleans, never a user-authored string or path.
 * @returns {boolean} true only when a mark was actually emitted.
 */
export function markTimeToValueStep(stepId, props = {}) {
  if (typeof window === 'undefined') return false;
  // Before the event buffer, localStorage, and PostHog: a disabled run must
  // emit nothing and write nothing.
  if (isTelemetryDisabled()) return false;
  const stepIndex = TTV_STEP_INDEXES[stepId];
  if (!stepIndex) return false;

  const journey = resolveJourney();
  if (journey.steps && journey.steps[stepId] != null) return false;

  const now = Date.now();
  const previousMs = previousStepMs(journey.steps);
  const startedAtMs = typeof journey.started_at_ms === 'number' ? journey.started_at_ms : null;

  // Claim before firing: a throwing sink must not leave the step unclaimed and
  // re-firing on every subsequent call.
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

  // Write back so "once per journey" survives this origin — but only when the
  // CLI handed us the journey; the cloud/dist viewer would 404 on every mark.
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
