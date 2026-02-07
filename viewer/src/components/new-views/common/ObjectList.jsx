import React from 'react';
import { ObjectStatus } from '../../../stores/store';
import { getTypeByValue, DEFAULT_COLORS } from './objectTypeConfigs';
import { getEmbeddedTypes, EmbeddedTypesIndicator } from './EmbeddedTypesIndicator';

/**
 * StatusDot - Visual indicator for object status
 */
const StatusDot = ({ status }) => {
  if (!status || status === ObjectStatus.PUBLISHED) {
    return null;
  }

  const isNew = status === ObjectStatus.NEW;
  const colorClass = isNew ? 'bg-green-500' : 'bg-amber-500';
  const title = isNew ? 'New - Not yet published' : 'Modified - Has unpublished changes';

  return <span className={`w-2 h-2 rounded-full ${colorClass}`} title={title} />;
};

/**
 * ObjectList - Displays a list of objects with status indicators
 * Used by EditorNew view
 */
const ObjectList = ({
  objects,
  selectedName,
  onSelect,
  title = 'Objects',
  objectType = 'source',
}) => {
  const typeConfig = getTypeByValue(objectType);
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  if (!objects || objects.length === 0) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        No {title.toLowerCase()} found. Click the + button to create one.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Section Header */}
      <div
        className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b ${colors.bg} ${colors.text} ${colors.border}`}
      >
        {title} ({objects.length})
      </div>

      {/* Object List */}
      <div className="flex-1 overflow-y-auto">
        {objects.map(obj => {
          const isSelected = obj.name === selectedName;
          return (
            <button
              key={obj.name}
              onClick={() => onSelect(obj)}
              className={`
                w-full text-left px-4 py-2.5
                flex items-center gap-2
                transition-colors border-b border-gray-100
                ${isSelected ? `${colors.bg} border-l-2 ${colors.borderSelected}` : 'hover:bg-gray-50'}
              `}
              style={isSelected ? { borderLeftColor: 'currentColor' } : undefined}
            >
              {/* Status indicator */}
              <StatusDot status={obj.status} />

              {/* Icon */}
              {Icon && (
                <Icon fontSize="small" className={isSelected ? colors.text : 'text-gray-400'} />
              )}

              {/* Name */}
              <span
                className={`text-sm truncate flex-1 ${isSelected ? `${colors.text} font-medium` : 'text-gray-700'}`}
              >
                {obj.name}
              </span>

              {/* Embedded children indicator */}
              <EmbeddedTypesIndicator types={getEmbeddedTypes(obj, objectType)} />

              {/* Type badge */}
              {obj.type && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
                  {obj.type}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default ObjectList;
