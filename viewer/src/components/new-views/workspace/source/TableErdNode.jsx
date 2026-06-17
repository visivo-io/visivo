import React from 'react';
import { Handle } from 'reactflow';
import { getTypeColors, getTypeIcon } from '../../common/objectTypeConfigs';

/**
 * TableErdNode — a React-Flow node card for one table in the Source ERD (VIS-1005).
 *
 * Layout: a tinted header (source colour + storage icon + qualified table name)
 * over a list of column rows (name + type). Long column lists are capped with a
 * "+N more" row so a wide table can't blow out the canvas (the full schema lives
 * in the right-rail outline; this is the relationship view).
 *
 * FK-readiness: every column row carries a left (target) and right (source)
 * React-Flow `Handle` whose `id` is the column name, so VIS-1014 can land
 * foreign-key edges between specific columns without re-wiring the node. The
 * handles are visually muted until edges exist.
 *
 * Colours/icon come ONLY from objectTypeConfigs (source = orange).
 */

const MAX_VISIBLE_COLUMNS = 12;

const TableErdNode = ({ data }) => {
  const colors = getTypeColors('source');
  const Icon = getTypeIcon('source');
  const columns = Array.isArray(data?.columns) ? data.columns : [];

  const qualifiedName = [data?.schema, data?.table].filter(Boolean).join('.') || data?.table || '';
  const visible = columns.slice(0, MAX_VISIBLE_COLUMNS);
  const hiddenCount = columns.length - visible.length;

  return (
    <div
      data-testid={`source-erd-node-${data?.table}`}
      className={`min-w-[200px] max-w-[280px] overflow-hidden rounded-lg border-2 bg-white shadow-sm ${colors.border}`}
    >
      {/* Header */}
      <div className={`flex items-center gap-2 px-3 py-2 ${colors.bg}`}>
        {Icon && <Icon fontSize="small" className={colors.text} />}
        <span className={`truncate text-sm font-semibold ${colors.text}`} title={qualifiedName}>
          {data?.table}
        </span>
      </div>

      {/* Column rows */}
      <div className="divide-y divide-gray-100">
        {visible.length === 0 ? (
          <div className="px-3 py-2 text-xs italic text-gray-400">No columns</div>
        ) : (
          visible.map(col => (
            <div
              key={col.name}
              data-testid={`source-erd-column-${data?.table}-${col.name}`}
              className="relative flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
            >
              {/* FK-ready handles, keyed by column id (edges land in VIS-1014). */}
              <Handle
                type="target"
                position="left"
                id={col.name}
                style={{
                  background: colors.connectionHandle,
                  width: 6,
                  height: 6,
                  border: '1px solid white',
                  opacity: 0.5,
                }}
              />
              <span className="truncate font-medium text-gray-700" title={col.name}>
                {col.name}
              </span>
              {col.type && (
                <span className="shrink-0 font-mono text-[10px] uppercase text-gray-400">
                  {col.type}
                </span>
              )}
              <Handle
                type="source"
                position="right"
                id={col.name}
                style={{
                  background: colors.connectionHandle,
                  width: 6,
                  height: 6,
                  border: '1px solid white',
                  opacity: 0.5,
                }}
              />
            </div>
          ))
        )}
        {hiddenCount > 0 && (
          <div className="px-3 py-1.5 text-[11px] font-medium text-gray-400">
            +{hiddenCount} more
          </div>
        )}
      </div>
    </div>
  );
};

export default TableErdNode;
