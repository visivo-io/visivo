import { inputRefRegex, matchName, isPlainIdentifier, toSafeInputAlias } from './inputNames';

/* eslint-disable no-template-curly-in-string */
describe('inputNames', () => {
  it.each([
    ['${a.value}', 'a'],
    ['${show-markers.value}', 'show-markers'],
    ['${ref(show-markers).value}', 'show-markers'],
    ['${my input.value}', 'my input'],
    ["${ref(it's-ok).value}", "it's-ok"],
  ])('anchored regex matches %s', (text, name) => {
    const m = text.match(inputRefRegex({ anchored: true }));
    expect(m).not.toBeNull();
    expect(matchName(m)).toBe(name);
  });

  it('does not match names with characters the DAG rejects', () => {
    expect('${a/b.value}'.match(inputRefRegex({ anchored: true }))).toBeNull();
    expect('${a.b.c}'.match(inputRefRegex({ anchored: true }))).toBeNull();
  });

  it('global regex finds every reference', () => {
    const found = [...'x ${a-b.value} y ${ref(c).max}'.matchAll(inputRefRegex({ global: true }))];
    expect(found.map(matchName)).toEqual(['a-b', 'c']);
  });

  it('classifies identifiers and builds safe aliases', () => {
    expect(isPlainIdentifier('abc_1')).toBe(true);
    expect(isPlainIdentifier('a-b')).toBe(false);
    expect(toSafeInputAlias('a-b c')).toBe('_input_a_b_c');
  });
});
