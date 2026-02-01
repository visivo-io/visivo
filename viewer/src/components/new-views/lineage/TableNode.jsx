import React from 'react';
import { Handle } from 'reactflow';
import { ObjectStatus } from '../../../stores/store';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import EmbeddedPill from './EmbeddedPill';

/**
 * Helper to check if a value is an embedded object (not a ref string)
 */
const isEmbeddedObject = (value) => {
  if (!value) return false;
  if (typeof value === 'string') return false; // It's a ref
  if (typeof value === 'object') return true; // It's embedded
  return false;
};

/**
 * TableNode - Custom React Flow node for tables
 * Shows table name with status indicator.
 * Tables have incoming connections from insights.
 * Supports nested embedded objects (traces, insights).
 */
const TableNode = ({ data, selected }) => {
  const { name, status, isEditing, table } = data;
  const isHighlighted = selected || isEditing;

  // Get type colors and icon
  const typeConfig = getTypeByValue('table');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  // Check for embedded insights in table config (traces not supported for embedded display)
  const config = table?.config || {};
  const insights = config.insights || [];

  // Count embedded insights (not refs)
  const embeddedInsights = insights.filter(isEmbeddedObject);
  const hasEmbeddedObjects = embeddedInsights.length > 0;

  return (
    <div
      className={`
        relative flex items-center gap-2 px-3 py-2
        rounded-lg border-2 shadow-sm cursor-pointer
        transition-all duration-150
        ${isHighlighted ? `${colors.bg} ${colors.borderSelected} shadow-md` : `bg-white ${colors.border} hover:${colors.bg}`}
      `}
    >
      {/* Target handle (for incoming insight connections) */}
      <Handle
        type="target"
        position="left"
        style={{
          background: '#f59e0b', // amber-500 for table connections
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
      {Icon && <Icon fontSize="small" className={isHighlighted ? colors.text : 'text-gray-500'} />}

      {/* Name and embedded objects */}
      <div className="flex flex-col min-w-0 gap-1">
        <span className={`text-sm font-medium truncate ${isHighlighted ? colors.text : 'text-gray-800'}`}>
          {name}
        </span>

        {/* Embedded insight pills */}
        {hasEmbeddedObjects && (
          <div className="flex flex-wrap gap-1">
            {embeddedInsights.map((insight, index) => (
              <EmbeddedPill
                key={`insight-${index}`}
                objectType="insight"
                label={insight.name || 'insight'}
                onClick={() => data.onEditEmbeddedInsight?.(insight, index)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Source handle (for outgoing connections to dashboards) */}
      <Handle
        type="source"
        position="right"
        style={{
          background: '#f59e0b', // amber-500 for table connections
          width: 8,
          height: 8,
          border: '2px solid white',
        }}
      />
    </div>
  );
};

export default TableNode;
