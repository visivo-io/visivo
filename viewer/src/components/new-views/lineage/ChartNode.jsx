import React from 'react';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';
import { StatusIndicator } from '../../styled/StatusIndicator';
import { NodeHandle } from '../../styled/NodeHandle';
import { NodeWrapper } from '../../styled/NodeWrapper';
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
 * ChartNode - Custom React Flow node for charts
 * Shows chart name with status indicator.
 * Charts have incoming connections from insights.
 * Supports nested embedded objects (traces, insights).
 */
const ChartNode = ({ data, selected }) => {
  const { name, status, isEditing, chart } = data;
  const isHighlighted = selected || isEditing;

  // Get type colors and icon
  const typeConfig = getTypeByValue('chart');
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  // Check for embedded insights in chart config (traces not supported for embedded display)
  const config = chart?.config || {};
  const insights = config.insights || [];

  // Count embedded insights (not refs)
  const embeddedInsights = insights.filter(isEmbeddedObject);
  const hasEmbeddedObjects = embeddedInsights.length > 0;

  return (
    <NodeWrapper isHighlighted={isHighlighted} colors={colors}>
      {/* Target handle (for incoming insight connections) */}
      <NodeHandle type="target" colors={colors} />

      {/* Status indicator */}
      <StatusIndicator status={status} />

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
      <NodeHandle type="source" colors={colors} />
    </NodeWrapper>
  );
};

export default ChartNode;
