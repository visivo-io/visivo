import React from 'react';
import { Handle } from 'reactflow';
import { StatusIndicator } from '../../styled/StatusIndicator';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';

const InputNode = ({ data, selected }) => {
  const { name, status, isEditing } = data;
  const isHighlighted = selected || isEditing;

  const typeConfig = getTypeByValue('input');
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

      <StatusIndicator status={status} />

      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      <div className="flex flex-col min-w-0">
        <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
          {name}
        </span>
      </div>

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

export default InputNode;
