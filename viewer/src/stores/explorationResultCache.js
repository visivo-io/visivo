/**
 * Page-lifetime LRU of exploration query results.
 *
 * Parking an exploration tab strips `queryResult` from the persisted draft on
 * purpose (it must stay a small JSON document), so switching tabs and back
 * used to drop every result on screen. `CenterPanel` parks each completed
 * run here and `useModelTabPrefill` reads it back when a tab mounts empty.
 *
 * Key: `[explorationId, modelName, sourceName, sql]`, all taken from the run
 * that was executed. Any change to any part is a miss (a rename included:
 * downstream consumers use the name to decide what the rows are). Entries are
 * invalidated on a failed re-run, on promote, on exploration delete, and when
 * the source is saved or deleted (the key carries the source name, not its
 * config). Bounded by entry count and total cells; least-recently-used first.
 * Nothing clears it on navigation: the navigation it must survive is the same
 * one that would otherwise clear it.
 */

const DEFAULT_MAX_ENTRIES = 8;
// rows × columns summed over all entries, as an O(1) proxy for bytes
// (~25–50 MB at full budget). A result larger than the whole budget is
// refused rather than evicting everything else to make room.
const DEFAULT_MAX_CELLS = 250_000;

let maxEntries = DEFAULT_MAX_ENTRIES;
let maxCells = DEFAULT_MAX_CELLS;

// key -> {explorationId, modelName, sourceName, sql, result, cells, ranAt}.
// Map iteration order is insertion order, so the first key is the LRU one.
const entries = new Map();

let totalCells = 0;

const cellsIn = result => {
  const rowCount = Array.isArray(result?.rows) ? result.rows.length : 0;
  const colCount = Array.isArray(result?.columns) ? result.columns.length : 0;
  return rowCount * Math.max(1, colCount);
};

/** Cache key for one query chip's result, or `null` when the scope is incomplete (caching off). */
export const explorationResultCacheKey = ({
  explorationId,
  modelName,
  sourceName,
  sql,
} = {}) => {
  if (!explorationId || !modelName || !sourceName) return null;
  const text = typeof sql === 'string' ? sql.trim() : '';
  if (!text) return null;
  return JSON.stringify([explorationId, modelName, sourceName, text]);
};

const dropWhere = predicate => {
  let dropped = 0;
  for (const [key, entry] of entries) {
    if (!predicate(entry)) continue;
    entries.delete(key);
    totalCells -= entry.cells;
    dropped += 1;
  }
  return dropped;
};

const evictToBounds = () => {
  while (entries.size > maxEntries || totalCells > maxCells) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    const entry = entries.get(oldest.value);
    entries.delete(oldest.value);
    totalCells -= entry.cells;
  }
};

/** Read the parked result for a scope, or `null`. A hit counts as a use. */
export const getCachedExplorationResult = scope => {
  const key = explorationResultCacheKey(scope);
  if (!key) return null;
  const entry = entries.get(key);
  if (!entry) return null;
  entries.delete(key);
  entries.set(key, entry);
  return entry.result;
};

/**
 * Park the result of a completed run. `scope.sql` / `scope.sourceName` must be
 * what was executed, not the editor's current contents.
 *
 * @returns {boolean} whether the result was stored.
 */
export const putCachedExplorationResult = (scope, result) => {
  const key = explorationResultCacheKey(scope);
  if (!key || !result) return false;

  const { explorationId, modelName, sourceName } = scope;

  // One live result per query chip: a re-run supersedes whatever it had parked.
  dropWhere(entry => entry.explorationId === explorationId && entry.modelName === modelName);

  const cells = cellsIn(result);
  if (cells > maxCells) return false;

  entries.set(key, {
    explorationId,
    modelName,
    sourceName,
    sql: typeof scope.sql === 'string' ? scope.sql.trim() : '',
    result,
    cells,
    ranAt: Date.now(),
  });
  totalCells += cells;
  evictToBounds();
  return entries.has(key);
};

/**
 * Forget results for one exploration, or for one query chip inside it.
 *
 * @param {string} explorationId
 * @param {string} [modelName] - omit to drop the whole exploration's results.
 * @returns {number} entries dropped.
 */
export const invalidateExplorationResults = (explorationId, modelName) => {
  if (!explorationId) return 0;
  return dropWhere(
    entry =>
      entry.explorationId === explorationId &&
      (modelName === undefined || entry.modelName === modelName)
  );
};

/**
 * Forget every parked result produced by one source, across all explorations.
 *
 * @param {string} sourceName
 * @returns {number} entries dropped.
 */
export const invalidateResultsForSource = sourceName => {
  if (!sourceName) return 0;
  return dropWhere(entry => entry.sourceName === sourceName);
};

export const explorationResultCacheStats = () => ({
  entries: entries.size,
  cells: totalCells,
  maxEntries,
  maxCells,
});

/** Test-only: empty the cache and restore the shipped bounds. */
export const _resetExplorationResultCacheForTests = () => {
  entries.clear();
  totalCells = 0;
  maxEntries = DEFAULT_MAX_ENTRIES;
  maxCells = DEFAULT_MAX_CELLS;
};

/** Test-only: shrink the bounds so eviction is reachable in a unit test. */
export const _setExplorationResultCacheBoundsForTests = bounds => {
  if (typeof bounds?.maxEntries === 'number') maxEntries = bounds.maxEntries;
  if (typeof bounds?.maxCells === 'number') maxCells = bounds.maxCells;
  evictToBounds();
};
