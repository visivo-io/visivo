import React from 'react';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { StatusIndicator } from '../../styled/StatusIndicator';
import { NodeHandle } from '../../styled/NodeHandle';
import { NodeWrapper } from '../../styled/NodeWrapper';

/**
 * CsvScriptModelNode - Custom React Flow node for CSV script models
 * Shows model name with status indicator.
 * Has incoming connections from sources and outgoing to dimensions/metrics/etc.
 */
const CsvScriptModelNode = ({ data, selected }) => {
  const { name, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  const typeConfig = getTypeByValue('csvScriptModel');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  return (
    <NodeWrapper isHighlighted={isHighlighted} colors={colors}>
      {/* Target handle (incoming from sources) */}
      <NodeHandle type="target" colors={colors} />

      {/* Status indicator */}
      <StatusIndicator status={status} />

      {/* Icon */}
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      {/* Name */}
      <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
        {name}
      </span>

      {/* Source handle (outgoing to dimensions/metrics/etc) */}
      <NodeHandle type="source" colors={colors} />
    </NodeWrapper>
  );
};

export default CsvScriptModelNode;
