/**
 * runDashboardConfigGate (VIS-993 canvas-persist regression) — the ONE shared
 * gate runner for dashboard-structure persistence (canvas commitCanvasConfig +
 * the rail's persistConfig). Exactly-once verdict callback, sync when the
 * schema is warm, and — the regression pin — FAIL-OPEN when the async gate
 * errors: a gate crash must persist (backend stays authoritative), never
 * silently swallow the save.
 */
import { runDashboardConfigGate } from './itemMutations';
import {
  validateRecordConfig,
  validateRecordConfigSync,
} from './validateAgainstSchema';

jest.mock('./validateAgainstSchema', () => ({
  validateRecordConfig: jest.fn(),
  validateRecordConfigSync: jest.fn(),
}));

const VALID = { name: 'd', rows: [{ height: 'medium', items: [{ width: 1 }] }] };

let consoleErrorSpy;
beforeEach(() => {
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
  jest.clearAllMocks();
});

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('runDashboardConfigGate', () => {
  test('leaf-exclusivity violations block BEFORE any schema work', () => {
    const onResult = jest.fn();
    runDashboardConfigGate(
      {
        rows: [
          // eslint-disable-next-line no-template-curly-in-string
          { items: [{ width: 1, chart: '${ref(a)}', table: '${ref(b)}' }] }, // eslint-disable-line no-template-curly-in-string
        ],
      },
      onResult
    );
    expect(onResult).toHaveBeenCalledTimes(1);
    const blocked = onResult.mock.calls[0][0];
    expect(blocked.valid).toBe(false);
    expect(blocked.errors[0].keyword).toBe('exclusive');
    expect(validateRecordConfigSync).not.toHaveBeenCalled();
  });

  test('warm sync path: valid verdict → onResult(null) synchronously', () => {
    validateRecordConfigSync.mockReturnValue({ valid: true, errors: [] });
    const onResult = jest.fn();
    runDashboardConfigGate(VALID, onResult);
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(null);
    expect(validateRecordConfig).not.toHaveBeenCalled();
  });

  test('warm sync path: invalid verdict → onResult(blocked)', () => {
    const verdict = { valid: false, errors: [{ path: 'rows.0', message: 'bad', keyword: 'type' }] };
    validateRecordConfigSync.mockReturnValue(verdict);
    const onResult = jest.fn();
    runDashboardConfigGate(VALID, onResult);
    expect(onResult).toHaveBeenCalledWith(verdict);
  });

  test('cold async path: valid verdict persists', async () => {
    validateRecordConfigSync.mockReturnValue(null);
    validateRecordConfig.mockResolvedValue({ valid: true, errors: [] });
    const onResult = jest.fn();
    runDashboardConfigGate(VALID, onResult);
    expect(onResult).not.toHaveBeenCalled(); // deferred to the async verdict
    await flush();
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(null);
  });

  test('cold async path: invalid verdict blocks', async () => {
    validateRecordConfigSync.mockReturnValue(null);
    const verdict = { valid: false, errors: [{ path: '', message: 'nope', keyword: 'required' }] };
    validateRecordConfig.mockResolvedValue(verdict);
    const onResult = jest.fn();
    runDashboardConfigGate(VALID, onResult);
    await flush();
    expect(onResult).toHaveBeenCalledWith(verdict);
  });

  test('REGRESSION: a rejecting async gate FAILS OPEN — the save still fires', async () => {
    // The field failure: cold session → sync returns null → async gate errors
    // internally → with a bare `.then` the verdict never arrived, so the
    // canvas showed the resize (optimistic) but NOTHING persisted and not even
    // canvas_commit_blocked fired. The shared runner must fail open instead.
    validateRecordConfigSync.mockReturnValue(null);
    validateRecordConfig.mockRejectedValue(new Error('ajv exploded'));
    const onResult = jest.fn();
    runDashboardConfigGate(VALID, onResult);
    await flush();
    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith(null); // fail-open → persist
  });

  test('a THROWING sync gate fails open too (never breaks the commit call)', () => {
    validateRecordConfigSync.mockImplementation(() => {
      throw new Error('sync validator exploded');
    });
    const onResult = jest.fn();
    expect(() => runDashboardConfigGate(VALID, onResult)).not.toThrow();
    expect(onResult).toHaveBeenCalledWith(null);
  });
});
