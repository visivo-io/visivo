/**
 * Parse DuckDB PIVOT result column keys into a hierarchical tree structure
 * suitable for TanStack React Table nested column definitions.
 *
 * DuckDB PIVOT column naming convention:
 *   Row columns: passed through as-is from GROUP BY
 *   Pivot columns: {on_val1}_{on_val2}_..._aggFunc("col_name") or aggFunc("col_name")
 *   Single value shorthand: {on_val1}_{on_val2}_... (no agg suffix when only one value)
 */

/**
 * @param {string[]} resultKeys - All column keys from DuckDB PIVOT result
 * @param {Set<string>} resolvedRowCols - Set of column keys that are row (GROUP BY) columns
 * @param {string[]} resolvedPivotCols - Resolved ON column names (determines nesting depth)
 * @param {Array<{aggFunc: string, displayName: string}>} aggInfo - Aggregation info from value expressions
 * @param {Object} reverseMapping - Hash-to-display-name mapping
 * @returns {Array} TanStack-compatible column definition tree (row columns flat, pivot columns nested)
 */
export function parsePivotColumnHierarchy(resultKeys, resolvedRowCols, resolvedPivotCols, aggInfo, reverseMapping) {
  const rowKeys = resultKeys.filter(k => resolvedRowCols.has(k));
  const pivotKeys = resultKeys.filter(k => !resolvedRowCols.has(k));

  const rowColumnDefs = rowKeys.map(key => ({
    id: key,
    accessorKey: key,
    displayName: reverseMapping[key] || formatSimpleHeader(key),
    meta: { isPivotRow: true },
  }));

  if (pivotKeys.length === 0) {
    return rowColumnDefs;
  }

  const pivotColCount = resolvedPivotCols.length;
  const singleValue = aggInfo.length === 1;

  const parsed = pivotKeys.map(key => {
    const { prefix, aggIndex } = extractPrefixAndAgg(key, aggInfo);
    return { originalKey: key, prefix, aggIndex };
  });

  // Group by prefix
  const groups = new Map();
  for (const item of parsed) {
    if (!groups.has(item.prefix)) groups.set(item.prefix, []);
    groups.get(item.prefix).push(item);
  }

  // Split each prefix into segments (one per ON column)
  const groupEntries = [...groups.entries()].map(([prefix, items]) => {
    const segments = splitPrefix(prefix, pivotColCount);
    return { segments, items };
  });

  // Single ON column + single value: flat (no nesting needed)
  if (pivotColCount === 1 && singleValue) {
    return [
      ...rowColumnDefs,
      ...groupEntries.map(({ segments, items }) => ({
        id: items[0].originalKey,
        accessorKey: items[0].originalKey,
        displayName: formatSimpleHeader(segments[0]),
        meta: { isPivotRow: false },
      })),
    ];
  }

  // Build nested tree
  const pivotTree = buildTree(groupEntries, 0, pivotColCount, aggInfo, singleValue);

  return [...rowColumnDefs, ...pivotTree];
}

/**
 * Extract the value prefix and aggregation index from a DuckDB PIVOT column key.
 */
function extractPrefixAndAgg(key, aggInfo) {
  // Try each known agg function suffix
  for (let i = 0; i < aggInfo.length; i++) {
    const aggLower = aggInfo[i].aggFunc.toLowerCase();
    // Match pattern: _aggFunc("col") or _aggFunc(col) at end of key
    const suffixPattern = new RegExp(`_${aggLower}\\(.*\\)$`, 'i');
    const match = key.match(suffixPattern);
    if (match) {
      const prefix = key.slice(0, match.index);
      return { prefix, aggIndex: i };
    }
  }

  // Single value: DuckDB may omit the agg suffix entirely
  if (aggInfo.length === 1) {
    return { prefix: key, aggIndex: 0 };
  }

  // Fallback: treat whole key as prefix with unknown agg
  return { prefix: key, aggIndex: -1 };
}

/**
 * Split a pivot column prefix into segments (one per ON column).
 * For single ON column, the entire prefix is one segment.
 * For multiple, split on underscore.
 */
function splitPrefix(prefix, pivotColCount) {
  if (pivotColCount <= 1) return [prefix];
  const parts = prefix.split('_');
  if (parts.length === pivotColCount) return parts;
  if (parts.length < pivotColCount) {
    // Fewer parts than expected — pad with empty strings
    return [...parts, ...Array(pivotColCount - parts.length).fill('')];
  }
  // More parts than pivot columns — rejoin excess into the last segment
  // This handles cases where later ON-column values contain underscores
  const result = parts.slice(0, pivotColCount - 1);
  result.push(parts.slice(pivotColCount - 1).join('_'));
  return result;
}

/**
 * Recursively build nested column groups.
 */
function buildTree(groupEntries, level, pivotColCount, aggInfo, singleValue) {
  if (level === pivotColCount) {
    // At leaf level — return individual agg column defs
    if (singleValue) {
      // Single value: just one leaf per group, no agg label needed
      return groupEntries.flatMap(({ items }) =>
        items.map(item => ({
          id: item.originalKey,
          accessorKey: item.originalKey,
          displayName: aggInfo[0] ? `${aggInfo[0].aggFunc} of ${aggInfo[0].displayName}` : item.originalKey,
          meta: { isPivotRow: false },
        }))
      );
    }
    // Multiple values: one leaf per agg
    return groupEntries.flatMap(({ items }) =>
      items
        .sort((a, b) => a.aggIndex - b.aggIndex)
        .map(item => ({
          id: item.originalKey,
          accessorKey: item.originalKey,
          displayName: aggInfo[item.aggIndex]
            ? `${aggInfo[item.aggIndex].aggFunc} of ${aggInfo[item.aggIndex].displayName}`
            : item.originalKey,
          meta: { isPivotRow: false },
        }))
    );
  }

  // Group by current level's segment value
  const grouped = new Map();
  for (const entry of groupEntries) {
    const segValue = entry.segments[level];
    if (!grouped.has(segValue)) grouped.set(segValue, []);
    grouped.get(segValue).push(entry);
  }

  return [...grouped.entries()].map(([segValue, children]) => ({
    id: `group-${level}-${segValue}`,
    header: formatSimpleHeader(segValue),
    meta: { isGroupHeader: true },
    columns: buildTree(children, level + 1, pivotColCount, aggInfo, singleValue),
  }));
}

function formatSimpleHeader(key) {
  if (!key) return '';
  const cleanKey = key.replace(/_hash_[a-f0-9]+$/i, '');
  return cleanKey
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}
