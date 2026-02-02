import React from 'react';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { StatusIndicator } from '../../styled/StatusIndicator';
import { NodeHandle } from '../../styled/NodeHandle';
import { NodeWrapper } from '../../styled/NodeWrapper';

/**
 * MarkdownNode - Custom React Flow node for markdowns
 * Shows markdown name with status indicator.
 * Markdowns are leaf nodes - they have no connections.
 */
const MarkdownNode = ({ data, selected }) => {
  const { name, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  // Get type colors and icon
  const typeConfig = getTypeByValue('markdown');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  return (
    <NodeWrapper isHighlighted={isHighlighted} colors={colors}>
      {/* Target handle (for potential incoming connections) */}
      <NodeHandle type="target" colors={colors} />

      {/* Status indicator */}
      <StatusIndicator status={status} />

      {/* Icon */}
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      {/* Name */}
      <div className="flex flex-col min-w-0">
        <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
          {name}
        </span>
      </div>

      {/* Source handle (for outgoing connections to dashboards) */}
      <NodeHandle type="source" colors={colors} />
    </NodeWrapper>
  );
};

export default MarkdownNode;
