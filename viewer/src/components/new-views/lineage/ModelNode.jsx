import React from 'react';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { getEmbeddedTypes, EmbeddedTypesIndicator } from '../common/EmbeddedTypesIndicator';
import { StatusIndicator } from '../../styled/StatusIndicator';
import { NodeHandle } from '../../styled/NodeHandle';
import { NodeWrapper } from '../../styled/NodeWrapper';

/**
 * ModelNode - Custom React Flow node for models
 * Shows model name with status indicator. Click node to edit.
 * Supports nested embedded objects (e.g., embedded sources).
 */
const ModelNode = ({ data, selected }) => {
  const { name, status, isEditing, model } = data;
  const isHighlighted = selected || isEditing;

  // Get type colors and icon
  const typeConfig = getTypeByValue('model');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  // Get embedded types for small icon indicators (use full model object if available, fallback to data)
  const embeddedTypes = getEmbeddedTypes(model || data, 'model');

  return (
    <NodeWrapper isHighlighted={isHighlighted} colors={colors}>
      {/* Target handle (for source connections) */}
      <NodeHandle type="target" colors={colors} />

      {/* Status indicator */}
      <StatusIndicator status={status} />

      {/* Icon */}
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      {/* Name */}
      <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
        {name}
      </span>

      {/* Embedded types indicator */}
      <EmbeddedTypesIndicator types={embeddedTypes} />

      {/* Source handle (for future connections to traces/downstream) */}
      <NodeHandle type="source" colors={colors} />
    </NodeWrapper>
  );
};

export default ModelNode;
