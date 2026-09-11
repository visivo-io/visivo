/**
 * Time-to-value mark write-back (Guided First Run W1).
 *
 * `buildFirstRunStepRequest` is the testable core — it resolves the local-only
 * endpoint through the urls.js null-pattern and shapes the POST body.
 * `postFirstRunStep` is a thin fire-and-forget dispatcher that is a deliberate
 * no-op under jest (asserted here).
 */
import { buildFirstRunStepRequest, postFirstRunStep } from './firstRunSteps';
import { isAvailable, getUrl } from '../contexts/URLContext';

jest.mock('../contexts/URLContext', () => ({
  isAvailable: jest.fn(),
  getUrl: jest.fn(),
}));

describe('buildFirstRunStepRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAvailable.mockReturnValue(true);
    getUrl.mockReturnValue('/api/telemetry/first-run/step/');
  });

  test('builds a keepalive POST carrying the step, the journey and the timestamp', () => {
    const request = buildFirstRunStepRequest({
      journeyId: 'J-1',
      stepId: 'source_connected',
      atMs: 1718000000000,
    });

    expect(request.url).toBe('/api/telemetry/first-run/step/');
    expect(request.options.method).toBe('POST');
    // Without keepalive, the terminal mark is the one a navigation cancels.
    expect(request.options.keepalive).toBe(true);
    expect(JSON.parse(request.options.body)).toEqual({
      step_id: 'source_connected',
      journey_id: 'J-1',
      at_ms: 1718000000000,
    });
  });

  test('a mark with no journey id still round-trips as explicit nulls', () => {
    const body = JSON.parse(
      buildFirstRunStepRequest({ stepId: 'first_model_created' }).options.body
    );
    expect(body).toEqual({ step_id: 'first_model_created', journey_id: null, at_ms: null });
  });

  test('carries nothing but ids and a timestamp — no name, no path, no SQL', () => {
    const body = JSON.parse(
      buildFirstRunStepRequest({
        journeyId: 'J-1',
        stepId: 'first_query_run',
        atMs: 1718000000000,
      }).options.body
    );
    expect(Object.keys(body).sort()).toEqual(['at_ms', 'journey_id', 'step_id']);
  });

  test('returns null in the dist/cloud viewer, where there is no server to write to', () => {
    isAvailable.mockReturnValue(false);

    expect(buildFirstRunStepRequest({ stepId: 'source_connected' })).toBeNull();
    expect(getUrl).not.toHaveBeenCalled();
  });

  test('returns null for a malformed mark', () => {
    expect(buildFirstRunStepRequest(null)).toBeNull();
    expect(buildFirstRunStepRequest({})).toBeNull();
    expect(buildFirstRunStepRequest({ stepId: '' })).toBeNull();
    expect(buildFirstRunStepRequest({ stepId: 42 })).toBeNull();
  });
});

describe('postFirstRunStep', () => {
  test('is a no-op under jest so unit tests never dispatch network calls', () => {
    const fetchSpy = jest.fn();
    global.fetch = fetchSpy;
    isAvailable.mockReturnValue(true);
    getUrl.mockReturnValue('/api/telemetry/first-run/step/');

    postFirstRunStep({ journeyId: 'J-1', stepId: 'source_connected', atMs: 1 });

    expect(fetchSpy).not.toHaveBeenCalled();
    delete global.fetch;
  });

  test('never throws into the caller, whatever the sink does', () => {
    isAvailable.mockImplementation(() => {
      throw new Error('URLConfig exploded');
    });

    expect(() => postFirstRunStep({ stepId: 'source_connected' })).not.toThrow();
  });
});
