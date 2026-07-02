/**
 * Workspace telemetry sink (VIS-822).
 *
 * `buildWorkspaceTelemetryRequest` is the testable core — it resolves the
 * relay URL through the urls.js null-pattern (local-only endpoint) and shapes
 * the POST body. `postWorkspaceEvent` is a thin fire-and-forget dispatcher
 * that is a deliberate no-op under jest (asserted here).
 */
import { buildWorkspaceTelemetryRequest, postWorkspaceEvent } from './workspaceTelemetry';
import { isAvailable, getUrl } from '../contexts/URLContext';

jest.mock('../contexts/URLContext', () => ({
  isAvailable: jest.fn(),
  getUrl: jest.fn(),
}));

describe('buildWorkspaceTelemetryRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAvailable.mockReturnValue(true);
    getUrl.mockReturnValue('/api/telemetry/workspace-event/');
  });

  test('builds a keepalive POST with name + payload + ts', () => {
    const request = buildWorkspaceTelemetryRequest({
      eventName: 'canvas_action',
      payload: { kind: 'resize_item', fluid: true },
      ts: 1718000000000,
    });

    expect(request.url).toBe('/api/telemetry/workspace-event/');
    expect(request.options.method).toBe('POST');
    expect(request.options.keepalive).toBe(true);
    expect(request.options.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(request.options.body)).toEqual({
      name: 'canvas_action',
      payload: { kind: 'resize_item', fluid: true },
      ts: 1718000000000,
    });
  });

  test('defaults a missing payload to an empty object', () => {
    const request = buildWorkspaceTelemetryRequest({ eventName: 'workspace_mode_entered' });
    expect(JSON.parse(request.options.body).payload).toEqual({});
  });

  test('returns null when the endpoint is unavailable (dist mode / uninitialized)', () => {
    isAvailable.mockReturnValue(false);
    expect(
      buildWorkspaceTelemetryRequest({ eventName: 'canvas_action', payload: {} })
    ).toBeNull();
    expect(getUrl).not.toHaveBeenCalled();
  });

  test('returns null for malformed events', () => {
    expect(buildWorkspaceTelemetryRequest(null)).toBeNull();
    expect(buildWorkspaceTelemetryRequest({})).toBeNull();
    expect(buildWorkspaceTelemetryRequest({ eventName: '' })).toBeNull();
    expect(buildWorkspaceTelemetryRequest({ eventName: 42 })).toBeNull();
  });
});

describe('postWorkspaceEvent', () => {
  test('is a no-op under jest (never dispatches network calls from unit tests)', () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    try {
      expect(() =>
        postWorkspaceEvent({ eventName: 'canvas_action', payload: { kind: 'add_row' } })
      ).not.toThrow();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      delete global.fetch;
    }
  });
});

describe('postWorkspaceEvent outside jest (JEST_WORKER_ID cleared)', () => {
  // The jest guard keys off process.env.JEST_WORKER_ID; removing it exercises
  // the real fire-and-forget dispatch path.
  const originalWorkerId = process.env.JEST_WORKER_ID;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.JEST_WORKER_ID;
    isAvailable.mockReturnValue(true);
    getUrl.mockReturnValue('/api/telemetry/workspace-event/');
  });

  afterEach(() => {
    process.env.JEST_WORKER_ID = originalWorkerId;
    delete global.fetch;
  });

  test('dispatches fetch with the built request (keepalive POST)', () => {
    const fetchSpy = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetchSpy;

    postWorkspaceEvent({ eventName: 'canvas_action', payload: { kind: 'add_row' }, ts: 123 });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/telemetry/workspace-event/');
    expect(options.method).toBe('POST');
    expect(options.keepalive).toBe(true);
    expect(JSON.parse(options.body)).toEqual({
      name: 'canvas_action',
      payload: { kind: 'add_row' },
      ts: 123,
    });
  });

  test('swallows fetch rejections (telemetry never throws into the render path)', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));

    expect(() => postWorkspaceEvent({ eventName: 'canvas_action' })).not.toThrow();
    // Flush the rejected promise; an unhandled rejection here would fail the test
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  test('does not fetch when the sink is unavailable (request builds to null)', () => {
    isAvailable.mockReturnValue(false);
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    postWorkspaceEvent({ eventName: 'canvas_action' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('is safe when fetch is not a function', () => {
    global.fetch = undefined;

    expect(() => postWorkspaceEvent({ eventName: 'canvas_action' })).not.toThrow();
  });

  test('swallows synchronous errors thrown while building the request', () => {
    getUrl.mockImplementation(() => {
      throw new Error('URLConfig not initialized');
    });
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;

    expect(() => postWorkspaceEvent({ eventName: 'canvas_action' })).not.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
