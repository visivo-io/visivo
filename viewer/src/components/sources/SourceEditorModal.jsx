import React, { useState, useEffect } from 'react';
import useStore from '../../stores/store';
import { ModalOverlay, ModalWrapper } from '../styled/Modal';
import { Button, ButtonOutline } from '../styled/Button';
import SourceTypeSelector from './SourceTypeSelector';
import SourceFormGenerator, { getSourceSchema } from './SourceFormGenerator';
import { validateName } from '../new-views/common/namedModel';
import CircularProgress from '@mui/material/CircularProgress';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

const SourceEditorModal = () => {
  const {
    sourceModalOpen,
    editingSource,
    closeSourceModal,
    saveSource,
    testConnection,
    connectionStatus,
    clearConnectionStatus,
  } = useStore();

  const isEditMode = !!editingSource;
  const sourceName = editingSource?.name || '';

  // Form state
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [formValues, setFormValues] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // Initialize form when modal opens or editingSource changes
  useEffect(() => {
    if (sourceModalOpen) {
      if (editingSource) {
        // Edit mode - populate from existing source
        setName(editingSource.name || '');
        setSourceType(editingSource.type || '');
        // Copy all config except name and type
        const { name: _, type: __, status: ___, ...config } = editingSource.config || editingSource;
        setFormValues(config);
      } else {
        // Create mode - reset form
        setName('');
        setSourceType('');
        setFormValues({});
      }
      setErrors({});
      setSaveError(null);
    }
  }, [sourceModalOpen, editingSource]);

  // Clear connection status when modal closes
  useEffect(() => {
    if (!sourceModalOpen && sourceName) {
      clearConnectionStatus(sourceName);
    }
  }, [sourceModalOpen, sourceName, clearConnectionStatus]);

  const validateForm = () => {
    const newErrors = {};

    const nameError = validateName(name);
    if (nameError) {
      newErrors.name = nameError;
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
      closeSourceModal();
    } else {
      setSaveError(result.error || 'Failed to save source');
    }
  };

  const handleClose = () => {
    closeSourceModal();
  };

  const currentConnectionStatus = connectionStatus[name || 'new'];

  if (!sourceModalOpen) return null;

  return (
    <ModalOverlay onClick={handleClose}>
      <ModalWrapper onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {isEditMode ? `Edit Source: ${sourceName}` : 'Create New Source'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="space-y-6">
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
            <div className={`
              flex items-center gap-2 p-3 rounded-md text-sm
              ${currentConnectionStatus.status === 'connected'
                ? 'bg-green-50 text-green-700'
                : currentConnectionStatus.status === 'testing'
                  ? 'bg-blue-50 text-blue-700'
                  : 'bg-red-50 text-red-700'
              }
            `}>
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
            <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm">
              {saveError}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center mt-8 pt-6 border-t border-gray-200">
          <ButtonOutline
            type="button"
            onClick={handleTestConnection}
            disabled={!sourceType || currentConnectionStatus?.status === 'testing'}
          >
            Test Connection
          </ButtonOutline>

          <div className="flex gap-3">
            <ButtonOutline type="button" onClick={handleClose}>
              Cancel
            </ButtonOutline>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <CircularProgress size={16} className="mr-2" style={{ color: 'white' }} />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </div>
      </ModalWrapper>
    </ModalOverlay>
  );
};

export default SourceEditorModal;
