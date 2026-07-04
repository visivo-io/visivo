import React from 'react';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { StatusIndicator } from '../../styled/StatusIndicator';
import { NodeHandle } from '../../styled/NodeHandle';
import { NodeWrapper } from '../../styled/NodeWrapper';

/**
 * InsightNode - Custom React Flow node for insights
 * Shows insight name with status indicator and chart type.
 * Insights connect from models/traces and connect to charts/tables.
 */
const InsightNode = ({ data, selected }) => {
  const { name, propsType, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  // Get type colors and icon
  const typeConfig = getTypeByValue('insight');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  return (
    <NodeWrapper isHighlighted={isHighlighted} colors={colors}>
      {/* Target handle (for incoming model connections) */}
      <NodeHandle type="target" colors={colors} />

      {/* Status indicator */}
      <StatusIndicator status={status} />

      {/* Icon */}
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      {/* Name and chart type */}
      <div className="flex flex-col min-w-0">
        <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
          {name}
        </span>
        {propsType && <span className="text-xs text-gray-400">{propsType}</span>}
      </div>

      {/* Source handle (for outgoing connections to charts/tables) */}
      <NodeHandle type="source" colors={colors} />
    </NodeWrapper>
  );
};

export default InsightNode;
