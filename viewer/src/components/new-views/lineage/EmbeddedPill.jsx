import React from 'react';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';

/**
 * EmbeddedPill - Displays an embedded (inline) object as a mini pill inside a parent node.
 *
 * Used to show embedded objects like:
 * - Models with embedded sources
 * - Items with embedded markdowns, charts, or tables
 * - Charts/Tables with embedded traces or insights
 *
 * Props:
 * - objectType: The type of embedded object ('source', 'markdown', 'chart', 'table', 'trace', 'insight')
 * - label: Display label (e.g., source type like 'duckdb', or 'markdown')
 * - onClick: Handler when the pill is clicked (typically opens parent editor)
 * - tooltip: Optional custom tooltip text
 */
const EmbeddedPill = ({ objectType, label, onClick, tooltip }) => {
  const typeConfig = getTypeByValue(objectType);
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  const defaultTooltip = `Embedded ${objectType}${label ? `: ${label}` : ''} - Click to edit`;

  return (
    <button
      type="button"
      className={`
        nodrag nopan nowheel
        inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
        ${colors.bg} ${colors.border} border
        cursor-pointer hover:shadow-sm transition-all
        relative z-10
      `}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) {
          onClick();
        }
      }}
      title={tooltip || defaultTooltip}
    >
      {Icon && <Icon style={{ fontSize: 12 }} className={colors.text} />}
      <span className={`text-xs font-medium ${colors.text}`}>
        {label || objectType}
      </span>
    </button>
  );
};

export default EmbeddedPill;
