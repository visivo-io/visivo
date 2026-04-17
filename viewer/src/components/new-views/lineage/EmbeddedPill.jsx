import React from 'react';
import { PiX } from 'react-icons/pi';
import { getTypeByValue, DEFAULT_COLORS } from '../common/objectTypeConfigs';

/**
 * EmbeddedPill - Displays an embedded (inline) object as a mini pill inside a parent node.
 *
 * Used to show embedded objects like:
 * - Models with embedded sources
 * - Items with embedded markdowns, charts, or tables
 * - Charts/Tables with embedded traces or insights
 * - Computed column pills in DataSectionToolbar
 * - Drag overlay content in ExplorerDndContext
 * - Draggable items in ExplorerLeftPanel
 * - Insight pills in ChartCRUDSection
 *
 * Props:
 * - objectType: The type of embedded object ('source', 'markdown', 'chart', 'table', 'trace', 'insight', etc.)
 * - label: Display label (e.g., source type like 'duckdb', or 'markdown')
 * - onClick: Handler when the pill is clicked (typically opens parent editor)
 * - tooltip: Optional custom tooltip text
 * - onRemove: (function) renders a small x button on the right; clicking calls onRemove and stops propagation
 * - statusDot: ('new' | 'modified' | null) renders a small colored dot before the label
 * - isActive: (boolean) adds ring-2 highlight with the type's border color
 * - size: ('sm' | 'md') controls padding and font size. 'sm' is the default
 * - as: ('button' | 'div') element type. Default 'button'
 * - className: (string) additional CSS classes appended
 */
const EmbeddedPill = ({
  objectType,
  label,
  onClick,
  tooltip,
  onRemove,
  statusDot,
  isActive,
  size = 'sm',
  as = 'button',
  className,
}) => {
  const typeConfig = getTypeByValue(objectType);
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;

  const defaultTooltip = `Embedded ${objectType}${label ? `: ${label}` : ''} - Click to edit`;

  const sizeClasses = size === 'md' ? 'px-2 py-1 text-sm' : 'px-1.5 py-0.5 text-xs';
  const iconSize = size === 'md' ? 14 : 12;

  const activeClasses = isActive ? `ring-2 ring-current ${colors.text}` : '';

  const Tag = as === 'div' ? 'div' : 'button';
  const extraProps = as === 'div' ? {} : { type: 'button' };

  return (
    <Tag
      {...extraProps}
      className={`
        nodrag nopan nowheel
        inline-flex items-center gap-1 ${sizeClasses} rounded-md
        ${colors.bg} ${colors.border} border
        cursor-pointer hover:shadow-sm transition-all
        relative z-10
        ${activeClasses}
        ${className || ''}
      `}
      onClick={(e) => {
        e.stopPropagation();
        if (onClick) {
          onClick(e);
        }
      }}
      title={tooltip || defaultTooltip}
    >
      {statusDot === 'new' && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"
          data-testid="status-dot-new"
        />
      )}
      {statusDot === 'modified' && (
        <span
          className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"
          data-testid="status-dot-modified"
        />
      )}
      {Icon && <Icon style={{ fontSize: iconSize }} className={colors.text} />}
      <span className={`font-medium ${colors.text} truncate`}>{label || objectType}</span>
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          className="hover:opacity-70 ml-0.5 flex-shrink-0"
          data-testid="pill-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(e);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onRemove(e);
            }
          }}
        >
          <PiX size={size === 'md' ? 12 : 10} />
        </span>
      )}
    </Tag>
  );
};

export default EmbeddedPill;
