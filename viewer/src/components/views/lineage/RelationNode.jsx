import React from 'react';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { StatusIndicator } from '../../styled/StatusIndicator';
import { NodeHandle } from '../../styled/NodeHandle';
import { NodeWrapper } from '../../styled/NodeWrapper';

/**
 * RelationNode - Custom React Flow node for relations
 * Shows relation name with status indicator. Click node to edit.
 */
const RelationNode = ({ data, selected }) => {
  const { name, model, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  // Get type colors and icon
  const typeConfig = getTypeByValue('relation');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  return (
    <NodeWrapper isHighlighted={isHighlighted} colors={colors}>
      {/* Target handle (connects from models) */}
      <NodeHandle type="target" colors={colors} />

      {/* Status indicator */}
      <StatusIndicator status={status} />

      {/* Icon */}
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      {/* Name and model reference */}
      <div className="flex flex-col min-w-0">
        <span
          className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}
        >
          {name}
        </span>
        {model && (
          <span className="text-xs text-gray-400 truncate max-w-[150px]" title={`→ ${model}`}>
            → {model}
          </span>
        )}
      </div>

      {/* Source handle (for future connections) */}
      <NodeHandle type="source" colors={colors} />
    </NodeWrapper>
  );
};

export default RelationNode;
