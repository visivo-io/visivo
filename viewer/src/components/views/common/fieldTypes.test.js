import {
  fieldTypeFor,
  refKindsFor,
  accessorsForInput,
  EDITORS,
  ALL_INPUT_ACCESSORS,
} from './fieldTypes';

describe('fieldTypeFor — container vs vocabulary are separate axes', () => {
  test('two fields with the same container can have different vocabularies', () => {
    const relation = fieldTypeFor('relation', 'condition');
    const metric = fieldTypeFor('metric', 'expression');

    // Same editor…
    expect(relation.editor).toBe(EDITORS.CONTEXT_SQL);
    expect(metric.editor).toBe(EDITORS.CONTEXT_SQL);
    // …different rules. This is the distinction the old "Grammar" column hid.
    expect(relation.refKinds).toEqual(['model']);
    expect(metric.refKinds).toEqual(expect.arrayContaining(['metric']));
    expect(relation.bareRefs).toBe(false);
    expect(metric.bareRefs).toBe(true);
  });

  test('an unknown field has no declared rule rather than a wrong default', () => {
    expect(fieldTypeFor('relation', 'join_type')).toBeNull();
    expect(fieldTypeFor('nonsense', 'field')).toBeNull();
    expect(fieldTypeFor(null, 'x')).toBeNull();
    expect(fieldTypeFor('metric', null)).toBeNull();
  });

  test('every entry carries a prose reason, so the next reader need not re-derive it', () => {
    ['relation.condition', 'metric.expression', 'insight.props', 'model.source'].forEach(key => {
      const [type, field] = key.split('.');
      expect(fieldTypeFor(type, field).why).toEqual(expect.any(String));
    });
  });
});

// `relation.validate_condition_has_models` requires two distinct models, and a
// bare `${ref(orders)}` names a table — it cannot be one side of an `=`.
describe('relation.condition — the only field with a minimum ref count', () => {
  const entry = fieldTypeFor('relation', 'condition');

  test('requires at least two refs', () => {
    expect(entry.minRefs).toBe(2);
  });

  test('requires a property on every ref', () => {
    expect(entry.bareRefs).toBe(false);
  });

  test('offers models only — a metric ref would be an aggregate, not a join key', () => {
    expect(entry.refKinds).toEqual(['model']);
  });

  test('no other declared field imposes a minimum', () => {
    const others = [
      fieldTypeFor('metric', 'expression'),
      fieldTypeFor('dimension', 'expression'),
      fieldTypeFor('insight', 'props'),
      fieldTypeFor('interaction', 'filter'),
    ];
    others.forEach(e => expect(e.minRefs).toBe(0));
  });
});

// `sql_model.set_parent_names_on_nested_objects` raises on ANY ref in a nested
// metric/dimension expression. The registry has to agree, or the editor will
// offer insertions that fail on save.
describe('nested metric/dimension — a different grammar under the same field name', () => {
  test.each(['metric', 'dimension'])('%s.expression nests to plain-sql with no refs', type => {
    const standalone = fieldTypeFor(type, 'expression');
    const nested = fieldTypeFor(type, 'expression', { nested: true });

    expect(standalone.editor).toBe(EDITORS.CONTEXT_SQL);
    expect(standalone.refKinds.length).toBeGreaterThan(0);

    expect(nested.editor).toBe(EDITORS.PLAIN_SQL);
    expect(nested.refKinds).toEqual([]);
    expect(nested.bareRefs).toBe(false);
    // Not merely "none offered" — none are legal at all.
    expect(nested.maxRefs).toBe(0);
  });

  test('nesting does not change fields that have no nested form', () => {
    const plain = fieldTypeFor('relation', 'condition');
    const asNested = fieldTypeFor('relation', 'condition', { nested: true });
    expect(asNested).toEqual(plain);
  });
});

describe('query strings', () => {
  test('every Plotly prop path resolves to the one shared props rule', () => {
    const x = fieldTypeFor('insight', 'x');
    const nested = fieldTypeFor('insight', 'marker.color');
    expect(x.key).toBe('insight.props');
    expect(nested.key).toBe('insight.props');
    expect(x).toEqual(nested);
  });

  test('props and interactions share one vocabulary — they are the same surface', () => {
    const props = fieldTypeFor('insight', 'props').refKinds;
    ['filter', 'split', 'sort'].forEach(f => {
      expect(fieldTypeFor('interaction', f).refKinds).toEqual(props);
    });
  });

  test('inputs are legal in query strings but not in semantic-layer expressions', () => {
    // An input is a runtime value; a metric/dimension must resolve statically.
    expect(fieldTypeFor('insight', 'props').refKinds).toContain('input');
    expect(fieldTypeFor('metric', 'expression').refKinds).not.toContain('input');
    expect(fieldTypeFor('dimension', 'expression').refKinds).not.toContain('input');
    expect(fieldTypeFor('relation', 'condition').refKinds).not.toContain('input');
  });

  test('only query strings accept a trailing [index]', () => {
    expect(fieldTypeFor('insight', 'props').slice).toBe(true);
    expect(fieldTypeFor('relation', 'condition').slice).toBe(false);
    expect(fieldTypeFor('metric', 'expression').slice).toBe(false);
  });
});

describe('refKindsFor', () => {
  test('delegates to the entry', () => {
    expect(refKindsFor('relation', 'condition')).toEqual(['model']);
  });

  test('a plain-sql field offers nothing — the whole point of declaring it', () => {
    expect(refKindsFor('metric', 'expression', { nested: true })).toEqual([]);
  });

  test('an undeclared field offers nothing rather than a permissive default', () => {
    // The old RefTextArea default included `source`, which has no value to
    // reference from inside an expression — a ref that can never resolve.
    expect(refKindsFor('relation', 'join_type')).toEqual([]);
    expect(refKindsFor('relation', 'join_type')).not.toContain('source');
  });

  test('no declared field offers `source`', () => {
    ['relation.condition', 'metric.expression', 'dimension.expression', 'insight.props'].forEach(
      key => {
        const [type, field] = key.split('.');
        expect(refKindsFor(type, field)).not.toContain('source');
      }
    );
  });
});

// An input pill's "property" is an accessor from a fixed set, not a column —
// and which are legal depends on the input's type
// (`accessor_validator.validate_input_accessor`).
describe('accessorsForInput', () => {
  test('single-select exposes only `value`', () => {
    expect(accessorsForInput('single-select')).toEqual(['value']);
  });

  test('multi-select exposes the collection accessors, and not `value`', () => {
    const accessors = accessorsForInput('multi-select');
    expect(accessors).toEqual(expect.arrayContaining(['values', 'min', 'max', 'first', 'last']));
    expect(accessors).not.toContain('value');
  });

  test('an unknown type fails OPEN, matching the project convention', () => {
    expect(accessorsForInput(undefined)).toEqual(ALL_INPUT_ACCESSORS);
    expect(accessorsForInput('not-a-type')).toEqual(ALL_INPUT_ACCESSORS);
  });
});
