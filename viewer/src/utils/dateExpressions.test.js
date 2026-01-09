import {
  isDateExpression,
  isStepUnit,
  resolveDateExpression,
  resolveAnchor,
  parseOffset,
  applyOffset,
  parseStep,
  generateDateRange,
  formatDateISO,
  formatDateDisplay,
  resolveDateRangeToOptions,
  tryResolveDateExpression,
} from './dateExpressions';
import {
  startOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addDays,
  format,
} from 'date-fns';

describe('dateExpressions', () => {
  // Use a fixed reference date for predictable tests
  const mockNow = new Date('2024-06-15T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(mockNow);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('isDateExpression', () => {
    it('should return true for valid anchor keywords', () => {
      expect(isDateExpression('today')).toBe(true);
      expect(isDateExpression('now')).toBe(true);
      expect(isDateExpression('start_of_week')).toBe(true);
      expect(isDateExpression('end_of_week')).toBe(true);
      expect(isDateExpression('start_of_month')).toBe(true);
      expect(isDateExpression('end_of_month')).toBe(true);
      expect(isDateExpression('start_of_quarter')).toBe(true);
      expect(isDateExpression('end_of_quarter')).toBe(true);
      expect(isDateExpression('start_of_year')).toBe(true);
      expect(isDateExpression('end_of_year')).toBe(true);
    });

    it('should return true for anchors with offsets', () => {
      expect(isDateExpression('today - 30 days')).toBe(true);
      expect(isDateExpression('today + 7 days')).toBe(true);
      expect(isDateExpression('start_of_month - 1 month')).toBe(true);
      expect(isDateExpression('end_of_year + 2 weeks')).toBe(true);
      expect(isDateExpression('today - 1 quarter')).toBe(true);
      expect(isDateExpression('now + 1 year')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isDateExpression('TODAY')).toBe(true);
      expect(isDateExpression('Today')).toBe(true);
      expect(isDateExpression('TODAY - 30 DAYS')).toBe(true);
    });

    it('should return false for non-date expressions', () => {
      expect(isDateExpression('2024-01-01')).toBe(false);
      expect(isDateExpression('hello')).toBe(false);
      expect(isDateExpression('123')).toBe(false);
      expect(isDateExpression('')).toBe(false);
      expect(isDateExpression(null)).toBe(false);
      expect(isDateExpression(undefined)).toBe(false);
      expect(isDateExpression(42)).toBe(false);
    });

    it('should handle whitespace', () => {
      expect(isDateExpression('  today  ')).toBe(true);
      expect(isDateExpression(' today - 30 days ')).toBe(true);
      // Note: today-30days matches because the regex optionally allows offset
      // The pattern matches 'today' successfully, and -30days doesn't match offset pattern
      // but since offset is optional, it still matches
    });
  });

  describe('isStepUnit', () => {
    it('should return true for valid step units', () => {
      expect(isStepUnit('1 day')).toBe(true);
      expect(isStepUnit('2 days')).toBe(true);
      expect(isStepUnit('1 week')).toBe(true);
      expect(isStepUnit('4 weeks')).toBe(true);
      expect(isStepUnit('1 month')).toBe(true);
      expect(isStepUnit('3 months')).toBe(true);
      expect(isStepUnit('1 quarter')).toBe(true);
      expect(isStepUnit('2 quarters')).toBe(true);
      expect(isStepUnit('1 year')).toBe(true);
      expect(isStepUnit('5 years')).toBe(true);
    });

    it('should return false for non-step values', () => {
      expect(isStepUnit('day')).toBe(false); // missing number
      expect(isStepUnit('1')).toBe(false); // missing unit
      expect(isStepUnit('hello')).toBe(false);
      expect(isStepUnit('')).toBe(false);
      expect(isStepUnit(null)).toBe(false);
      expect(isStepUnit(42)).toBe(false);
    });
  });

  describe('resolveAnchor', () => {
    it('should resolve today to start of current day', () => {
      const result = resolveAnchor('today');
      expect(result).toEqual(startOfDay(mockNow));
    });

    it('should resolve now to current time', () => {
      const result = resolveAnchor('now');
      expect(result.getTime()).toBeCloseTo(mockNow.getTime(), -3);
    });

    it('should resolve start_of_week (Monday)', () => {
      const result = resolveAnchor('start_of_week');
      expect(result).toEqual(startOfWeek(mockNow, { weekStartsOn: 1 }));
    });

    it('should resolve end_of_week (Sunday)', () => {
      const result = resolveAnchor('end_of_week');
      expect(result).toEqual(endOfWeek(mockNow, { weekStartsOn: 1 }));
    });

    it('should resolve start_of_month', () => {
      const result = resolveAnchor('start_of_month');
      expect(result).toEqual(startOfMonth(mockNow));
    });

    it('should resolve end_of_month', () => {
      const result = resolveAnchor('end_of_month');
      expect(result).toEqual(endOfMonth(mockNow));
    });

    it('should resolve start_of_quarter', () => {
      const result = resolveAnchor('start_of_quarter');
      expect(result).toEqual(startOfQuarter(mockNow));
    });

    it('should resolve end_of_quarter', () => {
      const result = resolveAnchor('end_of_quarter');
      expect(result).toEqual(endOfQuarter(mockNow));
    });

    it('should resolve start_of_year', () => {
      const result = resolveAnchor('start_of_year');
      expect(result).toEqual(startOfYear(mockNow));
    });

    it('should resolve end_of_year', () => {
      const result = resolveAnchor('end_of_year');
      expect(result).toEqual(endOfYear(mockNow));
    });

    it('should throw for unknown anchor', () => {
      expect(() => resolveAnchor('invalid')).toThrow('Unknown anchor: invalid');
    });
  });

  describe('parseOffset', () => {
    it('should parse positive offsets', () => {
      expect(parseOffset('+', '30', 'days')).toEqual({ value: 30, unit: 'day' });
      expect(parseOffset('+', '1', 'week')).toEqual({ value: 1, unit: 'week' });
    });

    it('should parse negative offsets', () => {
      expect(parseOffset('-', '30', 'days')).toEqual({ value: -30, unit: 'day' });
      expect(parseOffset('-', '1', 'month')).toEqual({ value: -1, unit: 'month' });
    });

    it('should normalize unit names (remove trailing s)', () => {
      expect(parseOffset('+', '2', 'weeks')).toEqual({ value: 2, unit: 'week' });
      expect(parseOffset('-', '3', 'months')).toEqual({ value: -3, unit: 'month' });
    });
  });

  describe('applyOffset', () => {
    const baseDate = new Date('2024-06-15T00:00:00Z');

    it('should apply day offsets', () => {
      expect(applyOffset(baseDate, { value: 5, unit: 'day' })).toEqual(addDays(baseDate, 5));
      expect(applyOffset(baseDate, { value: -5, unit: 'day' })).toEqual(addDays(baseDate, -5));
    });

    it('should throw for unknown unit', () => {
      expect(() => applyOffset(baseDate, { value: 1, unit: 'invalid' })).toThrow(
        'Unknown unit: invalid'
      );
    });
  });

  describe('parseStep', () => {
    it('should parse valid step strings', () => {
      expect(parseStep('1 day')).toEqual({ value: 1, unit: 'day' });
      expect(parseStep('7 days')).toEqual({ value: 7, unit: 'day' });
      expect(parseStep('1 week')).toEqual({ value: 1, unit: 'week' });
      expect(parseStep('2 months')).toEqual({ value: 2, unit: 'month' });
    });

    it('should throw for invalid step format', () => {
      expect(() => parseStep('invalid')).toThrow('Invalid step format: invalid');
    });
  });

  describe('resolveDateExpression', () => {
    it('should resolve simple anchor expressions', () => {
      const result = resolveDateExpression('today');
      expect(result).toEqual(startOfDay(mockNow));
    });

    it('should resolve anchor with positive offset', () => {
      const result = resolveDateExpression('today + 5 days');
      expect(result).toEqual(addDays(startOfDay(mockNow), 5));
    });

    it('should resolve anchor with negative offset', () => {
      const result = resolveDateExpression('today - 30 days');
      expect(result).toEqual(addDays(startOfDay(mockNow), -30));
    });

    it('should parse ISO date strings', () => {
      const result = resolveDateExpression('2024-01-15');
      expect(format(result, 'yyyy-MM-dd')).toBe('2024-01-15');
    });

    it('should throw for invalid expressions', () => {
      expect(() => resolveDateExpression('invalid expression')).toThrow(
        'Invalid date expression: invalid expression'
      );
    });
  });

  describe('tryResolveDateExpression', () => {
    it('should resolve valid date expressions', () => {
      const result = tryResolveDateExpression('today');
      expect(result).toEqual(startOfDay(mockNow));
    });

    it('should return original value for non-date expressions', () => {
      expect(tryResolveDateExpression('hello')).toBe('hello');
      expect(tryResolveDateExpression(42)).toBe(42);
      expect(tryResolveDateExpression(null)).toBe(null);
    });
  });

  describe('formatDateISO', () => {
    it('should format date as ISO string', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      expect(formatDateISO(date)).toBe('2024-06-15');
    });
  });

  describe('formatDateDisplay', () => {
    it('should format date for display', () => {
      const date = new Date('2024-06-15T12:00:00Z');
      expect(formatDateDisplay(date)).toBe('Jun 15, 2024');
    });
  });

  describe('generateDateRange', () => {
    it('should generate daily dates', () => {
      // Use dates without timezone suffix to avoid timezone issues
      const start = new Date(2024, 5, 1); // June 1, 2024 (months are 0-indexed)
      const end = new Date(2024, 5, 5); // June 5, 2024
      const result = generateDateRange(start, end, '1 day');

      expect(result).toHaveLength(5);
      expect(format(result[0], 'yyyy-MM-dd')).toBe('2024-06-01');
      expect(format(result[4], 'yyyy-MM-dd')).toBe('2024-06-05');
    });

    it('should generate weekly dates', () => {
      const start = new Date(2024, 5, 1); // June 1, 2024
      const end = new Date(2024, 5, 30); // June 30, 2024
      const result = generateDateRange(start, end, '1 week');

      expect(result.length).toBeGreaterThan(1);
    });

    it('should generate monthly dates', () => {
      const start = new Date(2024, 0, 1); // Jan 1, 2024
      const end = new Date(2024, 5, 1); // June 1, 2024
      const result = generateDateRange(start, end, '1 month');

      expect(result.length).toBeGreaterThanOrEqual(5);
    });

    it('should handle step objects as well as strings', () => {
      const start = new Date(2024, 5, 1); // June 1, 2024
      const end = new Date(2024, 5, 5); // June 5, 2024
      const result = generateDateRange(start, end, { value: 1, unit: 'day' });

      expect(result).toHaveLength(5);
    });
  });

  describe('resolveDateRangeToOptions', () => {
    it('should resolve date expressions to ISO strings', () => {
      // Using static dates to avoid time-dependent tests
      const result = resolveDateRangeToOptions('2024-06-01', '2024-06-05', '1 day');

      expect(result).toHaveLength(5);
      expect(result[0]).toBe('2024-06-01');
      expect(result[4]).toBe('2024-06-05');
    });

    it('should handle date expression anchors', () => {
      const result = resolveDateRangeToOptions('today - 2 days', 'today', '1 day');

      expect(result).toHaveLength(3);
      // Should include today and two days before
    });

    it('should handle numeric step as days', () => {
      const result = resolveDateRangeToOptions('2024-06-01', '2024-06-03', 1);

      expect(result).toHaveLength(3);
    });

    it('should return empty array for invalid dates', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = resolveDateRangeToOptions('invalid', 'invalid', '1 day');

      expect(result).toEqual([]);
      consoleSpy.mockRestore();
    });

    it('should default to 1 day step for invalid step format', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const result = resolveDateRangeToOptions('2024-06-01', '2024-06-03', 'invalid');

      expect(result).toHaveLength(3);
      consoleSpy.mockRestore();
    });
  });
});
