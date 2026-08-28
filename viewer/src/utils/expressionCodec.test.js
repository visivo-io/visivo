/* eslint-disable no-template-curly-in-string -- literal Visivo `${ref(...)}` strings are the data under test, not template-literal mistakes */
import {
  EXPRESSION_FORMS,
  decodeQueryString,
  encodeQueryString,
  canonicalizeQueryString,
  isQueryStringValue,
  parseQueryString,
} from './expressionCodec';

/**
 * The shape table.
 *
 * Every entry is a value the app can genuinely put in front of the codec,
 * enumerated from the models rather than invented:
 *
 *  - `?{ }` query strings  — `QueryString` (visivo/models/base/query_string.py),
 *    the type of InsightInteraction.{filter,split,sort} and every query-string
 *    Plotly prop slot.
 *  - `${ }` context strings — `CONTEXT_STRING_REF_PATTERN` in
 *    visivo/query/patterns.py; what the @ ref picker and every pill drop emit
 *    as a BARE body, with no wrapper of their own.
 *  - `>{ }` eval strings   — `EvalString` (visivo/models/base/eval_string.py),
 *    the type of Test.assertions and Alert.if. A different grammar.
 *  - `query(...)` / `column(...)` — the legacy forms still listed in the AJV
 *    `$defs/query-string` and still matched by QUERY_COLUMN_PATTERN.
 *  - slices `[0] [-1] [1:5] [::2] [0,2]` — QUERY_STRING_VALUE_PATTERN's slice
 *    group.
 *  - already-wrapped and DOUBLY-wrapped values — what the six ad-hoc wrapper
 *    sites produce today (M24).
 *
 * `label` is only for test names; `value` is what goes in.
 */
const SHAPES = [
  // ── bare bodies: what a picker/pill/typed edit hands the save path (M6) ──
  { label: 'bare column ref', value: '${ref(orders).month}' },
  { label: 'bare column ref with direction', value: '${ref(orders).month} DESC' },
  { label: 'bare column ref, ASC', value: '${ref(orders).month} ASC' },
  { label: 'bare metric ref', value: '${ref(total_revenue)}' },
  { label: 'bare input ref comparison', value: '${ref(orders).region} = ${ref(region-input).value}' },
  { label: 'bare multi-select input ref', value: '${ref(orders).sku} in ${ref(sku-picker).values}' },
  { label: 'bare aggregate over a ref', value: 'sum(${ref(orders).amount})' },
  { label: 'bare nested aggregate', value: 'sum(${ref(orders).amount}) / count(${ref(orders).id})' },
  { label: 'bare quoted identifier', value: '${ref(orders)."Order Date"}' },
  { label: 'bare hyphenated model name', value: '${ref(my-model).col}' },
  { label: 'bare plain SQL identifier', value: 'amount' },
  { label: 'bare SQL with a case expression', value: "case when ${ref(o).amt} > 0 then 'pos' else 'neg' end" },
  { label: 'bare env context string', value: '${env.REGION}' },

  // ── already canonical: must survive byte-identical ──────────────────────
  { label: 'wrapped column ref', value: '?{${ref(orders).month}}' },
  { label: 'wrapped ref with direction', value: '?{${ref(orders).month} DESC}' },
  { label: 'wrapped aggregate', value: '?{sum(${ref(orders).amount})}' },
  { label: 'wrapped plain identifier', value: '?{amount}' },

  // ── wrapped, needing whitespace normalisation ───────────────────────────
  { label: 'wrapped with padding', value: '?{ ${ref(orders).month} }' },
  { label: 'wrapped with heavy padding', value: '?{   sum(${ref(o).amt})   }' },
  { label: 'wrapped with trailing space outside', value: '?{${ref(o).c}} ' },

  // ── slices ──────────────────────────────────────────────────────────────
  { label: 'wrapped + first index', value: '?{${ref(daily).value}}[0]' },
  { label: 'wrapped + last index', value: '?{${ref(daily).value}}[-1]' },
  { label: 'wrapped + range slice', value: '?{${ref(daily).value}}[1:5]' },
  { label: 'wrapped + strided slice', value: '?{${ref(daily).value}}[::2]' },
  { label: 'wrapped + multi-index pick', value: '?{${ref(daily).value}}[0,2]' },
  { label: 'wrapped aggregate + index', value: '?{max(${ref(daily).value})}[0]' },

  // ── doubly wrapped: what the ad-hoc wrapper sites produce today (M24) ───
  { label: 'double wrapped', value: '?{?{${ref(orders).month}}}' },
  { label: 'double wrapped with padding', value: '?{ ?{ ${ref(orders).month} } }' },
  { label: 'triple wrapped', value: '?{?{?{amount}}}' },
  { label: 'double wrapped, outer slice', value: '?{?{${ref(d).v}}}[0]' },
  { label: 'double wrapped, inner slice', value: '?{?{${ref(d).v}}[0]}' },

  // ── other grammars and legacy forms ─────────────────────────────────────
  { label: 'eval string', value: '>{ anyTestFailed() }' },
  { label: 'eval string with a ref', value: '>{ ${ ref(chart).props.x[0] } == 1 }' },
  { label: 'legacy query()', value: 'query(select 1)' },
  { label: 'legacy column()', value: 'column(amount)' },
  { label: 'legacy column() indexed', value: 'column(amount)[0]' },

  // ── empties ─────────────────────────────────────────────────────────────
  { label: 'empty string', value: '' },
  { label: 'whitespace only', value: '   ' },
  { label: 'null', value: null },
  { label: 'undefined', value: undefined },
  { label: 'a number', value: 42 },
];

describe('expressionCodec — idempotence (the property that matters)', () => {
  // The invariant M6 and M24 both violate, stated once and checked over the
  // whole table: normalising an already-normalised value must change nothing.
  // Test as a PROPERTY, not as a handful of examples — a codec that is
  // idempotent on `?{x}` but not on `?{?{x}}` is exactly the bug.
  it.each(SHAPES)('canonicalize is idempotent for $label', ({ value }) => {
    const once = canonicalizeQueryString(value);
    const twice = canonicalizeQueryString(once);
    expect(twice).toBe(once);
    // …and a third pass, because a two-cycle would satisfy f(f(x)) === f(x)
    // only by accident.
    expect(canonicalizeQueryString(twice)).toBe(once);
  });

  it.each(SHAPES)('encode(decode(x)) never nests a wrapper for $label', ({ value }) => {
    const encoded = canonicalizeQueryString(value);
    expect(encoded).not.toMatch(/\?\{\s*\?\{/);
  });

  it.each(SHAPES.filter(s => decodeQueryString(s.value).form !== EXPRESSION_FORMS.EMPTY))(
    'a canonical value re-decodes to the same body for $label',
    ({ value }) => {
      const first = decodeQueryString(value);
      const second = decodeQueryString(canonicalizeQueryString(value));
      // The BODY and SLICE survive untouched. The FORM is allowed to change —
      // turning a `bare` body into a `query` value is the whole job. And
      // re-decoding a canonical value never reports a repair: there is nothing
      // left to repair.
      expect({ body: second.body, slice: second.slice, repaired: second.repaired }).toEqual({
        body: first.body,
        slice: first.slice,
        repaired: false,
      });
      expect([EXPRESSION_FORMS.QUERY, EXPRESSION_FORMS.EVAL]).toContain(second.form);
    }
  );

  it.each(SHAPES.filter(s => decodeQueryString(s.value).form === EXPRESSION_FORMS.EMPTY))(
    'an empty value canonicalizes to the empty string for $label',
    ({ value }) => {
      expect(canonicalizeQueryString(value)).toBe('');
    }
  );

  it.each(SHAPES)('encodeQueryString itself is idempotent for $label', ({ value }) => {
    const once = encodeQueryString({ body: value });
    expect(encodeQueryString({ body: once })).toBe(once);
  });
});

describe('decodeQueryString', () => {
  it('returns the empty form for anything that is not a non-blank string', () => {
    for (const v of [null, undefined, 42, {}, [], '', '   ']) {
      expect(decodeQueryString(v)).toEqual({
        body: '',
        slice: null,
        form: EXPRESSION_FORMS.EMPTY,
        repaired: false,
      });
    }
  });

  it('splits a wrapped value into body and slice', () => {
    expect(decodeQueryString('?{${ref(m).c}}[1:5]')).toEqual({
      body: '${ref(m).c}',
      slice: '[1:5]',
      form: EXPRESSION_FORMS.QUERY,
      repaired: false,
    });
  });

  it('trims padding inside the wrapper', () => {
    expect(decodeQueryString('?{   sum(x)   }').body).toBe('sum(x)');
  });

  it('reports a bare body as BARE, with the body untouched', () => {
    expect(decodeQueryString('${ref(orders).month} DESC')).toEqual({
      body: '${ref(orders).month} DESC',
      slice: null,
      form: EXPRESSION_FORMS.BARE,
      repaired: false,
    });
  });

  it('unwraps a double wrapper to a fixpoint and flags the repair', () => {
    expect(decodeQueryString('?{?{ x }}')).toEqual({
      body: 'x',
      slice: null,
      form: EXPRESSION_FORMS.QUERY,
      repaired: true,
    });
  });

  it('unwraps arbitrarily deep nesting', () => {
    expect(decodeQueryString('?{?{?{?{x}}}}').body).toBe('x');
  });

  it('promotes an inner slice when the outer layer carries none', () => {
    expect(decodeQueryString('?{?{v}[0]}')).toMatchObject({ body: 'v', slice: '[0]' });
  });

  it('keeps the OUTER slice when both layers carry one', () => {
    expect(decodeQueryString('?{?{v}[0]}[1:5]')).toMatchObject({ body: 'v', slice: '[1:5]' });
  });

  it('classifies the legacy function forms', () => {
    expect(decodeQueryString('query(select 1)').form).toBe(EXPRESSION_FORMS.LEGACY);
    expect(decodeQueryString('column(amount)').form).toBe(EXPRESSION_FORMS.LEGACY);
    expect(decodeQueryString('column(amount)[0]').form).toBe(EXPRESSION_FORMS.LEGACY);
  });

  it('classifies an eval string as its own grammar', () => {
    expect(decodeQueryString('>{ anyTestFailed() }')).toEqual({
      body: '>{ anyTestFailed() }',
      slice: null,
      form: EXPRESSION_FORMS.EVAL,
      repaired: false,
    });
  });
});

describe('encodeQueryString', () => {
  it('returns the empty string for an empty body, slice or not', () => {
    expect(encodeQueryString()).toBe('');
    expect(encodeQueryString({})).toBe('');
    expect(encodeQueryString({ body: '' })).toBe('');
    expect(encodeQueryString({ body: '   ' })).toBe('');
    expect(encodeQueryString({ body: '', slice: '[0]' })).toBe('');
  });

  it('wraps a bare body exactly once', () => {
    expect(encodeQueryString({ body: '${ref(m).c}' })).toBe('?{${ref(m).c}}');
  });

  it('does not re-wrap an already-wrapped body (M24)', () => {
    // The documented YAML form, typed by a user into a field the editor wraps.
    expect(encodeQueryString({ body: '?{ ${ref(m).col} }' })).toBe('?{${ref(m).col}}');
  });

  it('appends the slice OUTSIDE the wrapper', () => {
    expect(encodeQueryString({ body: 'x', slice: '[0]' })).toBe('?{x}[0]');
  });

  it("lets the caller's slice win over one recovered from the body", () => {
    expect(encodeQueryString({ body: '?{x}[0]', slice: '[1:5]' })).toBe('?{x}[1:5]');
  });

  it('recovers a slice from the body when the caller passes none', () => {
    expect(encodeQueryString({ body: '?{x}[0]' })).toBe('?{x}[0]');
  });

  it('passes an eval string through instead of wrapping it into nonsense', () => {
    expect(encodeQueryString({ body: '>{ anyTestFailed() }' })).toBe('>{ anyTestFailed() }');
  });
});

describe('canonicalizeQueryString', () => {
  it('wraps what the UI writes bare today (M6)', () => {
    expect(canonicalizeQueryString('${ref(orders).month} DESC')).toBe(
      '?{${ref(orders).month} DESC}'
    );
  });

  it('leaves an already-canonical value byte-identical', () => {
    const v = '?{${ref(orders).month} DESC}';
    expect(canonicalizeQueryString(v)).toBe(v);
  });

  it('repairs a value a double-wrapping write already corrupted (M24)', () => {
    expect(canonicalizeQueryString('?{?{${ref(orders).month}}}')).toBe('?{${ref(orders).month}}');
  });

  it('preserves a slice through the round trip', () => {
    expect(canonicalizeQueryString('?{ ${ref(d).v} }[1:5]')).toBe('?{${ref(d).v}}[1:5]');
  });

  it('collapses a blank value to the empty string so it is dropped, not stored as ?{}', () => {
    expect(canonicalizeQueryString('   ')).toBe('');
  });
});

describe('the parser accepts everything the codec emits', () => {
  // A JS mirror of visivo/models/base/query_string.py's
  // `validate_and_create`, so the codec's output is checked against the same
  // gate the Pydantic model applies. M6 is precisely a value that fails here.
  const pydanticWouldAccept = value =>
    value.startsWith('?{') && (value.endsWith('}') || /\}(\[[^\]]+\])\s*$/.test(value));

  const nonEmpty = SHAPES.filter(s => typeof s.value === 'string' && s.value.trim());
  const isEval = s => decodeQueryString(s.value).form === EXPRESSION_FORMS.EVAL;

  it.each(nonEmpty.filter(s => !isEval(s)))(
    'canonicalized $label is a value the QueryString validator accepts',
    ({ value }) => {
      expect(pydanticWouldAccept(canonicalizeQueryString(value))).toBe(true);
    }
  );

  it.each(nonEmpty.filter(isEval))(
    '$label belongs to another grammar and is passed through, not wrapped',
    ({ value }) => {
      expect(canonicalizeQueryString(value)).toBe(value.trim());
    }
  );
});

describe('parseQueryString (strict single-layer parse)', () => {
  it('returns null for non-strings and non-query values', () => {
    expect(parseQueryString(null)).toBeNull();
    expect(parseQueryString(42)).toBeNull();
    expect(parseQueryString('plain text')).toBeNull();
    expect(parseQueryString('column(x)')).toBeNull();
  });

  it('does NOT unwrap nesting — that is decodeQueryString\'s job', () => {
    expect(parseQueryString('?{?{x}}')).toEqual({ body: '?{x}', slice: null });
  });
});

describe('isQueryStringValue', () => {
  it('accepts every wrapped and legacy form', () => {
    for (const v of ['?{x}', '?{x}[0]', '?{x}[1:5]', 'query(x)', 'column(x)', 'column(x)[0]']) {
      expect(isQueryStringValue(v)).toBe(true);
    }
  });

  it('rejects bare bodies, eval strings and non-strings', () => {
    for (const v of ['${ref(m).c}', 'date DESC', '>{ x }', 42, null, undefined, '']) {
      expect(isQueryStringValue(v)).toBe(false);
    }
  });
});
