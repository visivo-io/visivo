/**
 * explorationResultCache.js — M27 tier 1: exploration query results survive a
 * tab switch.
 *
 * THE BUG. Only one exploration's working state is ever "hot" in the legacy
 * `explorerStore` singleton (see `ExplorationPane`'s park/resume docstring),
 * and `snapshotExplorerWorkingState` deliberately strips `queryResult` /
 * `enrichedResult` from the snapshot — they are large, and the persisted draft
 * is meant to stay a small JSON document. `restoreExplorerWorkingState` then
 * rebuilds every model state from `createEmptyModelState`, whose `queryResult`
 * is `null`. So switching to another exploration tab and back throws away
 * every result you had on screen, and the only way back is to re-run every
 * query — which is exactly what a user who looked away for a minute reports.
 *
 * THE FIX (tier 1). Keep the rows OUT of the draft (that stays small and
 * correct) and park them here instead: a module-level, bounded, LRU cache that
 * lives as long as the page does. `CenterPanel` writes an entry when a run
 * completes; `useModelTabPrefill` reads one back when a tab mounts with no
 * result, and hands it to `setModelQueryResult` so the normal downstream
 * pipeline runs (`useExplorerDuckDB` re-registers the DuckDB table, so
 * computed columns and the column profiler keep working).
 *
 * Tier 2 — surviving a hard reload / a `visivo serve` restart by writing a
 * parquet twin under `target/exploration-<id>/` — is deliberately NOT here.
 * It needs a product decision about whether the Django (cloud) path gets a
 * parquet twin at all, so this cache is honest about its lifetime: one page
 * session. A reload starts empty, and an empty cache is simply a miss.
 *
 * ── WHAT THE KEY IS, AND WHY ──────────────────────────────────────────────
 *
 * A cache is only as good as the honesty of its key. The key here is the full
 * tuple that DETERMINES the rows:
 *
 *     [explorationId, modelName, sourceName, sql]
 *
 * serialised with `JSON.stringify` so no separator can be forged by a name
 * that happens to contain the separator character.
 *
 *   - `explorationId` — isolation. Exploration B must never see A's rows even
 *     when both have a query chip called `orders` running the same SQL against
 *     the same source; they are different documents and a user reading one
 *     must never be shown the other's data.
 *   - `modelName` — a RENAME MISSES, deliberately. The name is not what
 *     determines the rows, so the cheaper key would drop it; but the name is
 *     what every downstream consumer (the DuckDB table, computed-column
 *     parenting, the promote checklist) uses to decide what these rows ARE.
 *     Serving rows recorded under one identity to a tab that now claims a
 *     different one is the kind of quiet mismatch that is much more expensive
 *     than the re-run it saves.
 *   - `sourceName` + `sql` — the actual determinants. Both are taken from what
 *     was EXECUTED (`SQLEditor` snapshots them at run time and hands them back
 *     through `onQueryComplete`), never from whatever the editor holds when
 *     the result lands: the user may have typed on, or run a SELECTION rather
 *     than the whole buffer. Caching under the current buffer text would serve
 *     one query's rows under another query's name, which is the precise
 *     failure this cache must never have.
 *
 * `sql` is compared as an exact string (only end-trimmed, matching what
 * `SQLEditor.handleRun` actually sends). No normalisation, no parsing — a
 * whitespace-only edit misses, and that is the correct side to err on.
 *
 * ── WHAT INVALIDATES ──────────────────────────────────────────────────────
 *
 *   - Editing the SQL, or picking a different source: the key changes, so the
 *     read misses. Nothing to do.
 *   - Renaming the query chip: the key changes, so the read misses. The entry
 *     under the old name is then an ORPHAN — unreachable, but still counted
 *     against both bounds. It is left to the LRU rather than invalidated
 *     explicitly, and that is a considered choice, not an oversight: an
 *     orphan is by definition never read again, so it never moves to the
 *     recently-used end and is always evicted ahead of a live entry. It
 *     serves nothing wrong; it costs a slot until pressure arrives. Doing
 *     better would mean teaching `explorerStore.renameModelTab` — the legacy
 *     singleton, which knows nothing about which exploration is on screen —
 *     an exploration identity, and that coupling is a larger correctness risk
 *     than the slot is worth. `explorationResultCache.test.js` pins the LRU
 *     ordering that makes this safe.
 *   - Re-running: `put` drops EVERY other entry for that (exploration, model)
 *     before inserting. One live result per query chip, always the newest. So
 *     re-running a second query and then typing the first one's text back in
 *     is a miss, not a resurrection of rows from before the re-run.
 *   - A run that FAILS: `CenterPanel` calls `invalidateExplorationResults` for
 *     that chip. If the same SQL that succeeded a minute ago now errors, the
 *     rows it produced are exactly the rows that must not come back.
 *   - EDITING OR DELETING THE SOURCE ITSELF: `sourceStore.saveSource` /
 *     `deleteSource` call `invalidateResultsForSource`. This one is not
 *     optional. The key identifies a source by NAME, and a name is not a
 *     connection: repoint `local` from `a.duckdb` to `b.duckdb`, or change its
 *     schema or credentials, and every key still matches while the rows behind
 *     them came out of a database the user has stopped pointing at. Nothing
 *     downstream reads `from_cache`, so there is no visible signal either —
 *     the grid would simply be wrong. Folding a config hash into the key would
 *     also work, but invalidating is honest about the fact that the app itself
 *     made the change and therefore knows exactly when to forget.
 *   - Promoting a model: `promoteExploration` invalidates that chip. Once a
 *     model is a project object, its rows belong to the project's own build
 *     (which `useModelTabPrefill`'s last-build path serves), and a session
 *     result must not shadow it.
 *
 * ── WHAT BOUNDS IT ────────────────────────────────────────────────────────
 *
 * An unbounded result cache is a memory leak with a friendly name. Two bounds,
 * both enforced on every write, least-recently-USED evicted first (a read
 * counts as a use):
 *
 *   - `DEFAULT_MAX_ENTRIES` — how many parked results may exist at once.
 *   - `DEFAULT_MAX_CELLS` — `rows × columns` summed over all entries, as an
 *     O(1) proxy for bytes. Measuring real retained size would mean
 *     serialising the rows, which for a 100k-row result costs more than the
 *     cache saves.
 *
 * A single result too big to fit the whole budget is not cached at all, rather
 * than evicting everything else to make room for something that still would
 * not fit.
 *
 * The bounds are the ONLY thing that limits this cache — it is not cleared on
 * leaving the Explorer, and deliberately so: the navigation it must survive
 * (park an exploration, read another, come back) is indistinguishable at the
 * component level from the navigation that would clear it, and a clear-on-exit
 * hook that fired on the wrong one would delete the feature. So the numbers
 * below have to be defensible on their own, for the life of the page.
 */

const DEFAULT_MAX_ENTRIES = 8;

/**
 * The cell budget, shared across every parked result.
 *
 * Sized, not guessed. An entry retains the run's own row objects (the cache
 * stores the SAME array the store was handed, so a parked result costs one
 * copy, not two) — call it 100–200 bytes per cell for JS objects with string
 * keys. 250k cells is therefore roughly 25–50 MB at full budget, held for the
 * page's lifetime. That comfortably covers what a person actually tabs between
 * — 8 chips of a few thousand rows each, or one 25k × 10 result — while
 * staying an order of magnitude below the point where the tab itself is in
 * trouble.
 *
 * There is no server-side row cap on `/api/model-query-jobs/`
 * (`model_query_jobs_views.py` applies no LIMIT), so `SELECT * FROM big_table`
 * really can return more than this. That result is simply not cached: the
 * `cells > maxCells` refusal above declines it rather than evicting eight live
 * results for one that would still not fit, and the Run button remains the way
 * back to it. Erring toward "not cached" is the right side for a convenience.
 */
const DEFAULT_MAX_CELLS = 250_000;

let maxEntries = DEFAULT_MAX_ENTRIES;
let maxCells = DEFAULT_MAX_CELLS;

/**
 * key -> {explorationId, modelName, sourceName, sql, result, cells, ranAt}
 *
 * A `Map` iterates in insertion order, which is all an LRU list needs: a read
 * re-inserts its entry at the end, so the FIRST key is always the least
 * recently used one. Module-level (not Zustand state) for the same reason
 * `workspaceExplorationsStore`'s `_pendingSyncTimers` is: this is ephemeral
 * session bookkeeping that nothing renders, and putting megabytes of rows in a
 * reactive store would re-render every subscriber on every write.
 */
const entries = new Map();

let totalCells = 0;

/** Cheap O(1) memory proxy for a result — see DEFAULT_MAX_CELLS above. */
const cellsIn = result => {
  const rowCount = Array.isArray(result?.rows) ? result.rows.length : 0;
  const colCount = Array.isArray(result?.columns) ? result.columns.length : 0;
  // A result with rows but no declared columns still costs memory; charge it
  // at least one cell per row so it can never look free.
  return rowCount * Math.max(1, colCount);
};

/**
 * The cache key for one query chip's result, or `null` when the scope isn't
 * complete enough to key by (no exploration, no chip, no source) — callers
 * treat `null` as "caching is off here", which is what a CenterPanel mounted
 * outside an exploration gets.
 */
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

/** Drop every entry matching a predicate, keeping `totalCells` honest. */
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

/** Evict least-recently-used entries until both bounds hold. */
const evictToBounds = () => {
  while (entries.size > maxEntries || totalCells > maxCells) {
    const oldest = entries.keys().next();
    if (oldest.done) break;
    const entry = entries.get(oldest.value);
    entries.delete(oldest.value);
    totalCells -= entry.cells;
  }
};

/**
 * Read the parked result for a scope, or `null`.
 *
 * A hit counts as a use: the entry moves to the most-recently-used end, so the
 * explorations you actually keep coming back to are the last ones evicted.
 */
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
 * Park the result of a completed run.
 *
 * `scope.sql` / `scope.sourceName` MUST be what was executed, not what the
 * editor holds now — see the key docstring above.
 *
 * @returns {boolean} whether the result was actually stored (a result too
 *   large for the whole budget is refused rather than allowed to evict the
 *   entire cache for itself).
 */
export const putCachedExplorationResult = (scope, result) => {
  const key = explorationResultCacheKey(scope);
  if (!key || !result) return false;

  const { explorationId, modelName, sourceName } = scope;

  // One live result per query chip: a re-run supersedes whatever that chip had
  // parked, including results for SQL it no longer holds. Without this, typing
  // an earlier query's text back in would resurrect rows from before the
  // re-run.
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
 * @param {string} [modelName] - omit to drop the whole exploration's results
 *   (a delete, a discard, a promote of the exploration as a whole).
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
 * Forget every parked result that was produced by one SOURCE, across every
 * exploration.
 *
 * Called when the source's own definition changes or goes away
 * (`sourceStore.saveSource` / `deleteSource`). The key carries the source's
 * NAME, and editing a source in place keeps the name while changing what it
 * connects to — so without this, every entry still matches a source that no
 * longer produces those rows. Scoped by source rather than by exploration
 * because a source is shared: one edit can invalidate results in several
 * explorations at once.
 *
 * @param {string} sourceName
 * @returns {number} entries dropped.
 */
export const invalidateResultsForSource = sourceName => {
  if (!sourceName) return 0;
  return dropWhere(entry => entry.sourceName === sourceName);
};

/** Observability (and what the bound tests assert against). */
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

/**
 * Test-only: shrink the bounds so eviction is reachable without allocating a
 * million-cell result inside a unit test. `_resetExplorationResultCacheForTests`
 * puts the shipped numbers back.
 */
export const _setExplorationResultCacheBoundsForTests = bounds => {
  if (typeof bounds?.maxEntries === 'number') maxEntries = bounds.maxEntries;
  if (typeof bounds?.maxCells === 'number') maxCells = bounds.maxCells;
  evictToBounds();
};
