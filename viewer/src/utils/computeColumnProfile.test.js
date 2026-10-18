import { computeColumnProfile, median, percentile, stdDev } from './computeColumnProfile';

describe('computeColumnProfile', () => {
  it('returns an empty profile when there are no rows', () => {
    const profile = computeColumnProfile('x', { duckdbType: 'INTEGER' }, []);
    expect(profile).toMatchObject({ name: 'x', type: 'INTEGER', distinct: 0, min: null });
  });

  it('falls back to the normalized type, then UNKNOWN', () => {
    expect(computeColumnProfile('x', { normalizedType: 'number' }, null).type).toBe('NUMBER');
    expect(
      computeColumnProfile('x', { duckdbType: 'UNKNOWN', normalizedType: 'unknown' }, null).type
    ).toBe('UNKNOWN');
  });

  it('computes numeric statistics for an odd number of values', () => {
    const rows = [{ x: 3 }, { x: 1 }, { x: 2 }, { x: null }];
    const profile = computeColumnProfile('x', {}, rows);
    expect(profile).toMatchObject({
      null_count: 1,
      null_percentage: 25,
      distinct: 3,
      min: 1,
      max: 3,
      avg: 2,
      median: 2,
      q25: 1.5,
      q75: 2.5,
    });
    expect(profile.std_dev).toBeCloseTo(Math.sqrt(2 / 3));
  });

  it('averages the middle pair for an even number of values', () => {
    const profile = computeColumnProfile('x', {}, [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }]);
    expect(profile.median).toBe(2.5);
    expect(profile.q25).toBe(1.75);
  });

  it('takes string min and max for a non-numeric column', () => {
    const profile = computeColumnProfile('x', {}, [{ x: 'b' }, { x: 'a' }, { x: 'b' }]);
    expect(profile).toMatchObject({ distinct: 2, min: 'a', max: 'b', avg: null });
  });

  it('counts distinct structs that hold BigInts', () => {
    const rows = [{ x: { _0: 1n } }, { x: { _0: 1n } }, { x: { _0: 2n } }];
    expect(computeColumnProfile('x', {}, rows).distinct).toBe(2);
  });

  it('leaves min and max empty when every value is null', () => {
    const profile = computeColumnProfile('x', {}, [{ x: null }, { x: undefined }]);
    expect(profile).toMatchObject({ null_count: 2, distinct: 0, min: null, max: null });
  });
});

describe('statistics helpers', () => {
  it('return null for an empty array', () => {
    expect(median([])).toBeNull();
    expect(percentile([], 25)).toBeNull();
    expect(stdDev([], 0)).toBeNull();
  });
});
