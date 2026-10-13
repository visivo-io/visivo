/* eslint-disable no-template-curly-in-string -- literal Visivo `${ref(...)}` strings are the data under test, not template-literal mistakes */
import {
  EXPRESSION_FORMS,
  PARSER_QUERY_STRING_PATTERN,
  decodeQueryString,
  encodeQueryString,
  canonicalizeQueryString,
  isParserReadableQueryString,
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
 *  - MULTI-LINE bodies, empty wrappers and unrecognised bracket suffixes — the
 *    shapes a table calibrated to the implementation quietly omits. They are
 *    the ones that broke it: `?{a\nb}` and `?{}` and `?{x}[a]` all failed to
 *    unwrap, were classed BARE, and got wrapped a second time — one more layer
 *    per save, forever. A property test is only as strong as its table, and the
 *    first version of this one had no entry that could fail.
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

  // ── multi-line bodies ───────────────────────────────────────────────────
  // SQL wraps. A pasted WHERE clause, anything copied out of a Windows editor
  // (CRLF), a CASE the author laid out over three lines — RefTextArea is a
  // multi-line editor and `handlePaste` inserts the text verbatim.
  { label: 'wrapped multi-line CASE body', value: '?{case when ${ref(o).a} > 0\n  then 1 else 0 end}' },
  { label: 'wrapped body with an interior newline', value: '?{a = 1\nAND b = 2}' },
  { label: 'wrapped body with a CRLF', value: '?{a = 1\r\nAND b = 2}' },
  { label: 'bare multi-line body', value: 'a = 1\nAND b = 2' },
  { label: 'wrapped multi-line body + slice', value: '?{a\nb}[0]' },
  { label: 'wrapped body padded with newlines', value: '?{\n  sum(${ref(o).a})\n}' },

  // ── empty and malformed wrappers ────────────────────────────────────────
  { label: 'empty wrapper', value: '?{}' },
  { label: 'blank wrapper', value: '?{ }' },
  { label: 'double empty wrapper', value: '?{?{}}' },
  { label: 'unrecognised bracket suffix', value: '?{x}[a]' },
  { label: 'four-part slice', value: '?{x}[1:2:3:4]' },
  { label: 'two chained suffixes', value: '?{a}[0][1]' },
  { label: 'trailing-comma slice', value: '?{x}[0,]' },
  { label: 'unclosed wrapper', value: '?{unbalanced' },
  { label: 'wrapper around a malformed wrapper', value: '?{?{x}[a]}' },

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
      expect([
        EXPRESSION_FORMS.QUERY,
        EXPRESSION_FORMS.EVAL,
        // A malformed wrapper stays malformed: the codec does not "repair" it
        // into a different value, it declines to touch it.
        EXPRESSION_FORMS.MALFORMED,
      ]).toContain(second.form);
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

  // The property with the most teeth, and the one the first version of this
  // suite was missing. The others ask "does applying the codec twice differ
  // from applying it once" — a question `decodeQueryString`'s fixpoint unwrap
  // can answer 'no' to even while `encodeQueryString` is wrapping blindly. This
  // one asks the PARSER what it reads out of the codec's output, and compares
  // that to the body the codec claims to have preserved. Double-wrap and the
  // parser reads `?{x}` where the codec decoded `x`.
  it.each(SHAPES.filter(s => isParserReadableQueryString(canonicalizeQueryString(s.value))))(
    'the parser reads back exactly the body the codec decoded, for $label',
    ({ value }) => {
      const decoded = decodeQueryString(value);
      const match = canonicalizeQueryString(value).match(PARSER_QUERY_STRING_PATTERN);
      expect(match).not.toBeNull();
      expect(match.groups.body).toBe(decoded.body);
      expect(match.groups.slice ?? null).toBe(decoded.slice);
    }
  );

  // …and the complement: a value the codec does NOT own comes back byte for
  // byte. Nothing is "repaired" into a different value, and in particular a
  // malformed wrapper is not upgraded into a nested one that passes validation
  // and means nothing.
  it.each(
    SHAPES.filter(s =>
      [EXPRESSION_FORMS.EVAL, EXPRESSION_FORMS.MALFORMED].includes(decodeQueryString(s.value).form)
    )
  )('a value the codec declines to own is returned untouched, for $label', ({ value }) => {
    expect(canonicalizeQueryString(value)).toBe(value.trim());
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

  it('unwraps a multi-line body instead of mistaking it for a bare one', () => {
    // Classed BARE, this value got wrapped a second time on every save.
    expect(decodeQueryString('?{a = 1\nAND b = 2}')).toEqual({
      body: 'a = 1\nAND b = 2',
      slice: null,
      form: EXPRESSION_FORMS.QUERY,
      repaired: false,
    });
  });

  it('treats an empty wrapper as empty, not as a body to be wrapped again', () => {
    for (const v of ['?{}', '?{ }', '?{   }']) {
      expect(decodeQueryString(v)).toEqual({
        body: '',
        slice: null,
        form: EXPRESSION_FORMS.EMPTY,
        repaired: false,
      });
    }
  });

  it.each(['?{x}[a]', '?{x}[1:2:3:4]', '?{a}[0][1]', '?{x}[0,]', '?{unbalanced'])(
    'classifies %s as MALFORMED, keeping the value verbatim',
    value => {
      expect(decodeQueryString(value)).toEqual({
        body: value,
        slice: null,
        form: EXPRESSION_FORMS.MALFORMED,
        repaired: false,
      });
    }
  );

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

  it.each(['?{x}[a]', '?{a}[0][1]', '?{unbalanced', '?{x}[1:2:3:4]'])(
    'passes the malformed wrapper %s through rather than nesting it',
    value => {
      // These are values the QueryString validator REFUSES today. Wrapping one
      // makes it `?{?{x}[a]}` — which the validator ACCEPTS, whose body is the
      // literal text `?{x}[a]`, and which grows another layer on every save.
      // A loud rejection is worth more than silent nonsense.
      expect(encodeQueryString({ body: value })).toBe(value);
    }
  );

  it('drops an empty wrapper rather than nesting it', () => {
    expect(encodeQueryString({ body: '?{}' })).toBe('');
    expect(canonicalizeQueryString('?{}')).toBe('');
    expect(canonicalizeQueryString('?{?{}}')).toBe('');
  });

  it('wraps a multi-line body once, and only once', () => {
    const body = 'case when a > 0\n  then 1 else 0 end';
    expect(encodeQueryString({ body })).toBe(`?{${body}}`);
    expect(encodeQueryString({ body: `?{${body}}` })).toBe(`?{${body}}`);
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

describe('the parser and the codec agree on what is storable', () => {
  // `isParserReadableQueryString` mirrors
  // `visivo/query/patterns.py:QUERY_STRING_VALUE_PATTERN`, which is now also
  // the gate `QueryString.validate_and_create` applies — so this is the same
  // question the backend asks, asked in the viewer.
  //
  // The earlier version of this block used a loose mirror
  // (`startsWith('?{') && endsWith('}')`) that accepts `?{?{x}}`, so it could
  // not have failed on the bug the file is named for.
  const nonEmpty = SHAPES.filter(s => typeof s.value === 'string' && s.value.trim());
  // What the codec is left holding after it has unwrapped everything it can —
  // the body it would wrap. That, not the original spelling, decides which of
  // the four outcomes below applies.
  const bodyOf = s => decodeQueryString(s.value).body;
  const innerFormOf = s => decodeQueryString(bodyOf(s)).form;
  const DECLINED = [EXPRESSION_FORMS.EVAL, EXPRESSION_FORMS.MALFORMED];
  const bodyHasNewline = s => /[\r\n]/.test(bodyOf(s));

  const wrappable = s =>
    !DECLINED.includes(innerFormOf(s)) && innerFormOf(s) !== EXPRESSION_FORMS.EMPTY;

  // Every non-blank shape lands in exactly one of the four buckets below —
  // asserted, so a shape cannot be added to the table and then quietly fall
  // through every property in this block.
  it('every shape lands in one of the buckets below', () => {
    const buckets = s => [
      wrappable(s) && !bodyHasNewline(s),
      wrappable(s) && bodyHasNewline(s),
      DECLINED.includes(innerFormOf(s)),
      innerFormOf(s) === EXPRESSION_FORMS.EMPTY,
    ];
    const miscounted = nonEmpty.filter(s => buckets(s).filter(Boolean).length !== 1);
    expect(miscounted.map(s => s.label)).toEqual([]);
  });

  it.each(nonEmpty.filter(s => wrappable(s) && !bodyHasNewline(s)))(
    'canonicalized $label is a value the QueryString validator accepts',
    ({ value }) => {
      expect(isParserReadableQueryString(canonicalizeQueryString(value))).toBe(true);
    }
  );

  it.each(nonEmpty.filter(s => DECLINED.includes(innerFormOf(s))))(
    '$label is not the codec\'s to rewrite, so its body is passed through',
    ({ value }) => {
      expect(canonicalizeQueryString(value)).toBe(decodeQueryString(value).body);
    }
  );

  it.each(nonEmpty.filter(s => innerFormOf(s) === EXPRESSION_FORMS.EMPTY))(
    '$label carries no expression at any depth, so it is dropped',
    ({ value }) => {
      expect(canonicalizeQueryString(value)).toBe('');
    }
  );

  // A body carrying an interior newline is the one shape the codec can neither
  // rewrite nor store: `?{a\nb}` is not a value the parser can read (`.` stops
  // at a newline in both languages), and unwrapping it to edit is still the
  // right thing to do. The editor is what refuses it — see
  // `interactionHelp.test.js`, which pins that the two answers agree.
  it.each(nonEmpty.filter(s => wrappable(s) && bodyHasNewline(s)))(
    'a multi-line body is unwrapped for editing but is NOT parser-readable, for $label',
    ({ value }) => {
      expect(decodeQueryString(value).body).not.toMatch(/^\?\{/);
      expect(isParserReadableQueryString(canonicalizeQueryString(value))).toBe(false);
    }
  );
});

describe('isParserReadableQueryString', () => {
  it('accepts the forms QUERY_STRING_VALUE_PATTERN accepts', () => {
    for (const v of ['?{x}', '?{ MAX(a) }', '?{x}[0]', '?{x}[1:5]', '?{x}[::2]', '?{x}[0,2]']) {
      expect(isParserReadableQueryString(v)).toBe(true);
    }
  });

  it('rejects exactly what the backend rejects', () => {
    // `?{}` / `?{ }`: no body. `?{a\nb}`: the pattern's `.` stops at newlines,
    // so `get_value()` returns None and the run dies in `re.sub(..., None)`.
    // `?{x}[a]`: not a slice. `>{ }` / bare: not a query string at all.
    for (const v of ['?{}', '?{ }', '?{a\nb}', '?{x}[a]', '>{ x }', 'date DESC', 42, null]) {
      expect(isParserReadableQueryString(v)).toBe(false);
    }
  });

  it('is blind to nesting — a doubly-wrapped value parses, with the wrong body', () => {
    // Why the codec, not this predicate, is what stops M24: `?{?{x}}` IS a
    // syntactically valid query string. Its body is the literal text `?{x}`,
    // which then reaches SQL.
    expect(isParserReadableQueryString('?{?{x}}')).toBe(true);
    expect('?{?{x}}'.match(PARSER_QUERY_STRING_PATTERN).groups.body).toBe('?{x}');
  });
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
