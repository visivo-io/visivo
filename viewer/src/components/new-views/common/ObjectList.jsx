import React from 'react';
import { ObjectStatus } from '../../../stores/store';
import { getTypeByValue, DEFAULT_COLORS } from './objectTypeConfigs';

/**
 * Get the types of embedded children for an object
 * Returns an array of type strings, e.g., ['source', 'dimension', 'metric']
 */
const getEmbeddedTypes = (obj, objectType) => {
  const types = [];

  if (objectType === 'model') {
    // Check for embedded source
    const source = obj.config?.source || obj.source;
    if (source && typeof source === 'object') {
      types.push('source');
    }
    // Check for inline dimensions
    const dimensions = obj.config?.dimensions || [];
    if (dimensions.length > 0) {
      types.push('dimension');
    }
    // Check for inline metrics
    const metrics = obj.config?.metrics || [];
    if (metrics.length > 0) {
      types.push('metric');
    }
  }

  if (objectType === 'chart' || objectType === 'table') {
    // Check for embedded insights
    const insights = obj.config?.insights || obj.insights || [];
    if (insights.some(i => typeof i === 'object')) {
      types.push('insight');
    }
  }

  return types;
};

/**
 * EmbeddedTypesIndicator - Shows icons for embedded types
 * If multiple types, shows stacked/overlapped icons with depth
 */
const EmbeddedTypesIndicator = ({ types }) => {
  if (types.length === 0) return null;

  // Get icons for each type
  const typeIcons = types.map(type => {
    const config = getTypeByValue(type);
    return { type, Icon: config?.icon, color: config?.colors?.text || 'text-gray-500' };
  }).filter(t => t.Icon);

  if (typeIcons.length === 0) return null;

  // Single type - just show the icon in a square
  if (typeIcons.length === 1) {
    const { Icon, color } = typeIcons[0];
    return (
      <span
        className="flex-shrink-0 flex items-center justify-center w-5 h-5 bg-white rounded shadow-sm"
        title={`Contains embedded ${types[0]}`}
      >
        <Icon style={{ fontSize: 14 }} className={color} />
      </span>
    );
  }

  // Multiple types - show stacked square icons with depth
  return (
    <span
      className="flex-shrink-0 flex items-center -space-x-2"
      title={`Contains embedded: ${types.join(', ')}`}
    >
      {typeIcons.map(({ type, Icon, color }, index) => (
        <span
          key={type}
          className="flex items-center justify-center w-5 h-5 bg-white rounded shadow-sm"
          style={{ zIndex: typeIcons.length - index }}
        >
          <Icon style={{ fontSize: 14 }} className={color} />
        </span>
      ))}
    </span>
  );
};

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
