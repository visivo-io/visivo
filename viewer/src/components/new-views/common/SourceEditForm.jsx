import React, { useState, useEffect } from 'react';
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

/**
 * SourceEditForm - Form component for editing/creating sources
 *
 * Props:
 * - source: Source object to edit (null for create mode)
 * - isCreate: Whether in create mode
 * - onClose: Callback to close the panel
 * - onSave: Callback after successful save
 * - onSaveEmbedded: Callback to save embedded source (updates parent model)
 * - onGoBack: Callback to navigate back to parent (for embedded sources)
 */
const SourceEditForm = ({ source, isCreate, onClose, onSave, onSaveEmbedded, onGoBack }) => {
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

  // Initialize form when source changes
  useEffect(() => {
    if (source) {
      // Edit mode - populate from existing source
      // API returns: { name, status, child_item_names, config: { name, type, ...props } }
      setName(source.name || '');
      setSourceType(source.config?.type || '');

      // Extract form values from the nested config object
      if (source.config) {
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
  }, [source, isCreate]);

  // Clear connection status when panel closes
  useEffect(() => {
    return () => {
      if (name) {
        clearConnectionStatus(name);
      }
    };
  }, [name, clearConnectionStatus]);

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
        {/* Embedded source banner */}
        {isEmbedded && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-md mb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-blue-800 font-medium">Embedded Source</p>
                <p className="text-xs text-blue-700 mt-1">
                  Defined inline in model "{parentModelName}"
                </p>
              </div>
              {onGoBack && (
                <button
                  type="button"
                  onClick={onGoBack}
                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 transition-colors"
                >
                  <ChevronLeftIcon fontSize="inherit" />
                  Back to model
                </button>
              )}
            </div>
          </div>
        )}

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
