/* eslint-disable no-template-curly-in-string */
import {
  ContextString,
  parseTextWithRefs,
  isInsideDollarBrace,
  formatRef,
  formatRefExpression,
  REF_PATTERN,
} from './contextString';

describe('ContextString', () => {
  describe('toString', () => {
    it('returns the original value', () => {
      const ctx = new ContextString('${ref(foo)}');
      expect(ctx.toString()).toBe('${ref(foo)}');
    });
  });

  describe('equals', () => {
    it('returns true when context strings match', () => {
      const a = new ContextString('${ref(foo)}');
      const b = new ContextString('${ref(foo)}');
      expect(a.equals(b)).toBe(true);
    });

    it('returns false when comparing with non-context string', () => {
      const a = new ContextString('${ref(foo)}');
      expect(a.equals('foo')).toBe(false);
    });
  });

  describe('getReference', () => {
    it('extracts the reference inside ref()', () => {
      const ctx = new ContextString('${ref(myMetric)}');
      expect(ctx.getReference()).toBe('myMetric');
    });

    it('returns null if no ref is found', () => {
      const ctx = new ContextString('plain string');
      expect(ctx.getReference()).toBeNull();
    });
  });

  describe('getRefPropsPath', () => {
    it('extracts the props path after ref()', () => {
      const ctx = new ContextString('${ref(myMetric).value}');
      expect(ctx.getRefPropsPath()).toBe('.value');
    });

    it('returns null if no props path exists', () => {
      const ctx = new ContextString('${ref(myMetric)}');
      expect(ctx.getRefPropsPath()).toBe('');
    });
  });

  describe('getPath', () => {
    it('returns null when no inline path is present', () => {
      const ctx = new ContextString('${ref(foo)}');
      expect(ctx.getPath()).toBeNull();
    });
  });

  describe('getRefAttr', () => {
    it('returns the whole matched ref string', () => {
      const ctx = new ContextString('${ref(myMetric).value}');
      expect(ctx.getRefAttr()).toBe('${ref(myMetric).value}');
    });

    it('returns null when no ref attr exists', () => {
      const ctx = new ContextString('${foo.bar}');
      expect(ctx.getRefAttr()).toBeNull();
    });
  });

  describe('getAllRefs', () => {
    it('returns all refs in the string', () => {
      const ctx = new ContextString('${ref(foo)} and ${ref(bar).baz}');
      expect(ctx.getAllRefs()).toEqual(['${ref(foo)}', '${ref(bar).baz}']);
    });

    it('returns empty array if no refs found', () => {
      const ctx = new ContextString('plain text');
      expect(ctx.getAllRefs()).toEqual([]);
    });
  });

  describe('isContextString', () => {
    it('returns true for ContextString instance', () => {
      const ctx = new ContextString('${ref(foo)}');
      expect(ContextString.isContextString(ctx)).toBe(true);
    });

    it('returns true for valid context string', () => {
      expect(ContextString.isContextString('${ref(bar)}')).toBe(true);
    });

    it('returns false for plain string', () => {
      expect(ContextString.isContextString('hello')).toBe(false);
    });

    it('returns false for non-string object', () => {
      expect(ContextString.isContextString({})).toBe(false);
    });
  });
});

describe('REF_PATTERN', () => {
  it('matches standard refs', () => {
    const text = '${ref(myModel)}';
    const matches = [...text.matchAll(REF_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('myModel');
  });

  it('matches refs with property', () => {
    const text = '${ref(myModel).field}';
    const matches = [...text.matchAll(REF_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('myModel');
    expect(matches[0][2]).toBe('field');
  });

  it('matches refs with whitespace inside ${}', () => {
    const text = '${ ref(myModel) }';
    const matches = [...text.matchAll(REF_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('myModel');
  });

  it('matches refs with whitespace inside ref()', () => {
    const text = '${ref( myModel )}';
    const matches = [...text.matchAll(REF_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('myModel');
  });

  it('matches refs with whitespace everywhere', () => {
    const text = '${ ref( myModel ) }';
    const matches = [...text.matchAll(REF_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('myModel');
  });

  it('matches refs with property and whitespace', () => {
    const text = '${ ref( myModel ) . field }';
    const matches = [...text.matchAll(REF_PATTERN)];
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe('myModel');
    expect(matches[0][2]).toBe('field');
  });

  it('matches multiple refs with varying whitespace', () => {
    const text = '${ref(a)} and ${ ref( b ) } and ${ref(c).prop}';
    const matches = [...text.matchAll(REF_PATTERN)];
    expect(matches).toHaveLength(3);
    expect(matches[0][1]).toBe('a');
    expect(matches[1][1]).toBe('b');
    expect(matches[2][1]).toBe('c');
    expect(matches[2][2]).toBe('prop');
  });
});

describe('parseTextWithRefs', () => {
  it('returns empty array for empty text', () => {
    expect(parseTextWithRefs('')).toEqual([]);
    expect(parseTextWithRefs(null)).toEqual([]);
  });

  it('parses text without refs', () => {
    const segments = parseTextWithRefs('plain text');
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('text');
    expect(segments[0].content).toBe('plain text');
  });

  it('parses single ref', () => {
    const segments = parseTextWithRefs('${ref(myModel)}');
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('ref');
    expect(segments[0].name).toBe('myModel');
  });

  it('parses ref with whitespace variations', () => {
    const variations = [
      '${ref(myModel)}',
      '${ ref(myModel) }',
      '${ref( myModel )}',
      '${ ref( myModel ) }',
    ];
    variations.forEach(text => {
      const segments = parseTextWithRefs(text);
      expect(segments).toHaveLength(1);
      expect(segments[0].type).toBe('ref');
      expect(segments[0].name).toBe('myModel');
    });
  });

  it('parses ref with property and whitespace', () => {
    const text = '${ ref( myModel ) . field }';
    const segments = parseTextWithRefs(text);
    expect(segments).toHaveLength(1);
    expect(segments[0].type).toBe('ref');
    expect(segments[0].name).toBe('myModel');
    expect(segments[0].property).toBe('field');
  });

  it('parses mixed text and refs', () => {
    const segments = parseTextWithRefs('prefix ${ref(a)} middle ${ ref( b ) } suffix');
    expect(segments).toHaveLength(5);
    expect(segments[0].type).toBe('text');
    expect(segments[0].content).toBe('prefix ');
    expect(segments[1].type).toBe('ref');
    expect(segments[1].name).toBe('a');
    expect(segments[2].type).toBe('text');
    expect(segments[2].content).toBe(' middle ');
    expect(segments[3].type).toBe('ref');
    expect(segments[3].name).toBe('b');
    expect(segments[4].type).toBe('text');
    expect(segments[4].content).toBe(' suffix');
  });
});

describe('isInsideDollarBrace', () => {
  it('returns false for empty text', () => {
    expect(isInsideDollarBrace('', 0)).toBe(false);
    expect(isInsideDollarBrace(null, 0)).toBe(false);
  });

  it('returns false for position before ${', () => {
    expect(isInsideDollarBrace('abc ${ref(x)}', 0)).toBe(false);
    expect(isInsideDollarBrace('abc ${ref(x)}', 3)).toBe(false);
  });

  it('returns true for position inside ${}', () => {
    expect(isInsideDollarBrace('${ref(x)}', 2)).toBe(true);
    expect(isInsideDollarBrace('${ref(x)}', 5)).toBe(true);
    expect(isInsideDollarBrace('${ref(x)}', 8)).toBe(true);
  });

  it('returns false for position after }', () => {
    expect(isInsideDollarBrace('${ref(x)}', 9)).toBe(false);
    expect(isInsideDollarBrace('${ref(x)} more', 10)).toBe(false);
  });

  it('handles multiple ${} blocks', () => {
    const text = '${a} text ${b}';
    expect(isInsideDollarBrace(text, 2)).toBe(true); // inside ${a}
    expect(isInsideDollarBrace(text, 5)).toBe(false); // after ${a}
    expect(isInsideDollarBrace(text, 12)).toBe(true); // inside ${b}
    expect(isInsideDollarBrace(text, 14)).toBe(false); // after ${b}
  });
});

describe('formatRef', () => {
  it('formats ref without property', () => {
    expect(formatRef('myModel')).toBe('ref(myModel)');
  });

  it('formats ref with property', () => {
    expect(formatRef('myModel', 'field')).toBe('ref(myModel).field');
  });

  it('trims whitespace from name', () => {
    expect(formatRef('  myModel  ')).toBe('ref(myModel)');
  });

  it('trims whitespace from property', () => {
    expect(formatRef('myModel', '  field  ')).toBe('ref(myModel).field');
  });
});

describe('formatRefExpression', () => {
  it('formats ref expression without property', () => {
    expect(formatRefExpression('myModel')).toBe('${ref(myModel)}');
  });

  it('formats ref expression with property', () => {
    expect(formatRefExpression('myModel', 'field')).toBe('${ref(myModel).field}');
  });

  it('trims whitespace', () => {
    expect(formatRefExpression('  myModel  ', '  field  ')).toBe('${ref(myModel).field}');
  });
});
