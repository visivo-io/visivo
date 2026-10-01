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
 * Compute gradient background styles for table cells.
 *
 * @param {Array<Object>} rows - Array of row objects
 * @param {string[]} numericColumnIds - Column accessor keys that are numeric
 * @param {Object} formatCells - { scope, min_color, max_color }
 * @returns {Map<string, { backgroundColor: string }>} Map keyed by "rowIdx-colId"
 */
export function computeGradientStyles(rows, numericColumnIds, formatCells) {
  const styles = new Map();

  if (!formatCells || !rows.length || !numericColumnIds.length) {
    return styles;
  }

  const { scope, min_color, max_color } = formatCells;
  const minRgb = parseHex(min_color);
  const maxRgb = parseHex(max_color);

  if (scope === 'table') {
    let globalMin = Infinity;
    let globalMax = -Infinity;
    for (const row of rows) {
      for (const colId of numericColumnIds) {
        const val = Number(row[colId]);
        if (!isNaN(val)) {
          if (val < globalMin) globalMin = val;
          if (val > globalMax) globalMax = val;
        }
      }
    }
    const range = globalMax - globalMin;
    rows.forEach((row, rowIdx) => {
      for (const colId of numericColumnIds) {
        const val = Number(row[colId]);
        if (!isNaN(val) && range > 0) {
          const ratio = (val - globalMin) / range;
          styles.set(`${rowIdx}-${colId}`, gradientCellStyle(minRgb, maxRgb, ratio));
        }
      }
    });
  } else if (scope === 'column') {
    for (const colId of numericColumnIds) {
      let colMin = Infinity;
      let colMax = -Infinity;
      for (const row of rows) {
        const val = Number(row[colId]);
        if (!isNaN(val)) {
          if (val < colMin) colMin = val;
          if (val > colMax) colMax = val;
        }
      }
      const range = colMax - colMin;
      rows.forEach((row, rowIdx) => {
        const val = Number(row[colId]);
        if (!isNaN(val) && range > 0) {
          const ratio = (val - colMin) / range;
          styles.set(`${rowIdx}-${colId}`, gradientCellStyle(minRgb, maxRgb, ratio));
        }
      });
    }
  } else if (scope === 'row') {
    rows.forEach((row, rowIdx) => {
      let rowMin = Infinity;
      let rowMax = -Infinity;
      for (const colId of numericColumnIds) {
        const val = Number(row[colId]);
        if (!isNaN(val)) {
          if (val < rowMin) rowMin = val;
          if (val > rowMax) rowMax = val;
        }
      }
      const range = rowMax - rowMin;
      for (const colId of numericColumnIds) {
        const val = Number(row[colId]);
        if (!isNaN(val) && range > 0) {
          const ratio = (val - rowMin) / range;
          styles.set(`${rowIdx}-${colId}`, gradientCellStyle(minRgb, maxRgb, ratio));
        }
      }
    });
  }

  return styles;
}
