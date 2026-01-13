import React from 'react';
import { Handle } from 'reactflow';
import { ObjectStatus } from '../../../stores/store';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';

/**
 * InsightNode - Custom React Flow node for insights
 * Shows insight name with status indicator and chart type.
 * Insights are leaf nodes - they have incoming connections from models but no outgoing connections.
 */
const InsightNode = ({ data, selected }) => {
  const { name, propsType, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  // Get type colors and icon
  const typeConfig = getTypeByValue('insight');
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
      {/* Target handle (for incoming model connections) */}
      <Handle
        type="target"
        position="left"
        style={{
          background: '#ec4899', // pink-500 for insight connections
          width: 8,
          height: 8,
          border: '2px solid white',
        }}
      />

      {/* Status indicator */}
      {status && status !== ObjectStatus.PUBLISHED && (
        <span
          className={`
            absolute -top-1.5 -left-1.5 w-3 h-3 rounded-full z-10
            border-2 border-white
            ${status === ObjectStatus.NEW ? 'bg-green-500' : 'bg-amber-500'}
          `}
          title={
            status === ObjectStatus.NEW
              ? 'New - Not yet published'
              : 'Modified - Has unpublished changes'
          }
        />
      )}

      {/* Icon */}
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      {/* Name and chart type */}
      <div className="flex flex-col min-w-0">
        <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
          {name}
        </span>
        {propsType && <span className="text-xs text-gray-400">{propsType}</span>}
      </div>

      {/* No source handle - insights are leaf nodes */}
    </div>
  );
};

export default InsightNode;
