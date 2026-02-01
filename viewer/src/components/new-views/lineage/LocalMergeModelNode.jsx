import React from 'react';
import { Handle } from 'reactflow';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { StatusIndicator } from '../../styled/StatusIndicator';

/**
 * LocalMergeModelNode - Custom React Flow node for local merge models
 * Shows model name with status indicator.
 * Has incoming connections from other models and outgoing to dimensions/metrics/etc.
 */
const LocalMergeModelNode = ({ data, selected }) => {
  const { name, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  const typeConfig = getTypeByValue('localMergeModel');
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
      {/* Target handle (incoming from other models) */}
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
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-800'} />}

      {/* Name */}
      <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
        {name}
      </span>

      {/* Source handle (outgoing to dimensions/metrics/etc) */}
      <Handle
        type="source"
        position="right"
        style={{
          background: colors.connectionHandle,
          width: 8,
          height: 8,
          border: '2px solid white',
        }}
      />
    </div>
  );
};

export default LocalMergeModelNode;
