import React, { useCallback, useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { PiArrowsClockwise, PiDotsThreeOutlineVertical, PiDotsSix } from 'react-icons/pi';
import { ObjectStatus } from '../../../../stores/store';
import { getTypeIcon } from '../../common/objectTypeConfigs';
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
// Label + plural + droppable flag + accent per object type. The `icon` is
// pulled from the app-wide canonical `objectTypeConfigs.js` (MUI icons) so the
// Library's object icons match /editor, the lineage nodes, the explorer, and
// every edit form — see `../../common/objectTypeConfigs.js`. Layout types
// (chart/table/markdown/input) are canvas-droppable with a mulberry accent;
// Data-layer types are click-to-edit with a teal accent.
export const TYPE = {
  // Layout items — droppable on the canvas.
  chart: {
    icon: getTypeIcon('chart'),
    label: 'Chart',
    plural: 'Charts',
    droppable: true,
    accent: 'mulberry',
  },
  table: {
    icon: getTypeIcon('table'),
    label: 'Table',
    plural: 'Tables',
    droppable: true,
    accent: 'mulberry',
  },
  markdown: {
    icon: getTypeIcon('markdown'),
    label: 'Markdown',
    plural: 'Markdowns',
    droppable: true,
    accent: 'mulberry',
  },
  input: {
    icon: getTypeIcon('input'),
    label: 'Input',
    plural: 'Inputs',
    droppable: true,
    accent: 'mulberry',
  },
  // Data layer — click-to-edit.
  source: {
    icon: getTypeIcon('source'),
    label: 'Source',
    plural: 'Sources',
    droppable: false,
    accent: 'teal',
  },
  model: {
    icon: getTypeIcon('model'),
    label: 'Model',
    plural: 'Models',
    droppable: false,
    accent: 'teal',
  },
  dimension: {
    icon: getTypeIcon('dimension'),
    label: 'Dimension',
    plural: 'Dimensions',
    droppable: false,
    accent: 'teal',
  },
  metric: {
    icon: getTypeIcon('metric'),
    label: 'Metric',
    plural: 'Metrics',
    droppable: false,
    accent: 'teal',
  },
  relation: {
    icon: getTypeIcon('relation'),
    label: 'Relation',
    plural: 'Relations',
    droppable: false,
    accent: 'teal',
  },
  insight: {
    icon: getTypeIcon('insight'),
    label: 'Insight',
    plural: 'Insights',
    droppable: false,
    accent: 'teal',
  },
};

export const LAYOUT_TYPES = ['chart', 'table', 'markdown', 'input'];
export const DATA_TYPES = ['source', 'model', 'dimension', 'metric', 'relation', 'insight'];

// Resolve a type definition, defaulting to chart so an unknown type still
// renders rather than crashing.
export const getTypeDef = type => TYPE[type] || TYPE.chart;

// Back-compat alias — older imports referenced `TYPE_ICON`.
export const TYPE_ICON = Object.fromEntries(
  Object.entries(TYPE).map(([key, def]) => [key, def.icon])
);

const StatusDot = ({ status }) => {
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

const ContextMenuItem = ({ icon: Icon, label, onClick, destructive }) => (
  <button
    type="button"
    onMouseDown={e => e.preventDefault()} // prevent row losing focus on click
    onClick={onClick}
    className={[
      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[12.5px]',
      destructive ? 'text-[#a84738] hover:bg-[#f6ddda]/40' : 'text-gray-800 hover:bg-gray-50',
    ].join(' ')}
  >
    {Icon && <Icon className="shrink-0 text-gray-500" style={{ fontSize: 14 }} />}
    <span className="flex-1">{label}</span>
  </button>
);

const ContextMenu = ({ obj, onAction, onDismiss }) => {
  const isInsight = obj.type === 'insight';
  const handle = action => () => {
    onAction && onAction(action, obj);
    onDismiss && onDismiss();
  };
  return (
    <div
      role="menu"
      data-testid={`library-row-${obj.type}-${obj.name}-context-menu`}
      className="absolute right-0 top-full z-30 mt-1 w-52 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-gray-200"
    >
      <ul className="flex flex-col py-1">
        {isInsight && (
          <li>
            <ContextMenuItem
              icon={TYPE.chart.icon}
              label="Wrap in Chart…"
              onClick={handle('wrapInChart')}
            />
          </li>
        )}
        <li>
          <ContextMenuItem
            icon={PiArrowsClockwise}
            label="Show lineage"
            onClick={handle('showLineage')}
          />
        </li>
        <li>
          <ContextMenuItem
            icon={PiDotsThreeOutlineVertical}
            label="Open in right rail"
            onClick={handle('edit')}
          />
        </li>
      </ul>
    </div>
  );
};

const LibraryRow = ({ obj, selected = false, draggable = true, onClick, onContextAction, testId }) => {
  const [hovered, setHovered] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const def = getTypeDef(obj.type);
  const Icon = def.icon;

  // dnd-kit draggable wiring. `data.current` is what drop targets read —
  // the canvas (D2) consumes `{ source: 'library', type, name, subtype }`.
  const drag = useDraggable({
    id: `library:${obj.type}:${obj.name}`,
    data: { source: 'library', type: obj.type, name: obj.name, subtype: obj.subtype },
    disabled: !draggable,
  });

  const dragStyle = drag.transform
    ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`
    : undefined;

  const dragProps = draggable
    ? {
        ref: drag.setNodeRef,
        ...drag.listeners,
        ...drag.attributes,
        style: {
          transform: dragStyle,
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

  // Dismiss menu on outside click.
  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const onDoc = () => setMenuOpen(false);
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const showActions = hovered || popoverOpen || menuOpen;
  const tid = testId || `library-row-${obj.type}-${obj.name}`;

  return (
    <div className="relative">
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
          'relative flex h-8 items-center gap-2 rounded-md pl-2 pr-1 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#713b57]/30',
          selected
            ? 'bg-[#e2d7dd]/55 text-[#5a2f45]'
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
            className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-[#713b57]"
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
          className={`shrink-0 ${selected ? 'text-[#5a2f45]' : 'text-gray-500'}`}
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
                ? 'bg-white text-[#713b57] ring-1 ring-[#713b57]/30 shadow-sm'
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
                ? 'bg-white text-[#713b57] ring-1 ring-[#713b57]/30 shadow-sm'
                : 'text-gray-500 hover:bg-white hover:text-gray-900',
            ].join(' ')}
          >
            <PiDotsThreeOutlineVertical className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {popoverOpen && (
        <LibraryRowFlipPopover obj={obj} onClose={handlePopoverClose} testIdPrefix={`${tid}-popover`} />
      )}
      {menuOpen && (
        <ContextMenu obj={obj} onAction={onContextAction} onDismiss={handleMenuDismiss} />
      )}
    </div>
  );
};

export default LibraryRow;
