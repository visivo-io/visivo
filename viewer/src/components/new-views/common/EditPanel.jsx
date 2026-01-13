import React from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { getTypeByValue } from './objectTypeConfigs';
import ModelEditForm from './ModelEditForm';
import SourceEditForm from './SourceEditForm';
import DimensionEditForm from './DimensionEditForm';
import MetricEditForm from './MetricEditForm';
import RelationEditForm from './RelationEditForm';
import InsightEditForm from './InsightEditForm';

/**
 * EditPanel - Shared right-side panel for editing/creating sources, models, and semantic objects
 * Used by both LineageNew and EditorNew views
 *
 * This component is a thin wrapper that handles the panel layout and header,
 * delegating to specific form components for each object type.
 *
 * Props:
 * - source: Source object to edit
 * - model: Model object to edit
 * - dimension: Dimension object to edit
 * - metric: Metric object to edit
 * - relation: Relation object to edit
 * - insight: Insight object to edit
 * - objectType: 'source' | 'model' | 'dimension' | 'metric' | 'relation' | 'insight' (used for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 */
const EditPanel = ({
  source,
  model,
  dimension,
  metric,
  relation,
  insight,
  objectType = 'source',
  isCreate,
  onClose,
  onSave,
}) => {
  // Determine which object we're editing
  const currentObjectType = model
    ? 'model'
    : source
      ? 'source'
      : dimension
        ? 'dimension'
        : metric
          ? 'metric'
          : relation
            ? 'relation'
            : insight
              ? 'insight'
              : objectType;

  const typeConfig = getTypeByValue(currentObjectType);
  const TypeIcon = typeConfig?.icon;

  // Get the current object for display
  const currentObject = model || dimension || metric || relation || insight || source;
  const isEditMode = !!currentObject && !isCreate;

  // Generate title based on object type
  const getTitle = () => {
    const singularLabel = typeConfig?.singularLabel || currentObjectType;
    if (isEditMode) {
      return `Edit ${singularLabel}: ${currentObject?.name}`;
    }
    return `Create New ${singularLabel}`;
  };

  // Model form handling
  const handleModelSave = result => {
    onSave && onSave(result);
    onClose();
  };

  // Render the appropriate form based on object type
  const renderForm = () => {
    switch (currentObjectType) {
      case 'model':
        return <ModelEditForm model={model} onSave={handleModelSave} onCancel={onClose} />;
      case 'dimension':
        return (
          <DimensionEditForm
            dimension={dimension}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
          />
        );
      case 'metric':
        return (
          <MetricEditForm metric={metric} isCreate={isCreate} onClose={onClose} onSave={onSave} />
        );
      case 'relation':
        return (
          <RelationEditForm
            relation={relation}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
          />
        );
      case 'insight':
        return (
          <InsightEditForm
            insight={insight}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
          />
        );
      case 'source':
      default:
        return (
          <SourceEditForm source={source} isCreate={isCreate} onClose={onClose} onSave={onSave} />
        );
    }
  };

  return (
    <div className="w-96 h-full bg-white border-l border-gray-200 flex flex-col shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          {TypeIcon && (
            <TypeIcon fontSize="small" className={typeConfig?.colors?.text || 'text-gray-500'} />
          )}
          <h2 className="text-lg font-semibold text-gray-900">{getTitle()}</h2>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-200"
        >
          <CloseIcon fontSize="small" />
        </button>
      </div>

      {/* Form Content */}
      {currentObjectType === 'model' ? (
        <div className="flex-1 overflow-y-auto p-4">{renderForm()}</div>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">{renderForm()}</div>
      )}
    </div>
  );
};

export default EditPanel;
