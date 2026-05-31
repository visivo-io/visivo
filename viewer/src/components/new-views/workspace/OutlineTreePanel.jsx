import React, { useMemo, useCallback } from 'react';
import { PiCaretDown, PiPlus, PiList, PiRows, PiStack } from 'react-icons/pi';
import useStore from '../../../stores/store';
import useWorkspaceScope from './useWorkspaceScope';
import { getTypeIcon } from '../common/objectTypeConfigs';
import { parseRefValue } from '../../../utils/refString';

/**
 * OutlineTreePanel — VIS-793 / Track F F-3.
 *
 * A compact, clickable indented tree of the currently scoped dashboard's
 * structure: `dashboard → row → item`. Mounts inside the right-rail Outline
 * tab (see `RightRail.jsx`). Read-only over the dashboard structure: it
 * reflects whatever the store holds, so once the canvas (Track D) lands and
 * mutates the same `dashboards` slice the tree updates live for free.
 *
 * Behaviour:
 *   - Click any node → `setWorkspaceOutlineSelectedKey` updates the workspace
 *     selection (the canvas highlights the same key once Track D ships).
 *   - "+ Add row" (mulberry) appends an empty row via `addDashboardRow`.
 *   - Empty / no-dashboard states render their own messaging.
 *
 * Selection idiom matches the Library row: a 2-px mulberry left bar + tinted
 * background + bolded label (mulberry = layout/selection per the delivered
 * two-tone palette). Leaf type icons + colours come from the canonical
 * `objectTypeConfigs.js` — never hand-rolled.
 */

// Item carriers in a dashboard Row, in render order. The first key present on
// an Item determines its object type + display name. `width` is its column
// span (defaults to 1).
const ITEM_TYPE_KEYS = ['chart', 'table', 'markdown', 'input'];

/**
 * Derive `{ type, name }` from a dashboard Item. The carrier value may be a
 * ref string (`${ref(name)}` / `ref(name)`), a bare name, or an inline object
 * with a `.name`. Returns a fallback when nothing usable is present.
 */
const resolveItem = item => {
  if (!item || typeof item !== 'object') {
    return { type: 'chart', name: '(item)' };
  }
  for (const key of ITEM_TYPE_KEYS) {
    const value = item[key];
    if (value === undefined || value === null || value === '') continue;
    const name =
      typeof value === 'string' ? parseRefValue(value) : value?.name || `(${key})`;
    return { type: key, name: name || `(${key})` };
  }
  return { type: 'chart', name: '(empty item)' };
};

/**
 * One tree row. Recursive: `children` renders the nested sub-tree (rows under
 * the dashboard, items under a row). Indent is computed from `level`.
 */
const Node = ({
  level,
  kind,
  itemType,
  label,
  meta,
  selected,
  selectionKey,
  onSelect,
  testId,
  children,
}) => {
  const Icon =
    kind === 'dashboard'
      ? getTypeIcon('dashboard')
      : kind === 'row'
        ? PiRows
        : kind === 'container'
          ? PiStack
          : getTypeIcon(itemType);

  const indent = 6 + level * 14;
  const hasChildren = React.Children.count(children) > 0;

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
          'group/node relative flex h-7 cursor-pointer items-center gap-1.5 pr-2 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#713b57]/30',
          selected ? 'bg-[#e2d7dd]/55 text-[#5a2f45]' : 'hover:bg-gray-50',
        ].join(' ')}
        style={{ paddingLeft: indent }}
      >
        {selected && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-[#713b57]"
          />
        )}
        {/* Disclosure caret — parents only; items get a spacer to align icons. */}
        {hasChildren ? (
          <PiCaretDown aria-hidden="true" className="h-3 w-3 shrink-0 text-gray-400" />
        ) : (
          <span aria-hidden="true" className="h-3 w-3 shrink-0" />
        )}
        <Icon
          aria-hidden="true"
          style={{ fontSize: 14 }}
          className={`shrink-0 ${selected ? 'text-[#5a2f45]' : 'text-gray-500'}`}
        />
        <span
          className={`min-w-0 flex-1 truncate text-[12.5px] ${selected ? 'font-semibold' : ''}`}
        >
          {label}
        </span>
        {meta && (
          <span
            className={[
              'shrink-0 text-[10px] text-gray-400 group-hover/node:text-gray-500',
              kind === 'item' ? 'lowercase' : 'uppercase tracking-wide',
            ].join(' ')}
          >
            {meta}
          </span>
        )}
      </div>
      {hasChildren && <div className="flex flex-col">{children}</div>}
    </div>
  );
};

const EmptyState = ({ onAddRow }) => (
  <div
    data-testid="outline-tree-empty"
    className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center"
  >
    <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gray-100 text-gray-500">
      <PiList aria-hidden="true" className="h-4 w-4" />
    </div>
    <p className="mt-2 text-[13px] font-medium text-gray-900">No rows yet.</p>
    <p className="mt-1 text-[11px] leading-relaxed text-gray-500">
      Drag from Library or click{' '}
      <span className="font-medium text-[#713b57]">+ Add row</span>.
    </p>
    <button
      type="button"
      onClick={onAddRow}
      data-testid="outline-tree-add-row-empty"
      className="mt-3 inline-flex h-7 items-center gap-1 rounded-md bg-[#713b57] px-2 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[#5a2f45]"
    >
      <PiPlus aria-hidden="true" className="h-3.5 w-3.5" /> Add row
    </button>
  </div>
);

const NoDashboardState = () => (
  <div
    data-testid="outline-tree-no-dashboard"
    className="flex flex-1 items-start justify-center px-6 py-8 text-center"
  >
    <div className="text-gray-500">
      <PiList aria-hidden="true" className="mx-auto mb-2 h-5 w-5 text-gray-400" />
      <p className="text-[12px] leading-relaxed">
        Open a dashboard from the Library to see its outline.
      </p>
    </div>
  </div>
);

const OutlineTreePanel = () => {
  const { dashboardName } = useWorkspaceScope();
  const dashboards = useStore(s => s.dashboards);
  const selectedKey = useStore(s => s.workspaceOutlineSelectedKey);
  const setSelectedKey = useStore(s => s.setWorkspaceOutlineSelectedKey);
  const addDashboardRow = useStore(s => s.addDashboardRow);

  // Resolve the scoped dashboard's rows from the same store source the canvas
  // reads, so structural edits there flow into the tree automatically.
  const rows = useMemo(() => {
    if (!dashboardName) return null;
    const entry = (dashboards || []).find(d => d.name === dashboardName);
    if (!entry) return null;
    const config = entry.config || entry;
    return Array.isArray(config.rows) ? config.rows : [];
  }, [dashboards, dashboardName]);

  const handleAddRow = useCallback(() => {
    if (!dashboardName) return;
    addDashboardRow(dashboardName);
  }, [addDashboardRow, dashboardName]);

  // Recursively render an Item. A leaf item (chart/table/markdown/input)
  // renders a single node; a container item (`item.rows` present) renders a
  // distinguishable "container" node whose children are its nested rows. Keys
  // extend the existing scheme by appending `.row.<ri>.item.<ii>` per level,
  // e.g. `row.0.item.1.row.0.item.0`, so a click on any depth writes a fully
  // qualified, nested selection key.
  const renderItemNode = (item, ii, parentKey, level) => {
    const itemKey = `${parentKey}.item.${ii}`;
    const nestedRows = Array.isArray(item?.rows) ? item.rows : null;

    if (nestedRows && nestedRows.length > 0) {
      return (
        <Node
          key={ii}
          level={level}
          kind="container"
          label={`Container ${ii + 1}`}
          meta={`${nestedRows.length} row${nestedRows.length === 1 ? '' : 's'} · ${item?.width || 1} col${(item?.width || 1) === 1 ? '' : 's'}`}
          selected={selectedKey === itemKey}
          selectionKey={itemKey}
          onSelect={setSelectedKey}
          testId={`outline-tree-node-${itemKey}`}
        >
          {nestedRows.map((row, ri) => renderRowNode(row, ri, itemKey, level + 1))}
        </Node>
      );
    }

    const { type, name } = resolveItem(item);
    return (
      <Node
        key={ii}
        level={level}
        kind="item"
        itemType={type}
        label={name}
        meta={`${type} · ${item?.width || 1} col${(item?.width || 1) === 1 ? '' : 's'}`}
        selected={selectedKey === itemKey}
        selectionKey={itemKey}
        onSelect={setSelectedKey}
        testId={`outline-tree-node-${itemKey}`}
      />
    );
  };

  // Recursively render a Row and its items. `parentKey` is the dashboard root
  // ('') for top-level rows or a container item key for nested rows.
  const renderRowNode = (row, ri, parentKey, level) => {
    const rowKey = parentKey ? `${parentKey}.row.${ri}` : `row.${ri}`;
    const items = Array.isArray(row?.items) ? row.items : [];
    return (
      <Node
        key={ri}
        level={level}
        kind="row"
        label={`Row ${ri + 1}`}
        meta={`${row?.height || 'medium'} · ${items.length} item${items.length === 1 ? '' : 's'}`}
        selected={selectedKey === rowKey}
        selectionKey={rowKey}
        onSelect={setSelectedKey}
        testId={`outline-tree-node-${rowKey}`}
      >
        {items.map((item, ii) => renderItemNode(item, ii, rowKey, level + 1))}
      </Node>
    );
  };

  if (!dashboardName) {
    return (
      <div
        data-testid="workspace-right-rail-outline"
        className="flex flex-1 flex-col overflow-hidden"
      >
        <NoDashboardState />
      </div>
    );
  }

  const isEmpty = !rows || rows.length === 0;

  return (
    <div
      data-testid="workspace-right-rail-outline"
      className="flex flex-1 flex-col overflow-hidden"
    >
      {isEmpty ? (
        <EmptyState onAddRow={handleAddRow} />
      ) : (
        <div
          data-testid="outline-tree"
          className="flex-1 overflow-y-auto py-2 text-[13px] text-gray-800"
        >
          <Node
            level={0}
            kind="dashboard"
            label={dashboardName}
            meta={`${rows.length} row${rows.length === 1 ? '' : 's'}`}
            selected={selectedKey === 'dashboard'}
            selectionKey="dashboard"
            onSelect={setSelectedKey}
            testId="outline-tree-node-dashboard"
          >
            {rows.map((row, ri) => renderRowNode(row, ri, '', 1))}
          </Node>

          <button
            type="button"
            onClick={handleAddRow}
            data-testid="outline-tree-add-row"
            className="mt-2 ml-3 inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[12px] font-medium text-[#713b57] transition-colors hover:bg-[#e2d7dd]/40"
          >
            <PiPlus aria-hidden="true" className="h-3.5 w-3.5" /> Add row
          </button>
        </div>
      )}
    </div>
  );
};

export default OutlineTreePanel;
