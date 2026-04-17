import React from 'react';
import { PiX, PiArrowCounterClockwise } from 'react-icons/pi';
import { useDraggable } from '@dnd-kit/core';
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
 * ObjectListRow - One row of the object list.
 * Extracted so useDraggable can be called once per row (Rules of Hooks).
 */
const ObjectListRow = ({
  obj,
  isSelected,
  onSelect,
  onDelete,
  onReset,
  Icon,
  colors,
  objectType,
  draggableType,
  draggableIdPrefix,
}) => {
  const isNew = obj.status === ObjectStatus.NEW;
  const isModified = obj.status === ObjectStatus.MODIFIED;
  const hasActionBtn = (isNew && onDelete) || (isModified && onReset);

  const draggable = useDraggable({
    id: `${draggableIdPrefix}${obj.name}`,
    data: { type: draggableType || '__none__', name: obj.name },
    disabled: !draggableType,
  });

  const transformStyle = draggable.transform
    ? `translate3d(${draggable.transform.x}px, ${draggable.transform.y}px, 0)`
    : undefined;
  const dragProps = draggableType
    ? {
        ref: draggable.setNodeRef,
        ...draggable.listeners,
        ...draggable.attributes,
        style: {
          transform: transformStyle,
          touchAction: 'none',
          opacity: draggable.isDragging ? 0.5 : undefined,
        },
        'data-testid': `draggable-${draggableType}-${obj.name}`,
      }
    : {};

  return (
    <div className="group relative">
      <button
        {...dragProps}
        onClick={() => onSelect(obj)}
        className={`
          w-full text-left px-4 py-2.5
          flex items-center gap-2
          transition-colors border-b border-gray-100
          ${hasActionBtn ? 'pr-8' : ''}
          ${draggableType ? 'cursor-grab active:cursor-grabbing' : ''}
          ${isSelected ? `${colors.bg} border-l-2 ${colors.borderSelected}` : 'hover:bg-gray-50'}
        `}
      >
        <StatusDot status={obj.status} />
        {Icon && (
          <Icon fontSize="small" className={isSelected ? colors.text : 'text-gray-400'} />
        )}
        <span
          className={`text-sm truncate flex-1 ${isSelected ? `${colors.text} font-medium` : 'text-gray-700'}`}
        >
          {obj.name}
        </span>
        <EmbeddedTypesIndicator types={getEmbeddedTypes(obj, objectType)} />
        {obj.type && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${colors.bg} ${colors.text}`}>
            {obj.type}
          </span>
        )}
      </button>

      {isNew && onDelete && (
        <button
          type="button"
          data-testid={`delete-${objectType}-${obj.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete(obj);
          }}
          title="Delete"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
        >
          <PiX size={14} />
        </button>
      )}

      {isModified && onReset && (
        <button
          type="button"
          data-testid={`reset-${objectType}-${obj.name}`}
          onClick={(e) => {
            e.stopPropagation();
            onReset(obj);
          }}
          title="Reset to original"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-amber-500 opacity-0 group-hover:opacity-100 transition-all"
        >
          <PiArrowCounterClockwise size={14} />
        </button>
      )}
    </div>
  );
};

/**
 * ObjectList - Displays a list of objects with status indicators
 * Used by EditorNew view
 */
const ObjectList = ({
  objects,
  selectedName,
  onSelect,
  onDelete,
  onReset,
  title = 'Objects',
  objectType = 'source',
  draggableType = null,
  draggableIdPrefix,
}) => {
  const typeConfig = getTypeByValue(objectType);
  const colors = typeConfig?.colors || DEFAULT_COLORS;
  const Icon = typeConfig?.icon;
  const idPrefix = draggableIdPrefix || `draggable-${objectType}-`;

  if (!objects || objects.length === 0) {
    return (
      <div className="p-4 text-gray-500 text-sm">
        No {title.toLowerCase()} found. Click the + button to create one.
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        className={`px-4 py-2 text-xs font-semibold uppercase tracking-wide border-b ${colors.bg} ${colors.text} ${colors.border}`}
      >
        {title} ({objects.length})
      </div>

      <div className="flex-1 overflow-y-auto">
        {objects.map((obj) => (
          <ObjectListRow
            key={obj.name}
            obj={obj}
            isSelected={obj.name === selectedName}
            onSelect={onSelect}
            onDelete={onDelete}
            onReset={onReset}
            Icon={Icon}
            colors={colors}
            objectType={objectType}
            draggableType={draggableType}
            draggableIdPrefix={idPrefix}
          />
        ))}
      </div>
    </div>
  );
};

export default ObjectList;
