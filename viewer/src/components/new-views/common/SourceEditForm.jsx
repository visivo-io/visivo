import React, { useState, useEffect, useRef } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { ButtonOutline } from '../../styled/Button';
import SourceTypeSelector from '../../sources/SourceTypeSelector';
import SourceFormGenerator, { getSourceSchema } from '../../sources/SourceFormGenerator';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import {
  FormInput,
  FormFooter,
  FormAlert,
  FormLayout,
} from '../../styled/FormComponents';
import { validateName } from './namedModel';
import { getTypeByValue } from './objectTypeConfigs';

/**
 * SourceEditForm - Form component for editing/creating sources
 *
 * Props:
 * - source: Source object to edit (null for create mode)
 * - parentEdit: Parent edit item from navigation stack (for embedded sources)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 * - onSaveEmbedded: Callback to save embedded source (updates parent model)
 * - onGoBack: Callback to navigate back to parent (for embedded sources)
 * - onUpdateParent: Callback to update the parent stack entry with pending changes
 */
const SourceEditForm = ({ source, parentEdit, isCreate, onClose, onSave, onSaveEmbedded, onGoBack, onUpdateParent }) => {
  const { saveSource, deleteSource, testConnection, connectionStatus, clearConnectionStatus, checkPublishStatus } =
    useStore();

  // Form state
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [formValues, setFormValues] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isEditMode = !!source && !isCreate;
  const isNewObject = source?.status === ObjectStatus.NEW;
  const isEmbedded = source?._isEmbedded === true;
  const parentModelName = source?._parentModelName;

  // Use ref to track the parentEdit at mount time - this avoids re-running init when parent updates
  const initialParentEditRef = useRef(parentEdit);

  // Initialize form when source changes
  useEffect(() => {
    // Capture the current parentEdit at init time
    const currentParentEdit = initialParentEditRef.current;

    if (source) {
      // Edit mode - populate from existing source
      // API returns: { name, status, child_item_names, config: { name, type, ...props } }
      setName(source.name || '');

      // For embedded sources, prefer pending changes from parent if available
      // This ensures changes persist when navigating back and forth
      let configToUse = source.config;
      if (isEmbedded && currentParentEdit?.object?._pendingEmbeddedSource) {
        configToUse = currentParentEdit.object._pendingEmbeddedSource;
      }

      setSourceType(configToUse?.type || '');

      // Extract form values from the config object
      if (configToUse) {
        const { name: _, type: __, ...formProps } = configToUse;
        setFormValues(formProps);
      } else if (source.config) {
        const { name: _, type: __, ...formProps } = source.config;
        setFormValues(formProps);
      } else {
        // Fallback for flat source objects
        const { name: _, type: __, status: ___, config: ____, ...formProps } = source;
        setFormValues(formProps);
      }
    } else if (isCreate) {
      // Create mode - reset form
      setName('');
      setSourceType('');
      setFormValues({});
    }
    setErrors({});
    setSaveError(null);
  }, [source, isCreate, isEmbedded]);

  // Update the ref when parentEdit changes (for the next mount)
  useEffect(() => {
    initialParentEditRef.current = parentEdit;
  }, [parentEdit]);

  // Clear connection status when panel closes
  useEffect(() => {
    return () => {
      if (name) {
        clearConnectionStatus(name);
      }
    };
  }, [name, clearConnectionStatus]);

  // Update the parent model with pending embedded source changes
  // This ensures pending changes are preserved when navigating back and forth
  useEffect(() => {
    if (isEmbedded && onUpdateParent && sourceType) {
      const pendingConfig = {
        type: sourceType,
        ...formValues,
      };
      // Store pending embedded source on the parent model
      onUpdateParent(prevParent => ({
        ...prevParent,
        _pendingEmbeddedSource: pendingConfig,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceType, formValues, isEmbedded, onUpdateParent]);

  const validateForm = () => {
    const newErrors = {};

    // Skip name validation for embedded sources (they don't have names)
    if (!isEmbedded) {
      const nameError = validateName(name);
      if (nameError) {
        newErrors.name = nameError;
      }
    }

    if (!sourceType) {
      newErrors.type = 'Source type is required';
    }

    // Validate required fields based on schema
    const schema = getSourceSchema(sourceType);
    schema.fields.forEach(field => {
      if (field.required && !formValues[field.name]) {
        newErrors[field.name] = `${field.label} is required`;
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleTestConnection = async () => {
    if (!validateForm()) return;

    const config = {
      name,
      type: sourceType,
      ...formValues,
    };

    await testConnection(config);
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    setSaveError(null);

    const config = {
      name,
      type: sourceType,
      ...formValues,
    };

    let result;
    if (isEmbedded && onSaveEmbedded) {
      // For embedded sources, save through the parent model
      // Don't include name in config since embedded sources don't need names
      const embeddedConfig = {
        type: sourceType,
        ...formValues,
      };
      result = await onSaveEmbedded(embeddedConfig, parentModelName);
    } else {
      result = await saveSource(name, config);
    }

    setSaving(false);

    if (result.success) {
      onSave && onSave(config);
      if (!isEmbedded) {
        onClose();
      }
    } else {
      setSaveError(result.error || 'Failed to save source');
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    const result = await deleteSource(source.name);
    setDeleting(false);

    if (result.success) {
      await checkPublishStatus();
      onClose();
    } else {
      setSaveError(result.error || 'Failed to delete source');
      setShowDeleteConfirm(false);
    }
  };

  const currentConnectionStatus = connectionStatus[name || 'new'];

  return (
    <>
      <FormLayout>
        {/* Embedded source back navigation */}
        {isEmbedded && onGoBack && (() => {
          const parentTypeConfig = getTypeByValue('model');
          const ParentIcon = parentTypeConfig?.icon;
          return (
            <button
              type="button"
              onClick={onGoBack}
              className={`w-full flex items-center gap-2 px-3 py-2 mb-4 rounded-md border transition-colors ${parentTypeConfig?.colors?.node || 'bg-gray-50 border-gray-200'} ${parentTypeConfig?.colors?.bgHover || 'hover:bg-gray-100'}`}
            >
              <ChevronLeftIcon fontSize="small" className={parentTypeConfig?.colors?.text || 'text-gray-600'} />
              {ParentIcon && <ParentIcon fontSize="small" className={parentTypeConfig?.colors?.text || 'text-gray-600'} />}
              <span className={`text-sm font-medium ${parentTypeConfig?.colors?.text || 'text-gray-700'}`}>
                Model {parentModelName}
              </span>
            </button>
          );
        })()}

        {/* Name field - hidden for embedded sources */}
        {!isEmbedded && (
          <FormInput
            id="sourceName"
            label="Source Name"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={isEditMode}
            required
            error={errors.name}
          />
        )}

          {/* Source Type Selector */}
          <div>
            <SourceTypeSelector
              value={sourceType}
              onChange={type => {
                setSourceType(type);
                setFormValues({}); // Reset form values when type changes
              }}
              disabled={isEditMode}
            />
            {errors.type && <p className="mt-1 text-xs text-red-500">{errors.type}</p>}
          </div>

          {/* Dynamic Form Fields */}
          <SourceFormGenerator
            sourceType={sourceType}
            values={formValues}
            onChange={setFormValues}
            errors={errors}
          />

          {/* Connection Status */}
          {currentConnectionStatus && (
            <div
              className={`
            flex items-center gap-2 p-3 rounded-md text-sm
            ${
              currentConnectionStatus.status === 'connected'
                ? 'bg-green-50 text-green-700'
                : currentConnectionStatus.status === 'testing'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-red-50 text-red-700'
            }
          `}
            >
              {currentConnectionStatus.status === 'testing' && (
                <>
                  <CircularProgress size={16} />
                  <span>Testing connection...</span>
                </>
              )}
              {currentConnectionStatus.status === 'connected' && (
                <>
                  <CheckCircleIcon fontSize="small" />
                  <span>Connection successful</span>
                </>
              )}
              {currentConnectionStatus.status === 'failed' && (
                <>
                  <ErrorOutlineIcon fontSize="small" />
                  <span>Connection failed: {currentConnectionStatus.error}</span>
                </>
              )}
            </div>
          )}

        {saveError && <FormAlert variant="error">{saveError}</FormAlert>}
      </FormLayout>

      <FormFooter
        onCancel={onClose}
        onSave={handleSave}
        saving={saving}
        showDelete={isEditMode && !showDeleteConfirm && !isEmbedded}
        onDeleteClick={() => setShowDeleteConfirm(true)}
        deleteConfirm={
          showDeleteConfirm && isEditMode && !isEmbedded
            ? {
                show: true,
                message: isNewObject
                  ? 'Are you sure you want to delete this source? This will discard your unsaved changes.'
                  : 'Are you sure you want to delete this source? This will mark it for deletion and remove it from YAML when you publish.',
                onConfirm: handleDelete,
                onCancel: () => setShowDeleteConfirm(false),
                deleting,
              }
            : null
        }
        leftActions={
          <ButtonOutline
            type="button"
            onClick={handleTestConnection}
            disabled={!sourceType || currentConnectionStatus?.status === 'testing'}
            className="text-sm"
          >
            Test Connection
          </ButtonOutline>
        }
      />
    </>
  );
};

export default SourceEditForm;
