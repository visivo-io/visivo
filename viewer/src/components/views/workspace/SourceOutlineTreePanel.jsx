import React, { useCallback, useMemo, useState } from 'react';
import {
  PiCaretDown,
  PiDatabase,
  PiFolder,
  PiColumns,
  PiMagnifyingGlass,
  PiArrowsClockwise,
  PiSpinnerGap,
  PiHardDrives,
  PiWarningCircle,
} from 'react-icons/pi';
import useStore from '../../../stores/store';
import { getTypeIcon, getTypeColors } from '../common/objectTypeConfigs';
import useSourceOutline, { sourceRootKey } from './useSourceOutline';

/**
 * SourceOutlineTreePanel — VIS-1004 (Canvas Object Surfaces, Track N).
 *
 * The right-rail "Data" outline when a `source` is the active workspace object.
 * Mounted by branching `RightRail::RightRailBody` on the active object type —
 * `source` → this panel, anything else → the dashboard `OutlineTreePanel`.
 *
 * Renders the source's database → table → column tree as an Explorer-style
 * expandable, searchable tree. It REUSES `OutlineTreePanel`'s recursive Node
 * shell idiom (the mulberry selection bar + caret disclosure + indent +
 * truncation) rather than importing the left-nav `SchemaTreeNode`, and layers
 * the Explorer's in-tree search + type badges on top. Data + the cold-source
 * generate/poll flow come from `useSourceOutline`, which reads the SAME
 * BACKEND-CACHED schema feed the Explorer's SourceBrowser uses (not the live
 * introspect, which returns zero databases for file sources like duckdb).
 *
 * Selection / expand state:
 *   - Selection writes a DISJOINT `source-outline::…` key into the new
 *     `workspaceSourceOutlineSelectedKey` store slice (never the dashboard's
 *     `workspaceOutlineSelectedKey`), so the two outlines can't collide.
 *   - Expand/collapse is remembered PER SESSION, PER SOURCE in
 *     `workspaceSourceOutlineExpanded[sourceName]`.
 *
 * Type colours + icons come ONLY from `objectTypeConfigs` (source = orange,
 * table = fuchsia); db/schema use neutral grouping icons; columns render a
 * monospace type badge.
 */

const SourceIcon = getTypeIcon('source');
const TableIcon = getTypeIcon('table');

const KIND_ICON = {
  database: PiDatabase,
  schema: PiFolder,
  table: TableIcon,
  column: PiColumns,
};

const matchesSearch = (name, query) =>
  !query || (name || '').toLowerCase().includes(query.toLowerCase());

/**
 * Does this node (or any descendant) match the query? Drives search filtering.
 * Lazily-loaded columns live in `flatColumns[tableKey]` (NOT `node.children` —
 * the cached feed carries no eager column data), so LOADED columns must be
 * consulted too: a table whose loaded column matches stays visible, as do its
 * ancestor groups. Unloaded columns can't match (they aren't known yet).
 */
const nodeMatches = (node, query, flatColumns) => {
  if (!query) return true;
  if (matchesSearch(node.name, query)) return true;
  const children = Array.isArray(node.children) ? node.children : [];
  if (children.some(child => nodeMatches(child, query, flatColumns))) return true;
  const lazyCols = node.key ? flatColumns?.[node.key] : null;
  return Array.isArray(lazyCols) && lazyCols.some(col => matchesSearch(col?.name, query));
};

/**
 * One tree row. Recursive: `children` renders the nested sub-tree. Indent is
 * computed from `level`. Mirrors OutlineTreePanel.Node's mulberry selection
 * idiom; adds a right-aligned type badge for column nodes.
 */
const Node = ({
  level,
  kind,
  icon: Icon,
  iconClassName,
  label,
  badge,
  meta,
  selected,
  selectionKey,
  onSelect,
  testId,
  collapsed = false,
  onToggle,
  hasChildren = false,
  children,
}) => {
  const indent = 6 + level * 14;

  const handleClick = useCallback(
    e => {
      e.stopPropagation();
      onSelect && onSelect(selectionKey);
    },
    [onSelect, selectionKey]
  );

  return (
    <div className="flex flex-col">
      <div
        role="button"
        tabIndex={0}
        data-testid={testId}
        data-kind={kind}
        data-selected={selected ? 'true' : 'false'}
        data-selection-key={selectionKey}
        onClick={handleClick}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect && onSelect(selectionKey);
          }
        }}
        className={[
          'group/node relative flex h-7 cursor-pointer items-center gap-1.5 pr-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/30',
          selected ? 'bg-primary-100/55 text-primary-600' : 'hover:bg-gray-50',
        ].join(' ')}
        style={{ paddingLeft: indent }}
      >
        {selected && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-primary"
          />
        )}
        {hasChildren ? (
          <button
            type="button"
            aria-label={collapsed ? 'Expand' : 'Collapse'}
            aria-expanded={!collapsed}
            data-testid={`${testId}-toggle`}
            onClick={e => {
              e.stopPropagation();
              onToggle && onToggle();
            }}
            className="-ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200/70 hover:text-gray-600"
          >
            <PiCaretDown
              aria-hidden="true"
              className={`h-3 w-3 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            />
          </button>
        ) : (
          <span aria-hidden="true" className="h-3 w-3 shrink-0" />
        )}
        <Icon
          aria-hidden="true"
          style={{ fontSize: 14 }}
          className={`shrink-0 ${selected ? 'text-primary-600' : iconClassName || 'text-gray-500'}`}
        />
        <span
          className={`min-w-0 flex-1 truncate text-[12.5px] ${selected ? 'font-semibold' : ''}`}
        >
          {label}
        </span>
        {badge && (
          <span className="shrink-0 rounded bg-gray-100 px-1 py-px font-mono text-[9.5px] uppercase tracking-tight text-gray-500 group-hover/node:bg-gray-200/70">
            {badge}
          </span>
        )}
        {meta && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide text-gray-400 group-hover/node:text-gray-500">
            {meta}
          </span>
        )}
      </div>
      {hasChildren && !collapsed && <div className="flex flex-col">{children}</div>}
    </div>
  );
};

const EmptyState = ({ icon: Icon, title, body, testId, children }) => (
  <div
    data-testid={testId}
    className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center"
  >
    <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500">
      <Icon aria-hidden="true" className="h-4 w-4" />
    </div>
    <p className="mt-2 text-[13px] font-medium text-gray-900">{title}</p>
    {body && <p className="mt-1 text-[11px] leading-relaxed text-gray-500">{body}</p>}
    {children}
  </div>
);

const SourceOutlineTreePanel = ({ sourceName }) => {
  const {
    available,
    loading,
    nodes,
    status,
    error,
    isCold,
    generating,
    generateSchema,
    loadFlatColumns,
    flatColumns,
    reload,
  } = useSourceOutline(sourceName);

  const selectedKey = useStore(s => s.workspaceSourceOutlineSelectedKey);
  const setSelectedKey = useStore(s => s.setWorkspaceSourceOutlineSelectedKey);
  const expandedBySource = useStore(s => s.workspaceSourceOutlineExpanded);
  const toggleExpanded = useStore(s => s.toggleWorkspaceSourceOutlineExpanded);

  const [query, setQuery] = useState('');

  const sourceColors = getTypeColors('source');
  const tableColors = getTypeColors('table');

  // Per-source expanded set (session memory). The source root is expanded by
  // default; everything else honours the remembered set.
  const expandedSet = useMemo(
    () => new Set(expandedBySource?.[sourceName] || []),
    [expandedBySource, sourceName]
  );

  const handleToggle = useCallback(
    key => {
      const wasExpanded = expandedSet.has(key);
      toggleExpanded(sourceName, key);
      // Lazy-load columns for flat-fallback tables on first expand.
      if (!wasExpanded && key.includes('::table::')) {
        loadFlatColumns(key);
      }
    },
    [expandedSet, toggleExpanded, sourceName, loadFlatColumns]
  );

  // Dist / cloud: every source endpoint is null → degrade to a clear empty state.
  if (!available) {
    return (
      <div
        data-testid="workspace-source-outline"
        className="flex flex-1 flex-col overflow-hidden"
      >
        <EmptyState
          icon={PiHardDrives}
          testId="source-outline-unavailable"
          title="Schema browsing isn't available here"
          body={
            <>
              The database outline is available under{' '}
              <span className="font-mono text-[10.5px] text-gray-700">visivo serve</span>.
            </>
          }
        />
      </div>
    );
  }

  const renderColumnNode = (col, level) => {
    if (!col || !col.name) return null;
    return (
      <Node
        key={col.key}
        level={level}
        kind="column"
        icon={KIND_ICON.column}
        iconClassName="text-fuchsia-400"
        label={col.name}
        badge={col.type || null}
        selected={selectedKey === col.key}
        selectionKey={col.key}
        onSelect={setSelectedKey}
        testId={`source-outline-node-${col.key}`}
      />
    );
  };

  const renderTableNode = (table, level) => {
    if (!nodeMatches(table, query, flatColumns)) return null;
    // Columns lazy-load into `flatColumns[tableKey]` on expand (the cached feed
    // carries no eager column data). `table.children` only matters if a future
    // feed ever supplies columns eagerly.
    const lazyCols = flatColumns?.[table.key];
    const cols = Array.isArray(table.children)
      ? table.children
      : Array.isArray(lazyCols)
        ? lazyCols
        : null;
    const hasChildren = cols == null || cols.length > 0;
    const collapsed = !expandedSet.has(table.key);
    // Show the loaded column count once expanded; before that, fall back to the
    // cached `column_count` the tables list provides so the row isn't bare.
    const colCount = Array.isArray(cols)
      ? cols.length
      : typeof table.columnCount === 'number'
        ? table.columnCount
        : null;

    return (
      <Node
        key={table.key}
        level={level}
        kind="table"
        icon={KIND_ICON.table}
        iconClassName={tableColors.text}
        label={table.name}
        meta={colCount != null ? `${colCount} col${colCount === 1 ? '' : 's'}` : null}
        selected={selectedKey === table.key}
        selectionKey={table.key}
        onSelect={setSelectedKey}
        hasChildren={hasChildren}
        collapsed={collapsed}
        onToggle={() => handleToggle(table.key)}
        testId={`source-outline-node-${table.key}`}
      >
        {Array.isArray(cols)
          ? cols
              .filter(col => matchesSearch(col.name, query))
              .map(col => renderColumnNode(col, level + 1))
          : null}
      </Node>
    );
  };

  const renderGroupNode = (node, level) => {
    if (!nodeMatches(node, query, flatColumns)) return null;
    const children = Array.isArray(node.children) ? node.children : [];
    const collapsed = !expandedSet.has(node.key);
    const isSchema = node.kind === 'schema';
    return (
      <Node
        key={node.key}
        level={level}
        kind={node.kind}
        icon={KIND_ICON[node.kind] || PiFolder}
        iconClassName="text-gray-400"
        label={node.name}
        meta={node.kind}
        selected={selectedKey === node.key}
        selectionKey={node.key}
        onSelect={setSelectedKey}
        hasChildren={children.length > 0}
        collapsed={collapsed}
        onToggle={() => handleToggle(node.key)}
        testId={`source-outline-node-${node.key}`}
      >
        {children.map(child =>
          isSchema || node.kind === 'database'
            ? child.kind === 'table'
              ? renderTableNode(child, level + 1)
              : renderGroupNode(child, level + 1)
            : renderTableNode(child, level + 1)
        )}
      </Node>
    );
  };

  const rootKey = sourceRootKey(sourceName);
  const databaseNodes = Array.isArray(nodes) ? nodes : [];
  const rootCollapsed = expandedSet.has(`${rootKey}::collapsed`);

  return (
    <div
      data-testid="workspace-source-outline"
      className="flex flex-1 flex-col overflow-hidden"
    >
      {/* In-tree search (Explorer idiom). */}
      <div className="shrink-0 border-b border-gray-100 p-2">
        <div className="relative">
          <PiMagnifyingGlass
            aria-hidden="true"
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search tables & columns"
            data-testid="source-outline-search"
            className="h-7 w-full rounded-md border border-gray-200 bg-white pl-7 pr-2 text-[12px] text-gray-800 outline-none transition-colors placeholder:text-gray-400 focus:border-primary/40 focus:ring-2 focus:ring-primary/15"
          />
        </div>
      </div>

      {loading ? (
        <EmptyState
          icon={PiSpinnerGap}
          testId="source-outline-loading"
          title="Loading schema…"
          body="Reading the source's cached tables."
        />
      ) : status === 'error' ? (
        // A transient load failure (e.g. the schema-jobs listing errored) is
        // RETRYABLE — the hook never caches it, so Retry (or re-selecting the
        // source) re-fetches instead of dead-ending on a bare "0 dbs" root.
        <EmptyState
          icon={PiWarningCircle}
          testId="source-outline-error"
          title="Couldn't load the schema"
          body={error}
        >
          <button
            type="button"
            onClick={reload}
            data-testid="source-outline-retry"
            className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600"
          >
            <PiArrowsClockwise aria-hidden="true" className="h-3.5 w-3.5" />
            Retry
          </button>
        </EmptyState>
      ) : isCold ? (
        <EmptyState
          icon={SourceIcon}
          testId="source-outline-cold"
          title="No schema cached yet"
          body={
            generating
              ? `Generating schema… ${Math.round((generating.progress || 0) * 100)}%`
              : 'Generate the schema to browse this source.'
          }
        >
          <button
            type="button"
            onClick={generateSchema}
            disabled={!!generating}
            data-testid="source-outline-generate"
            className="mt-3 inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generating ? (
              <PiSpinnerGap aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <PiArrowsClockwise aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            {generating ? 'Generating…' : 'Generate schema'}
          </button>
          {error && (
            <p className="mt-2 inline-flex items-center gap-1 text-[10.5px] text-highlight-600">
              <PiWarningCircle aria-hidden="true" className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
        </EmptyState>
      ) : (
        <div
          data-testid="source-outline-tree"
          className="flex-1 overflow-y-auto py-2 text-[13px] text-gray-800"
        >
          <Node
            level={0}
            kind="source"
            icon={SourceIcon}
            iconClassName={sourceColors.text}
            label={sourceName}
            meta={`${databaseNodes.length} db${databaseNodes.length === 1 ? '' : 's'}`}
            selected={selectedKey === rootKey}
            selectionKey={rootKey}
            onSelect={setSelectedKey}
            hasChildren={databaseNodes.length > 0}
            collapsed={rootCollapsed}
            onToggle={() => handleToggle(`${rootKey}::collapsed`)}
            testId="source-outline-node-root"
          >
            {databaseNodes.map(db => renderGroupNode(db, 1))}
          </Node>
        </div>
      )}
    </div>
  );
};

export default SourceOutlineTreePanel;
