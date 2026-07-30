/* eslint-disable no-template-curly-in-string -- test fixtures use literal Visivo `${ref(...)}` strings */
import {
  parse,
  serialize,
  PRESET_AGGREGATIONS,
  MEDIAN_SUPPORTED_DIALECTS,
  isMedianSupported,
} from './pillGrammar';

const METRICS = [{ name: 'churn_rate', parentModel: 'orders_q' }];
const DIMENSIONS = [{ name: 'signup_cohort', parentModel: 'orders_q' }];
const OPTS = { metricFields: METRICS, dimensionFields: DIMENSIONS };

describe('pillGrammar.parse', () => {
  test('bare column ref -> dimension', () => {
    const state = parse('${ref(orders_q).region}', OPTS);
    expect(state).toEqual({
      kind: 'dimension',
      ref: 'orders_q',
      column: 'region',
      raw: '${ref(orders_q).region}',
    });
  });

  test('preset-wrapped column ref -> aggregate', () => {
    const state = parse('sum(${ref(orders_q).amount})', OPTS);
    expect(state).toEqual({
      kind: 'aggregate',
      agg: 'sum',
      ref: 'orders_q',
      column: 'amount',
      raw: 'sum(${ref(orders_q).amount})',
    });
  });

  test.each(PRESET_AGGREGATIONS)('recognizes every preset aggregation: %s', agg => {
    const state = parse(`${agg}(\${ref(orders_q).amount})`, OPTS);
    expect(state.kind).toBe('aggregate');
    expect(state.agg).toBe(agg);
  });

  test('aggregation is case-insensitive on the function name', () => {
    const state = parse('SUM(${ref(orders_q).amount})', OPTS);
    expect(state.kind).toBe('aggregate');
    expect(state.agg).toBe('sum');
  });

  test('bare ref matching a known metric name -> metricRef', () => {
    const state = parse('${ref(churn_rate)}', OPTS);
    expect(state).toEqual({ kind: 'metricRef', ref: 'churn_rate', raw: '${ref(churn_rate)}' });
  });

  test('bare ref matching a known dimension name -> dimensionRef', () => {
    const state = parse('${ref(signup_cohort)}', OPTS);
    expect(state).toEqual({
      kind: 'dimensionRef',
      ref: 'signup_cohort',
      raw: '${ref(signup_cohort)}',
    });
  });

  test('bare ref matching nothing known -> opaque (never invented as a dimension)', () => {
    const state = parse('${ref(some_unknown_thing)}', OPTS);
    expect(state.kind).toBe('opaque');
    expect(state.raw).toBe('${ref(some_unknown_thing)}');
  });

  test('unparseable / free-typed expression -> opaque, raw preserved verbatim', () => {
    const raw = 'count(distinct ${ref(orders_q).id}) / count(*)';
    const state = parse(raw, OPTS);
    expect(state).toEqual({ kind: 'opaque', raw });
  });

  test('unknown aggregation function wrapping a real column ref -> opaque, not invented as "aggregate"', () => {
    const raw = 'percentile_cont(${ref(orders_q).amount})';
    const state = parse(raw, OPTS);
    expect(state.kind).toBe('opaque');
    expect(state.raw).toBe(raw);
  });

  test('empty string -> opaque', () => {
    expect(parse('', OPTS)).toEqual({ kind: 'opaque', raw: '' });
  });

  test('non-string input -> opaque with empty raw (defensive)', () => {
    expect(parse(undefined, OPTS)).toEqual({ kind: 'opaque', raw: '' });
    expect(parse(null, OPTS)).toEqual({ kind: 'opaque', raw: '' });
  });

  // ── Global-name-first resolution (the riskiest assumption, S5 §5) ────────
  describe('global-name-first collision (field_resolver.py:344-406 parity)', () => {
    test('${ref(model).field} where field collides with a global metric -> metricRef, ignoring the stated model', () => {
      // orders_q does NOT own `churn_rate`, but backend resolves by field
      // name globally once it matches a real Metric node — the pill must
      // classify this as metricRef, not as a bare "orders_q.churn_rate" dimension.
      const state = parse('${ref(totally_different_model).churn_rate}', OPTS);
      expect(state.kind).toBe('metricRef');
      expect(state.ref).toBe('churn_rate');
    });

    test('surfaces statedModel/resolvedParent when they differ (drives the PillMenu preflight warning)', () => {
      const state = parse('${ref(model_a).churn_rate}', OPTS);
      expect(state.kind).toBe('metricRef');
      expect(state.statedModel).toBe('model_a');
      expect(state.resolvedParent).toBe('orders_q');
    });

    test('does NOT surface statedModel/resolvedParent when the stated model already matches the true parent', () => {
      const state = parse('${ref(orders_q).churn_rate}', OPTS);
      expect(state.kind).toBe('metricRef');
      expect(state.statedModel).toBeUndefined();
      expect(state.resolvedParent).toBeUndefined();
    });

    test('aggregate wrapping a global-colliding field is opaque, not a composite state', () => {
      const raw = 'sum(${ref(orders_q).churn_rate})';
      const state = parse(raw, OPTS);
      expect(state).toEqual({ kind: 'opaque', raw });
    });

    test('with no metric/dimension name lists supplied, falls back to plain dimension classification', () => {
      const state = parse('${ref(orders_q).churn_rate}');
      expect(state.kind).toBe('dimension');
      expect(state.ref).toBe('orders_q');
      expect(state.column).toBe('churn_rate');
    });
  });
});

describe('pillGrammar.serialize', () => {
  test('dimension -> ${ref(model).column}', () => {
    expect(serialize({ kind: 'dimension', ref: 'orders_q', column: 'region' })).toBe(
      '${ref(orders_q).region}'
    );
  });

  test('aggregate -> agg(${ref(model).column})', () => {
    expect(
      serialize({ kind: 'aggregate', agg: 'avg', ref: 'orders_q', column: 'amount' })
    ).toBe('avg(${ref(orders_q).amount})');
  });

  test('metricRef -> bare ${ref(name)}', () => {
    expect(serialize({ kind: 'metricRef', ref: 'churn_rate' })).toBe('${ref(churn_rate)}');
  });

  test('dimensionRef -> bare ${ref(name)}', () => {
    expect(serialize({ kind: 'dimensionRef', ref: 'signup_cohort' })).toBe(
      '${ref(signup_cohort)}'
    );
  });

  test('opaque passes raw through verbatim', () => {
    const raw = 'count(distinct ${ref(orders_q).id}) / count(*)';
    expect(serialize({ kind: 'opaque', raw })).toBe(raw);
  });

  test('custom (Phase 4 reserved) passes raw through verbatim', () => {
    expect(serialize({ kind: 'custom', raw: 'ƒ churn ratio expr' })).toBe('ƒ churn ratio expr');
  });

  test('unknown/missing state -> empty string, never throws', () => {
    expect(serialize(null)).toBe('');
    expect(serialize(undefined)).toBe('');
  });

  test('round-trip fidelity: parse -> serialize reproduces recognized states exactly', () => {
    const cases = [
      '${ref(orders_q).region}',
      'sum(${ref(orders_q).amount})',
      'median(${ref(orders_q).amount})',
      '${ref(churn_rate)}',
      '${ref(signup_cohort)}',
    ];
    cases.forEach(raw => {
      const state = parse(raw, OPTS);
      expect(serialize(state)).toBe(raw);
    });
  });

  test('opaque round-trip fidelity: parse -> serialize never rewrites an unparseable expression', () => {
    const cases = [
      'count(distinct ${ref(orders_q).id}) / count(*)',
      'percentile_cont(${ref(orders_q).amount})',
      '${ref(some_unknown_thing)}',
    ];
    cases.forEach(raw => {
      const state = parse(raw, OPTS);
      expect(state.kind).toBe('opaque');
      expect(serialize(state)).toBe(raw);
    });
  });
});

describe('MEDIAN dialect gating', () => {
  test('MEDIAN_SUPPORTED_DIALECTS is the hand-verified allowlist (excludes mysql/sqlite)', () => {
    expect([...MEDIAN_SUPPORTED_DIALECTS].sort()).toEqual(
      ['bigquery', 'clickhouse', 'duckdb', 'postgres', 'redshift', 'snowflake'].sort()
    );
    expect(MEDIAN_SUPPORTED_DIALECTS.has('mysql')).toBe(false);
    expect(MEDIAN_SUPPORTED_DIALECTS.has('sqlite')).toBe(false);
  });

  test.each(['duckdb', 'snowflake', 'bigquery', 'redshift', 'postgres', 'clickhouse'])(
    'isMedianSupported(%s) -> true',
    dialect => {
      expect(isMedianSupported(dialect)).toBe(true);
    }
  );

  test.each(['mysql', 'sqlite'])('isMedianSupported(%s) -> false', dialect => {
    expect(isMedianSupported(dialect)).toBe(false);
  });

  test('isMedianSupported is case-insensitive', () => {
    expect(isMedianSupported('DuckDB')).toBe(true);
    expect(isMedianSupported('MySQL')).toBe(false);
  });

  test('fails OPEN (shows MEDIAN) for an unresolved/null dialect', () => {
    expect(isMedianSupported(undefined)).toBe(true);
    expect(isMedianSupported(null)).toBe(true);
    expect(isMedianSupported('')).toBe(true);
  });
});
