import React, { useCallback, useRef, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import {
  PiArrowsClockwise,
  PiDotsThreeOutlineVertical,
  PiDotsSix,
  PiPencil,
  PiArrowSquareOut,
  PiTrash,
  PiCompass,
  PiPlusCircle,
} from 'react-icons/pi';
import { ObjectStatus } from '../../../../stores/store';
import { getTypeByValue, getTypeIcon } from '../../common/objectTypeConfigs';
import LibraryRowFlipPopover from './LibraryRowFlipPopover';

/**
 * LibraryRow — VIS-769 + VIS-776 / Track C C1 + C3.
 *
 * One line per object in the Library rail. Renders the type icon, name,
 * status dot, and the hover-revealed action cluster (flip + ⋯). Wraps the
 * row in dnd-kit's `useDraggable` so a Layout-Items row dragged onto the
 * canvas (drop target lives in Track D) triggers a drop event.
 *
 * Per the C-1 design's row hierarchy:
 *   - Selected row     → 2-px mulberry left bar + tinted bg + bold name.
 *   - Hovered row      → gray-100 bg + flip & ⋯ become visible.
 *   - Dragging row     → opacity-40 ghost in place.
 *   - Drag handle dots → only for droppable (Layout) types; only on hover.
 *
 * Context menu (right-click) wraps the row; for Insight rows it exposes a
 * "Wrap in Chart…" action (stubbed for C3 — wired in Track G).
 */

// ──────────────────────── Object-type vocabulary ─────────────────────────
// The Library never forks per-type metadata: `getTypeDef` derives everything
// (icon, singular label, plural label) from the app-wide canonical
// `objectTypeConfigs.js`, so a Library row matches the icons + names used in
// /editor, the lineage nodes, the explorer, and every edit form. The only
// Library-specific knobs are which section a type belongs to (Layout vs.
// Data) and the resulting droppable flag + visual accent.
export const LAYOUT_TYPES = ['chart', 'table', 'markdown', 'input', 'dashboard'];
export const DATA_TYPES = ['source', 'model', 'dimension', 'metric', 'relation', 'insight'];

// Of the Layout-Items types, only these four are canvas-droppable drag sources
// with an inline "+ New X" CTA. Dashboards live in the Layout Items section so
// the Library offers a dashboard navigation path (VIS-824), but a dashboard is
// not a canvas-droppable item — clicking it scopes the middle pane instead.
export const DROPPABLE_TYPES = ['chart', 'table', 'markdown', 'input'];

// Explore 2.0 Phase 3a (D9 / 02-architecture.md §4): these Data-Layer types
// are drag sources INTO an open exploration (SQL editor cursor, insight prop
// slots, interaction fields, the chart's insight zone) even though they are
// NOT canvas-droppable dashboard items — `source`/`metric`/`dimension`/
// `insight` had this exact drag capability in the legacy `ExplorerLeftPanel`
// (`DraggableItem` / `ObjectList`'s `draggableType`), which the Library
// replaces. Kept DISTINCT from `DROPPABLE_TYPES` (rather than folding into
// it) so the `droppable`/`accent` computation below — and the canvas-insert
// routing in `WorkspaceDndContext.routeWorkspaceDragEnd`, which must reject
// these types — stay unchanged: a Library row being an exploration drag
// source is orthogonal to it being a valid DASHBOARD canvas item.
export const EXPLORATION_DRAG_TYPES = ['source', 'metric', 'dimension', 'insight'];

// Explore 2.0 Phase 5 (VIS-1067): types a right-click "Explore this" can mint
// a brand-new, pre-wired exploration from (`explorerStore.js`'s
// `buildExplorationSeedState`) — broader than `EXPLORATION_DRAG_TYPES`
// because minting a NEW exploration (rather than adding into an already-open
// one) also makes sense for `model` and `chart`, which have no meaningful
// "drop into an existing exploration" analog (a model is queried, not
// bound to a slot; a chart already IS the top-level draft, not a value that
// fits inside one).
export const EXPLORE_THIS_TYPES = ['source', 'model', 'metric', 'dimension', 'insight', 'chart'];

// Every type except `relation` supports inline create (a draft with a
// minimal valid config — see stores/inlineCreateStore.js). A relation can't
// be templated: its condition must reference two real models.
export const CREATABLE_TYPES = [
  'chart',
  'table',
  'markdown',
  'input',
  'dashboard',
  'source',
  'model',
  'dimension',
  'metric',
  'insight',
];

export const getTypeDef = type => {
  const cfg = getTypeByValue(type);
  const droppable = DROPPABLE_TYPES.includes(type);
  return {
    icon: cfg?.icon || getTypeIcon(type),
    label: cfg?.singularLabel || type,
    plural: cfg?.label || `${type}s`,
    droppable,
    creatable: CREATABLE_TYPES.includes(type),
    accent: droppable ? 'mulberry' : 'teal',
    // Independent of `droppable` (canvas-item eligibility) — see
    // EXPLORATION_DRAG_TYPES's comment above.
    explorationDragSource: EXPLORATION_DRAG_TYPES.includes(type),
  };
};

// Exported so `LibrarySourceRow.jsx` (the D9 source drill-down's top-level
// row, which doesn't route through this file's own row shell) can render the
// identical unpublished-changes dot rather than forking it.
export const StatusDot = ({ status }) => {
  if (!status || status === ObjectStatus.PUBLISHED) return null;
  const isNew = status === ObjectStatus.NEW;
  const colorClass = isNew ? 'bg-green-500' : 'bg-amber-500';
  const title = isNew ? 'New — not yet published' : 'Modified — has unpublished changes';
  return (
    <span
      className={`mr-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${colorClass}`}
      title={title}
      data-testid="library-row-status-dot"
      data-status={status}
    />
  );
};

const ContextMenuItem = ({ icon: Icon, label, hint, onClick, destructive }) => (
  <button
    type="button"
    onMouseDown={e => e.preventDefault()} // prevent row losing focus on click
    onClick={onClick}
    className={[
      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px]',
      destructive ? 'text-highlight-600 hover:bg-highlight-100/40' : 'text-gray-800 hover:bg-gray-50',
    ].join(' ')}
  >
    {Icon && (
      <Icon
        className={[
          'shrink-0',
          destructive ? 'text-highlight-600' : 'text-gray-500',
        ].join(' ')}
        style={{ fontSize: 14 }}
      />
    )}
    <span className="flex-1">{label}</span>
    {hint && (
      <span
        aria-hidden="true"
        className="shrink-0 font-mono text-[10.5px] text-gray-400"
      >
        {hint}
      </span>
    )}
  </button>
);

const MenuDivider = () => (
  <li
    aria-hidden="true"
    role="separator"
    className="my-0.5 border-t border-gray-200"
  />
);

const ContextMenu = ({ obj, onAction, onDismiss, canAddToExploration = false }) => {
  const isInsight = obj.type === 'insight';
  const canExploreThis = EXPLORE_THIS_TYPES.includes(obj.type);
  const canAddThisToExploration = canAddToExploration && EXPLORATION_DRAG_TYPES.includes(obj.type);
  const handle = action => () => {
    onAction && onAction(action, obj);
    onDismiss && onDismiss();
  };
  return (
    <div
      role="menu"
      data-library-row-menu="true"
      data-testid={`library-row-${obj.type}-${obj.name}-context-menu`}
      className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-gray-200"
    >
      <ul className="flex flex-col py-1">
        {isInsight && (
          <li>
            <ContextMenuItem
              icon={getTypeDef('chart').icon}
              label="Wrap in Chart…"
              hint="⌘⇧W"
              onClick={handle('wrapInChart')}
            />
          </li>
        )}
        <li>
          <ContextMenuItem
            icon={PiPencil}
            label="Open in right rail"
            hint="↵"
            onClick={handle('edit')}
          />
        </li>
        <li>
          <ContextMenuItem
            icon={PiArrowSquareOut}
            label="Open in new tab"
            hint="⌘↵"
            onClick={handle('openInNewTab')}
          />
        </li>
        <li>
          <ContextMenuItem
            icon={PiArrowsClockwise}
            label="Show lineage"
            hint="F"
            onClick={handle('showLineage')}
          />
        </li>
        {(canExploreThis || canAddThisToExploration) && <MenuDivider />}
        {canExploreThis && (
          <li>
            <ContextMenuItem
              icon={PiCompass}
              label="Explore this"
              onClick={handle('exploreThis')}
            />
          </li>
        )}
        {canAddThisToExploration && (
          <li>
            <ContextMenuItem
              icon={PiPlusCircle}
              label="Add to exploration"
              onClick={handle('addToExploration')}
            />
          </li>
        )}
        <MenuDivider />
        <li>
          <ContextMenuItem
            icon={PiTrash}
            label="Delete…"
            hint="⌫"
            destructive
            onClick={handle('delete')}
          />
        </li>
      </ul>
    </div>
  );
};

const LibraryRow = ({
  obj,
  selected = false,
  draggable = true,
  onClick,
  onContextAction,
  canAddToExploration = false,
  testId,
}) => {
  const [hovered, setHovered] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // Anchor for the portal-rendered flip popover (escapes the rail's
  // overflow-y-auto clipping ancestor).
  const rowAnchorRef = useRef(null);

  const def = getTypeDef(obj.type);
  const Icon = def.icon;

  // dnd-kit draggable wiring. `data.current` is what drop targets read — the
  // canvas (D2) consumes `{ source: 'library', type, name, subtype }`.
  // `parentModel` / `expression` / `inputType` are the Explore 2.0 Phase 3a
  // payload extension (02-architecture.md §4): `undefined` for row shapes
  // that don't carry them (chart/table/markdown/model/relation/dashboard),
  // which is exactly what the pre-Phase-3a payload looked like for those
  // types — no behavior change there.
  const drag = useDraggable({
    id: `library:${obj.type}:${obj.name}`,
    data: {
      source: 'library',
      type: obj.type,
      name: obj.name,
      subtype: obj.subtype,
      parentModel: obj.parentModel,
      expression: obj.expression,
      inputType: obj.inputType,
    },
    disabled: !draggable,
  });

  // The shared <DragOverlay> (WorkspaceDndContext) renders the drag preview, so
  // the source row must NOT also translate with the cursor. Applying the dnd-kit
  // transform here too made the source slide right with the pointer, which grew
  // the Library rail's scroll width and let dnd-kit auto-scroll the rail
  // horizontally until it went blank during a drag (VIS-836).
  const dragProps = draggable
    ? {
        ref: drag.setNodeRef,
        ...drag.listeners,
        ...drag.attributes,
        style: {
          touchAction: 'none',
        },
      }
    : {};

  const handleClick = useCallback(
    e => {
      // Don't fire onClick if a drag has begun.
      if (drag.isDragging) return;
      e.stopPropagation();
      onClick && onClick(obj, e);
    },
    [drag.isDragging, obj, onClick]
  );

  const handleContextMenu = useCallback(e => {
    e.preventDefault();
    setMenuOpen(true);
  }, []);

  const handleFlipClick = useCallback(e => {
    e.stopPropagation();
    setPopoverOpen(prev => !prev);
  }, []);

  const handleKebabClick = useCallback(e => {
    e.stopPropagation();
    setMenuOpen(prev => !prev);
  }, []);

  const handleMenuDismiss = useCallback(() => setMenuOpen(false), []);
  const handlePopoverClose = useCallback(() => setPopoverOpen(false), []);

  // Dismiss menu on outside click. Mousedowns INSIDE the menu must not
  // dismiss it — with a real cursor the native mousedown precedes the click,
  // and unmounting the item between the two means its onClick never fires
  // (VIS-811: this made every menu action a silent no-op outside jsdom).
  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = e => {
      if (e.target?.closest?.('[data-library-row-menu="true"]')) return;
      setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const showActions = hovered || popoverOpen || menuOpen;
  const tid = testId || `library-row-${obj.type}-${obj.name}`;

  return (
    <div className="relative" ref={rowAnchorRef}>
      <div
        {...dragProps}
        data-testid={tid}
        data-selected={selected ? 'true' : 'false'}
        data-hovered={hovered ? 'true' : 'false'}
        data-dragging={drag.isDragging ? 'true' : 'false'}
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onContextMenu={handleContextMenu}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick && onClick(obj, e);
          }
        }}
        role="button"
        tabIndex={0}
        style={dragProps.style}
        className={[
          'relative flex h-8 items-center gap-2 rounded-md pl-2 pr-1 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
          selected
            ? 'bg-primary-100/55 text-primary-600'
            : showActions
              ? 'bg-gray-100'
              : 'hover:bg-gray-50',
          drag.isDragging ? 'opacity-40' : '',
          draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        ].join(' ')}
      >
        {selected && (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-primary"
          />
        )}
        {/* Reserve the drag-handle slot for every row so Layout-Items and
            Data-Layer rows share the same icon indent. Only droppable rows
            fill the slot with the grip dots (visible on hover). */}
        <span
          aria-hidden="true"
          className={[
            'inline-flex h-3 w-3 shrink-0 items-center justify-center text-gray-300 transition-opacity',
            draggable && (showActions || drag.isDragging) ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          title={draggable ? 'Drag to canvas' : undefined}
          data-testid={draggable ? `${tid}-drag-handle` : undefined}
        >
          {draggable && <PiDotsSix className="h-3 w-3" />}
        </span>
        <StatusDot status={obj.status} />
        <Icon
          aria-hidden="true"
          style={{ fontSize: 14 }}
          className={`shrink-0 ${selected ? 'text-primary-600' : 'text-gray-500'}`}
        />
        <span className={`min-w-0 flex-1 truncate ${selected ? 'font-medium' : ''}`}>
          {obj.name}
        </span>
        <div
          className={[
            'flex shrink-0 items-center gap-0.5 transition-opacity',
            showActions ? 'opacity-100' : 'opacity-0 pointer-events-none',
          ].join(' ')}
        >
          <button
            type="button"
            onClick={handleFlipClick}
            title="Show lineage"
            aria-label="Show lineage"
            data-testid={`${tid}-flip`}
            data-active={popoverOpen ? 'true' : 'false'}
            className={[
              'inline-flex h-6 w-6 items-center justify-center rounded',
              popoverOpen
                ? 'bg-white text-primary ring-1 ring-primary/30 shadow-sm'
                : 'text-gray-500 hover:bg-white hover:text-gray-900',
            ].join(' ')}
          >
            <PiArrowsClockwise className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleKebabClick}
            title="More actions"
            aria-label="More actions"
            data-testid={`${tid}-kebab`}
            data-active={menuOpen ? 'true' : 'false'}
            className={[
              'inline-flex h-6 w-6 items-center justify-center rounded',
              menuOpen
                ? 'bg-white text-primary ring-1 ring-primary/30 shadow-sm'
                : 'text-gray-500 hover:bg-white hover:text-gray-900',
            ].join(' ')}
          >
            <PiDotsThreeOutlineVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {popoverOpen && (
        <LibraryRowFlipPopover
          obj={obj}
          anchorRef={rowAnchorRef}
          onClose={handlePopoverClose}
          testIdPrefix={`${tid}-popover`}
        />
      )}
      {menuOpen && (
        <ContextMenu
          obj={obj}
          onAction={onContextAction}
          onDismiss={handleMenuDismiss}
          canAddToExploration={canAddToExploration}
        />
      )}
    </div>
  );
};

export default LibraryRow;
