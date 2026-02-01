import React from 'react';
import { Handle } from 'reactflow';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { StatusIndicator } from '../../styled/StatusIndicator';

/**
 * DashboardNode - Custom React Flow node for dashboards
 * Shows dashboard name with status indicator.
 * Dashboards have incoming connections from charts, tables, markdowns, selectors.
 */
const DashboardNode = ({ data, selected }) => {
  const { name, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  const typeConfig = getTypeByValue('dashboard');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  return (
    <div
      className={`
        relative flex items-center gap-2 px-3 py-2
        rounded-lg border-2 shadow-sm cursor-pointer
        transition-all duration-150
        ${isHighlighted ? `${colors.bg} ${colors.borderSelected} shadow-md` : `bg-white ${colors.border} hover:${colors.bg}`}
      `}
    >
      {/* Target handle (for incoming connections from charts/tables/markdowns) */}
      <Handle
        type="target"
        position="left"
        style={{
          background: colors.connectionHandle,
          width: 8,
          height: 8,
          border: '2px solid white',
        }}
      />

      {/* Status indicator */}
      <StatusIndicator status={status} />

      {/* Icon */}
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      {/* Name */}
      <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
        {name}
      </span>
    </div>
  );
};

export default DashboardNode;
