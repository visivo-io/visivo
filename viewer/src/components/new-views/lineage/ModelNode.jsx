import React from 'react';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { StatusIndicator } from '../../styled/StatusIndicator';
import { NodeHandle } from '../../styled/NodeHandle';
import { NodeWrapper } from '../../styled/NodeWrapper';
import EmbeddedPill from './EmbeddedPill';

/**
 * ModelNode - Custom React Flow node for models
 * Shows model name with status indicator. Click node to edit.
 * Supports nested embedded objects (e.g., embedded sources).
 */
const ModelNode = ({ data, selected }) => {
  const { name, source, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  // Get type colors and icon
  const typeConfig = getTypeByValue('model');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  // Check if source is embedded (object) vs referenced (string)
  const hasEmbeddedSource = source && typeof source === 'object';
  const hasReferencedSource = source && typeof source === 'string';

  return (
    <NodeWrapper isHighlighted={isHighlighted} colors={colors}>
      {/* Target handle (for source connections) */}
      <NodeHandle type="target" colors={colors} />

      {/* Status indicator */}
      <StatusIndicator status={status} />

      {/* Icon */}
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      {/* Name and source */}
      <div className="flex flex-col min-w-0 gap-1">
        <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
          {name}
        </span>
        {hasReferencedSource && (
          <span className="text-xs text-gray-400">
            source: {source}
          </span>
        )}
        {hasEmbeddedSource && (
          <EmbeddedPill
            objectType="source"
            label={source.type || 'embedded'}
            onClick={data.onEditEmbeddedSource}
          />
        )}
      </div>

      {/* Source handle (for future connections to traces/downstream) */}
      <NodeHandle type="source" colors={colors} />
    </NodeWrapper>
  );
};

export default ModelNode;
