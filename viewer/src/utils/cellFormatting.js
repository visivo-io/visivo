import { readableTextOn } from '../theme/colorUtils';

/**
 * Parse a hex color string to { r, g, b }.
 * @param {string} hex - e.g. "#ff0000" or "#f00"
 * @returns {{ r: number, g: number, b: number }}
 */
function parseHex(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  }
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function gradientCellStyle(minRgb, maxRgb, ratio) {
  const channels = ['r', 'g', 'b'].map(k => Math.round(minRgb[k] + (maxRgb[k] - minRgb[k]) * ratio));
  const hex = `#${channels.map(v => v.toString(16).padStart(2, '0')).join('')}`;
  return { backgroundColor: `rgb(${channels.join(', ')})`, color: readableTextOn(hex) };
}

/**
 * Coerce a cell value to a finite number, or `null` when the cell carries no
 * number. `Number(null) === 0` used to paint every empty pivot cell as the
 * minimum of the gradient (VIS-1463 T4): null, undefined, blank strings and
 * booleans are NOT numbers here, so they stay uncoloured and do not take part
 * in the min/max.
 *
 * @param {*} value
 * @returns {number|null}
 */
export function toGradientNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if (value.trim() === '') return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Decide which columns a `format_cells` gradient may colour.
 *
 * - Pivot mode: every non-row column is a measure (`values` aggregate), so all
 *   of them are coloured and nothing else is.
 * - Column-select / data mode: only columns whose source values are genuinely
 *   numeric (JS numbers / bigints from the query result). Numeric-LOOKING
 *   strings (ids, codes, years stored as text) are left alone — in these modes
 *   the config carries no notion of a measure, so the value type is the only
 *   honest signal (VIS-1463 T4).
 *
 * @param {Array<{name: string, isPivotRow?: boolean}>} columns
 * @param {Array<Object>} rows - ALL rows of the table (not a page)
 * @param {boolean} isPivotMode
 * @returns {string[]} column accessor keys
 */
export function selectGradientColumns(columns, rows, isPivotMode) {
  if (!columns?.length || !rows?.length) return [];
  if (isPivotMode) {
    return columns.filter(col => !col.isPivotRow).map(col => col.name);
  }
  return columns
    .filter(col => {
      let sawNumber = false;
      for (const row of rows) {
        const val = row[col.name];
        if (val === null || val === undefined) continue;
        if (typeof val === 'number' || typeof val === 'bigint') {
          sawNumber = true;
        } else {
          return false;
        }
      }
      return sawNumber;
    })
    .map(col => col.name);
}

function rangeOf(cells) {
  let min = Infinity;
  let max = -Infinity;
  for (const val of cells) {
    if (val === null) continue;
    if (val < min) min = val;
    if (val > max) max = val;
  }
  return { min, max, range: max - min };
}

/**
 * Compute gradient background styles for table cells.
 *
 * Pass EVERY row of the table (not just the visible page): the min/max is
 * computed over all of them so a given value has the same colour on every
 * page (VIS-1463 T4). Cells without a number get no style.
 *
 * @param {Array<Object>} rows - Array of row objects
 * @param {string[]} numericColumnIds - Column accessor keys that are measures
 * @param {Object} formatCells - { scope, min_color, max_color }
 * @returns {Map<string, { backgroundColor: string, color: string }>} Map keyed by "rowIdx-colId"
 */
export function computeGradientStyles(rows, numericColumnIds, formatCells) {
  const styles = new Map();

  if (!formatCells || !rows.length || !numericColumnIds.length) {
    return styles;
  }

  const { scope, min_color, max_color } = formatCells;
  const minRgb = parseHex(min_color);
  const maxRgb = parseHex(max_color);

  // numbers[rowIdx][colId] = finite number | null
  const numbers = rows.map(row => {
    const out = {};
    for (const colId of numericColumnIds) out[colId] = toGradientNumber(row[colId]);
    return out;
  });

  const paint = (rowIdx, colId, { min, range }) => {
    const val = numbers[rowIdx][colId];
    if (val === null || !(range > 0)) return;
    styles.set(`${rowIdx}-${colId}`, gradientCellStyle(minRgb, maxRgb, (val - min) / range));
  };

  if (scope === 'table') {
    const stats = rangeOf(numbers.flatMap(r => numericColumnIds.map(c => r[c])));
    numbers.forEach((_, rowIdx) => {
      for (const colId of numericColumnIds) paint(rowIdx, colId, stats);
    });
  } else if (scope === 'column') {
    for (const colId of numericColumnIds) {
      const stats = rangeOf(numbers.map(r => r[colId]));
      numbers.forEach((_, rowIdx) => paint(rowIdx, colId, stats));
    }
  } else if (scope === 'row') {
    numbers.forEach((r, rowIdx) => {
      const stats = rangeOf(numericColumnIds.map(c => r[c]));
      for (const colId of numericColumnIds) paint(rowIdx, colId, stats);
    });
  }

  return styles;
}
