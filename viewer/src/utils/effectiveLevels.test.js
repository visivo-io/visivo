import { getEffectiveLevels, hasConfiguredLevels } from './effectiveLevels';
import { defaultLevels } from './dashboardUtils';

describe('getEffectiveLevels (VIS-899 single source of truth)', () => {
  test('returns configured levels when defaults.levels is non-empty', () => {
    const defaults = {
      levels: [
        { title: 'Exec', description: 'top' },
        { title: 'Ops', description: 'day to day' },
      ],
    };
    expect(getEffectiveLevels(defaults)).toEqual(defaults.levels);
  });

  test('falls back to the shared defaultLevels when none configured', () => {
    expect(getEffectiveLevels({ levels: [] })).toEqual(defaultLevels);
    expect(getEffectiveLevels({})).toEqual(defaultLevels);
    expect(getEffectiveLevels(null)).toEqual(defaultLevels);
    expect(getEffectiveLevels(undefined)).toEqual(defaultLevels);
  });

  test('returns fresh copies so callers cannot mutate the canonical defaults', () => {
    const a = getEffectiveLevels(null);
    a[0].title = 'mutated';
    const b = getEffectiveLevels(null);
    expect(b[0].title).not.toBe('mutated');
    expect(b[0].title).toBe(defaultLevels[0].title);
  });

  test('configured copies are detached from the source array', () => {
    const defaults = { levels: [{ title: 'Exec', description: 'top' }] };
    const result = getEffectiveLevels(defaults);
    result[0].title = 'changed';
    expect(defaults.levels[0].title).toBe('Exec');
  });
});

describe('hasConfiguredLevels', () => {
  test('true only when defaults define a non-empty levels array', () => {
    expect(hasConfiguredLevels({ levels: [{ title: 'A' }] })).toBe(true);
    expect(hasConfiguredLevels({ levels: [] })).toBe(false);
    expect(hasConfiguredLevels({})).toBe(false);
    expect(hasConfiguredLevels(null)).toBe(false);
    expect(hasConfiguredLevels(undefined)).toBe(false);
  });
});
