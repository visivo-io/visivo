/**
 * Workspace telemetry fan-out (VIS-775 / VIS-779).
 *
 * `emitWorkspaceEvent` must reach out-of-process observers (E2E tests, a
 * future browser analytics sink) via a `visivo:workspace-telemetry`
 * CustomEvent on `window` — under Vite the browser runtime has no `process`,
 * so the console-debug path never runs there and cannot be the signal an E2E
 * test asserts on. The in-memory `listener` (used by component unit tests)
 * still short-circuits everything else when set.
 */
import {
  emitWorkspaceEvent,
  setWorkspaceTelemetryListener,
  markBuildModeEntered,
  emitFirstPublishTelemetry,
  markExplorationCreated,
  emitTimeToFirstChart,
} from './telemetry';
import { postWorkspaceEvent } from '../../../api/workspaceTelemetry';

// Mock the PostHog sink so the integration tests below can assert the
// emit → sink contract (VIS-822) without network calls.
jest.mock('../../../api/workspaceTelemetry', () => ({
  postWorkspaceEvent: jest.fn(),
}));

const TEL_EVENT = 'visivo:workspace-telemetry';

describe('emitWorkspaceEvent', () => {
  afterEach(() => {
    setWorkspaceTelemetryListener(null);
  });

  test('dispatches a visivo:workspace-telemetry CustomEvent on window', () => {
    const received = [];
    const handler = e => received.push(e.detail);
    window.addEventListener(TEL_EVENT, handler);
    try {
      emitWorkspaceEvent('middle_pane_toggled', { pane: 'lineage', scope: 'item' });
    } finally {
      window.removeEventListener(TEL_EVENT, handler);
    }

    expect(received).toHaveLength(1);
    expect(received[0].eventName).toBe('middle_pane_toggled');
    expect(received[0].payload).toEqual({ pane: 'lineage', scope: 'item' });
    expect(typeof received[0].ts).toBe('number');
  });

  test('no-ops (no throw, no dispatch) when eventName is missing', () => {
    const received = [];
    const handler = e => received.push(e.detail);
    window.addEventListener(TEL_EVENT, handler);
    try {
      expect(() => emitWorkspaceEvent()).not.toThrow();
    } finally {
      window.removeEventListener(TEL_EVENT, handler);
    }
    expect(received).toHaveLength(0);
  });

  test('an in-memory listener short-circuits the window dispatch', () => {
    const windowEvents = [];
    const windowHandler = e => windowEvents.push(e.detail);
    window.addEventListener(TEL_EVENT, windowHandler);

    const listenerEvents = [];
    setWorkspaceTelemetryListener(e => listenerEvents.push(e));
    try {
      emitWorkspaceEvent('lineage_node_selected', { type: 'chart', name: 'fibonacci' });
    } finally {
      window.removeEventListener(TEL_EVENT, windowHandler);
    }

    expect(listenerEvents).toHaveLength(1);
    expect(listenerEvents[0].eventName).toBe('lineage_node_selected');
    // The CustomEvent path is skipped while a listener is registered.
    expect(windowEvents).toHaveLength(0);
  });

  test('a faulty in-memory listener cannot break the shell', () => {
    setWorkspaceTelemetryListener(() => {
      throw new Error('boom');
    });
    expect(() => emitWorkspaceEvent('middle_pane_toggled', {})).not.toThrow();
  });
});

describe('PostHog sink integration (VIS-822)', () => {
  beforeEach(() => {
    postWorkspaceEvent.mockClear();
  });

  afterEach(() => {
    setWorkspaceTelemetryListener(null);
  });

  test('emitWorkspaceEvent forwards the event to the sink with name + payload', () => {
    emitWorkspaceEvent('workspace_mode_entered', { dashboardName: 'sales', scope: 'dashboard' });

    expect(postWorkspaceEvent).toHaveBeenCalledTimes(1);
    const event = postWorkspaceEvent.mock.calls[0][0];
    expect(event.eventName).toBe('workspace_mode_entered');
    expect(event.payload).toEqual({ dashboardName: 'sales', scope: 'dashboard' });
    expect(typeof event.ts).toBe('number');
  });

  test('the in-memory test listener short-circuits the sink', () => {
    setWorkspaceTelemetryListener(() => {});
    emitWorkspaceEvent('canvas_action', { kind: 'add_row' });
    expect(postWorkspaceEvent).not.toHaveBeenCalled();
  });

  test('a throwing sink cannot break the shell', () => {
    postWorkspaceEvent.mockImplementationOnce(() => {
      throw new Error('sink boom');
    });
    expect(() => emitWorkspaceEvent('canvas_action', { kind: 'add_row' })).not.toThrow();
  });
});

describe('time_to_first_publish_in_build_mode (VIS-806 / H-1)', () => {
  let events;
  let unsubscribe;

  beforeEach(() => {
    events = [];
    unsubscribe = setWorkspaceTelemetryListener(evt => events.push(evt));
  });

  afterEach(() => {
    unsubscribe();
  });

  test('emits once per Build-mode entry, with elapsed ms', () => {
    markBuildModeEntered();
    emitFirstPublishTelemetry();
    emitFirstPublishTelemetry(); // second publish in the same session — no event

    const publishEvents = events.filter(
      e => e.eventName === 'time_to_first_publish_in_build_mode'
    );
    expect(publishEvents).toHaveLength(1);
    expect(publishEvents[0].payload.msSinceBuildModeEntered).toEqual(expect.any(Number));
    expect(publishEvents[0].payload.msSinceBuildModeEntered).toBeGreaterThanOrEqual(0);
  });

  test('re-entering Build mode re-arms the metric', () => {
    markBuildModeEntered();
    emitFirstPublishTelemetry();
    markBuildModeEntered();
    emitFirstPublishTelemetry();

    const publishEvents = events.filter(
      e => e.eventName === 'time_to_first_publish_in_build_mode'
    );
    expect(publishEvents).toHaveLength(2);
  });
});

describe('time_to_first_chart (VIS-1072)', () => {
  let events;
  let unsubscribe;

  beforeEach(() => {
    events = [];
    unsubscribe = setWorkspaceTelemetryListener(evt => events.push(evt));
  });

  afterEach(() => {
    unsubscribe();
  });

  const chartEvents = () => events.filter(e => e.eventName === 'time_to_first_chart');

  test('emits once per exploration, with elapsed ms', () => {
    markExplorationCreated('exp_1');
    emitTimeToFirstChart('exp_1');
    emitTimeToFirstChart('exp_1'); // a second render — no second event

    expect(chartEvents()).toHaveLength(1);
    expect(chartEvents()[0].payload.ms).toEqual(expect.any(Number));
    expect(chartEvents()[0].payload.ms).toBeGreaterThanOrEqual(0);
  });

  test('tracks multiple explorations independently', () => {
    markExplorationCreated('exp_1');
    markExplorationCreated('exp_2');
    emitTimeToFirstChart('exp_2');
    emitTimeToFirstChart('exp_1');

    expect(chartEvents()).toHaveLength(2);
  });

  test('never fires for an id this session never saw created (e.g. resumed after a reload)', () => {
    emitTimeToFirstChart('exp_never_created');
    expect(chartEvents()).toHaveLength(0);
  });

  test('re-creating the SAME id re-arms the metric', () => {
    markExplorationCreated('exp_1');
    emitTimeToFirstChart('exp_1');
    markExplorationCreated('exp_1');
    emitTimeToFirstChart('exp_1');

    expect(chartEvents()).toHaveLength(2);
  });

  test('no-ops (never throws) for a missing id', () => {
    expect(() => markExplorationCreated(null)).not.toThrow();
    expect(() => emitTimeToFirstChart(null)).not.toThrow();
    expect(chartEvents()).toHaveLength(0);
  });
});
