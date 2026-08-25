import { DIAGNOSTIC_CODES, DIAGNOSTIC_PHASES, DIAGNOSTIC_SEVERITIES, diagnosticsFrom } from './diagnostic';

describe('diagnosticsFrom', () => {
  const valid = { severity: 'error', phase: 'run', code: 'not_built', message: 'never built' };

  test('reads diagnostics off a payload that carries them', () => {
    expect(diagnosticsFrom({ phase: 'run', diagnostics: [valid] })).toEqual([valid]);
  });

  test('returns [] for pre-contract payloads, null, and junk shapes', () => {
    expect(diagnosticsFrom({ phase: 'run' })).toEqual([]);
    expect(diagnosticsFrom(null)).toEqual([]);
    expect(diagnosticsFrom(undefined)).toEqual([]);
    expect(diagnosticsFrom({ diagnostics: 'nope' })).toEqual([]);
    expect(diagnosticsFrom({ diagnostics: { message: 'not an array' } })).toEqual([]);
  });

  test('filters entries without a string message', () => {
    expect(
      diagnosticsFrom({ diagnostics: [valid, null, { code: 'not_built' }, { message: 7 }] })
    ).toEqual([valid]);
  });

  test('tolerates a JSON-encoded string payload (older error_json rows)', () => {
    expect(diagnosticsFrom(JSON.stringify({ phase: 'run', diagnostics: [valid] }))).toEqual([
      valid,
    ]);
    expect(diagnosticsFrom('not json {')).toEqual([]);
  });
});

describe('contract mirrors', () => {
  test('vocabularies are non-empty and duplicate-free', () => {
    for (const list of [DIAGNOSTIC_CODES, DIAGNOSTIC_PHASES, DIAGNOSTIC_SEVERITIES]) {
      expect(list.length).toBeGreaterThan(0);
      expect(new Set(list).size).toBe(list.length);
    }
  });
});
