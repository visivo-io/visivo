import { checkRefCounts } from './refCountPreflight';

describe('checkRefCounts', () => {
  describe('a project-level metric or dimension must name a model', () => {
    // The scaffold that caused this: `count(*)` saved happily, and the next
    // parse after commit rejected the whole project — every metric and
    // dimension vanished from the editor.
    it.each(['metric', 'dimension'])('rejects a %s expression with no ref', type => {
      const result = checkRefCounts(type, { expression: 'count(*)' });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      // Reported ON the field, so it renders under the input rather than as a
      // form-level banner detached from what caused it.
      expect(result.errors[0].path).toBe('expression');
      expect(result.errors[0].message).toMatch(/must reference at least one model/);
    });

    it.each(['metric', 'dimension'])('accepts a %s expression carrying a ref', type => {
      // eslint-disable-next-line no-template-curly-in-string
      expect(checkRefCounts(type, { expression: 'sum(${ref(orders).amount})' }).valid).toBe(true);
    });

    it('accepts a bare metric-composing ref', () => {
      // eslint-disable-next-line no-template-curly-in-string
      expect(checkRefCounts('metric', { expression: '${ref(revenue)} / 2' }).valid).toBe(true);
    });
  });

  describe('a nested metric or dimension must NOT name one', () => {
    // The mirror rule: nesting IS the tie to a source, and `sql_model.py`
    // rejects any ref outright. Same field name, opposite requirement.
    it.each(['metric', 'dimension'])('accepts a nested %s with no ref', type => {
      expect(checkRefCounts(type, { expression: 'count(*)' }, { nested: true }).valid).toBe(true);
    });

    it.each(['metric', 'dimension'])('rejects a ref inside a nested %s', type => {
      const result = checkRefCounts(
        type,
        // eslint-disable-next-line no-template-curly-in-string
        { expression: 'sum(${ref(orders).amount})' },
        { nested: true }
      );

      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe('expression');
      expect(result.errors[0].message).toMatch(/cannot use/);
    });
  });

  describe('a relation condition needs two models', () => {
    it('rejects a condition naming only one', () => {
      // eslint-disable-next-line no-template-curly-in-string
      const result = checkRefCounts('relation', { condition: '${ref(orders).id} = 1' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].path).toBe('condition');
    });

    it('accepts a condition naming two', () => {
      const result = checkRefCounts('relation', {
        // eslint-disable-next-line no-template-curly-in-string
        condition: '${ref(orders).user_id} = ${ref(users).id}',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('fails open rather than inventing a verdict', () => {
    it('says nothing about an empty expression — that is the required rule', () => {
      // Two errors on one field reads as two problems; `required` owns this one.
      expect(checkRefCounts('metric', { expression: '' }).valid).toBe(true);
      expect(checkRefCounts('metric', { expression: '   ' }).valid).toBe(true);
      expect(checkRefCounts('metric', {}).valid).toBe(true);
    });

    it.each([
      ['an unknown type', 'source', { expression: 'x' }],
      ['a null config', 'metric', null],
      ['a non-object config', 'metric', 'nope'],
    ])('skips %s', (_label, type, config) => {
      expect(checkRefCounts(type, config).valid).toBe(true);
    });
  });
});
