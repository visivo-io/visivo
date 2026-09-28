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

  // Mirror of visivo/models/diagnostic.py DIAGNOSTIC_CODES. The Python side
  // pins the two files against each other (tests/models/test_diagnostic.py
  // ::test_viewer_mirror_lists_every_diagnostic_code); this names the code the
  // Explorer's positional-axis 400 arrives with, so a viewer surface that
  // branches on it has something to branch on.
  test('carries the compile-time positional-axis code', () => {
    expect(DIAGNOSTIC_CODES).toContain('non_plottable_axis_type');
  });
});

describe('the draft endpoints 400 body', () => {
  // The exact shape visivo/server/views/insight_draft_common.py::
  // diagnostic_fields puts on the wire for a positional axis bound to a
  // STRUCT (WB9 / S5-14). A singular `diagnostic` object — the shape that
  // shipped first — reads as [] here, which is why it changed to a list.
  const body = {
    error: "Insight 'blank_chart': positional axis prop 'props.x' resolves to a STRUCT.",
    diagnostics: [
      {
        id: 'compile:non_plottable_axis_type:blank_chart:props.x',
        severity: 'error',
        phase: 'compile',
        code: 'non_plottable_axis_type',
        message: "Insight 'blank_chart': positional axis prop 'props.x' resolves to a STRUCT.",
        object: { type: 'insight', name: 'blank_chart' },
        field: 'props.x',
        hint: "Bind 'props.x' to a single scalar column or expression.",
      },
    ],
  };

  test('is readable by the universal reader', () => {
    const diagnostics = diagnosticsFrom(body);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('non_plottable_axis_type');
    expect(diagnostics[0].field).toBe('props.x');
    expect(DIAGNOSTIC_CODES).toContain(diagnostics[0].code);
    expect(DIAGNOSTIC_PHASES).toContain(diagnostics[0].phase);
    expect(DIAGNOSTIC_SEVERITIES).toContain(diagnostics[0].severity);
  });

  test('a singular `diagnostic` object would have been invisible', () => {
    const singular = { error: body.error, diagnostic: body.diagnostics[0] };
    expect(diagnosticsFrom(singular)).toEqual([]);
  });
});
