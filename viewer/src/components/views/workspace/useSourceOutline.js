import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../../stores/store';
import { isAvailable } from '../../../contexts/URLContext';
import {
  fetchSourceSchemaJobs,
  generateSourceSchema,
  fetchSchemaGenerationStatus,
  fetchSourceTables,
  fetchTableColumns,
} from '../../../api/sourceSchemaJobs';

/**
 * useSourceOutline — VIS-1004 data feed for the right-rail source outline.
 *
 * Reads the BACKEND-CACHED schema (the same `source-schema-jobs` feed the
 * Explorer's SourceBrowser uses), NOT the live introspect. The live introspect
 * (`/api/project/sources_metadata/`) returns zero databases for file sources
 * like duckdb, which is what left the Data tab showing "0 DBS / No tables".
 *
 * Mirrors SourceBrowser exactly:
 *   1. List sources via `fetchSourceSchemaJobs()` → read this source's
 *      `has_cached_schema` flag (AUTHORITATIVE — decides warm vs cold).
 *   2. WARM (cached): load the flat cached tables via `fetchSourceTables`, then
 *      lazy-load each table's columns via `fetchTableColumns` on expand.
 *   3. COLD (no cache): expose `isCold` so the panel shows the "Generate schema"
 *      prompt. `generateSchema` runs `generateSourceSchema` + polls
 *      `fetchSchemaGenerationStatus`, then loads the now-cached flat tables.
 *
 * The cached feed is flat (source → table → column, NO db/schema layer). We
 * synthesise a single pseudo-database node so the panel's recursive renderer
 * (db → table → column) stays uniform — the same shape SourceBrowser renders
 * (source → table → column) one level deeper.
 *
 * Nodes are keyed with the disjoint `source-outline::…` grammar so the dashboard
 * outline consumers never collide. Columns lazy-load into `flatColumns[tableKey]`.
 *
 * `isAvailable` gating means this degrades cleanly in dist/cloud (every source
 * endpoint URL is null there) — `available` flips false and the panel renders
 * the "available under `visivo serve`" empty state instead of dead-ending.
 *
 * The loaded result (tables + cached flag) is cached in the per-session
 * `workspaceSourceOutlineDataCache` store slice so re-selecting a source is
 * instant — NO re-fetch on re-select.
 */

const KEY_ROOT = 'source-outline';

export const sourceRootKey = src => `${KEY_ROOT}::${src}`;
export const dbKey = (src, db) => `${sourceRootKey(src)}::db::${db}`;
export const schemaKey = (src, db, schema) => `${dbKey(src, db)}::schema::${schema}`;
export const tableKey = (src, db, schema, table) =>
  schema != null
    ? `${schemaKey(src, db, schema)}::table::${table}`
    : `${dbKey(src, db)}::table::${table}`;
export const columnKey = (parentTableKey, col) => `${parentTableKey}::col::${col}`;

/**
 * Build the flat cached-schema tree (no db/schema). Synthesises a single
 * pseudo-database node (named after the source) so the renderer stays uniform.
 * Columns are `null` (lazy-loaded on expand via loadFlatColumns).
 */
const buildCachedTree = (sourceName, tables) => {
  const dKey = dbKey(sourceName, sourceName);
  return [
    {
      key: dKey,
      kind: 'database',
      name: sourceName,
      flat: true,
      children: (tables || []).map(table => {
        const name = typeof table === 'string' ? table : table.name;
        const colCount =
          typeof table === 'object' && table != null && table.column_count != null
            ? table.column_count
            : null;
        const tKey = tableKey(sourceName, sourceName, null, name);
        return {
          key: tKey,
          kind: 'table',
          name,
          columnCount: colCount,
          // Columns lazy-load on expand for the cached path (see loadFlatColumns).
          children: null,
        };
      }),
    },
  ];
};

export default function useSourceOutline(sourceName) {
  // The cached tree is the source of truth; `null` until first load completes.
  const [nodes, setNodes] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState(null);

  // Per-table lazy column loads, keyed by tableKey -> column nodes (or { error }).
  const [flatColumns, setFlatColumns] = useState({});
  const [generating, setGenerating] = useState(null); // { status, progress, message } | null
  // Authoritative "does the API have a cached schema for this source" signal
  // (from the schema-jobs list, the same one SourceBrowser uses). null = unknown.
  // This — NOT a live-introspect result — decides whether to offer "Generate".
  const [hasCachedSchema, setHasCachedSchema] = useState(null);
  // Per-invocation cancellation epoch. Every source switch (and unmount) bumps
  // it, and each async closure captures the epoch it started under — so an
  // in-flight load / generate-poll for source A can never write A's tables
  // into source B's panel state. (A single shared boolean ref was reset by the
  // NEXT source's effect, which is exactly how that cross-write happened.)
  const epochRef = useRef(0);

  const available = useMemo(() => isAvailable('sourceSchemaJobsList'), []);

  /**
   * Read the authoritative cached-schema flag from the cheap schema-jobs list.
   * Returns true | false | null (unknown / endpoint unavailable). Never throws.
   */
  const readHasCachedSchema = useCallback(async () => {
    if (!isAvailable('sourceSchemaJobsList')) return null;
    try {
      const jobs = await fetchSourceSchemaJobs();
      const job = (jobs || []).find(j => (j.source_name || j.name) === sourceName);
      return job ? !!job.has_cached_schema : null;
    } catch {
      return null;
    }
  }, [sourceName]);

  /**
   * Load the cached flat tables and cache the result. Mirrors
   * SourceBrowser.toggleNode(sourceKey, () => fetchSourceTables(src)).
   */
  const loadCached = useCallback(async () => {
    if (!sourceName || !available) return;
    const epoch = epochRef.current;
    const stale = () => epochRef.current !== epoch;
    setStatus('loading');
    setError(null);
    try {
      const cachedFlag = await readHasCachedSchema();
      if (stale()) return;
      setHasCachedSchema(cachedFlag);

      // UNKNOWN (the schema-jobs listing failed / returned no row for this
      // source): a transient failure must stay RETRYABLE — never write it to
      // the session cache. Caching `{ hasCachedSchema: null }` as a 'ready'
      // entry poisoned every re-select for the rest of the session: no tree,
      // and no Generate prompt either (isCold requires an authoritative
      // `false`). Surface an error status instead so the panel can offer a
      // retry and a re-select misses the cache and re-fetches.
      if (cachedFlag === null) {
        setNodes(null);
        setStatus('error');
        setError('Could not read the schema listing for this source.');
        return;
      }

      // COLD (authoritative `false`): resolve to the Generate prompt without a
      // wasted 404 round-trip, and cache the flag so re-select is instant.
      if (cachedFlag === false) {
        setNodes(null);
        setStatus('ready');
        useStore.getState().setWorkspaceSourceOutlineData?.(sourceName, {
          nodes: null,
          tables: null,
          hasCachedSchema: cachedFlag,
        });
        return;
      }

      const tables = await fetchSourceTables(sourceName);
      if (stale()) return;
      const tree = buildCachedTree(sourceName, tables);
      setNodes(tree);
      setStatus('ready');
      // Cache the cached-tables tree + flag so re-selecting this source is
      // instant — no re-fetch (VIS-1004 caching fix).
      useStore.getState().setWorkspaceSourceOutlineData?.(sourceName, {
        nodes: tree,
        tables,
        hasCachedSchema: cachedFlag,
      });
    } catch (e) {
      if (stale()) return;
      setStatus('error');
      setError(e.message);
      setNodes([]);
    }
  }, [sourceName, available, readHasCachedSchema]);

  useEffect(() => {
    // Reset transient per-source state (switching never bleeds it).
    setFlatColumns({});
    setGenerating(null);
    setError(null);
    // Hydrate from the per-session cache if we've already loaded this source —
    // avoids a re-fetch on every (re)select. Cache miss → fetch once.
    const cached = useStore.getState().workspaceSourceOutlineDataCache?.[sourceName];
    if (cached) {
      setNodes(cached.nodes ?? null);
      setStatus('ready');
      setHasCachedSchema(cached.hasCachedSchema ?? null);
    } else {
      setNodes(null);
      setStatus('idle');
      setHasCachedSchema(null);
      loadCached();
    }
    return () => {
      // Bump the epoch so every in-flight closure started for THIS source
      // self-cancels; the next source's work captures the new epoch.
      epochRef.current += 1;
    };
  }, [sourceName, loadCached]);

  /**
   * Cold-source "Generate schema" — lifted from SourceBrowser.handleGenerateSchema.
   * Triggers the schema-jobs generate run, polls to completion, then loads the
   * now-cached flat tables.
   */
  const generateSchema = useCallback(async () => {
    if (!sourceName || !isAvailable('sourceSchemaJobCreate')) return;
    const epoch = epochRef.current;
    const stale = () => epochRef.current !== epoch;
    setGenerating({ status: 'starting', progress: 0, message: '' });
    setError(null);
    try {
      const { run_id: runId } = await generateSourceSchema(sourceName);
      const maxWaitTime = 120000;
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        if (stale()) return;
        const st = await fetchSchemaGenerationStatus(runId);
        if (stale()) return;
        setGenerating({
          status: st.status,
          progress: st.progress || 0,
          message: st.progress_message || '',
        });

        if (st.status === 'completed') {
          const tables = await fetchSourceTables(sourceName);
          if (stale()) return;
          const tree = buildCachedTree(sourceName, tables);
          setNodes(tree);
          setHasCachedSchema(true);
          setStatus('ready');
          setGenerating(null);
          useStore.getState().setWorkspaceSourceOutlineData?.(sourceName, {
            nodes: tree,
            tables,
            hasCachedSchema: true,
          });
          return;
        }
        if (st.status === 'failed') {
          throw new Error(st.error || 'Schema generation failed');
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      throw new Error('Schema generation timed out');
    } catch (e) {
      if (stale()) return;
      setGenerating(null);
      setError(e.message);
    }
  }, [sourceName]);

  /**
   * Lazy-load columns for a cached table on expand (the cached path carries no
   * eager column data). Mirrors SourceBrowser's per-table fetchTableColumns.
   */
  const loadFlatColumns = useCallback(
    async tKey => {
      if (!sourceName || flatColumns[tKey]) return;
      const epoch = epochRef.current;
      const stale = () => epochRef.current !== epoch;
      // tableKey grammar: …::table::<name>
      const match = tKey.match(/::table::(.+)$/);
      const tableName = match ? match[1] : null;
      if (!tableName) return;
      try {
        const cols = await fetchTableColumns(sourceName, tableName);
        if (stale()) return;
        setFlatColumns(prev => ({
          ...prev,
          [tKey]: (cols || []).map(c => {
            const name = typeof c === 'string' ? c : c.name;
            return {
              key: columnKey(tKey, name),
              kind: 'column',
              name,
              type: typeof c === 'string' ? null : c.type || null,
            };
          }),
        }));
      } catch (e) {
        if (stale()) return;
        setFlatColumns(prev => ({ ...prev, [tKey]: { error: e.message } }));
      }
    },
    [sourceName, flatColumns]
  );

  // A source is "cold" (offer Generate) when the API authoritatively reports no
  // cached schema. Only `hasCachedSchema === false` is cold — never merely an
  // empty/failed read (VIS-1004 fix). A generation run IN FLIGHT stays cold:
  // the cold state is where the progress copy + disabled Generate button live,
  // so flipping to the (empty) tree mid-run would hide the progress indicator.
  const isCold = useMemo(() => {
    if (!available) return false;
    if (nodes && nodes.length > 0) return false;
    return hasCachedSchema === false;
  }, [available, nodes, hasCachedSchema]);

  // Force-refresh: evict the per-session cache for this source, then re-fetch.
  const reload = useCallback(() => {
    useStore.getState().setWorkspaceSourceOutlineData?.(sourceName, null);
    loadCached();
  }, [sourceName, loadCached]);

  return {
    available,
    loading: status === 'loading' && nodes == null,
    nodes,
    status,
    error,
    isCold,
    generating,
    generateSchema,
    loadFlatColumns,
    flatColumns,
    reload,
  };
}
