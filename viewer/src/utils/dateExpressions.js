/**
 * Date expression utilities for input range defaults.
 *
 * Supports the full PRD date expression syntax:
 * - Anchors: today, now, start_of_week, end_of_week, start_of_month, end_of_month,
 *            start_of_quarter, end_of_quarter, start_of_year, end_of_year
 * - Offsets: "+ 30 days", "- 1 week", etc.
 * - Units: day(s), week(s), month(s), quarter(s), year(s)
 *
 * Date expressions are resolved at frontend runtime (browser local timezone).
 */

import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfQuarter,
  endOfQuarter,
  startOfYear,
  endOfYear,
  addDays,
  addWeeks,
  addMonths,
  addQuarters,
  addYears,
  startOfDay,
  eachDayOfInterval,
  eachWeekOfInterval,
  eachMonthOfInterval,
  eachQuarterOfInterval,
  eachYearOfInterval,
  format,
  isValid,
  parseISO,
} from 'date-fns';

/**
 * List of supported anchor keywords.
 */
const ANCHORS = [
  'today',
  'now',
  'start_of_week',
  'end_of_week',
  'start_of_month',
  'end_of_month',
  'start_of_quarter',
  'end_of_quarter',
  'start_of_year',
  'end_of_year',
];

/**
 * List of supported time units.
 */
const UNITS = ['day', 'days', 'week', 'weeks', 'month', 'months', 'quarter', 'quarters', 'year', 'years'];

/**
 * Regex pattern for date expressions.
 * Matches: "today", "today - 30 days", "start_of_month + 1 week", etc.
 */
const DATE_EXPRESSION_PATTERN = new RegExp(
  `^(${ANCHORS.join('|')})(?:\\s*([+-])\\s*(\\d+)\\s*(${UNITS.join('|')}))?$`,
  'i'
);

/**
 * Regex pattern for step units.
 * Matches: "1 day", "2 weeks", "1 month", etc.
 */
const STEP_PATTERN = new RegExp(`^(\\d+)\\s*(${UNITS.join('|')})$`, 'i');

/**
 * Check if a value is a date expression string.
 *
 * @param {*} value - Value to check
 * @returns {boolean} True if the value is a date expression
 */
export function isDateExpression(value) {
  if (typeof value !== 'string') return false;

  // Check if it matches the date expression pattern
  return DATE_EXPRESSION_PATTERN.test(value.trim());
}

/**
 * Check if a value is a step unit string.
 *
 * @param {*} value - Value to check
 * @returns {boolean} True if the value is a step unit (e.g., "1 day", "2 weeks")
 */
export function isStepUnit(value) {
  if (typeof value !== 'string') return false;
  return STEP_PATTERN.test(value.trim());
}

/**
 * Resolve an anchor keyword to a Date object.
 *
 * @param {string} anchor - Anchor keyword (e.g., "today", "start_of_month")
 * @returns {Date} Resolved date
 */
export function resolveAnchor(anchor) {
  const now = new Date();

  switch (anchor.toLowerCase()) {
    case 'today':
      return startOfDay(now);
    case 'now':
      return now;
    case 'start_of_week':
      // Week starts on Monday (weekStartsOn: 1)
      return startOfWeek(now, { weekStartsOn: 1 });
    case 'end_of_week':
      // Week ends on Sunday
      return endOfWeek(now, { weekStartsOn: 1 });
    case 'start_of_month':
      return startOfMonth(now);
    case 'end_of_month':
      return endOfMonth(now);
    case 'start_of_quarter':
      return startOfQuarter(now);
    case 'end_of_quarter':
      return endOfQuarter(now);
    case 'start_of_year':
      return startOfYear(now);
    case 'end_of_year':
      return endOfYear(now);
    default:
      throw new Error(`Unknown anchor: ${anchor}`);
  }
}

/**
 * Parse an offset string into value and unit.
 *
 * @param {string} operator - "+" or "-"
 * @param {string} amount - Numeric amount as string
 * @param {string} unit - Time unit (day, week, month, quarter, year)
 * @returns {{ value: number, unit: string }} Parsed offset
 */
export function parseOffset(operator, amount, unit) {
  const value = parseInt(amount, 10);
  const normalizedUnit = unit.toLowerCase().replace(/s$/, ''); // Remove trailing 's'

  return {
    value: operator === '-' ? -value : value,
    unit: normalizedUnit,
  };
}

/**
 * Apply an offset to a date.
 *
 * @param {Date} date - Base date
 * @param {{ value: number, unit: string }} offset - Offset to apply
 * @returns {Date} New date with offset applied
 */
export function applyOffset(date, offset) {
  const { value, unit } = offset;

  switch (unit) {
    case 'day':
      return addDays(date, value);
    case 'week':
      return addWeeks(date, value);
    case 'month':
      return addMonths(date, value);
    case 'quarter':
      return addQuarters(date, value);
    case 'year':
      return addYears(date, value);
    default:
      throw new Error(`Unknown unit: ${unit}`);
  }
}

/**
 * Parse a step unit string into value and unit.
 *
 * @param {string} stepStr - Step string (e.g., "1 day", "2 weeks")
 * @returns {{ value: number, unit: string }} Parsed step
 */
export function parseStep(stepStr) {
  const match = stepStr.trim().match(STEP_PATTERN);
  if (!match) {
    throw new Error(`Invalid step format: ${stepStr}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase().replace(/s$/, ''); // Remove trailing 's'

  return { value, unit };
}

/**
 * Resolve a date expression to a Date object.
 *
 * @param {string} expr - Date expression (e.g., "today - 30 days", "start_of_month")
 * @returns {Date} Resolved date
 */
export function resolveDateExpression(expr) {
  const trimmed = expr.trim();
  const match = trimmed.match(DATE_EXPRESSION_PATTERN);

  if (!match) {
    // Try parsing as ISO date string
    const parsed = parseISO(trimmed);
    if (isValid(parsed)) {
      return parsed;
    }
    throw new Error(`Invalid date expression: ${expr}`);
  }

  const [, anchor, operator, amount, unit] = match;

  // Resolve the anchor
  let date = resolveAnchor(anchor);

  // Apply offset if present
  if (operator && amount && unit) {
    const offset = parseOffset(operator, amount, unit);
    date = applyOffset(date, offset);
  }

  return date;
}

/**
 * Try to resolve a value as a date expression.
 * If it's not a date expression, returns the original value.
 *
 * @param {*} value - Value to try to resolve
 * @returns {Date | *} Resolved date or original value
 */
export function tryResolveDateExpression(value) {
  if (!isDateExpression(value)) {
    return value;
  }

  try {
    return resolveDateExpression(value);
  } catch (e) {
    console.warn(`Failed to resolve date expression: ${value}`, e);
    return value;
  }
}

/**
 * Generate an array of dates between start and end with the given step.
 *
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @param {string | { value: number, unit: string }} step - Step specification
 * @returns {Date[]} Array of dates
 */
export function generateDateRange(start, end, step) {
  // Parse step if it's a string
  const parsedStep = typeof step === 'string' ? parseStep(step) : step;
  const { value, unit } = parsedStep;

  // Use date-fns interval functions for efficiency
  const interval = { start, end };

  switch (unit) {
    case 'day':
      if (value === 1) {
        return eachDayOfInterval(interval);
      }
      // For multi-day steps, generate manually
      return generateSteppedDates(start, end, value, addDays);

    case 'week':
      if (value === 1) {
        // eachWeekOfInterval returns start of each week
        const weeks = eachWeekOfInterval(interval, { weekStartsOn: 1 });
        // Filter to only include dates within the interval
        return weeks.filter(d => d >= start && d <= end);
      }
      return generateSteppedDates(start, end, value, addWeeks);

    case 'month':
      if (value === 1) {
        const months = eachMonthOfInterval(interval);
        return months.filter(d => d >= start && d <= end);
      }
      return generateSteppedDates(start, end, value, addMonths);

    case 'quarter':
      if (value === 1) {
        const quarters = eachQuarterOfInterval(interval);
        return quarters.filter(d => d >= start && d <= end);
      }
      return generateSteppedDates(start, end, value, addQuarters);

    case 'year':
      if (value === 1) {
        const years = eachYearOfInterval(interval);
        return years.filter(d => d >= start && d <= end);
      }
      return generateSteppedDates(start, end, value, addYears);

    default:
      throw new Error(`Unknown step unit: ${unit}`);
  }
}

/**
 * Generate dates with a custom step size.
 *
 * @param {Date} start - Start date
 * @param {Date} end - End date
 * @param {number} stepValue - Number of units per step
 * @param {function} addFn - Function to add units (e.g., addDays, addWeeks)
 * @returns {Date[]} Array of dates
 */
function generateSteppedDates(start, end, stepValue, addFn) {
  const dates = [];
  let current = start;

  while (current <= end) {
    dates.push(current);
    current = addFn(current, stepValue);
  }

  // Always include end date if not already included
  if (dates.length > 0 && dates[dates.length - 1].getTime() !== end.getTime()) {
    dates.push(end);
  }

  return dates;
}

/**
 * Format a date as an ISO date string (YYYY-MM-DD).
 *
 * @param {Date} date - Date to format
 * @returns {string} ISO date string
 */
export function formatDateISO(date) {
  return format(date, 'yyyy-MM-dd');
}

/**
 * Format a date for display in the UI.
 *
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
export function formatDateDisplay(date) {
  return format(date, 'MMM d, yyyy');
}

/**
 * Convert date range values to options array for input components.
 * If the step is a date expression, resolves it first.
 *
 * @param {*} start - Start value (can be date expression or static value)
 * @param {*} end - End value (can be date expression or static value)
 * @param {*} step - Step value (can be step unit string or numeric)
 * @returns {string[]} Array of ISO date strings
 */
export function resolveDateRangeToOptions(start, end, step) {
  // Resolve start and end as dates if they're expressions
  const startDate = isDateExpression(start)
    ? resolveDateExpression(start)
    : start instanceof Date
      ? start
      : parseISO(String(start));

  const endDate = isDateExpression(end)
    ? resolveDateExpression(end)
    : end instanceof Date
      ? end
      : parseISO(String(end));

  if (!isValid(startDate) || !isValid(endDate)) {
    console.warn('Invalid start or end date for range');
    return [];
  }

  // Handle step
  let stepSpec;
  if (isStepUnit(step)) {
    stepSpec = parseStep(step);
  } else if (typeof step === 'number') {
    // Assume numeric step is days
    stepSpec = { value: step, unit: 'day' };
  } else {
    // Try to parse as number
    const numStep = parseFloat(step);
    if (!isNaN(numStep)) {
      stepSpec = { value: numStep, unit: 'day' };
    } else {
      console.warn('Invalid step format, defaulting to 1 day');
      stepSpec = { value: 1, unit: 'day' };
    }
  }

  // Generate the date range
  const dates = generateDateRange(startDate, endDate, stepSpec);

  // Convert to ISO strings
  return dates.map(formatDateISO);
}
