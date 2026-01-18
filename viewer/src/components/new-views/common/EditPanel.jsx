import React from 'react';
import CloseIcon from '@mui/icons-material/Close';
import { getTypeByValue } from './objectTypeConfigs';
import ModelEditForm from './ModelEditForm';
import SourceEditForm from './SourceEditForm';
import DimensionEditForm from './DimensionEditForm';
import MetricEditForm from './MetricEditForm';
import RelationEditForm from './RelationEditForm';
import InsightEditForm from './InsightEditForm';
import MarkdownEditForm from './MarkdownEditForm';
import ChartEditForm from './ChartEditForm';
import TableEditForm from './TableEditForm';

/**
 * EditPanel - Shared right-side panel for editing/creating sources, models, and semantic objects
 * Used by both LineageNew and EditorNew views
 *
 * This component is a thin wrapper that handles the panel layout and header,
 * delegating to specific form components for each object type.
 *
 * Props:
 * - editItem: { type: string, object: Object } - Current item being edited from navigation stack
 * - canGoBack: boolean - Whether back navigation is available
 * - onGoBack: Function - Callback to navigate back in the stack
 * - onNavigateTo: Function(type, object) - Callback to push a new item onto the stack
 * - objectType: 'source' | 'model' | etc. (used for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Function(type, name, config) - Unified save callback for all objects
 */
const EditPanel = ({
  editItem,
  canGoBack,
  onGoBack,
  onNavigateTo,
  objectType = 'source',
  isCreate,
  onClose,
  onSave,
}) => {
  // Extract type and object from editItem (new navigation stack format)
  const currentObjectType = editItem?.type || objectType;
  const currentObject = editItem?.object || null;

  const typeConfig = getTypeByValue(currentObjectType);
  const TypeIcon = typeConfig?.icon;

  const isEditMode = !!currentObject && !isCreate;

  // Generate title based on object type
  const getTitle = () => {
    const singularLabel = typeConfig?.singularLabel || currentObjectType;
    if (isEditMode) {
      return `Edit ${singularLabel}`;
    }
    return `Create ${singularLabel}`;
  };

  // Render the appropriate form based on object type
  const renderForm = () => {
    switch (currentObjectType) {
      case 'model':
        return (
          <ModelEditForm
            model={currentObject}
            isCreate={isCreate}
            onSave={onSave}
            onCancel={onClose}
            onNavigateToEmbedded={onNavigateTo}
          />
        );
      case 'dimension':
        return (
          <DimensionEditForm
            dimension={currentObject}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
            onGoBack={canGoBack ? onGoBack : undefined}
          />
        );
      case 'metric':
        return (
          <MetricEditForm
            metric={currentObject}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
            onGoBack={canGoBack ? onGoBack : undefined}
          />
        );
      case 'relation':
        return (
          <RelationEditForm
            relation={currentObject}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
          />
        );
      case 'insight':
        return (
          <InsightEditForm
            insight={currentObject}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
            onGoBack={canGoBack ? onGoBack : undefined}
          />
        );
      case 'markdown':
        return (
          <MarkdownEditForm
            markdown={currentObject}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
          />
        );
      case 'chart':
        return (
          <ChartEditForm
            chart={currentObject}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
            onNavigateToEmbedded={onNavigateTo}
          />
        );
      case 'table':
        return (
          <TableEditForm
            table={currentObject}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
            onNavigateToEmbedded={onNavigateTo}
          />
        );
      case 'source':
      default:
        return (
          <SourceEditForm
            source={currentObject}
            isCreate={isCreate}
            onClose={onClose}
            onSave={onSave}
            onGoBack={canGoBack ? onGoBack : undefined}
          />
        );
    }
  };

  return (
    <div className="w-96 h-full bg-white border-l border-gray-200 flex flex-col shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          {TypeIcon && <TypeIcon fontSize="small" className={typeConfig?.colors?.text || 'text-gray-500'} />}
          <h2 className="text-lg font-semibold text-gray-900 truncate">{getTitle()}</h2>
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
