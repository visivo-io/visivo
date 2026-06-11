import React from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { PiDotsSixVertical } from 'react-icons/pi';
import LevelGroupHeader from './LevelGroupHeader';
import DashboardTile from './DashboardTile';

/**
 * LevelGroup — VIS-805 / Track M M-1.
 *
 * One level's worth of dashboard tiles, with a collapsible header and a
 * dnd-kit drop target spanning the tile grid. Dropping a `DashboardTile` from
 * a different level here reassigns that dashboard's `level` (handled by the
 * parent `<ProjectEditor>`'s `onDragEnd`). The group's own dragging tiles are
 * dimmed as invalid self-drop targets.
 */
const LevelGroup = ({
  group,
  levelIndex = -1,
  collapsed,
  onToggle,
  selectedDashboardName,
  onSelectTile,
  onOpenTileInNewTab,
  activeDragName,
  isActiveSourceGroup,
  editable = false,
  canMoveUp = false,
  canMoveDown = false,
  onRename,
  onMoveUp,
  onMoveDown,
  onDelete,
}) => {
  // Drop target for BOTH a dashboard tile (reassign level) AND a level-header
  // drag (reorder levels — VIS-901 #5). `levelIndex` lets the router compute the
  // reorder destination.
  const { setNodeRef, isOver } = useDroppable({
    id: group.levelKey,
    data: { levelKey: group.levelKey, levelValue: group.levelValue, levelIndex },
  });

  // The level itself is draggable by its grip (only for real, editable levels —
  // not the trailing Unassigned bucket). Reorder is routed through the shared
  // WorkspaceDndContext (VIS-901 #5).
  const levelDrag = useDraggable({
    id: `level-handle:${group.levelKey}`,
    data: { source: 'level', levelIndex, levelKey: group.levelKey, title: group.title },
    disabled: !editable,
  });

  const isInvalidTarget = !!activeDragName && isActiveSourceGroup;

  return (
    <section className="mt-1 mb-6" data-testid={`level-group-${group.levelKey}`}>
      <div className="flex items-center gap-1">
        {editable && (
          <button
            ref={levelDrag.setNodeRef}
            {...levelDrag.listeners}
            {...levelDrag.attributes}
            type="button"
            data-testid={`level-drag-handle-${group.levelKey}`}
            aria-label={`Reorder level ${group.title}`}
            title="Drag to reorder level"
            onClick={e => e.stopPropagation()}
            className="inline-flex h-6 w-5 shrink-0 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-primary"
            style={{ cursor: levelDrag.isDragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          >
            <PiDotsSixVertical className="h-4 w-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <LevelGroupHeader
            title={group.title}
            count={group.dashboards.length}
            collapsed={collapsed}
            onToggle={onToggle}
            testId={`level-group-header-${group.levelKey}`}
            editable={editable}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            onRename={onRename}
            onMoveUp={onMoveUp}
            onMoveDown={onMoveDown}
            onDelete={onDelete}
          />
        </div>
      </div>
      {!collapsed && (
        <div
          ref={setNodeRef}
          data-testid={`level-group-dropzone-${group.levelKey}`}
          data-over={isOver ? 'true' : 'false'}
          className={[
            'grid grid-cols-1 gap-3 rounded-lg transition-colors sm:grid-cols-2 lg:grid-cols-3',
            isOver && !isInvalidTarget
              ? 'bg-primary-100/30 p-2 ring-2 ring-dashed ring-primary'
              : '',
            isInvalidTarget ? 'opacity-40' : '',
          ].join(' ')}
        >
          {group.dashboards.length === 0 ? (
            <div className="col-span-full flex h-[100px] items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-white/40 px-4 text-[12px] text-gray-500">
              Drag a dashboard here
            </div>
          ) : (
            group.dashboards.map(tile => (
              <DashboardTile
                key={tile.name}
                tile={tile}
                selected={selectedDashboardName === tile.name}
                onSelect={onSelectTile}
                onOpenInNewTab={onOpenTileInNewTab}
              />
            ))
          )}
        </div>
      )}
    </section>
  );
};

export default LevelGroup;
