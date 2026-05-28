import React, { useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { PiDotsSix } from 'react-icons/pi';
import { getTypeIcon } from '../../common/objectTypeConfigs';

/**
 * DashboardTile — VIS-805 / Track M M-1.
 *
 * A single dashboard tile inside a level group. Renders the dashboard icon,
 * name, tag chips and a footer with item count + updated timestamp. Wrapped in
 * dnd-kit's `useDraggable` so it can be dragged onto a different
 * `<LevelGroup>` drop target.
 *
 * Clicking the tile (when not mid-drag) dispatches a `dashboard` selection up
 * to `<ProjectEditor>` via `onSelect`. The tile is intentionally NOT an editor
 * surface — the right-rail dashboard form is a separate ticket (M-3).
 */

const DashboardIcon = getTypeIcon('dashboard');

const DashboardTile = ({ tile, selected = false, onSelect }) => {
  const drag = useDraggable({
    id: `project-tile:${tile.name}`,
    data: { source: 'project-editor', type: 'dashboard', name: tile.name, level: tile.level },
  });

  const dragStyle = drag.transform
    ? `translate3d(${drag.transform.x}px, ${drag.transform.y}px, 0)`
    : undefined;

  const handleClick = useCallback(
    e => {
      if (drag.isDragging) return;
      e.stopPropagation();
      onSelect && onSelect(tile);
    },
    [drag.isDragging, onSelect, tile]
  );

  const tags = Array.isArray(tile.tags) ? tile.tags : [];

  return (
    <div
      ref={drag.setNodeRef}
      {...drag.listeners}
      {...drag.attributes}
      data-testid={`project-tile-${tile.name}`}
      data-selected={selected ? 'true' : 'false'}
      data-dragging={drag.isDragging ? 'true' : 'false'}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect && onSelect(tile);
        }
      }}
      role="button"
      tabIndex={0}
      style={{ transform: dragStyle, touchAction: 'none' }}
      className={[
        'group/tile relative flex h-[124px] cursor-grab flex-col rounded-lg bg-white p-3 shadow-sm transition-all outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-[#713b57]/40',
        selected ? 'ring-2 ring-[#713b57]' : 'ring-1 ring-gray-200 hover:ring-[#c6b0bb] hover:shadow-md',
        drag.isDragging ? 'opacity-50 ring-2 ring-[#713b57]' : '',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className="absolute left-1 top-1 text-gray-300 opacity-0 transition-opacity group-hover/tile:opacity-100"
        title="Drag to a different level"
      >
        <PiDotsSix className="h-3 w-3" />
      </span>

      <div className="flex items-center gap-2">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[#e6edf8] text-[#1e3a5f]">
          <DashboardIcon style={{ fontSize: 14 }} />
        </span>
        <span className="truncate text-[13px] font-semibold text-gray-900">{tile.name}</span>
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {tags.map(t => (
            <span
              key={t}
              className="inline-flex h-4 items-center rounded-full bg-[#e2d7dd] px-1.5 text-[10px] font-medium text-[#5a2f45]"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto flex items-center justify-between text-[10px] text-gray-500">
        <span>{tile.itemCount != null ? `${tile.itemCount} items` : 'dashboard'}</span>
        {tile.updatedAt && <span className="truncate">{tile.updatedAt}</span>}
      </div>
    </div>
  );
};

export default DashboardTile;
