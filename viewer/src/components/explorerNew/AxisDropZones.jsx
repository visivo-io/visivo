import React, { useMemo } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { PiX, PiArrowSquareIn } from 'react-icons/pi';
import useStore from '../../stores/store';
import { getRequiredFields } from '../new-views/common/insightRequiredFields';

const DropZone = ({ fieldName, label, description, value, onRemove, optional }) => {
  const { isOver, setNodeRef } = useDroppable({
    id: `axis-${fieldName}`,
    data: { fieldName, type: 'axis-zone' },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
        isOver
          ? 'border-primary bg-primary-50 ring-2 ring-primary-200'
          : value
            ? 'border-secondary-300 bg-white'
            : 'border-dashed border-secondary-300 bg-secondary-50'
      }`}
      data-testid={`axis-zone-${fieldName}`}
    >
      <span className="text-xs font-medium text-secondary-500 w-16 flex-shrink-0 truncate" title={description}>
        {label}
        {!optional && <span className="text-highlight ml-0.5">*</span>}
      </span>
      {value ? (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800"
          data-testid={`axis-pill-${fieldName}`}
        >
          {value}
          <button
            type="button"
            onClick={() => onRemove(fieldName)}
            className="hover:text-highlight transition-colors"
            title={`Remove ${value}`}
            data-testid={`axis-remove-${fieldName}`}
          >
            <PiX size={10} />
          </button>
        </span>
      ) : (
        <span className="text-xs text-secondary-400 italic flex items-center gap-1">
          <PiArrowSquareIn size={12} />
          {isOver ? 'Drop here' : 'Drag column here'}
        </span>
      )}
    </div>
  );
};

const AxisDropZones = () => {
  const insightConfig = useStore((s) => s.explorerInsightConfig);
  const removeInsightProp = useStore((s) => s.removeExplorerInsightProp);
  const queryResult = useStore((s) => s.explorerQueryResult);

  const chartType = insightConfig?.props?.type || 'scatter';
  const props = insightConfig?.props || {};

  const fields = useMemo(() => {
    const required = getRequiredFields(chartType);
    return required.filter((f) => f.type === 'dataArray');
  }, [chartType]);

  if (fields.length === 0 || !queryResult) return null;

  return (
    <div
      className="px-4 py-3 border-b border-gray-200 space-y-1.5 flex-shrink-0"
      data-testid="axis-drop-zones"
    >
      <div className="text-xs font-medium text-secondary-500 uppercase tracking-wide mb-2">
        Axis Mapping
      </div>
      {fields.map((field) => (
        <DropZone
          key={field.name}
          fieldName={field.name}
          label={field.label}
          description={field.description}
          value={props[field.name] || null}
          onRemove={removeInsightProp}
          optional={field.optional}
        />
      ))}
    </div>
  );
};

export default AxisDropZones;
