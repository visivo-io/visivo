import { alphaHash } from './alphaHash';

/**
 * Test values generated from the Python implementation:
 *   from visivo.models.base.named_model import alpha_hash
 *
 * If these tests fail, the JS and Python implementations have diverged.
 */
describe('alphaHash', () => {
  it('matches Python alpha_hash for typical insight name', () => {
    expect(alphaHash('filter-aggregate-input-test-insight')).toBe('mcfqwfyjithoefqyfitoeuwlatmvb');
  });

  it('matches Python alpha_hash for model name', () => {
    expect(alphaHash('my-model')).toBe('micjrebiipkcjzyxbmihctqqzdpna');
  });

  it('matches Python alpha_hash for short string', () => {
    expect(alphaHash('hello')).toBe('madrobbqxjefimvfiecudmhwqndua');
  });

  it('matches Python alpha_hash for string with spaces', () => {
    expect(alphaHash('some insight with spaces')).toBe('mtinfecofmyxbrtlcezvlufjfdtbb');
  });

  it('matches Python alpha_hash for empty string', () => {
    expect(alphaHash('')).toBe('mgiwmxadpdsyvtjdjzkczubjtuutb');
  });

  it('always starts with m', () => {
    expect(alphaHash('anything')).toMatch(/^m/);
  });

  it('returns only lowercase letters', () => {
    expect(alphaHash('test-123')).toMatch(/^[a-z]+$/);
  });

  it('returns 29 characters by default (m + 28)', () => {
    expect(alphaHash('test')).toHaveLength(29);
  });
});
