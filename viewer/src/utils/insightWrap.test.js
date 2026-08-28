/**
 * insightWrap — the shared auto-wrap naming/config recipe (#632/#637 pattern,
 * consumed by the canvas insight drop AND the click-to-pick picker paths).
 */
import { mintWrapperChartName, buildWrapperChartConfig } from './insightWrap';

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

  test('an underscored insight name still suffixes with a hyphen (forced separator)', () => {
    expect(mintWrapperChartName('rev_insight', ['rev_insight-chart'])).toBe('rev_insight-chart-2');
  });
});

describe('buildWrapperChartConfig', () => {
  test('the wrapper chart holds exactly the wrapped insight (matches #632)', () => {
    expect(buildWrapperChartConfig('rev-insight')).toEqual({ insights: ['ref(rev-insight)'] });
  });
});
