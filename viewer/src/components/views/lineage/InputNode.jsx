import React from 'react';
import { StatusIndicator } from '../../styled/StatusIndicator';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { NodeHandle } from '../../styled/NodeHandle';
import { NodeWrapper } from '../../styled/NodeWrapper';

const InputNode = ({ data, selected }) => {
  const { name, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  const typeConfig = getTypeByValue('input');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  return (
    <NodeWrapper isHighlighted={isHighlighted} colors={colors}>
      <NodeHandle type="target" colors={colors} />

      <StatusIndicator status={status} />

      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      <div className="flex flex-col min-w-0">
        <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
          {name}
        </span>
      </div>

      <NodeHandle type="source" colors={colors} />
    </NodeWrapper>
  );
};

export default InputNode;
