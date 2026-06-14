import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../../stores/store';
import { isAvailable } from '../../../contexts/URLContext';
import { fetchSourceMetadata } from '../../../api/explorer';
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
 * Mirrors the Explorer's backend + frontend (SourceBrowser) but normalises the
 * two divergent shapes into ONE nested db → schema → table → column tree:
 *
 *   - **Nested (primary):** `fetchSourceMetadata()` → the legacy introspect
 *     path is the only feed carrying db/schema. Shape:
 *       { sources: [{ name, type, status, databases:[
 *           { name, schemas:[{ name, tables:[{ name, columns:[colName,…] }] }],
 *                   tables:[{ name, columns:[colName,…] }] }  // schemas|tables
 *       ] }] }
 *     Columns here are bare strings (no type info).
 *   - **Flat (fallback):** the cached `source-schema-jobs` path
 *     (`fetchSourceTables` / `fetchTableColumns`) is source → table → column
 *     with NO db/schema and column objects `{ name, type }`. Used to enrich
 *     column types and as the cold-source generate target.
 *
 * Both normalise to nodes of the form:
 *   { key, kind: 'database'|'schema'|'table'|'column', name, type?, children? }
 * keyed with the disjoint `source-outline::…` grammar so the dashboard outline
 * consumers never collide.
 *
 * `isAvailable` gating means this degrades cleanly in dist/cloud (every source
 * endpoint URL is null there) — `available` flips false and the panel renders
 * the "available under `visivo serve`" empty state instead of dead-ending.
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
 * Normalise the nested `fetchSourceMetadata` entry for one source into the
 * shared node tree. Returns `{ nodes, status, error }`.
 */
const normalizeNested = (sourceName, entry) => {
  if (!entry) return { nodes: [], status: 'missing', error: null };
  const databases = Array.isArray(entry.databases) ? entry.databases : [];

  const databaseNodes = databases.map(db => {
    const dKey = dbKey(sourceName, db.name);

    const buildTableNode = (table, schemaName) => {
      const tKey = tableKey(sourceName, db.name, schemaName, table.name);
      const columns = Array.isArray(table.columns) ? table.columns : [];
      return {
        key: tKey,
        kind: 'table',
        name: table.name,
        children: columns.map(col => {
          // Nested columns are bare strings; flat columns are { name, type }.
          const colName = typeof col === 'string' ? col : col?.name;
          const colType = typeof col === 'string' ? null : col?.type || null;
          return {
            key: columnKey(tKey, colName),
            kind: 'column',
            name: colName,
            type: colType,
          };
        }),
      };
    };

    if (Array.isArray(db.schemas)) {
      return {
        key: dKey,
        kind: 'database',
        name: db.name,
        children: db.schemas.map(schema => {
          const sKey = schemaKey(sourceName, db.name, schema.name);
          const tables = Array.isArray(schema.tables) ? schema.tables : [];
          return {
            key: sKey,
            kind: 'schema',
            name: schema.name,
            children: tables.map(t => buildTableNode(t, schema.name)),
          };
        }),
      };
    }

    const tables = Array.isArray(db.tables) ? db.tables : [];
    return {
      key: dKey,
      kind: 'database',
      name: db.name,
      // No schemas → tables hang directly off the database.
      children: tables.map(t => buildTableNode(t, null)),
      error: db.error || null,
    };
  });

  return {
    nodes: databaseNodes,
    status: entry.status || 'connected',
    error: entry.error || null,
  };
};

/**
 * Build a flat-fallback tree (no db/schema) from the cached schema-jobs path.
 * Synthesises a single pseudo-database node so the renderer stays uniform.
 */
const buildFlatTree = (sourceName, tables) => {
  const dKey = dbKey(sourceName, sourceName);
  return [
    {
      key: dKey,
      kind: 'database',
      name: sourceName,
      flat: true,
      children: (tables || []).map(table => {
        const name = typeof table === 'string' ? table : table.name;
        const tKey = tableKey(sourceName, sourceName, null, name);
        return {
          key: tKey,
          kind: 'table',
          name,
          // Columns lazy-load on expand for the flat path (see loadFlatColumns).
          children: null,
        };
      }),
    },
  ];
};

export default function useSourceOutline(sourceName) {
  // The nested feed is the source of truth; `null` until first load completes.
  const [nestedNodes, setNestedNodes] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | connected | connection_failed | missing | error
  const [error, setError] = useState(null);

  // Flat-fallback state (cold source generate + lazy column loads).
  const [flatNodes, setFlatNodes] = useState(null);
  const [flatColumns, setFlatColumns] = useState({}); // tableKey -> column nodes
  const [generating, setGenerating] = useState(null); // { status, progress, message } | null
  // Authoritative "does the API have a cached schema for this source" signal
  // (from the schema-jobs list, the same one SourceBrowser uses). null = unknown.
  // This — NOT the live-introspect result — decides whether to offer "Generate".
  const [hasCachedSchema, setHasCachedSchema] = useState(null);
  const cancelledRef = useRef(false);

  const available = useMemo(
    () => isAvailable('sourcesMetadata') || isAvailable('sourceSchemaJobsList'),
    []
  );
  const nestedAvailable = useMemo(() => isAvailable('sourcesMetadata'), []);

  // Read the authoritative cached-schema flag from the cheap schema-jobs list.
  // Returns true | false | null (unknown / endpoint unavailable). Never throws.
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

  const loadNested = useCallback(async () => {
    if (!sourceName || !nestedAvailable) return;
    setStatus('loading');
    setError(null);
    try {
      // Cheap, authoritative cold check first: only offer "Generate" when the API
      // genuinely has no cached schema (not merely because a live introspect was
      // empty/failed) — VIS-1004 caching fix.
      const cachedFlag = await readHasCachedSchema();
      if (cancelledRef.current) return;
      setHasCachedSchema(cachedFlag);

      const data = await fetchSourceMetadata();
      if (cancelledRef.current) return;
      const entry = (data?.sources || []).find(s => s.name === sourceName);
      const { nodes, status: entryStatus, error: entryError } = normalizeNested(
        sourceName,
        entry
      );
      setNestedNodes(nodes);
      setStatus(entryStatus);
      setError(entryError);
      // Cache the (expensive) introspection + the cached-schema flag so
      // re-selecting this source is instant — no re-introspection.
      useStore.getState().setWorkspaceSourceOutlineData?.(sourceName, {
        nodes,
        status: entryStatus,
        error: entryError,
        hasCachedSchema: cachedFlag,
      });
    } catch (e) {
      if (cancelledRef.current) return;
      setStatus('error');
      setError(e.message);
      setNestedNodes([]);
    }
  }, [sourceName, nestedAvailable, readHasCachedSchema]);

  useEffect(() => {
    cancelledRef.current = false;
    // Reset transient flat-fallback state per source (switching never bleeds it).
    setFlatNodes(null);
    setFlatColumns({});
    setGenerating(null);
    setError(null);
    // Hydrate from the per-session cache if we've already introspected this
    // source — avoids a costly re-introspect on every (re)select. Cache miss →
    // reset to loading and fetch once.
    const cached = useStore.getState().workspaceSourceOutlineDataCache?.[sourceName];
    if (cached) {
      setNestedNodes(cached.nodes);
      setStatus(cached.status);
      setError(cached.error || null);
      setHasCachedSchema(cached.hasCachedSchema ?? null);
    } else {
      setNestedNodes(null);
      setStatus('idle');
      setHasCachedSchema(null);
      loadNested();
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [sourceName, loadNested]);

  /**
   * Cold-source "Generate schema" — lifted from SourceBrowser.handleGenerateSchema.
   * Triggers the schema-jobs generate run, polls to completion, then loads the
   * flat tables as a fallback feed (the nested feed remains primary when it can
   * connect; this fills the tree for sources the nested introspect can't reach).
   */
  const generateSchema = useCallback(async () => {
    if (!sourceName || !isAvailable('sourceSchemaJobCreate')) return;
    setGenerating({ status: 'starting', progress: 0, message: '' });
    setError(null);
    try {
      const { run_id: runId } = await generateSourceSchema(sourceName);
      const maxWaitTime = 120000;
      const pollInterval = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWaitTime) {
        if (cancelledRef.current) return;
        const st = await fetchSchemaGenerationStatus(runId);
        setGenerating({
          status: st.status,
          progress: st.progress || 0,
          message: st.progress_message || '',
        });

        if (st.status === 'completed') {
          const tables = await fetchSourceTables(sourceName);
          if (cancelledRef.current) return;
          setFlatNodes(buildFlatTree(sourceName, tables));
          setGenerating(null);
          // Re-attempt the nested feed; it may now connect/cache.
          loadNested();
          return;
        }
        if (st.status === 'failed') {
          throw new Error(st.error || 'Schema generation failed');
        }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
      throw new Error('Schema generation timed out');
    } catch (e) {
      if (cancelledRef.current) return;
      setGenerating(null);
      setError(e.message);
    }
  }, [sourceName, loadNested]);

  /**
   * Lazy-load columns for a flat-fallback table on expand (the flat path has no
   * eager column data). No-op for the nested feed, whose columns are eager.
   */
  const loadFlatColumns = useCallback(
    async tKey => {
      if (!sourceName || flatColumns[tKey]) return;
      // tableKey grammar: …::table::<name>
      const match = tKey.match(/::table::(.+)$/);
      const tableName = match ? match[1] : null;
      if (!tableName) return;
      try {
        const cols = await fetchTableColumns(sourceName, tableName);
        if (cancelledRef.current) return;
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
        if (cancelledRef.current) return;
        setFlatColumns(prev => ({ ...prev, [tKey]: { error: e.message } }));
      }
    },
    [sourceName, flatColumns]
  );

  // Prefer the nested tree; fall back to the generated flat tree. A source is
  // "cold" (offer Generate) when the nested feed connected with zero databases
  // AND no flat tree has been generated yet.
  const nodes = useMemo(() => {
    if (nestedNodes && nestedNodes.length > 0) return nestedNodes;
    if (flatNodes && flatNodes.length > 0) return flatNodes;
    if (nestedNodes && nestedNodes.length === 0) return [];
    return null;
  }, [nestedNodes, flatNodes]);

  const isCold = useMemo(() => {
    if (!available) return false;
    if (generating) return false;
    if (flatNodes && flatNodes.length > 0) return false;
    // AUTHORITATIVE: the API tells us whether a schema is cached. Only offer
    // "Generate" when it genuinely has none — never just because a live
    // introspect came back empty/failed while a cache exists (VIS-1004 fix).
    if (hasCachedSchema === true) return false;
    if (hasCachedSchema === false) return true;
    // Unknown (schema-jobs endpoint unavailable) → fall back to the introspect
    // heuristic so non-schema-jobs environments still surface a cold source.
    return (
      status === 'connection_failed' ||
      status === 'missing' ||
      (nestedNodes != null && nestedNodes.length === 0)
    );
  }, [available, generating, flatNodes, hasCachedSchema, status, nestedNodes]);

  // Force-refresh: evict the per-session cache for this source, then re-fetch
  // (the only path that pays for a fresh introspect once the cache is warm).
  const reload = useCallback(() => {
    useStore.getState().setWorkspaceSourceOutlineData?.(sourceName, null);
    loadNested();
  }, [sourceName, loadNested]);

  return {
    available,
    loading: status === 'loading' && nestedNodes == null,
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
