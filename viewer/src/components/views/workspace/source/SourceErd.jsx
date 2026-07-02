import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap, ReactFlowProvider } from 'reactflow';
import 'reactflow/dist/style.css';
import { PiGraph } from 'react-icons/pi';
import { isAvailable } from '../../../../contexts/URLContext';
import {
  fetchSourceSchemaJobs,
  fetchSourceTables,
  fetchTableColumns,
} from '../../../../api/sourceSchemaJobs';
import { getTypeColors } from '../../common/objectTypeConfigs';
import { computeLayout } from '../../lineage/useLineageDag';
import { useSourceErdDag } from './useSourceErdDag';
import TableErdNode from './TableErdNode';
import ErdTableContextMenu from './ErdTableContextMenu';

/**
 * SourceErd — the Source object's Canvas lens (VIS-1005).
 *
 * A React-Flow ERD of every table in the source (one node per table, flattened
 * across databases/schemas). Right-clicking a table opens `ErdTableContextMenu`
 * ("Create a model to query this table" / "Copy qualified name").
 *
 * Data comes from the SAME BACKEND-CACHED schema feed `useSourceOutline` and the
 * Explorer's SourceBrowser read — NOT the live introspect (which returns zero
 * databases for file sources like duckdb, leaving the ERD empty). The cached
 * tables + columns are shaped into the `{ databases: [{ name, tables }] }` entry
 * `useSourceErdDag` flattens, so its FK-edge logic stays intact (the cached feed
 * carries no foreign_keys yet → zero edges, which is correct). The component is
 * `serve`-gated by the frame's availability, but its OWN fetch also no-ops on
 * dist (`isAvailable` false) so a direct mount degrades cleanly.
 *
 * States: unavailable · loading · no-cache (Generate from the Data tab) · empty
 * · ready. None of them ever leaves an infinite spinner.
 */

const NODE_BASE_HEIGHT = 44; // header
const NODE_ROW_HEIGHT = 24; // per visible column row
const MAX_LAYOUT_ROWS = 12; // matches TableErdNode's column cap

const FrameMessage = ({ testId, title, body }) => (
  <div
    data-testid={testId}
    className="flex flex-1 items-center justify-center bg-gray-50 p-12"
  >
    <div className="max-w-[420px] rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
      <PiGraph className="mx-auto mb-2 h-6 w-6 text-gray-300" aria-hidden="true" />
      <h2 className="text-[15px] font-semibold text-gray-900">{title}</h2>
      {body && (
        <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-relaxed text-gray-500">
          {body}
        </p>
      )}
    </div>
  </div>
);

const nodeTypes = { tableErdNode: TableErdNode };

const SourceErdCanvas = ({ activeObject }) => {
  const sourceName = activeObject?.name || null;
  const available = useMemo(() => {
    try {
      return isAvailable('sourceSchemaJobsList');
    } catch {
      // No global URL config (e.g. a bare unit test) → behave as available so
      // the canvas renders. The fetch is mocked in that context.
      return true;
    }
  }, []);

  const [entry, setEntry] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | loading | connected | connection_failed | missing | error
  const [error, setError] = useState(null);
  const [ctxMenu, setCtxMenu] = useState(null); // { x, y, target } | null

  const reactFlowInstance = useRef(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setCtxMenu(null);
    // Drop the previous source's entry IMMEDIATELY — the frame reuses this body
    // across sibling selections, and a stale entry would render the OLD
    // source's ERD (with the NEW sourceName stamped onto its nodes, so the
    // table context menu targets the wrong source) through the load window.
    setEntry(null);
    if (!sourceName || !available) {
      setStatus(available ? 'missing' : 'idle');
      return () => {
        cancelledRef.current = true;
      };
    }
    setStatus('loading');
    setError(null);
    (async () => {
      try {
        // Authoritative cached-schema check (same feed SourceBrowser uses). No
        // cache → 'missing' → the "Generate from the Data tab" empty state.
        const jobs = await fetchSourceSchemaJobs();
        if (cancelledRef.current) return;
        const job = (jobs || []).find(j => (j.source_name || j.name) === sourceName);
        if (!job || !job.has_cached_schema) {
          setEntry(null);
          setStatus('missing');
          return;
        }

        // Load the flat cached tables, then each table's columns. Shape them into
        // the `{ databases: [{ name, tables }] }` entry useSourceErdDag flattens.
        const tables = await fetchSourceTables(sourceName);
        if (cancelledRef.current) return;
        const tableEntries = await Promise.all(
          (tables || []).map(async t => {
            const name = typeof t === 'string' ? t : t.name;
            let columns = [];
            try {
              const cols = await fetchTableColumns(sourceName, name);
              columns = (cols || []).map(c =>
                typeof c === 'string' ? { name: c } : { name: c.name, type: c.type }
              );
            } catch {
              columns = [];
            }
            return { name, columns };
          })
        );
        if (cancelledRef.current) return;
        // Single pseudo-database named after the source — the cached feed is flat
        // (no db/schema layer), matching how useSourceOutline renders it.
        setEntry({
          name: sourceName,
          status: 'connected',
          databases: [{ name: sourceName, tables: tableEntries }],
        });
        setStatus('connected');
      } catch (e) {
        if (cancelledRef.current) return;
        setEntry(null);
        setStatus('error');
        setError(e.message);
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, [sourceName, available]);

  const { nodes: rawNodes, edges } = useSourceErdDag(sourceName, entry);

  // Lay the table nodes out left-to-right with dagre, sizing each node's
  // height by its (capped) column count so the layout spaces tall tables apart.
  // computeLayout honours an explicit `layoutSize` per node (the same contract
  // useRelationErdDag uses); width falls back to its data.name estimate.
  const nodes = useMemo(() => {
    if (!rawNodes.length) return [];
    const sized = rawNodes.map(n => {
      const colCount = Math.min((n.data?.columns || []).length, MAX_LAYOUT_ROWS);
      return { ...n, layoutSize: { height: NODE_BASE_HEIGHT + colCount * NODE_ROW_HEIGHT } };
    });
    try {
      return computeLayout(sized, edges, null);
    } catch {
      // Fall back to a simple grid if dagre throws.
      return sized.map((n, i) => ({
        ...n,
        position: { x: (i % 4) * 320, y: Math.floor(i / 4) * 260 },
      }));
    }
  }, [rawNodes, edges]);

  useEffect(() => {
    if (nodes.length > 0 && reactFlowInstance.current) {
      const id = setTimeout(() => {
        reactFlowInstance.current?.fitView({ padding: 0.2, duration: 600 });
      }, 100);
      return () => clearTimeout(id);
    }
  }, [nodes.length]);

  const handleNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setCtxMenu({
      x: event.clientX,
      y: event.clientY,
      target: {
        database: node.data?.database ?? null,
        schema: node.data?.schema ?? null,
        table: node.data?.table ?? null,
      },
    });
  }, []);

  const dismissCtxMenu = useCallback(() => setCtxMenu(null), []);

  // --- Non-graph states ---------------------------------------------------
  if (!available) {
    return (
      <FrameMessage
        testId="source-erd-unavailable"
        title="Available with visivo serve"
        body="Run `visivo serve` locally to explore this source's tables as an ERD."
      />
    );
  }
  if (status === 'loading' && !entry) {
    return <FrameMessage testId="source-erd-loading" title="Loading tables…" />;
  }
  if (status === 'connection_failed' || status === 'missing') {
    return (
      <FrameMessage
        testId="source-erd-connection-failed"
        title="No tables to show"
        body={
          error ||
          "This source's schema hasn't been generated yet. Generate its schema from the Data tab to see its tables."
        }
      />
    );
  }
  if (status === 'error') {
    return (
      <FrameMessage
        testId="source-erd-connection-failed"
        title="Couldn't load tables"
        body={error || "The source's cached schema could not be loaded."}
      />
    );
  }
  if (nodes.length === 0) {
    return (
      <FrameMessage
        testId="source-erd-empty"
        title="No tables found"
        body="This source has no tables to diagram."
      />
    );
  }

  // --- The ERD ------------------------------------------------------------
  const sourceColors = getTypeColors('source');
  return (
    <div data-testid="source-erd" className="relative flex flex-1 min-h-0 min-w-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeContextMenu={handleNodeContextMenu}
        onInit={instance => {
          reactFlowInstance.current = instance;
        }}
        minZoom={0.1}
        maxZoom={2}
        fitView
        nodesConnectable={false}
        style={{ background: '#f8fafc' }}
      >
        <Background color="#e2e8f0" gap={16} />
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={() => sourceColors.connectionHandle}
          style={{ background: '#f1f5f9' }}
        />
      </ReactFlow>
      {ctxMenu && (
        <ErdTableContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          sourceName={sourceName}
          target={ctxMenu.target}
          onDismiss={dismissCtxMenu}
        />
      )}
    </div>
  );
};

const SourceErd = props => (
  <ReactFlowProvider>
    <SourceErdCanvas {...props} />
  </ReactFlowProvider>
);

export default SourceErd;
