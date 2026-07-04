import React from 'react';
import { Position } from 'reactflow';
import { getTypeColors, getTypeIcon } from '../../common/objectTypeConfigs';
import { NodeHandle } from '../../../styled/NodeHandle';

/**
 * ErdModelNode — a column-listing model card for the Relations ERD (VIS-1006).
 *
 * Unlike the horizontal lineage node, this is a vertical card: a tinted header
 * (model icon + name) over one row per column. Each column row exposes BOTH a
 * left (target) and right (source) `<Handle id={column}>` so a drag from any
 * column on one card to any column on another carries the two column names
 * (reactflow surfaces them as `sourceHandle` / `targetHandle` on the connection)
 * — that's what the JoinOperatorPopover turns into a relation condition.
 *
 * All colours come from objectTypeConfigs (model = amber); no hand-rolled tones.
 */
const ErdModelNode = ({ data, selected }) => {
  const { name, columns = [] } = data;
  const colors = getTypeColors('model');
  const Icon = getTypeIcon('model');

  return (
    <div
      data-testid={`erd-model-node-${name}`}
      className={[
        'min-w-[180px] max-w-[260px] rounded-lg border-2 bg-white shadow-sm transition-all duration-150',
        selected ? `${colors.borderSelected} shadow-md` : colors.border,
      ].join(' ')}
    >
      <div
        className={[
          'flex items-center gap-2 rounded-t-md px-3 py-2 text-[12px] font-semibold',
          colors.bg,
          colors.text,
        ].join(' ')}
      >
        {Icon && <Icon style={{ fontSize: 16 }} className="shrink-0" aria-hidden="true" />}
        <span className="truncate" title={name}>
          {name}
        </span>
      </div>

      {columns.length > 0 ? (
        <ul className="divide-y divide-gray-100">
          {columns.map(column => (
            <li
              key={column}
              data-testid={`erd-column-${name}-${column}`}
              className="relative flex items-center px-3 py-1.5 text-[12px] text-gray-700 hover:bg-gray-50"
            >
              <NodeHandle type="target" colors={colors} id={column} position={Position.Left} />
              <span className="truncate" title={column}>
                {column}
              </span>
              <NodeHandle type="source" colors={colors} id={column} position={Position.Right} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="relative px-3 py-2 text-[11px] italic text-gray-400">
          {/* No hydrated columns — still allow a card-level connection so the
              model can be picked up in a drag (handles fall back to default). */}
          <NodeHandle type="target" colors={colors} position={Position.Left} />
          No columns loaded
          <NodeHandle type="source" colors={colors} position={Position.Right} />
        </div>
      )}
    </div>
  );
};

export default ErdModelNode;
