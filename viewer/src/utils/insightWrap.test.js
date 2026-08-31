/**
 * insightWrap — the shared auto-wrap naming/config recipe (#632/#637 pattern,
 * consumed by the canvas insight drop AND the click-to-pick picker paths).
 */
import { mintWrapperChartName, buildWrapperChartConfig } from './insightWrap';
import { generateUniqueName } from './uniqueName';

// The forced `separator: '-'` cannot be falsified through mintWrapperChartName's
// RESULT: the base is always `<insight>-chart`, which already contains a hyphen,
// so `suffixSeparatorFor` infers '-' for every reachable input and the option
// can never change the output. Spying on the call is the only way to prove the
// option is actually passed — without this, deleting it leaves the suite green
// while a future change to `suffixSeparatorFor`'s inference (e.g. preferring the
// FIRST separator in the base, which picks '_' for `rev_insight-chart`) would
// silently start minting `rev_insight-chart_2`.
jest.mock('./uniqueName', () => {
  const actual = jest.requireActual('./uniqueName');
  return { ...actual, generateUniqueName: jest.fn(actual.generateUniqueName) };
});

beforeEach(() => {
  generateUniqueName.mockClear();
});

describe('mintWrapperChartName', () => {
  test('mints <insight>-chart when the name is free', () => {
    expect(mintWrapperChartName('rev-insight', [])).toBe('rev-insight-chart');
  });

  test('disambiguates with -2 on collision (hyphen separator, #620)', () => {
    expect(mintWrapperChartName('rev-insight', ['rev-insight-chart'])).toBe('rev-insight-chart-2');
  });

  test('keeps counting past taken suffixes', () => {
    expect(
      mintWrapperChartName('rev-insight', ['rev-insight-chart', 'rev-insight-chart-2'])
    ).toBe('rev-insight-chart-3');
  });

  test('an underscored insight name still suffixes with a hyphen', () => {
    expect(mintWrapperChartName('rev_insight', ['rev_insight-chart'])).toBe('rev_insight-chart-2');
  });

  test('FORCES the hyphen separator rather than letting the base infer it', () => {
    mintWrapperChartName('rev_insight', ['rev_insight-chart']);
    expect(generateUniqueName).toHaveBeenCalledWith('rev_insight-chart', ['rev_insight-chart'], {
      separator: '-',
    });
  });

  test('the forced separator wins even when the inferred one would differ', () => {
    // Prove the option is load-bearing by driving the real generator with an
    // inference that would otherwise pick '_' for this base.
    const { suffixSeparatorFor, generateUniqueName: real } = jest.requireActual('./uniqueName');
    expect(suffixSeparatorFor('rev_insight')).toBe('_');
    expect(real('rev_insight', ['rev_insight'])).toBe('rev_insight_2');
    expect(real('rev_insight', ['rev_insight'], { separator: '-' })).toBe('rev_insight-2');
  });
});

describe('buildWrapperChartConfig', () => {
  test('the wrapper chart holds exactly the wrapped insight (matches #632)', () => {
    expect(buildWrapperChartConfig('rev-insight')).toEqual({ insights: ['ref(rev-insight)'] });
  });
});
