import React from 'react';
import { useDroppable } from '@dnd-kit/core';
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
  collapsed,
  onToggle,
  selectedDashboardName,
  onSelectTile,
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
  const { setNodeRef, isOver } = useDroppable({
    id: group.levelKey,
    data: { levelKey: group.levelKey, levelValue: group.levelValue },
  });

  const isInvalidTarget = !!activeDragName && isActiveSourceGroup;

  return (
    <section className="mt-1 mb-6" data-testid={`level-group-${group.levelKey}`}>
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
              />
            ))
          )}
        </div>
      )}
    </section>
  );
};

export default LevelGroup;
