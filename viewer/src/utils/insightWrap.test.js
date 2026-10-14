import { mintWrapperChartName, buildWrapperChartConfig } from './insightWrap';
import { generateUniqueName } from './uniqueName';

// Today's separator inference already yields '-' for every `<insight>-chart`
// base, so only a spy proves the forced option is passed.
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
