import React from 'react';
import { getTypeByValue } from './objectTypeConfigs';

/**
 * Get the types of embedded children for an object
 * Returns an array of type strings, e.g., ['source', 'dimension', 'metric']
 */
export const getEmbeddedTypes = (obj, objectType) => {
  const types = [];

  if (objectType === 'model') {
    // Check for embedded source
    const source = obj.config?.source;
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
 * EmbeddedTypesIndicator - Shows small square icons for embedded types
 * If multiple types, shows stacked/overlapped icons with depth
 */
export const EmbeddedTypesIndicator = ({ types }) => {
  if (!types || types.length === 0) return null;

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

export default EmbeddedTypesIndicator;
