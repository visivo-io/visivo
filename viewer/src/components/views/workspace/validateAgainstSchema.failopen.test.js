/**
 * validateAgainstSchema fail-open hardening (VIS-993 canvas-persist regression).
 *
 * The module's documented policy is FAIL-OPEN: "this gate only ever ADDS
 * protection, never bricks a save path the backend would accept." But
 * registerRoot (the $id-strip JSON round-trip + ajv.addSchema) and the
 * validator execution ran OUTSIDE any try/catch — any internal error REJECTED
 * the async gate promise. Every persistence call site consumed the gate with
 * a bare `.then(...)`, so a rejected gate silently swallowed the save: the
 * optimistic UI applied, canvas_action telemetry fired, and NOTHING persisted
 * — no POST, and not even the canvas_commit_blocked event. That is exactly
 * the field regression ("all of the drag to resize is broken").
 *
 * These tests force an internal registerRoot error (a circular $defs graph
 * makes the JSON round-trip throw) and pin that the gate RESOLVES with the
 * policy's skip verdict instead of rejecting.
 */
import {
  validateRecordConfig,
  validateRecordConfigSync,
  clearValidationCache,
} from './validateAgainstSchema';
import { getObjectSchema } from '../../../schemas/projectSchema';

jest.mock('../../../schemas/projectSchema', () => {
  const actual = jest.requireActual('../../../schemas/projectSchema');
  return {
    ...actual,
    getObjectSchema: jest.fn(actual.getObjectSchema),
    preloadProjectSchema: jest.fn(() => Promise.resolve()),
  };
});

// Silence the expected console.error from the hardened fail-open path.
let consoleErrorSpy;
beforeEach(() => {
  clearValidationCache();
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleErrorSpy.mockRestore();
  jest.clearAllMocks();
});

describe('gate-internal errors fail OPEN (never reject, never swallow a save)', () => {
  test('a registerRoot crash resolves skipped-valid instead of rejecting', async () => {
    // A circular $defs graph makes registerRoot's JSON.stringify round-trip
    // throw — standing in for any internal registration/compile failure.
    const circular = { Dashboard: { type: 'object' } };
    circular.Dashboard.self = circular;
    getObjectSchema.mockResolvedValueOnce({ $defs: circular });

    // BEFORE the fix this REJECTED (TypeError: circular structure) — and the
    // call sites' bare `.then` swallowed the save with zero telemetry.
    await expect(
      validateRecordConfig('dashboard', { name: 'd', rows: [] })
    ).resolves.toMatchObject({ valid: true, skipped: true });
  });

  test('after a registerRoot crash the sync path stays fail-open too', async () => {
    const circular = { Dashboard: { type: 'object' } };
    circular.Dashboard.self = circular;
    getObjectSchema.mockResolvedValueOnce({ $defs: circular });
    await validateRecordConfig('dashboard', { name: 'd', rows: [] }).catch(() => {});

    // Root never registered — the sync fast path must keep returning its
    // "defer to fire time" null, not throw.
    expect(() => validateRecordConfigSync('dashboard', { name: 'd', rows: [] })).not.toThrow();
  });

  test('a healthy schema still validates normally after the hardening', async () => {
    const result = await validateRecordConfig('dashboard', {
      name: 'd',
      rows: [{ height: 487, items: [{ width: 7 }] }],
    });
    expect(result.valid).toBe(true);
    expect(result.skipped).toBeUndefined();
  });
});
