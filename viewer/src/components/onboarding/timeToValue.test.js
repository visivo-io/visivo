/* Tests for the time-to-value step marks (Guided First Run W1).
 *
 * What they pin: a mark fires exactly once per journey, including across a
 * reload; marks come out in ladder order with monotonic timestamps; every mark
 * carries the properties required by specs/marketing-relaunch/event-taxonomy.md
 * §4; the opt-out suppresses all of them and writes nothing; and no payload
 * contains a user-authored string.
 */

import {
  markTimeToValueStep,
  getTimeToValueJourney,
  clearTimeToValueLedger,
  TTV_STEPS,
  TTV_STEP_INDEXES,
} from './timeToValue';
import { getEventBuffer, clearEventBuffer } from './telemetry';
import { postFirstRunStep } from '../../api/firstRunSteps';

jest.mock('../../api/firstRunSteps', () => ({ postFirstRunStep: jest.fn() }));

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
  postFirstRunStep.mockClear();
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
  });

  test('a viewer-minted journey reports ms_since_first_run as null, not zero', () => {
    // Taxonomy §4: null when the journey start is unknown. Minting Date.now()
    // instead would report a ~0ms time-to-value for every cloud dashboard view.
    markTimeToValueStep(TTV_STEPS.FIRST_DASHBOARD_RENDERED, {
      item_count: 1,
      from_sample: false,
    });

    const props = marks()[0].props;
    expect(props.ms_since_first_run).toBeNull();
    expect(props.install_age_ms).toBeNull();
  });

  test('a later mark in a viewer-minted journey still measures the gap it does know', () => {
    // ms_since_first_run stays null, but ms_since_previous_step is real: the
    // journey start is unknown, the gap between two marks is not.
    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);
    markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED);

    const second = marks()[1].props;
    expect(second.ms_since_first_run).toBeNull();
    expect(second.ms_since_previous_step).toBeGreaterThanOrEqual(0);
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
      'install_age_ms',
      'journey_id',
      'machine_id',
      'started_at_ms',
      'steps',
    ]);
    expect(Object.values(ledger.steps).every(v => typeof v === 'number')).toBe(true);
    // journey_id and machine_id are the only strings — nothing else may become
    // somewhere a name or a path can hide.
    expect(Object.entries(ledger)
      .filter(([, value]) => typeof value === 'string')
      .map(([key]) => key)
      .sort()).toEqual(['journey_id', 'machine_id']);
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

describe('idempotence off this browser origin', () => {
  /* `localStorage` is scoped to `http://localhost:<port>`; the journey in
   * ~/.visivo/first_run.json is not, and survives a port change, a second
   * browser, and a site-data clear. */

  test('a mark is written back to the server so the next origin can dedupe it', () => {
    injectCliJourney({ journeyId: 'J-1' });

    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);

    expect(postFirstRunStep).toHaveBeenCalledTimes(1);
    const call = postFirstRunStep.mock.calls[0][0];
    expect(call.journeyId).toBe('J-1');
    expect(call.stepId).toBe('source_connected');
    expect(typeof call.atMs).toBe('number');
  });

  test('a step the server already knows about is NOT re-fired on a fresh origin', () => {
    // The exact scenario: `visivo serve -p 8001` (a new localStorage origin),
    // or a second browser. The viewer ledger is empty; the injected journey
    // carries the mark because the server recorded it.
    injectCliJourney({
      journeyId: 'J-1',
      steps: { first_run_launched: 1000, source_connected: 2000 },
    });
    expect(window.localStorage.getItem(LEDGER_KEY)).toBeNull();

    expect(markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED)).toBe(false);
    expect(marks()).toHaveLength(0);
  });

  test('a cleared site-data mid-journey does not re-fire what already fired', () => {
    injectCliJourney({ journeyId: 'J-1', steps: { first_run_launched: 1000 } });
    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);
    const writtenBack = postFirstRunStep.mock.calls[0][0];

    // The user clears site data. The server, which was told, hands the same
    // journey back with the mark on it.
    clearTimeToValueLedger();
    injectCliJourney({
      journeyId: 'J-1',
      steps: { first_run_launched: 1000, [writtenBack.stepId]: writtenBack.atMs },
    });

    expect(markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED)).toBe(false);
    expect(marks().filter(m => m.event === 'source_connected')).toHaveLength(1);
  });

  test('the cloud viewer writes nothing back — there is no server to write to', () => {
    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);

    expect(postFirstRunStep).not.toHaveBeenCalled();
  });

  test('an opted-out run writes nothing back either', () => {
    window.__VISIVO_TELEMETRY_DISABLED = true;
    injectCliJourney();

    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);

    expect(postFirstRunStep).not.toHaveBeenCalled();
  });
});

describe('install age', () => {
  /* The ledger's absence cannot mean "first run" — no install has one until
   * this ships, so on rollout day every established machine mints a journey.
   * install_age_ms is what tells those apart. */

  test('the CLI-reported install age rides on every viewer mark', () => {
    window.__VISIVO_FIRST_RUN = {
      journey_id: 'J-1',
      started_at_ms: Date.now() - 1000,
      install_age_ms: 400 * 86400 * 1000,
      machine_id: 'machine-abc',
      steps: {},
    };

    markTimeToValueStep(TTV_STEPS.FIRST_DASHBOARD_RENDERED, {
      item_count: 1,
      from_sample: false,
    });

    expect(marks()[0].props.install_age_ms).toBe(400 * 86400 * 1000);
  });

  test('it survives a reload, because the terminal mark is what needs it', () => {
    window.__VISIVO_FIRST_RUN = {
      journey_id: 'J-1',
      started_at_ms: Date.now() - 1000,
      install_age_ms: 12345,
      machine_id: 'machine-abc',
      steps: {},
    };
    markTimeToValueStep(TTV_STEPS.SOURCE_CONNECTED);

    // A reload: the ledger is read back from localStorage, journey unchanged.
    markTimeToValueStep(TTV_STEPS.FIRST_MODEL_CREATED);

    expect(marks()[1].props.install_age_ms).toBe(12345);
  });
});
