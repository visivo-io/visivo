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

/**
 * Interpolate between two colors based on a ratio (0 to 1).
 * @param {{ r: number, g: number, b: number }} minRgb
 * @param {{ r: number, g: number, b: number }} maxRgb
 * @param {number} ratio - 0 to 1
 * @returns {string} CSS rgb() color string
 */
function interpolateColor(minRgb, maxRgb, ratio) {
  const r = Math.round(minRgb.r + (maxRgb.r - minRgb.r) * ratio);
  const g = Math.round(minRgb.g + (maxRgb.g - minRgb.g) * ratio);
  const b = Math.round(minRgb.b + (maxRgb.b - minRgb.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
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
          styles.set(`${rowIdx}-${colId}`, {
            backgroundColor: interpolateColor(minRgb, maxRgb, ratio),
          });
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
          styles.set(`${rowIdx}-${colId}`, {
            backgroundColor: interpolateColor(minRgb, maxRgb, ratio),
          });
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
          styles.set(`${rowIdx}-${colId}`, {
            backgroundColor: interpolateColor(minRgb, maxRgb, ratio),
          });
        }
      }
    });
  }

  return styles;
}
