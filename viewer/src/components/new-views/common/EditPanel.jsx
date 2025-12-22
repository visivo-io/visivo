import React, { useState, useEffect } from 'react';
import useStore, { ObjectStatus } from '../../../stores/store';
import { Button, ButtonOutline } from '../../styled/Button';
import SourceTypeSelector from '../../sources/SourceTypeSelector';
import SourceFormGenerator, { getSourceSchema } from '../../sources/SourceFormGenerator';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CloseIcon from '@mui/icons-material/Close';

/**
 * EditPanel - Shared right-side panel for editing/creating sources
 * Used by both LineageNew and EditorNew views
 */
const EditPanel = ({ source, isCreate, onClose, onSave }) => {
  const { saveSource, testConnection, connectionStatus, clearConnectionStatus } = useStore();

  // Form state
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [formValues, setFormValues] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Initialize form when source changes
  useEffect(() => {
    if (source) {
      // Edit mode - populate from existing source
      // API returns: { name, status, type, config: { name, type, ...props } }
      setName(source.name || '');
      setSourceType(source.type || '');

      // Extract form values from the nested config object
      // The config object contains the full source including name and type
      if (source.config) {
        const { name: _, type: __, ...formProps } = source.config;
        setFormValues(formProps);
      } else {
        // Fallback for flat source objects (shouldn't happen but handle gracefully)
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

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      newErrors.name =
        'Name must start with a letter and contain only letters, numbers, underscores, and hyphens';
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

    const result = await saveSource(name, config);

    setSaving(false);

    if (result.success) {
      onSave && onSave(config);
      onClose();
    } else {
      setSaveError(result.error || 'Failed to save source');
    }
  };

  const currentConnectionStatus = connectionStatus[name || 'new'];
  const isEditMode = !!source && !isCreate;
  const title = isEditMode ? `Edit Source: ${source.name}` : 'Create New Source';

  return (
    <div className="w-96 h-full bg-white border-l border-gray-200 flex flex-col shadow-lg">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-200"
        >
          <CloseIcon fontSize="small" />
        </button>
      </div>

      {/* Form Content - Scrollable */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Name field */}
        <div className="relative">
          <input
            type="text"
            id="sourceName"
            value={name}
            onChange={e => setName(e.target.value)}
            disabled={isEditMode}
            placeholder=" "
            className={`
              block w-full px-3 py-2.5 text-sm text-gray-900
              bg-white rounded-md border appearance-none
              focus:outline-none focus:ring-2 focus:border-primary-500
              peer placeholder-transparent
              ${isEditMode ? 'bg-gray-100 cursor-not-allowed' : ''}
              ${errors.name ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-primary-500'}
            `}
          />
          <label
            htmlFor="sourceName"
            className={`
              absolute text-sm duration-200 transform -translate-y-4 scale-75 top-2 z-10 origin-[0]
              bg-white px-1 left-2
              peer-placeholder-shown:scale-100 peer-placeholder-shown:-translate-y-1/2
              peer-placeholder-shown:top-1/2
              peer-focus:top-2 peer-focus:scale-75 peer-focus:-translate-y-4
              ${errors.name ? 'text-red-500' : 'text-gray-500 peer-focus:text-primary-500'}
            `}
          >
            Source Name<span className="text-red-500 ml-0.5">*</span>
          </label>
          {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
        </div>

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

        {/* Save Error */}
        {saveError && (
          <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm">{saveError}</div>
        )}
      </div>

      {/* Footer Actions - Fixed at bottom */}
      <div className="flex justify-between items-center px-4 py-3 border-t border-gray-200 bg-gray-50">
        <ButtonOutline
          type="button"
          onClick={handleTestConnection}
          disabled={!sourceType || currentConnectionStatus?.status === 'testing'}
          className="text-sm"
        >
          Test Connection
        </ButtonOutline>

        <div className="flex gap-2">
          <ButtonOutline type="button" onClick={onClose} className="text-sm">
            Cancel
          </ButtonOutline>
          <Button type="button" onClick={handleSave} disabled={saving} className="text-sm">
            {saving ? (
              <>
                <CircularProgress size={14} className="mr-1" style={{ color: 'white' }} />
                Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default EditPanel;
