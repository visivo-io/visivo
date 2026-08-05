import React, { useCallback, useMemo } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  PiCaretDown,
  PiCaretRight,
  PiDotsSix,
  PiHash,
  PiTextAa,
  PiToggleLeft,
  PiCalendarBlank,
  PiSpinnerGap,
  PiWarningCircle,
  PiArrowsClockwise,
} from 'react-icons/pi';
import useStore from '../../../../stores/store';
import { SCHEMA_GENERATE_UNAVAILABLE } from '../../common/sourceCapabilities';
import { getTypeIcon } from '../../common/objectTypeConfigs';
import useSourceOutline from '../useSourceOutline';
import LibraryRow from './LibraryRow';
import { isNumericColumnType } from '../../../../utils/columnType';

/**
 * LibrarySourceRow — Explore 2.0 Phase 3a (D9 / VIS-1052).
 *
 * The Library's "Sources" subsection stops being a flat list: each source
 * row expands lazily into **source → table → columns** (schemas fold in as
 * an extra level for dialects that have them — most of Visivo's sources
 * today, DuckDB/warehouse file sources, are flat, so this ships the
 * source→table→column path; a schema level is a straightforward addition
 * once `useSourceOutline`'s cached feed carries one, per 01-ux-spec.md §3a's
 * "when the dialect has them").
 *
 * B10 consolidation (04-bug-inventory.md): reads the SAME shared
 * `useSourceOutline` hook the right-rail source Data tab
 * (`SourceOutlineTreePanel.jsx`) already uses — the one cached
 * `/api/source-schema-jobs/*` feed, not a second re-implementation. The
 * standalone `/explorer` route's `SourceBrowser.jsx` (its own independent
 * fetch) is deleted at the Phase 3b cutover — this row is now the only
 * source-schema drill-down in the tree.
 *
 * LAZY by construction: `useSourceOutline(sourceName)` only mounts (and
 * therefore only fetches) once this row's `expanded` flag
 * (`librarySourceRowExpanded`, `stores/workspaceStore.js`) is true — collapsed
 * sources never hit the network. Expand state for this top-level "is the
 * drill-down open at all" gate is a NEW, separate store key; per-node
 * (table) expand/collapse REUSES `workspaceSourceOutlineExpanded` (keyed by
 * source name, same as the right-rail panel), so expanding a table in one
 * surface is remembered in the other too. Session-only, matching that
 * slice's existing contract (schema can change between sessions).
 *
 * Drag payload taxonomy (all under `source: 'library'`, routed by
 * `WorkspaceDndContext.routeWorkspaceDragEnd`):
 *   - `type: 'source'`       — the row itself (unchanged from the flat list).
 *   - `type: 'sourceTable'`  — a table node. Dropped on the SQL editor, seeds
 *     a new query chip (`SELECT * FROM <table>`, bound to this source).
 *   - `type: 'sourceColumn'` — a column node. Dropped on the SQL editor,
 *     inserts the bare column name at the cursor; dropped on an insight prop
 *     slot / interaction field, resolves through the SAME fallback branch a
 *     results-grid column drag already uses (`formatRefExpression(activeModel,
 *     name)`) — a schema column is treated as belonging to whichever query is
 *     currently active, exactly like `DraggableColumnHeader`.
 * `sourceTable`/`sourceColumn` are deliberately NOT reused as `'table'`/
 * `'column'` — `'table'` already means "dashboard Table widget" elsewhere in
 * the Library (LAYOUT_TYPES), and building a canvas item from a raw schema
 * table name would be nonsensical (WorkspaceDndContext's canvas-insert
 * branch additionally guards against this by type-allowlisting canvas
 * inserts).
 *
 * Known scope-narrowing: this row's click still opens the source in the
 * right rail (the same `onClick` every Library row gets), but it does NOT
 * yet carry the plain `LibraryRow`'s hover flip-popover / kebab context menu
 * (Open in new tab · Show lineage · Delete…) — those are deferred, noted for
 * a follow-up rather than silently dropped. Nothing in this phase's gate
 * (`library-source-drilldown.spec.mjs`) exercises them for source rows.
 */

const glyphForColumnType = type => {
  const t = (type || '').toLowerCase();
  if (!t) return { Icon: PiTextAa, label: null };
  if (isNumericColumnType(t)) return { Icon: PiHash, label: '#' };
  if (/bool/.test(t)) return { Icon: PiToggleLeft, label: 'B' };
  if (/date|time/.test(t)) return { Icon: PiCalendarBlank, label: null };
  return { Icon: PiTextAa, label: 'T' };
};

const RowShell = ({
  level,
  hasCaret,
  expanded,
  onToggle,
  icon,
  name,
  meta,
  draggable,
  dragProps,
  isDragging,
  testId,
}) => (
  <div
    {...(dragProps || {})}
    data-testid={testId}
    data-dragging={isDragging ? 'true' : 'false'}
    className={[
      'group flex h-6 items-center gap-1 rounded pr-1 text-[12px] text-gray-700 transition-colors hover:bg-gray-50',
      isDragging ? 'opacity-40' : '',
      draggable ? 'cursor-grab active:cursor-grabbing' : '',
    ].join(' ')}
    style={{ paddingLeft: 8 + level * 14, ...(dragProps?.style || {}) }}
  >
    {hasCaret ? (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        data-testid={`${testId}-toggle`}
        className="-ml-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center text-gray-400 hover:text-gray-600"
      >
        {expanded ? (
          <PiCaretDown className="h-2.5 w-2.5" />
        ) : (
          <PiCaretRight className="h-2.5 w-2.5" />
        )}
      </button>
    ) : (
      <span className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
    )}
    {icon}
    <span className="min-w-0 flex-1 truncate">{name}</span>
    {meta && (
      <span className="shrink-0 text-[10px] text-gray-400 group-hover:text-gray-500">{meta}</span>
    )}
    {draggable && (
      <span
        aria-hidden="true"
        data-testid={`${testId}-drag-handle`}
        className="flex h-3 w-3 shrink-0 items-center justify-center text-gray-300 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <PiDotsSix className="h-3 w-3" />
      </span>
    )}
  </div>
);

const ColumnRow = ({ sourceName, tableName, col }) => {
  const { Icon, label } = glyphForColumnType(col.type);
  const drag = useDraggable({
    id: `library:sourceColumn:${sourceName}:${tableName}:${col.name}`,
    data: {
      source: 'library',
      type: 'sourceColumn',
      name: col.name,
      sourceName,
      tableName,
      columnType: col.type || null,
    },
  });
  const dragProps = {
    ref: drag.setNodeRef,
    ...drag.listeners,
    ...drag.attributes,
    style: { touchAction: 'none' },
  };
  return (
    <RowShell
      level={2}
      hasCaret={false}
      icon={
        label ? (
          <span className="w-3 shrink-0 text-center font-mono text-[9px] font-semibold text-gray-400">
            {label}
          </span>
        ) : (
          <Icon className="h-3 w-3 shrink-0 text-gray-400" aria-hidden="true" />
        )
      }
      name={col.name}
      draggable
      dragProps={dragProps}
      isDragging={drag.isDragging}
      testId={`library-source-column-${sourceName}-${tableName}-${col.name}`}
    />
  );
};

const TableRow = ({ sourceName, table, expandedSet, onToggle, flatColumns, loadFlatColumns }) => {
  // The glyph SHAPE is the table icon, but not the `table` type's fuchsia: these
  // are database tables, not Visivo Table objects, and dragging one yields
  // `type:'sourceTable'`. Wearing the widget's colour asserted a kinship that
  // doesn't exist — and left this glyph as the only coloured thing in a tree
  // whose column rows are already gray.
  const TableIcon = getTypeIcon('table');
  const expanded = expandedSet.has(table.key);
  const cols = flatColumns?.[table.key];
  const colsLoaded = Array.isArray(cols);
  const colCount = colsLoaded ? cols.length : table.columnCount;

  const drag = useDraggable({
    id: `library:sourceTable:${sourceName}:${table.name}`,
    data: { source: 'library', type: 'sourceTable', name: table.name, sourceName },
  });
  const dragProps = {
    ref: drag.setNodeRef,
    ...drag.listeners,
    ...drag.attributes,
    style: { touchAction: 'none' },
  };

  const handleToggle = useCallback(
    e => {
      e.stopPropagation();
      const willExpand = !expanded;
      onToggle(table.key);
      if (willExpand && !colsLoaded) loadFlatColumns(table.key);
    },
    [expanded, onToggle, table.key, colsLoaded, loadFlatColumns]
  );

  return (
    <>
      <RowShell
        level={1}
        hasCaret
        expanded={expanded}
        onToggle={handleToggle}
        icon={
          <TableIcon
            className="h-3 w-3 shrink-0 text-gray-400"
            aria-hidden="true"
            data-testid={`library-source-table-${sourceName}-${table.name}-icon`}
          />
        }
        name={table.name}
        meta={typeof colCount === 'number' ? `${colCount}` : null}
        draggable
        dragProps={dragProps}
        isDragging={drag.isDragging}
        testId={`library-source-table-${sourceName}-${table.name}`}
      />
      {expanded && colsLoaded && !cols.error && (
        <div data-testid={`library-source-table-${sourceName}-${table.name}-columns`}>
          {cols.map(col => (
            <ColumnRow key={col.key} sourceName={sourceName} tableName={table.name} col={col} />
          ))}
        </div>
      )}
      {expanded && colsLoaded && cols.error && (
        <div
          className="py-1 pl-10 text-[11px] text-highlight-600"
          data-testid={`library-source-table-${sourceName}-${table.name}-error`}
        >
          {cols.error}
        </div>
      )}
      {expanded && !colsLoaded && (
        <div className="flex items-center gap-1.5 py-1 pl-10 text-[11px] text-gray-400">
          <PiSpinnerGap className="h-3 w-3 animate-spin" aria-hidden="true" />
          Loading columns…
        </div>
      )}
    </>
  );
};

/** The lazily-mounted drill-down body for one expanded source row. Only
 * rendered (and therefore only calls `useSourceOutline`, which fetches) once
 * the source row is expanded — see `LibrarySourceRow` below. */
const LibrarySourceDrilldown = ({ sourceName }) => {
  const {
    available,
    loading,
    nodes,
    status,
    error,
    isCold,
    canGenerate,
    generating,
    generateSchema,
    loadFlatColumns,
    flatColumns,
    reload,
  } = useSourceOutline(sourceName);

  const expandedBySource = useStore(s => s.workspaceSourceOutlineExpanded);
  const toggleExpanded = useStore(s => s.toggleWorkspaceSourceOutlineExpanded);
  const expandedSet = useMemo(
    () => new Set(expandedBySource?.[sourceName] || []),
    [expandedBySource, sourceName]
  );
  const handleToggle = useCallback(
    key => toggleExpanded(sourceName, key),
    [sourceName, toggleExpanded]
  );

  if (!available) {
    return (
      <div
        className="py-1 pl-10 text-[11px] italic text-gray-400"
        data-testid={`library-source-${sourceName}-unavailable`}
      >
        Schema browsing needs `visivo serve`.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 py-1 pl-10 text-[11px] text-gray-400">
        <PiSpinnerGap className="h-3 w-3 animate-spin" aria-hidden="true" />
        Loading schema…
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-1.5 py-1 pl-10 text-[11px] text-highlight-600">
        <PiWarningCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">{error}</span>
        <button
          type="button"
          onClick={reload}
          data-testid={`library-source-${sourceName}-retry`}
          className="shrink-0 font-medium text-primary-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (isCold && !canGenerate) {
    // A file-backed source in cloud: its schema arrives via `visivo deploy`,
    // because the database file is on the author's machine. Offering the button
    // here would only ever produce "database does not exist".
    return (
      <div
        className="py-1 pl-10 text-[11px] text-gray-400"
        data-testid={`library-source-${sourceName}-local-only`}
      >
        {SCHEMA_GENERATE_UNAVAILABLE}
      </div>
    );
  }

  if (isCold) {
    return (
      <div className="flex items-center gap-1.5 py-1 pl-10 text-[11px] text-gray-400">
        <button
          type="button"
          onClick={generateSchema}
          disabled={!!generating}
          data-testid={`library-source-${sourceName}-generate`}
          className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PiArrowsClockwise
            className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`}
            aria-hidden="true"
          />
          {generating ? 'Generating schema…' : 'Generate schema to browse'}
        </button>
      </div>
    );
  }

  const tables = (nodes && nodes[0] && nodes[0].children) || [];
  if (tables.length === 0) {
    return (
      <div
        className="py-1 pl-10 text-[11px] italic text-gray-400"
        data-testid={`library-source-${sourceName}-empty`}
      >
        No tables found.
      </div>
    );
  }

  return (
    <div data-testid={`library-source-${sourceName}-tables`}>
      {tables.map(table => (
        <TableRow
          key={table.key}
          sourceName={sourceName}
          table={table}
          expandedSet={expandedSet}
          onToggle={handleToggle}
          flatColumns={flatColumns}
          loadFlatColumns={loadFlatColumns}
        />
      ))}
    </div>
  );
};

/**
 * LibrarySourceRow — the source drill-down, wrapped around the standard
 * `LibraryRow`.
 *
 * This used to be a parallel re-implementation of `LibraryRow`: its own row
 * shell, hover state, drag wiring and selected chrome. The copy drifted — it
 * dropped the `onContextAction` prop `LibrarySubsection` handed it, never grew
 * the kebab / right-click menu, the lineage popover, the Explore button or
 * keyboard activation, and it painted its icon by a different rule. It now
 * renders `LibraryRow` and contributes only what is genuinely source-specific:
 * a caret and the lazily-mounted drill-down beneath it.
 *
 * Phase 6c-T5 made the row body EXPAND rather than open, because an auditor
 * hunting for a column to drag found that clicking the name yanked them out of
 * their in-progress exploration. Consistency won here — every other row type
 * opens on click — but that complaint is answered rather than ignored: the
 * body click opens AND expands, and never collapses. The columns arrive from
 * the same click that opens the source, so the gesture no longer costs the
 * user their place. Collapsing stays on the caret.
 */
const LibrarySourceRow = ({
  obj,
  selected = false,
  draggable = true,
  onClick,
  onContextAction,
  canAddToExploration = false,
}) => {
  const expanded = useStore(s => !!s.librarySourceRowExpanded[obj.name]);
  const toggleExpanded = useStore(s => s.toggleLibrarySourceRowExpanded);

  const handleToggle = useCallback(
    e => {
      e.stopPropagation();
      toggleExpanded(obj.name);
    },
    [obj.name, toggleExpanded]
  );

  // Opens like every other row, and reveals the schema on the way — but never
  // collapses, so a second click on the name can't take the columns away.
  const handleOpen = useCallback(
    (o, e) => {
      if (!expanded) toggleExpanded(o.name);
      onClick && onClick(o, e);
    },
    [expanded, onClick, toggleExpanded]
  );

  return (
    <LibraryRow
      obj={obj}
      selected={selected}
      draggable={draggable}
      onClick={handleOpen}
      onContextAction={onContextAction}
      canAddToExploration={canAddToExploration}
      expandable
      expanded={expanded}
      onToggleExpand={handleToggle}
    >
      {/* LibraryRow indents its icon further than RowShell's `8 + level*14`
          does, so without this the tables would render LEFT of their own
          source. Keeps the ladder at roughly 52 / 64 / 74px. */}
      {expanded && (
        <div className="pl-6">
          <LibrarySourceDrilldown sourceName={obj.name} />
        </div>
      )}
    </LibraryRow>
  );
};

export default LibrarySourceRow;
