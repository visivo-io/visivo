import React from 'react';
import { PiCaretRight, PiCaretDown, PiSpinner, PiXCircle } from 'react-icons/pi';

const SchemaTreeNode = ({
  icon,
  label,
  type,
  badge,
  isExpanded,
  isLoading,
  onClick,
  onDoubleClick,
  onContextMenu,
  actions,
  level = 0,
  children,
  statusIcon,
  errorMessage,
  errorCollapsed = false,
}) => {
  const isExpandable = type !== 'column';

  return (
    <div>
      <div
        className="group flex items-center cursor-pointer py-2 hover:bg-gray-50 transition-colors duration-150 border-b border-gray-100"
        style={{ paddingLeft: level * 16 + 8, paddingRight: 8 }}
        onClick={onClick}
        onDoubleClick={onDoubleClick}
        onContextMenu={onContextMenu}
        role="treeitem"
        aria-selected={false}
        aria-expanded={isExpandable ? isExpanded : undefined}
        data-testid={`tree-node-${type}-${label}`}
        title={errorMessage || undefined}
      >
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 mr-1">
          {isLoading ? (
            <PiSpinner
              className="animate-spin text-gray-400"
              size={14}
              data-testid="loading-spinner"
            />
          ) : errorMessage ? (
            <PiXCircle
              size={14}
              className="text-highlight"
              data-testid="error-icon"
              title={errorMessage}
            />
          ) : isExpandable ? (
            isExpanded ? (
              <PiCaretDown size={14} className="text-gray-400" />
            ) : (
              <PiCaretRight size={14} className="text-gray-400" />
            )
          ) : null}
        </span>

        {icon && <span className="flex-shrink-0 mr-1.5 text-gray-500">{icon}</span>}

        {statusIcon && <span className="flex-shrink-0 mr-1.5">{statusIcon}</span>}

        <span className="text-sm text-gray-700 truncate">{label}</span>

        {badge && (
          <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 ml-2 flex-shrink-0">
            {badge}
          </span>
        )}

        {actions && actions.length > 0 && (
          <span className="ml-auto flex items-center gap-1 pr-2">
            {actions.map((action, idx) => (
              <button
                key={idx}
                className="flex items-center justify-center text-gray-400 hover:text-primary transition-colors p-0.5 rounded hover:bg-primary-50"
                onClick={e => {
                  e.stopPropagation();
                  action.onClick();
                }}
                title={action.label}
                data-testid={`action-${action.label}`}
              >
                {action.icon || action.label}
              </button>
            ))}
          </span>
        )}
      </div>

      {errorMessage && !errorCollapsed && (
        <div
          className="text-xs text-highlight-600 px-2 py-1.5 bg-highlight-50 border-b border-highlight-100"
          style={{ paddingLeft: level * 16 + 28 }}
          data-testid="error-message"
        >
          {errorMessage}
        </div>
      )}

      {isExpanded && children}
    </div>
  );
};

export default SchemaTreeNode;
