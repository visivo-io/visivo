import React, { useState } from 'react';
import { Handle } from 'react-flow-renderer';
import { ObjectStatus } from '../../../stores/store';
import EditIcon from '@mui/icons-material/Edit';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypes';

/**
 * ModelNode - Custom React Flow node for models
 * Shows model name with status indicator and edit button on hover
 */
const ModelNode = ({ data, selected }) => {
  const [hovered, setHovered] = useState(false);
  const { name, sql, source, status, onEdit } = data;

  // Get type colors and icon
  const typeConfig = getTypeByValue('model');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  const handleEditClick = e => {
    e.stopPropagation();
    onEdit && onEdit(data.model);
  };

  return (
    <div
      className={`
        relative flex items-center gap-2 px-3 py-2
        rounded-lg border-2 shadow-sm
        transition-all duration-150
        ${selected ? `${colors.bg} ${colors.borderSelected} shadow-md` : `bg-white ${colors.border} hover:${colors.bg}`}
      `}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Target handle (for source connections) */}
      <Handle
        type="target"
        position="left"
        style={{
          background: '#6366f1', // indigo-500 for model connections
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
      {Icon && <Icon fontSize="small" className={selected ? colors.text : 'text-gray-500'} />}

      {/* Name and source */}
      <div className="flex flex-col min-w-0">
        <span className={`text-sm font-medium truncate ${selected ? colors.text : 'text-gray-800'}`}>
          {name}
        </span>
        {source && <span className="text-xs text-gray-400">source: {source}</span>}
      </div>

      {/* Edit button (visible on hover) */}
      {hovered && (
        <button
          onClick={handleEditClick}
          className={`
            ml-2 p-1 rounded-full
            ${colors.bg} hover:opacity-80
            transition-colors
          `}
          title="Edit model"
        >
          <EditIcon fontSize="small" className={colors.text} />
        </button>
      )}

      {/* Source handle (for future connections to traces/downstream) */}
      <Handle
        type="source"
        position="right"
        style={{
          background: '#6366f1', // indigo-500 for model connections
          width: 8,
          height: 8,
          border: '2px solid white',
        }}
      />
    </div>
  );
};

export default ModelNode;
