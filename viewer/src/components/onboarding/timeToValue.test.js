/* Tests for the time-to-value step marks (Guided First Run W1).
 *
 * The 2.1 exit gate ("8 of 8 new users build a dashboard in under 20 minutes")
 * is read off this ladder, so these are tests of the metric, not of a shim:
 *
 *   - a mark fires EXACTLY ONCE per journey, including across a reload — a
 *     mark that re-fired would inflate the funnel and destroy the median;
 *   - marks come out in ladder order with monotonic timestamps;
 *   - every mark carries the required properties from
 *     specs/marketing-relaunch/event-taxonomy.md §4;
 *   - the opt-out suppresses all of them and writes nothing;
 *   - no payload contains a user-authored string.
 */

import {
  markTimeToValueStep,
  getTimeToValueJourney,
  clearTimeToValueLedger,
  TTV_STEPS,
  TTV_STEP_INDEXES,
} from './timeToValue';
import { getEventBuffer, clearEventBuffer } from './telemetry';

const LEDGER_KEY = 'visivo.ttv.v1';

/* A journey as the local Flask server injects it (data_views.py). */
function injectCliJourney({
  journeyId = 'journey-from-the-cli',
  startedAtMs = Date.now() - 60_000,
  machineId = 'machine-abc',
  steps = { first_run_launched: Date.now() - 60_000 },
} = {}) {
  window.__VISIVO_FIRST_RUN = {
    journey_id: journeyId,
    started_at_ms: startedAtMs,
    machine_id: machineId,
    steps,
  };
}

function marks() {
  return getEventBuffer();
}

beforeEach(() => {
  clearEventBuffer();
  clearTimeToValueLedger();
  delete window.__VISIVO_FIRST_RUN;
  delete window.__VISIVO_TELEMETRY_DISABLED;
});

describe('the ladder', () => {
  test('step indexes are the frozen contract, matching first_run.py', () => {
    expect(TTV_STEP_INDEXES).toEqual({
      first_run_launched: 1,
      source_connected: 2,
      first_query_run: 3,
      first_model_created: 4,
      first_insight_created: 5,
      first_dashboard_rendered: 6,
    });
  });

  test('step indexes cannot be mutated into a different ladder', () => {
    expect(Object.isFrozen(TTV_STEP_INDEXES)).toBe(true);
  });

  test('a full first run emits every step once, in order, with rising timestamps', () => {
    injectCliJourney();

    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED, { source_type: 'duckdb' });
    markTimeToValueStep(TTV_STEPS.FIRST_QUERY_RUN);
    markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED);
    markTimeToValueStep(TTV_STEPS.FIRST_INSIGHT_CREATED);
    markTimeToValueStep(TTV_STEPS.FIRST_DASHBOARD_RENDERED, {
      item_count: 2,
      from_sample: false,
    });

    expect(marks().map(m => m.event)).toEqual([
      'source_connected',
      'first_query_run',
      'first_model_created',
      'first_insight_created',
      'first_dashboard_rendered',
    ]);
    expect(marks().map(m => m.props.step_index)).toEqual([2, 3, 4, 5, 6]);
    const timestamps = marks().map(m => m.ts);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
    expect(marks().every(m => m.props.out_of_order === false)).toBe(true);
  });

  test('an unknown step is refused and emits nothing', () => {
    injectCliJourney();
    expect(markTimeToValueStep('scaffold_shown')).toBe(false);
    expect(marks()).toHaveLength(0);
  });
});

describe('required properties', () => {
  test('every mark carries the taxonomy §4 property set', () => {
    const startedAtMs = Date.now() - 120_000;
    injectCliJourney({ startedAtMs, steps: { first_run_launched: startedAtMs } });

    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED, { source_type: 'postgresql' });

    const props = marks()[0].props;
    expect(props.journey_id).toBe('journey-from-the-cli');
    expect(props.step_id).toBe('source_connected');
    expect(props.step_index).toBe(2);
    expect(props.machine_id).toBe('machine-abc');
    expect(props.out_of_order).toBe(false);
    expect(props.ms_since_first_run).toBeGreaterThanOrEqual(120_000);
    // Measured against the CLI's real mark, not guessed.
    expect(props.ms_since_previous_step).toBeGreaterThanOrEqual(120_000);
    expect(props.source_type).toBe('postgresql');
  });

  test('ms_since_previous_step is null for the first mark of a journey', () => {
    // No CLI step yet — e.g. the cloud viewer, which has no server to mark one.
    injectCliJourney({ steps: {} });

    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);

    expect(marks()[0].props.ms_since_previous_step).toBeNull();
  });

  test('a mark timestamped before the previous one is flagged out_of_order', () => {
    // A clock jump must show up as data, not as a silently wrong median.
    injectCliJourney({ steps: { first_run_launched: Date.now() + 10_000_000 } });

    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);

    expect(marks()[0].props.out_of_order).toBe(true);
  });

  test('the terminal mark carries from_sample so the TTV-5 trap is filterable', () => {
    injectCliJourney();

    markTimeToValueStep(TTV_STEPS.FIRST_DASHBOARD_RENDERED, {
      item_count: 3,
      from_sample: true,
    });

    expect(marks()[0].props).toMatchObject({
      step_id: 'first_dashboard_rendered',
      step_index: 6,
      item_count: 3,
      from_sample: true,
    });
  });
});

describe('exactly once per journey', () => {
  test('a repeated mark is a no-op', () => {
    injectCliJourney();

    expect(markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED)).toBe(true);
    expect(markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED)).toBe(false);
    expect(markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED)).toBe(false);

    expect(marks()).toHaveLength(1);
  });

  test('a reload does not re-fire an already-marked step', () => {
    injectCliJourney();
    markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED);

    // Reload: the buffer is a window-scoped array and does not survive; the
    // localStorage ledger is what has to.
    clearEventBuffer();
    injectCliJourney();

    expect(markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED)).toBe(false);
    expect(marks()).toHaveLength(0);
  });

  test('a step the CLI already marked is never re-fired by the viewer', () => {
    injectCliJourney({ steps: { first_run_launched: Date.now() - 1000 } });

    expect(markTimeToValueStep('first_run_launched')).toBe(false);
    expect(marks()).toHaveLength(0);
  });

  test('a genuinely new CLI journey replaces the stored one and marks again', () => {
    injectCliJourney({ journeyId: 'journey-one' });
    markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED);
    clearEventBuffer();

    injectCliJourney({ journeyId: 'journey-two', steps: {} });

    expect(markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED)).toBe(true);
    expect(marks()[0].props.journey_id).toBe('journey-two');
  });
});

describe('journey identity', () => {
  test('the CLI journey is adopted verbatim so both halves join on it', () => {
    injectCliJourney({ journeyId: 'j-1', machineId: 'm-1' });

    const journey = getTimeToValueJourney();

    expect(journey.journey_id).toBe('j-1');
    expect(journey.machine_id).toBe('m-1');
  });

  test('with no server-injected journey the viewer mints its own', () => {
    // The cloud/dist viewer has no Flask server, so nothing is injected — its
    // first run is still worth measuring, just with no CLI to join to.
    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);

    const props = marks()[0].props;
    expect(typeof props.journey_id).toBe('string');
    expect(props.journey_id.length).toBeGreaterThan(0);
    expect(props.machine_id).toBeNull();
    expect(props.ms_since_first_run).toBeGreaterThanOrEqual(0);
  });

  test('a locally-minted journey persists across marks', () => {
    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);
    markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED);

    const [first, second] = marks();
    expect(second.props.journey_id).toBe(first.props.journey_id);
  });
});

describe('the opt-out', () => {
  beforeEach(() => {
    window.__VISIVO_TELEMETRY_DISABLED = true;
  });

  test('no step mark is emitted', () => {
    injectCliJourney();

    Object.values(TTV_STEPS).forEach(step => {
      expect(markTimeToValueStep(step)).toBe(false);
    });

    expect(marks()).toHaveLength(0);
  });

  test('nothing is written to storage either', () => {
    injectCliJourney();
    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);

    expect(window.localStorage.getItem(LEDGER_KEY)).toBeNull();
  });

  test('no journey is even resolvable', () => {
    injectCliJourney();
    expect(getTimeToValueJourney()).toBeNull();
  });

  test('a non-boolean flag does not count as opting out', () => {
    // Matches posthogClient's gate exactly: only an explicit `true` disables.
    window.__VISIVO_TELEMETRY_DISABLED = 'true';
    injectCliJourney();

    expect(markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED)).toBe(true);
  });
});

describe('privacy', () => {
  test('no payload carries a user-authored string', () => {
    injectCliJourney();

    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED, { source_type: 'duckdb', via: 'onboarding' });
    markTimeToValueStep(TTV_STEPS.FIRST_QUERY_RUN);
    markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED);
    markTimeToValueStep(TTV_STEPS.FIRST_INSIGHT_CREATED);
    markTimeToValueStep(TTV_STEPS.FIRST_DASHBOARD_RENDERED, { item_count: 1, from_sample: false });

    const stringEntries = marks().flatMap(mark =>
      Object.entries(mark.props).filter(([, value]) => typeof value === 'string')
    );

    // Only the fixed vocabulary below may appear as a string; anything else is
    // a user-authored value that has no business in a telemetry payload.
    expect(stringEntries.map(([key]) => key).sort()).toEqual(
      expect.arrayContaining(['journey_id', 'machine_id', 'source_type', 'step_id', 'via'])
    );
    expect(
      stringEntries.filter(
        ([key]) => !['journey_id', 'step_id', 'machine_id', 'source_type', 'via'].includes(key)
      )
    ).toEqual([]);
    // No paths, emails, or anything else with a separator in it.
    expect(stringEntries.filter(([, value]) => /[/\\@]/.test(value))).toEqual([]);
  });

  test('the persisted ledger holds only ids and timestamps', () => {
    injectCliJourney();
    markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED);

    const ledger = JSON.parse(window.localStorage.getItem(LEDGER_KEY));
    expect(Object.keys(ledger).sort()).toEqual([
      'journey_id',
      'machine_id',
      'started_at_ms',
      'steps',
    ]);
    expect(Object.values(ledger.steps).every(v => typeof v === 'number')).toBe(true);
  });
});

describe('robustness', () => {
  test('a corrupt ledger does not throw and does not stop the mark', () => {
    window.localStorage.setItem(LEDGER_KEY, '{not json');

    expect(() => markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED)).not.toThrow();
    expect(marks()).toHaveLength(1);
  });

  test('a malformed injected journey is ignored rather than adopted', () => {
    window.__VISIVO_FIRST_RUN = { started_at_ms: 1, machine_id: 'm' };

    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);

    // Fell back to a locally-minted journey rather than trusting a journey
    // with no id.
    expect(marks()[0].props.machine_id).toBeNull();
    expect(marks()[0].props.journey_id).toBeTruthy();
  });
});
